import { Fragment } from "react";
import { parseInline, parseMarkdown, type Inline } from "@/lib/md";

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((s, i) => {
        if (s.href)
          return (
            <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              {s.text}
            </a>
          );
        if (s.code)
          return (
            <code key={i} className="px-1 py-0.5 rounded bg-bg-subtle text-[0.85em] font-mono text-primary">
              {s.text}
            </code>
          );
        if (s.bold) return <strong key={i} className="font-semibold text-text">{s.text}</strong>;
        if (s.italic) return <em key={i}>{s.text}</em>;
        return <Fragment key={i}>{s.text}</Fragment>;
      })}
    </>
  );
}

/** Renders assistant Markdown into styled, theme-aware React. */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-text-muted">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const size = b.level <= 1 ? "text-[17px]" : b.level === 2 ? "text-[15px]" : "text-[13.5px]";
            return (
              <p key={i} className={`font-bold text-text ${size} ${i > 0 ? "mt-3.5" : ""}`}>
                <Inlines parts={parseInline(b.text)} />
              </p>
            );
          }
          case "paragraph":
            return (
              <p key={i}>
                <Inlines parts={parseInline(b.text)} />
              </p>
            );
          case "list":
            return b.ordered ? (
              <ol key={i} className="list-decimal pl-5 space-y-1">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines parts={parseInline(it)} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="list-disc pl-5 space-y-1 marker:text-text-faint">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines parts={parseInline(it)} />
                  </li>
                ))}
              </ul>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-bg-subtle border border-border p-3 text-[12.5px] font-mono text-text">
                <code>{b.text}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-primary pl-3 italic text-text-faint">
                <Inlines parts={parseInline(b.text)} />
              </blockquote>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full text-[12.5px] border border-border rounded-lg">
                  <thead>
                    <tr className="bg-bg-subtle">
                      {b.header.map((h, j) => (
                        <th key={j} className="text-left font-semibold text-text px-3 py-1.5 border-b border-border">
                          <Inlines parts={parseInline(h)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-border last:border-0">
                        {r.map((c, k) => (
                          <td key={k} className="px-3 py-1.5 align-top">
                            <Inlines parts={parseInline(c)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
