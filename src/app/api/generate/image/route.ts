import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keyless text-to-image via Pollinations (https://pollinations.ai). No API key
// required. We fetch server-side and return a base64 data URL so the browser
// can render and download it without cross-origin concerns.
const IMAGE_BASE = "https://image.pollinations.ai/prompt/";
const IMAGE_MODEL = process.env.POLLINATIONS_MODEL ?? "flux";

// POST /api/generate/image — Body: { prompt }. Returns { image } or { error }.
export async function POST(request: Request) {
  let prompt = "";
  try {
    prompt = String((await request.json())?.prompt ?? "").slice(0, 800);
  } catch {
    /* ignore */
  }
  if (!prompt.trim()) return NextResponse.json({ error: "Describe the image you want." }, { status: 400 });

  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url =
    `${IMAGE_BASE}${encodeURIComponent(prompt)}` +
    `?width=1024&height=1024&nologo=true&seed=${seed}&model=${encodeURIComponent(IMAGE_MODEL)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(75_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Image service is busy (${res.status}). Please try again. ${detail.slice(0, 120)}` },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
    return NextResponse.json({ image: dataUrl });
  } catch (err) {
    const msg = (err as Error).name === "TimeoutError" ? "The image took too long — please try again." : (err as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
