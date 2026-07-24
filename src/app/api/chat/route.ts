import { buildSystemPrompt, streamChat, chatEnabled, enableNotice, type ChatMessage } from "@/lib/chat";
import { runAssistant } from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/chat — lightweight capability probe for the UI status chip.
// Image generation is always available (keyless); text needs a provider key.
export async function GET() {
  return Response.json({ enabled: chatEnabled(), imageEnabled: true });
}

// POST /api/chat — streaming general-purpose + portal-aware chat.
// Body: { messages: {role, content}[] }. Streams plain-text chunks.
export async function POST(request: Request) {
  let messages: ChatMessage[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.messages)) messages = body.messages;
  } catch {
    /* ignore */
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const textResponse = (text: string) =>
    new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  if (!lastUser.trim()) return textResponse("Ask me anything — a topic to explain, or opportunities to find.");

  // Offline mode: no model key. Opportunity *searches* still get a real answer;
  // general questions need the language model.
  if (!chatEnabled()) {
    const a = runAssistant(lastUser);
    if (a.isSearch && a.projects.length > 0) {
      return textResponse(
        `${a.answer}\n\n_Full AI chat for any topic (and image generation) turns on when an OpenRouter key is set._`,
      );
    }
    return textResponse(enableNotice());
  }

  // Full model: build a grounded system prompt and stream the answer.
  const { system } = buildSystemPrompt(lastUser);
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10);
  const payload: ChatMessage[] = [{ role: "system", content: system }, ...history];

  try {
    const stream = await streamChat(payload);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    return textResponse(
      `I hit an error reaching the model: ${(err as Error).message}\n\nThe portal search still works — try asking about GIS, telecom, or a country.`,
    );
  }
}
