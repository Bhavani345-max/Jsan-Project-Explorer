"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Send,
  Image as ImageIcon,
  FileText,
  Presentation,
  Copy,
  Check,
  MapPin,
  Wallet,
  ArrowUpRight,
  BookOpen,
  Search,
  Wand2,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { Markdown } from "@/components/Markdown";
import { money, deadlineLabel } from "@/lib/format";
import { exportPdf, exportPptx } from "@/lib/exporters";
import { webgpuAvailable, localChatStream } from "@/lib/localModel";

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  loadingText?: string;
  image?: string;
  projects?: Project[];
  filters?: Record<string, string>;
}

const SUGGESTIONS = [
  { icon: BookOpen, text: "Explain how 5G network slicing works, with a simple analogy" },
  { icon: Search, text: "Find open GIS opportunities best fit for us" },
  { icon: Presentation, text: "Create a 5-slide brief on winning government GIS tenders" },
  { icon: Wand2, text: "Draft a short capability statement for a telecom RFP" },
];

const CAPS = [
  { icon: BookOpen, title: "Explain anything", body: "Any topic, in the depth you need — plain English or technical." },
  { icon: Search, title: "Find opportunities", body: "Search the portal's public-source tenders in natural language." },
  { icon: Presentation, title: "Slides & PDF", body: "Turn any answer into a branded PowerPoint or PDF, instantly." },
  { icon: ImageIcon, title: "Generate images", body: "Create visuals from a prompt — free, no key needed." },
];

// Detects when the user wants a picture/map/drawing rather than text, so we can
// route to the (free, keyless) image generator instead of the text model.
function looksLikeImageRequest(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (/^(what|who|why|how|when|where|which|explain|define|describe|tell me|is |are |does )/.test(t)) return false;
  const visualNoun =
    /\b(image|picture|pic|photo|photograph|drawing|illustration|logo|poster|wallpaper|portrait|banner|icon|artwork|graphic|scene|map|painting)\b/;
  if (/\b(road ?-?map|site ?map|mind ?map|heat ?map)\b/.test(t)) return false; // not pictures
  if (/\b(image|picture|photo|drawing|illustration|logo|poster|map|portrait|painting) of\b/.test(t)) return true;
  if (/\b(draw|sketch|paint|illustrate|render|photograph)\b/.test(t)) return true;
  if (/\b(generate|create|make|design|show me|give me|visuali[sz]e)\b/.test(t) && visualNoun.test(t)) return true;
  if (visualNoun.test(t) && t.split(/\s+/).length <= 6) return true; // e.g. "asia map"
  return false;
}

function buildLocalSystem(projects: Project[] | null): string {
  const base =
    "You are the JSAN Discovery Assistant, a helpful, knowledgeable AI assistant for JSAN Consulting. " +
    "Explain topics clearly and answer questions accurately in concise, well-structured Markdown (use headings, **bold** and bullet lists). " +
    "If you are unsure, say so. JSAN's focus areas are GIS/geospatial, telecom & network engineering, digital engineering, workforce solutions and program management.";
  if (!projects || !projects.length) return base;
  const ctx = projects
    .slice(0, 6)
    .map((p) => `- ${p.title} | ${p.category} | ${p.country} | ${p.fitScore}% fit | ${p.status}`)
    .join("\n");
  return `${base}\n\nRelevant portal opportunities (only use these for specific opportunities):\n${ctx}`;
}

