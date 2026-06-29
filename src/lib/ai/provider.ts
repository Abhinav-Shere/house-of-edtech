import type { AiAction } from "@/lib/validation";

/**
 * Provider-agnostic AI helper. Configure exactly one provider via env:
 *   AI_PROVIDER = openai | groq | gemini
 *   AI_API_KEY  = <key>
 *   AI_MODEL    = <model name>  (sensible default per provider)
 *
 * When no key is configured, isAiEnabled() is false and the UI hides AI
 * features — the app degrades gracefully instead of erroring.
 */

export function isAiEnabled(): boolean {
  return Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY);
}

const SYSTEM_PROMPTS: Record<AiAction, string> = {
  summarize:
    "You are a concise editor. Summarize the document in 3-5 bullet points. Return only the summary.",
  improve:
    "You are a careful copy editor. Improve clarity, grammar, and flow of the text without changing its meaning or adding new facts. Return only the revised text.",
  continue:
    "You are a writing assistant. Continue the document naturally from where it leaves off, matching tone and style. Return only the new continuation text.",
  title:
    "Suggest a short, specific document title (max 8 words) for the text. Return only the title, no quotes.",
};

interface ChatResult {
  text: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  gemini: "gemini-1.5-flash",
};

const OPENAI_COMPATIBLE_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
};

export async function runAi(action: AiAction, text: string): Promise<ChatResult> {
  const provider = (process.env.AI_PROVIDER ?? "").toLowerCase();
  const apiKey = process.env.AI_API_KEY ?? "";
  const model = process.env.AI_MODEL || DEFAULT_MODELS[provider] || "";
  const system = SYSTEM_PROMPTS[action];

  if (!provider || !apiKey) {
    throw new Error("AI is not configured on this deployment.");
  }

  if (provider === "gemini") {
    return geminiChat({ apiKey, model, system, user: text });
  }

  const baseUrl = OPENAI_COMPATIBLE_BASE[provider];
  if (!baseUrl) throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  return openAiCompatibleChat({ baseUrl, apiKey, model, system, user: text });
}

async function openAiCompatibleChat(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<ChatResult> {
  const res = await fetch(`${args.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI provider error (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("AI provider returned an empty response.");
  return { text: out };
}

async function geminiChat(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<ChatResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${args.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts: [{ text: args.user }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI provider error (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!out) throw new Error("AI provider returned an empty response.");
  return { text: out };
}
