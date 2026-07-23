// Minimal client for LM Studio's local OpenAI-compatible API. This is the
// only place the bridge ever talks to LM Studio — no other module reaches
// across the process boundary, and nothing here is reachable by the public
// site directly (see server.mjs).

import {
  LM_STUDIO_URL,
  LM_STUDIO_TIMEOUT_MS,
  PREFERRED_MODEL_IDS,
} from "./config.mjs";

export async function listModelIds() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT_MS);
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/models`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Picks the first preferred model id LM Studio actually reports — never assumed, never hardcoded past a preference order. */
export async function resolveModelId() {
  const available = await listModelIds();
  if (available.length === 0) return null;
  for (const preferred of PREFERRED_MODEL_IDS) {
    if (available.includes(preferred)) return preferred;
  }
  return available[0];
}

export async function chatCompletion({
  modelId,
  systemPrompt,
  userPrompt,
  maxTokens,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT_MS);
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
