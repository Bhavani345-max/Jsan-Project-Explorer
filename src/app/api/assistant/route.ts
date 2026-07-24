import { NextResponse } from "next/server";
import { runAssistant } from "@/lib/assistant";

// POST /api/assistant — natural-language opportunity finder.
// Body: { message: string }. Returns a written answer plus ranked matches and
// the structured filters that produced them (for deep-linking to the Explorer).
export async function POST(request: Request) {
  let message = "";
  try {
    const body = await request.json();
    message = typeof body?.message === "string" ? body.message : "";
  } catch {
    // ignore malformed body
  }
  if (!message.trim()) {
    return NextResponse.json({ error: "Ask about the opportunities you're looking for." }, { status: 400 });
  }
  return NextResponse.json(runAssistant(message));
}
