// ------------------------------------------------------------------
// Server-side chat layer for the AI Assistant.
//
// A general-purpose assistant (explains any topic, helps write/plan/analyse)
// that is ALSO grounded in the portal's public-source opportunities.
//
// Text is provider-agnostic: it auto-detects whichever free/low-cost key is
// present — OpenRouter, Google Gemini (free tier, no card) or Groq — all of
// which speak the OpenAI chat-completions protocol. Images are generated
// key-free via Pollinations (see /api/generate/image). When no text key is
// present the portal features + image generation still work, and the assistant
// explains how to switch on general answers.
// ------------------------------------------------------------------
import { runAssistant } from "./assistant";
import { money } from "./format";
import type { Project } from "./types";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface Provider {
  name: string;
  url: string;
  key: string;
  model: string;
  headers?: Record<string, string>;
}

/** First configured text provider wins. All are OpenAI-compatible. */
export function textProvider(): Provider | null {
  const or = process.env.OPENROUTER_API_KEY;
  if (or)
    return {
      name: "OpenRouter",
      url: OPENROUTER_URL,
      key: or,
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-haiku-4.5",
      headers: { "HTTP-Referer": "https://github.com/Bhavani345-max", "X-Title": "Project Discovery Portal" },
    };
  const gem = process.env.GEMINI_API_KEY;
  if (gem)
    return {
      name: "Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: gem,
      model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    };
  const groq = process.env.GROQ_API_KEY;
  if (groq)
    return {
      name: "Groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: groq,
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    };
  return null;
}

export function chatEnabled(): boolean {
  return textProvider() !== null;
}

/** A compact, grounded catalogue of the matched opportunities for the model. */
function opportunityContext(projects: Project[]): string {
  if (!projects.length) return "";
  const lines = projects
    .slice(0, 8)
    .map(
      (p) =>
        `- ${p.title} | ${p.category} | ${p.serviceLine} | ${p.country} | ${money(
          p.budget,
        )} | ${p.fitScore}% fit | ${p.status} | id ${p.id}`,
    )
    .join("\n");
  return `\n\nRelevant public-source opportunities currently in the portal (use ONLY these when discussing specific opportunities — never invent tenders):\n${lines}`;
}

export function buildSystemPrompt(userMessage: string): { system: string; grounded: boolean } {
  const a = runAssistant(userMessage);
  const grounded = a.isSearch && a.projects.length > 0;
  const base = [
    "You are the JSAN Discovery Assistant — a professional, friendly, highly knowledgeable AI assistant embedded in JSAN Consulting's Project Discovery Portal.",
    "",
    "You can:",
    "- Explain any topic clearly and in depth, at the right level for the reader.",
    "- Help with analysis, writing, drafting, planning, brainstorming and step-by-step reasoning.",
    "- Answer questions about the business-development opportunities (RFPs, tenders, procurement) discovered in this portal.",
    "",
    "Formatting: reply in clean GitHub-flavoured Markdown — use headings, **bold**, bullet and numbered lists, tables and fenced code blocks where they help. Keep answers well-structured and skimmable.",
    "Be accurate and honest; if you are unsure or something is outside your knowledge, say so plainly.",
    "JSAN's core service lines: Geospatial Intelligence (GIS), Telecom & Network Engineering, Digital Engineering, Strategic Workforce Solutions, Structured Program Management.",
    "The portal only ever uses publicly available sources — never suggest scraping restricted sites.",
  ].join("\n");
  return { system: grounded ? base + opportunityContext(a.projects) : base, grounded };
}

/** Markdown shown when no text model key is configured. */
export function enableNotice(): string {
  return [
    "I'd love to answer that in full — but a **text AI model isn't connected yet**, so I can't explain general topics right now. (Good news: **image generation already works** with no setup — try the **Image** button.)",
    "",
    "**Switch on ‘answer anything’ with a FREE key — no credit card, ~1 minute:**",
    "",
    "1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** and sign in with your Google account.",
    "2. Click **Create API key** and copy it.",
    "3. Paste it back here — I'll drop it into `.env.local`, restart, and it'll work instantly.",
    "",
    "_(OpenRouter and Groq keys work too — whichever you prefer. Meanwhile I can still search the portal's opportunities, e.g. \"find open GIS tenders in the UK\".)_",
  ].join("\n");
}

/**
 * Streams the model's answer as plain-text chunks. Works with any configured
 * OpenAI-compatible provider. Throws on a non-OK response.
 */
export async function streamChat(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  const p = textProvider();
  if (!p) throw new Error("No text provider configured");

  const res = await fetch(p.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.key}`,
      "Content-Type": "application/json",
      ...(p.headers ?? {}),
    },
    body: JSON.stringify({ model: p.model, stream: true, temperature: 0.4, max_tokens: 1600, messages }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${p.name} ${res.status}: ${detail.slice(0, 200)}`);
  }

  const upstream = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await upstream.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          controller.close();
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta: string = json.choices?.[0]?.delta?.content ?? "";
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // ignore keep-alive / partial lines
        }
      }
    },
    cancel() {
      upstream.cancel().catch(() => {});
    },
  });
}
