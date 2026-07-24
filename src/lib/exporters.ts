// ------------------------------------------------------------------
// Client-side document generation. Turns an assistant answer (Markdown) into a
// real, downloadable PDF (jsPDF) or PowerPoint deck (pptxgenjs). Both libraries
// are dynamically imported so they never touch the server bundle.
// ------------------------------------------------------------------
import { parseMarkdown, stripInline, type Block } from "./md";

const BRAND = "0D3A5C"; // JSAN deep blue
const ACCENT = "217BB0";

function fileName(title: string, ext: string): string {
  const base =
    title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "jsan-assistant";
  return `${base}.${ext}`;
}

function deriveTitle(markdown: string, fallback: string): string {
  const blocks = parseMarkdown(markdown);
  const h = blocks.find((b) => b.type === "heading") as Extract<Block, { type: "heading" }> | undefined;
  if (h) return stripInline(h.text);
  const p = blocks.find((b) => b.type === "paragraph") as Extract<Block, { type: "paragraph" }> | undefined;
  if (p) return stripInline(p.text).slice(0, 70);
  return fallback;
}

// ---------------------------------------------------------------- PDF
export async function exportPdf(markdown: string, fallbackTitle = "JSAN Assistant") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  const title = deriveTitle(markdown, fallbackTitle);
  let y = margin;

  // Branded header band
  doc.setFillColor(BRAND);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor("#FFFFFF");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("JSAN Consulting", margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Discovery Assistant", margin, 46);
  y = 96;

  doc.setTextColor("#0F172A");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  for (const line of doc.splitTextToSize(title, maxW)) {
    doc.text(line, margin, y);
    y += 20;
  }
  y += 6;

  const ensure = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const write = (text: string, size: number, style: "normal" | "bold" | "italic", indent = 0, color = "#1F2937") => {
    if (!text.trim()) return;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, maxW - indent) as string[];
    for (const ln of lines) {
      ensure(size + 6);
      doc.text(ln, margin + indent, y);
      y += size + 6;
    }
  };

  for (const b of parseMarkdown(markdown)) {
    switch (b.type) {
      case "heading":
        y += 6;
        write(stripInline(b.text), b.level <= 1 ? 15 : b.level === 2 ? 13 : 12, "bold", 0, "#0D3A5C");
        y += 2;
        break;
      case "paragraph":
        write(stripInline(b.text), 10.5, "normal");
        y += 4;
        break;
      case "list":
        b.items.forEach((it, idx) => {
          const marker = b.ordered ? `${idx + 1}.` : "•";
          write(`${marker}  ${stripInline(it)}`, 10.5, "normal", 14);
        });
        y += 4;
        break;
      case "quote":
        write(stripInline(b.text), 10.5, "italic", 14, "#5B6472");
        y += 4;
        break;
      case "code":
        doc.setFont("courier", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor("#0F172A");
        for (const ln of doc.splitTextToSize(b.text, maxW - 16) as string[]) {
          ensure(14);
          doc.setFillColor("#EEF1F5");
          doc.rect(margin, y - 9, maxW, 13, "F");
          doc.text(ln, margin + 6, y);
          y += 13;
        }
        y += 6;
        break;
      case "table":
        write(b.header.join("   |   "), 10, "bold", 0, "#0D3A5C");
        b.rows.forEach((r) => write(r.map(stripInline).join("   |   "), 10, "normal", 8));
        y += 6;
        break;
    }
  }

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#8B94A3");
    doc.text(`JSAN Discovery Assistant · Public-source intelligence`, margin, pageH - 20);
    doc.text(`${p} / ${pages}`, pageW - margin, pageH - 20, { align: "right" });
  }

  doc.save(fileName(title, "pdf"));
}

// ---------------------------------------------------------------- PPTX
interface Slide {
  title: string;
  bullets: { text: string; level: number }[];
}

function toSlides(markdown: string, deckTitle: string): Slide[] {
  const blocks = parseMarkdown(markdown);
  const slides: Slide[] = [];
  let current: Slide | null = null;
  const push = (b: { text: string; level: number }) => {
    if (!current) current = { title: deckTitle, bullets: [] };
    if (current.bullets.length >= 7) {
      slides.push(current);
      current = { title: `${current.title} (cont.)`, bullets: [] };
    }
    current.bullets.push(b);
  };

  for (const b of blocks) {
    if (b.type === "heading") {
      if (current) slides.push(current);
      current = { title: stripInline(b.text), bullets: [] };
    } else if (b.type === "paragraph") {
      push({ text: stripInline(b.text), level: 0 });
    } else if (b.type === "list") {
      b.items.forEach((it) => push({ text: stripInline(it), level: 1 }));
    } else if (b.type === "quote") {
      push({ text: stripInline(b.text), level: 0 });
    } else if (b.type === "table") {
      push({ text: b.header.join(" · "), level: 0 });
      b.rows.forEach((r) => push({ text: r.map(stripInline).join(" · "), level: 1 }));
    }
  }
  if (current) slides.push(current);
  return slides.length ? slides : [{ title: deckTitle, bullets: [{ text: markdown.slice(0, 400), level: 0 }] }];
}

export async function exportPptx(markdown: string, fallbackTitle = "JSAN Assistant") {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.author = "JSAN Discovery Assistant";
  pptx.company = "JSAN Consulting";
  const title = deriveTitle(markdown, fallbackTitle);

  // Title slide
  const cover = pptx.addSlide();
  cover.background = { color: BRAND };
  cover.addText("JSAN Consulting", { x: 0.6, y: 2.2, w: 12, h: 0.6, fontSize: 20, color: "9FC7E0", bold: true });
  cover.addText(title, { x: 0.6, y: 2.9, w: 12, h: 1.6, fontSize: 34, color: "FFFFFF", bold: true });
  cover.addText("Discovery Assistant · public-source intelligence", {
    x: 0.6,
    y: 4.7,
    w: 12,
    h: 0.5,
    fontSize: 13,
    color: "C9DCEC",
  });

  for (const s of toSlides(markdown, title)) {
    const slide = pptx.addSlide();
    slide.addText(s.title, { x: 0.5, y: 0.35, w: 12.3, h: 0.9, fontSize: 24, bold: true, color: BRAND });
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.2, w: 2.2, h: 0.06, fill: { color: ACCENT } });
    if (s.bullets.length) {
      slide.addText(
        s.bullets.map((b) => ({
          text: b.text,
          options: { bullet: { indent: 15 }, indentLevel: b.level, fontSize: b.level ? 15 : 16, color: "1F2937", paraSpaceAfter: 6 },
        })),
        { x: 0.7, y: 1.5, w: 12, h: 5.6, valign: "top" },
      );
    }
    slide.addText("JSAN Consulting · Discovery Assistant", { x: 0.5, y: 7.0, w: 12, h: 0.3, fontSize: 9, color: "8B94A3" });
  }

  await pptx.writeFile({ fileName: fileName(title, "pptx") });
}