export function AssistantChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [localOk, setLocalOk] = useState<boolean | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const nextId = () => ++idRef.current;

  useEffect(() => {
    setLocalOk(webgpuAvailable());
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.enabled)))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function patch(id: number, up: Partial<ChatMsg>) {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...up } : x)));
  }

  async function streamRead(res: Response, botId: number) {
    if (!res.body) {
      patch(botId, { content: await res.text(), streaming: false });
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
      patch(botId, { content: acc });
    }
    patch(botId, { streaming: false });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";

    // Visual requests ("asia map", "draw a fox") → image generator, not text.
    if (looksLikeImageRequest(q)) {
      runImage(q);
      return;
    }

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMsg = { id: nextId(), role: "user", content: q };
    const botId = nextId();
    setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", content: "", streaming: true }]);
    setBusy(true);

    // Opportunity cards + grounding context (fast, local server).
    let oppProjects: Project[] = [];
    let isSearch = false;
    try {
      const a = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      }).then((r) => r.json());
      if (a?.isSearch && a?.projects?.length) {
        oppProjects = a.projects;
        isSearch = true;
        patch(botId, { projects: a.projects, filters: a.filters });
      }
    } catch {
      /* ignore */
    }

    try {
      if (aiEnabled) {
        // Cloud provider (OpenRouter / Gemini / Groq) — server streams & grounds.
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...history, { role: "user", content: q }] }),
        });
        await streamRead(res, botId);
      } else if (localOk) {
        // Keyless in-browser model (WebGPU). First run downloads weights once.
        const msgs = [
          { role: "system", content: buildLocalSystem(isSearch ? oppProjects : null) },
          ...history,
          { role: "user", content: q },
        ];
        let first = true;
        let acc = "";
        await localChatStream(
          msgs,
          (d) => {
            if (first) {
              first = false;
              patch(botId, { loadingText: undefined });
            }
            acc += d;
            patch(botId, { content: acc });
          },
          (p) => {
            if (first)
              patch(botId, {
                loadingText: `Preparing a private in-browser AI — first time only, downloads once (~1GB). ${Math.round(
                  p.progress * 100,
                )}%`,
              });
          },
        );
        patch(botId, { streaming: false, loadingText: undefined });
      } else {
        // No key and no WebGPU — server returns a friendly "how to enable" note.
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...history, { role: "user", content: q }] }),
        });
        await streamRead(res, botId);
      }
    } catch (e) {
      const local = localOk && !aiEnabled;
      patch(botId, {
        streaming: false,
        loadingText: undefined,
        content: local
          ? `⚠️ The in-browser AI couldn't start: ${(e as Error).message}\n\nThis usually means WebGPU isn't available in this browser. Try the latest Chrome or Edge, or add a free API key.`
          : "Sorry — I couldn't complete that. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function runImage(prompt: string) {
    const q = prompt.trim();
    if (!q || busy) return;
    const userMsg: ChatMsg = { id: nextId(), role: "user", content: q };
    const botId = nextId();
    setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", content: "", streaming: true, loadingText: "Generating your image…" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      const data = await res.json();
      if (data.image) patch(botId, { content: `Here's the image for **${q}**:`, image: data.image, streaming: false, loadingText: undefined });
      else patch(botId, { content: `⚠️ ${data.error ?? "Couldn't generate that image."}`, streaming: false, loadingText: undefined });
    } catch {
      patch(botId, { content: "⚠️ Image generation failed. Please try again.", streaming: false, loadingText: undefined });
    } finally {
      setBusy(false);
    }
  }

  function generateImage() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    runImage(q);
  }

  function copy(m: ChatMsg) {
    navigator.clipboard?.writeText(m.content).then(() => {
      setCopied(m.id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function openInExplorer(filters: Record<string, string>) {
    router.push(`/explorer?${new URLSearchParams(filters).toString()}`);
  }

  const empty = messages.length === 0;
  const statusLabel =
    aiEnabled === null ? "…" : aiEnabled ? "AI model connected" : localOk ? "Local AI · free, no key" : "Add a free key for chat";
  const statusGood = aiEnabled || (aiEnabled === false && localOk);

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border shrink-0">
        <span
          className="grid place-items-center w-9 h-9 rounded-xl text-white"
          style={{ background: "linear-gradient(120deg, var(--primary), var(--accent))" }}
        >
          <Sparkles size={18} />
        </span>
        <div className="leading-tight">
          <h1 className="font-bold text-[15px] flex items-center gap-2">AI Assistant</h1>
          <p className="text-[12px] text-text-faint">Explains any topic · finds opportunities · makes slides, PDFs & images</p>
        </div>
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={
            statusGood
              ? { background: "var(--success-soft)", color: "var(--success)" }
              : { background: "var(--warning-soft)", color: "var(--warning)" }
          }
          title={
            aiEnabled
              ? "Cloud AI model connected — ask anything"
              : localOk
                ? "Private in-browser AI (WebGPU) — no key, no cost. First answer downloads the model once."
                : "Add a free Google Gemini key to answer any topic. Images already work free."
          }
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
          {statusLabel}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-5 bg-bg-subtle">
        {empty ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <span
                className="inline-grid place-items-center w-14 h-14 rounded-2xl text-white mb-3"
                style={{ background: "linear-gradient(120deg, var(--primary), var(--accent))" }}
              >
                <Sparkles size={26} />
              </span>
              <h2 className="text-xl font-bold">How can I help, Alex?</h2>
              <p className="text-text-muted text-sm mt-1">
                Ask me to explain a topic, find opportunities, or produce a deck — I&apos;ll ground opportunity answers in the
                portal&apos;s public-source data.
              </p>
              {aiEnabled === false && localOk && (
                <p className="text-[12px] text-text-faint mt-2">
                  Running a private in-browser AI — the first answer downloads a small model once, then it&apos;s instant.
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              {CAPS.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.title} className="card !shadow-none border border-border p-3.5 flex gap-3">
                    <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary-soft text-primary shrink-0">
                      <Icon size={17} />
                    </span>
                    <div>
                      <div className="font-semibold text-[13.5px]">{c.title}</div>
                      <div className="text-[12px] text-text-faint leading-snug mt-0.5">{c.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    className="w-full flex items-center gap-2.5 text-left text-[13px] bg-bg-elev border border-border rounded-xl px-3.5 py-2.5 hover:border-primary hover:text-primary transition-colors"
                  >
                    <Icon size={15} className="text-text-faint shrink-0" />
                    {s.text}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex gap-3"}>
                {m.role === "assistant" && (
                  <span
                    className="grid place-items-center w-8 h-8 rounded-lg text-white shrink-0 mt-0.5"
                    style={{ background: "linear-gradient(120deg, var(--primary), var(--accent))" }}
                  >
                    <Sparkles size={15} />
                  </span>
                )}
                <div className={m.role === "user" ? "max-w-[85%]" : "flex-1 min-w-0"}>
                  {m.role === "user" ? (
                    <div className="bg-primary text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-[13.5px] whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    <div className="bg-bg-elev border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                      {m.content ? (
                        <Markdown text={m.content} />
                      ) : m.loadingText ? (
                        <LoadingLine text={m.loadingText} />
                      ) : m.streaming ? (
                        <Typing />
                      ) : null}
                      {m.streaming && m.content && (
                        <span className="inline-block w-1.5 h-4 align-middle bg-primary/70 ml-0.5 animate-pulse" />
                      )}

                      {m.image && (
                        <div className="mt-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.image} alt="Generated" className="rounded-xl border border-border max-w-full" />
                          <a
                            href={m.image}
                            download="jsan-generated.png"
                            className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-semibold text-primary hover:underline"
                          >
                            <ArrowUpRight size={13} /> Download image
                          </a>
                        </div>
                      )}

                      {/* Opportunity cards */}
                      {m.projects && m.projects.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                            Matched opportunities
                          </div>
                          {m.projects.slice(0, 4).map((p) => (
                            <Link
                              key={p.id}
                              href={`/projects/${p.id}`}
                              className="block bg-bg-subtle border border-border rounded-xl p-3 hover:border-primary transition-colors group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold text-[13px] leading-snug line-clamp-2 group-hover:text-primary">
                                  {p.title}
                                </span>
                                <span
                                  className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ background: "var(--success-soft)", color: "var(--success)" }}
                                >
                                  {p.fitScore}%
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-text-muted">
                                <span className="flex items-center gap-1">
                                  <MapPin size={11} className="text-text-faint" />
                                  {p.country}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Wallet size={11} className="text-text-faint" />
                                  {money(p.budget)}
                                </span>
                                <span>{deadlineLabel(p.deadline)}</span>
                              </div>
                            </Link>
                          ))}
                          {m.filters && Object.keys(m.filters).length > 0 && (
                            <button
                              onClick={() => openInExplorer(m.filters!)}
                              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold text-primary py-1.5 rounded-lg hover:bg-primary-soft transition-colors"
                            >
                              Open all in the Explorer <ArrowUpRight size={13} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Answer toolbar */}
                      {!m.streaming && m.content && !m.image && (
                        <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-border">
                          <ToolbarBtn onClick={() => copy(m)} icon={copied === m.id ? Check : Copy} label={copied === m.id ? "Copied" : "Copy"} />
                          <ToolbarBtn onClick={() => exportPdf(m.content)} icon={FileText} label="PDF" />
                          <ToolbarBtn onClick={() => exportPptx(m.content)} icon={Presentation} label="Slides" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-bg-elev p-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask anything, or describe opportunities you need…"
                className="input !py-2.5 resize-none max-h-40"
              />
            </div>
            <button
              onClick={generateImage}
              disabled={!input.trim() || busy}
              title="Generate an image from your prompt (free, no key)"
              className="btn btn-ghost !px-3 !py-2.5 disabled:opacity-40"
            >
              <ImageIcon size={16} />
              <span className="hidden sm:inline">Image</span>
            </button>
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || busy}
              className="btn btn-primary !px-3.5 !py-2.5 disabled:opacity-40"
              aria-label="Send"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="flex items-center gap-1.5 mt-2 px-1 text-[10.5px] text-text-faint">
            <ShieldCheck size={12} className="text-success" />
            Opportunity data is public-source only. AI answers can contain mistakes — verify anything important.
          </p>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Copy; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted hover:text-primary hover:bg-primary-soft rounded-lg px-2 py-1 transition-colors"
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function LoadingLine({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-text-muted">
      <Loader2 size={14} className="animate-spin text-primary" />
      {text}
    </span>
  );
}

function Typing() {
  return (
    <span className="flex gap-1 py-1">
      {[0, 1, 2].map((d) => (
        <span key={d} className="w-1.5 h-1.5 rounded-full bg-text-faint animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
      ))}
    </span>
  );
}
