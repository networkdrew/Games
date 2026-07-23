// Minimal client for LM Studio's local OpenAI-compatible API, plus model
// lifecycle management via the `lms` CLI (load/unload/ps) — this is the
// only place the bridge ever talks to LM Studio or shells out to `lms`. No
// other module reaches across the process boundary, and nothing here is
// reachable by the public site directly (see server.mjs).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  LM_STUDIO_URL,
  LM_STUDIO_TIMEOUT_MS,
  MODEL_LOAD_TIMEOUT_MS,
} from "./config.mjs";
import { getModelConfig } from "./models.mjs";

const execFileAsync = promisify(execFile);

/** Resolved lazily so tests can run without `lms` on PATH; production always finds the real CLI. */
function lmsBinary() {
  return process.env.LMS_BIN ?? "lms";
}

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

/**
 * Reads live load state (loaded/not-loaded) from LM Studio's native
 * management API — distinct from /v1/models, which lists every model on
 * disk regardless of whether it's actually resident in memory right now.
 */
export async function getModelState(lmStudioId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT_MS);
  try {
    const res = await fetch(`${LM_STUDIO_URL}/api/v0/models`, {
      signal: controller.signal,
    });
    if (!res.ok) return "unknown";
    const data = await res.json();
    const entry = (data?.data ?? []).find((m) => m.id === lmStudioId);
    return entry?.state ?? "not-loaded";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the game's stable alias (see models.mjs) against whatever LM
 * Studio actually reports as installed. Returns null if the configured
 * model for this alias isn't installed at all — never guesses a
 * substitute identifier.
 */
export async function resolveAlias(alias) {
  const config = getModelConfig(alias);
  if (!config) return null;
  const available = await listModelIds();
  if (!available.includes(config.lmStudioId)) return null;
  return config;
}

// --- Model lifecycle (load/unload) via the `lms` CLI ------------------------
//
// LM Studio's OpenAI-compatible server can just-in-time load a model on the
// first request, but that uses the server's own default context/GPU
// settings, not this game's tuned ones (see models.mjs). Explicitly loading
// via `lms load --ttl --context-length --gpu --identifier` gives full
// control over those settings and a stable, TTL-bounded lifetime, while
// still functioning as "automatic" from the player's perspective — the
// bridge does this itself on first turn, no manual `lms` use required.

const inFlightLoads = new Map(); // lmStudioId -> Promise, single-flight per model

async function runLms(args, timeoutMs = MODEL_LOAD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { stdout } = await execFileAsync(lmsBinary(), args, {
      signal: controller.signal,
      windowsHide: true,
    });
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ensures the given model is loaded in LM Studio with this game's tuned
 * settings, single-flighted so concurrent requests (including from
 * multiple browser tabs) never trigger two simultaneous loads of the same
 * model. Idempotent — a no-op if the model is already loaded.
 */
export async function ensureModelLoaded(config) {
  const state = await getModelState(config.lmStudioId);
  if (state === "loaded") return { alreadyLoaded: true };

  if (inFlightLoads.has(config.lmStudioId)) {
    await inFlightLoads.get(config.lmStudioId);
    return { alreadyLoaded: true };
  }

  const loadPromise = runLms([
    "load",
    config.lmStudioId,
    "-y",
    "--context-length",
    String(config.contextLength),
    "--gpu",
    config.gpuOffload,
    "--ttl",
    String(config.ttlSeconds),
  ]).finally(() => inFlightLoads.delete(config.lmStudioId));

  inFlightLoads.set(config.lmStudioId, loadPromise);
  await loadPromise;
  return { alreadyLoaded: false };
}

/** Releases the model this game loaded — used by the "Release local model" advanced-settings action. Never touches a model this game didn't load itself. */
export async function releaseModel(lmStudioId) {
  try {
    await runLms(["unload", lmStudioId], LM_STUDIO_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Streaming chat completion. Calls `onDelta(textChunk)` for each piece of
 * `content` as LM Studio streams it — real token-by-token/chunk-by-chunk
 * forwarding, not a buffered response revealed gradually. Model-specific
 * generation settings (temperature/topP/stop/reasoning-disable) come from
 * the resolved model config, never hardcoded here.
 */
export async function streamChatCompletion({
  modelId,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature = 0.75,
  topP = 0.9,
  stop = [],
  reasoningDisableParams = {},
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
        stop: stop.length ? stop : undefined,
        stream: true,
        ...reasoningDisableParams,
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

/** Non-streaming call used only for the single, small correction retry after a malformed control block — no need to stream a discarded attempt. */
export async function chatCompletionOnce({
  modelId,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature = 0.5,
  topP = 0.9,
  stop = [],
  reasoningDisableParams = {},
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
        stop: stop.length ? stop : undefined,
        stream: false,
        ...reasoningDisableParams,
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
