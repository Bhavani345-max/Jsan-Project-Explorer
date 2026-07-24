"use client";
// ------------------------------------------------------------------
// Keyless, in-browser language model via WebLLM (MLC) + WebGPU.
//
// Runs a small instruct model entirely on the user's machine — no API key, no
// server, fully private. The model weights download once (~1GB) and are cached
// by the browser thereafter. Used as the automatic text engine when no cloud
// provider key is configured.
// ------------------------------------------------------------------
import type { MLCEngine, InitProgressReport } from "@mlc-ai/web-llm";

export interface LoadProgress {
  text: string;
  progress: number; // 0..1
}

// Small, capable instruct models in rough order of preference (size ↔ quality).
const PREFERRED = [
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f32_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "gemma-2-2b-it-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
];

let engine: MLCEngine | null = null;
let loading: Promise<MLCEngine> | null = null;
let chosenModel = "";

export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function localModelName(): string {
  return chosenModel.replace(/-MLC$/, "").replace(/-q4f\w+/, "");
}

async function ensureEngine(onProgress: (p: LoadProgress) => void): Promise<MLCEngine> {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    const webllm = await import("@mlc-ai/web-llm");
    const available = new Set(webllm.prebuiltAppConfig.model_list.map((m) => m.model_id));
    const model =
      PREFERRED.find((m) => available.has(m)) ??
      webllm.prebuiltAppConfig.model_list.find((m) => /-1B-|-1\.5B-|-2b-/i.test(m.model_id))?.model_id;
    if (!model) throw new Error("No suitable in-browser model is available.");
    chosenModel = model;
    const eng = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (r: InitProgressReport) => onProgress({ text: r.text, progress: r.progress ?? 0 }),
    });
    engine = eng;
    return eng;
  })();
  try {
    return await loading;
  } catch (e) {
    loading = null; // allow a retry on next attempt
    throw e;
  }
}

export async function localChatStream(
  messages: { role: string; content: string }[],
  onDelta: (delta: string) => void,
  onProgress: (p: LoadProgress) => void,
): Promise<void> {
  const eng = await ensureEngine(onProgress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await eng.chat.completions.create({
    messages: messages as any,
    stream: true,
    temperature: 0.4,
    max_tokens: 1024,
  });
  for await (const chunk of stream) {
    const d = chunk.choices?.[0]?.delta?.content ?? "";
    if (d) onDelta(d);
  }
}
