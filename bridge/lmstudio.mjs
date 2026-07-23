// Minimal client for LM Studio's local OpenAI-compatible API. This is the
// only place the bridge ever talks to LM Studio — no other module reaches
// across the process boundary, and nothing here is reachable by the public
// site directly (see server.mjs).

import {
  LM_STUDIO_URL,
  LM_STUDIO_TIMEOUT_MS,
  PRIMARY_MODEL_PRIORITY,
  TINY_MODEL_PRIORITY,
  REASONING_DISABLE_PARAMS,
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

function firstAvailable(priorityList, available) {
  for (const preferred of priorityList) {
    if (available.includes(preferred)) return preferred;
  }
  return null;
}

/**
 * Resolves both tiers against whatever LM Studio actually reports. Returns
 * `{ primaryModelId, tinyModelId }` — either may be null if nothing in that
 * tier's priority list is currently loaded. Never guesses an identifier.
 */
export async function resolveModels() {
  const available = await listModelIds();
  return {
    primaryModelId: firstAvailable(PRIMARY_MODEL_PRIORITY, available),
    tinyModelId: firstAvailable(TINY_MODEL_PRIORITY, available),
    available,
  };
}

/**
 * Streaming chat completion. Calls `onDelta(textChunk)` for each piece of
 * `content` as LM Studio streams it — real token-by-token/chunk-by-chunk
 * forwarding, not a buffered response revealed gradually. Returns the full
 * accumulated text once the stream ends, or null if the request failed.
 * Reasoning is explicitly disabled (see config.mjs) since several installed
 * models emit hidden chain-of-thought that would otherwise consume the
 * entire token budget before any real content appears.
 */
export async function streamChatCompletion({
  modelId,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature = 0.75,
  topP = 0.9,
  onDelta,
  signal,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  let firstTokenAt = null;
  const startedAt = Date.now();
  let chunkCount = 0;
  let full = "";

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
        temperature,
        top_p: topP,
        stream: true,
        ...REASONING_DISABLE_PARAMS,
      }),
    });

    if (!res.ok || !res.body) {
      return {
        text: null,
        firstTokenMs: null,
        totalMs: Date.now() - startedAt,
        chunks: 0,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // LM Studio streams standard OpenAI-style SSE: lines of `data: {...}`,
      // terminated by a line `data: [DONE]`.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (payload === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          chunkCount++;
          full += delta;
          onDelta?.(delta);
        }
      }
    }

    return {
      text: full,
      firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null,
      totalMs: Date.now() - startedAt,
      chunks: chunkCount,
    };
  } catch {
    return {
      text: full.length > 0 ? full : null,
      firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null,
      totalMs: Date.now() - startedAt,
      chunks: chunkCount,
      aborted: true,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Non-streaming call used only for the single, small correction retry after an invalid outcome — no need to stream a discarded attempt. */
export async function chatCompletionOnce({
  modelId,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature = 0.5,
  topP = 0.9,
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
        temperature,
        top_p: topP,
        stream: false,
        ...REASONING_DISABLE_PARAMS,
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
