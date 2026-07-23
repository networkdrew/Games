// AI Dungeon Door's local bridge: a tiny, single-purpose HTTP server that
// runs only on this PC, binds to loopback by default, and is the sole thing
// allowed to talk to LM Studio (and to shell out to the `lms` CLI). It
// exposes a small fixed set of routes and nothing resembling a
// general-purpose LM Studio proxy. See docs/bridge.md for the full contract
// and threat model.
//
// /api/dungeon/turn is a real, free-form, LLM-driven turn: the model is the
// game master. It interprets the player's free-text action however it
// judges best and proposes a small, bounded CONTROL block (numeric deltas,
// optional clue/item/ending picks from scenario-defined allowlists)
// followed by the actual streamed RESPONSE narration. The bridge validates
// every CONTROL field against the caller's own bounds/allowlists before
// ever forwarding narration to the browser; a malformed block gets one
// compact correction retry. The client independently re-validates and is
// the final authority on whether an ending is actually reachable — the
// bridge never invents game content itself.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  ALLOWED_ORIGINS,
  HARD_MAX_NARRATION_WORDS,
  HOST,
  MAX_ALLOWLIST_ENTRIES,
  MAX_ALLOWLIST_HINT_LENGTH,
  MAX_BODY_BYTES,
  MAX_EXCHANGE_FIELD_LENGTH,
  MAX_FIELD_LENGTH,
  MAX_MEMORY_FACTS,
  MAX_MEMORY_FACT_LENGTH,
  MAX_PLAYER_ACTION_LENGTH,
  MAX_RECENT_EXCHANGES,
  MAX_STATE_SUMMARY_LENGTH,
  MIN_REQUEST_INTERVAL_MS,
  OPENING_MAX_WORDS,
  PORT,
} from "./config.mjs";
import {
  buildCorrectionSystemPrompt,
  buildOpeningSystemPrompt,
  buildOpeningUserPrompt,
  buildProposal,
  buildSystemPrompt,
  buildUserPrompt,
  hasResponseMarker,
  parseControlBlock,
  sanitizeMemoryFact,
  sanitizeNarration,
  textAfterResponseMarker,
} from "./protocol.mjs";
import {
  chatCompletionOnce,
  ensureModelLoaded,
  getModelState,
  releaseModel,
  resolveAlias,
  streamChatCompletion,
} from "./lmstudio.mjs";
import { MODEL_ALIAS, friendlyModelName, getModelConfig } from "./models.mjs";

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function sendJson(res, status, origin, body) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(origin) });
  res.end(JSON.stringify(body));
}

class PayloadTooLargeError extends Error {}

async function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        reject(new PayloadTooLargeError("payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function isNonEmptyString(v, maxLength) {
  return typeof v === "string" && v.length > 0 && v.length <= maxLength;
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function validateAllowlist(list) {
  if (!Array.isArray(list) || list.length > MAX_ALLOWLIST_ENTRIES) return false;
  return list.every(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      isNonEmptyString(e.id, 80) &&
      isNonEmptyString(e.hint, MAX_ALLOWLIST_HINT_LENGTH),
  );
}

function validateCommonFields(body) {
  if (typeof body !== "object" || body === null) return "invalid body";
  if (!isNonEmptyString(body.characterPrompt, MAX_FIELD_LENGTH))
    return "invalid characterPrompt";
  if (!isNonEmptyString(body.secretTruth, MAX_FIELD_LENGTH)) return "invalid secretTruth";
  if (!isNonEmptyString(body.environment, MAX_FIELD_LENGTH)) return "invalid environment";
  return null;
}

function validateTurnBody(body) {
  const commonError = validateCommonFields(body);
  if (commonError) return commonError;

  if (!isNonEmptyString(body.stateSummary, MAX_STATE_SUMMARY_LENGTH))
    return "invalid stateSummary";
  if (!isNonEmptyString(body.playerAction, MAX_PLAYER_ACTION_LENGTH))
    return "invalid playerAction";

  const bounds = body.bounds;
  if (
    typeof bounds !== "object" ||
    bounds === null ||
    !isFiniteNumber(bounds.healthMagnitude) ||
    !isFiniteNumber(bounds.tensionMagnitude) ||
    !isFiniteNumber(bounds.trustMagnitude)
  ) {
    return "invalid bounds";
  }

  if (!validateAllowlist(body.clueAllowlist ?? [])) return "invalid clueAllowlist";
  if (!validateAllowlist(body.itemAllowlist ?? [])) return "invalid itemAllowlist";

  if (body.endings !== undefined) {
    if (!Array.isArray(body.endings) || body.endings.length > MAX_ALLOWLIST_ENTRIES)
      return "invalid endings";
    for (const e of body.endings) {
      if (
        typeof e !== "object" ||
        e === null ||
        (e.kind !== "WIN" && e.kind !== "LOSS") ||
        !isNonEmptyString(e.id, 80) ||
        !isNonEmptyString(e.hint, MAX_ALLOWLIST_HINT_LENGTH)
      ) {
        return "invalid ending entry";
      }
    }
  }

  if (body.memoryFacts !== undefined) {
    if (!Array.isArray(body.memoryFacts) || body.memoryFacts.length > MAX_MEMORY_FACTS)
      return "invalid memoryFacts";
    for (const fact of body.memoryFacts) {
      if (typeof fact !== "string" || fact.length > MAX_MEMORY_FACT_LENGTH)
        return "invalid memory fact";
    }
  }

  if (body.recentExchanges !== undefined) {
    if (
      !Array.isArray(body.recentExchanges) ||
      body.recentExchanges.length > MAX_RECENT_EXCHANGES
    ) {
      return "invalid recentExchanges";
    }
    for (const ex of body.recentExchanges) {
      if (typeof ex !== "object" || ex === null) return "invalid recent exchange entry";
      if (typeof ex.action !== "string" || ex.action.length > MAX_EXCHANGE_FIELD_LENGTH)
        return "invalid recent exchange action";
      if (typeof ex.narration !== "string" || ex.narration.length > MAX_EXCHANGE_FIELD_LENGTH)
        return "invalid recent exchange narration";
    }
  }

  return null;
}

function validateOpeningBody(body) {
  return validateCommonFields(body);
}

function writeEvent(res, event) {
  if (res.writableEnded || res.destroyed) return;
  res.write(JSON.stringify(event) + "\n");
}

/**
 * `deps` lets tests substitute fake LM Studio/lms-CLI functions without a
 * real model running — production always uses the real modules above.
 */
export function createRequestHandler(
  deps = {
    resolveAlias,
    getModelState,
    ensureModelLoaded,
    releaseModel,
    streamChatCompletion,
    chatCompletionOnce,
  },
) {
  let lastRequestAt = 0;
  let busy = false;

  async function handleTurnOrOpening(req, res, origin) {
    let raw;
    try {
      raw = await readBody(req, MAX_BODY_BYTES);
    } catch {
      sendJson(res, 413, origin, { ok: false, error: "payload too large" });
      return;
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      sendJson(res, 400, origin, { ok: false, error: "invalid JSON" });
      return;
    }

    const mode = body?.mode === "opening" ? "opening" : "turn";
    const validationError =
      mode === "opening" ? validateOpeningBody(body) : validateTurnBody(body);
    if (validationError) {
      sendJson(res, 400, origin, { ok: false, error: validationError });
      return;
    }

    if (busy) {
      sendJson(res, 429, origin, { ok: false, error: "a generation is already in progress" });
      return;
    }
    const now = Date.now();
    if (now - lastRequestAt < MIN_REQUEST_INTERVAL_MS) {
      sendJson(res, 429, origin, { ok: false, error: "rate limited, slow down" });
      return;
    }

    busy = true;
    lastRequestAt = now;

    const requestId = randomUUID().slice(0, 8);
    const logSafe = (line) => console.log(`[dungeon:${requestId}] ${line}`);

    const turnAbortController = new AbortController();
    req.on("close", () => turnAbortController.abort());

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      ...corsHeaders(origin),
    });

    try {
      const config = await deps.resolveAlias(MODEL_ALIAS);
      writeEvent(res, { type: "start", requestId });

      if (!config) {
        logSafe("configured model not installed — signaling fallback");
        writeEvent(res, { type: "model", modelId: null, alias: MODEL_ALIAS });
        writeEvent(res, { type: "control", proposal: null, fallback: true, corrected: false });
        writeEvent(res, { type: "done", stats: { fallback: true } });
        res.end();
        return;
      }

      writeEvent(res, {
        type: "model",
        modelId: config.lmStudioId,
        alias: MODEL_ALIAS,
        friendlyName: friendlyModelName(config.lmStudioId),
      });

      const loadState = await deps.getModelState(config.lmStudioId);
      if (loadState !== "loaded") {
        writeEvent(res, { type: "loading" });
        await deps.ensureModelLoaded(config);
      }

      const systemPrompt =
        mode === "opening" ? buildOpeningSystemPrompt() : buildSystemPrompt();
      const userPrompt =
        mode === "opening" ? buildOpeningUserPrompt(body) : buildUserPrompt(body);
      logSafe(
        `mode=${mode} model=${config.lmStudioId} stream=true prompt_chars≈${systemPrompt.length + userPrompt.length}`,
      );

      if (mode === "opening") {
        let full = "";
        const result = await deps.streamChatCompletion({
          modelId: config.lmStudioId,
          systemPrompt,
          userPrompt,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          topP: config.topP,
          stop: config.stopSequences,
          reasoningDisableParams: config.reasoningDisableParams,
          onDelta: (chunk) => {
            full += chunk;
            writeEvent(res, { type: "delta", text: chunk });
          },
          signal: turnAbortController.signal,
        });
        const narration = sanitizeNarration(full, OPENING_MAX_WORDS);
        writeEvent(res, {
          type: "opening",
          ok: narration !== null,
          fallback: narration === null,
        });
        writeEvent(res, {
          type: "done",
          stats: {
            firstTokenMs: result.firstTokenMs,
            totalMs: result.totalMs,
            chunks: result.chunks,
            fallback: narration === null,
          },
        });
        logSafe(`opening ${narration === null ? "failed -> fallback" : "ok"}`);
        res.end();
        return;
      }

      // --- turn mode: CONTROL block (buffered, never forwarded) + streamed RESPONSE ---
      let buffer = "";
      let responseStarted = false;

      const onDelta = (chunk) => {
        if (responseStarted) {
          writeEvent(res, { type: "delta", text: chunk });
          return;
        }
        buffer += chunk;
        if (hasResponseMarker(buffer)) {
          responseStarted = true;
          const remainder = textAfterResponseMarker(buffer);
          if (remainder.length > 0) writeEvent(res, { type: "delta", text: remainder });
        }
      };

      const result = await deps.streamChatCompletion({
        modelId: config.lmStudioId,
        systemPrompt,
        userPrompt,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        topP: config.topP,
        stop: config.stopSequences,
        reasoningDisableParams: config.reasoningDisableParams,
        onDelta,
        signal: turnAbortController.signal,
      });

      if (responseStarted) {
        const fields = parseControlBlock(buffer);
        const { proposal, corrections } = buildProposal(fields, {
          bounds: body.bounds,
          clueAllowlist: body.clueAllowlist ?? [],
          itemAllowlist: body.itemAllowlist ?? [],
          endings: body.endings ?? [],
        });
        proposal.memory = sanitizeMemoryFact(fields.memory);
        logSafe(
          `first_token=${result.firstTokenMs}ms total=${result.totalMs}ms chunks=${result.chunks} corrections=${corrections.length}`,
        );
        writeEvent(res, {
          type: "control",
          proposal,
          fallback: false,
          corrected: false,
          corrections,
        });
        writeEvent(res, {
          type: "done",
          stats: {
            firstTokenMs: result.firstTokenMs,
            totalMs: result.totalMs,
            chunks: result.chunks,
            fallback: false,
            corrected: false,
            corrections: corrections.length,
          },
        });
        res.end();
        return;
      }

      // No RESPONSE: marker ever appeared — the whole block was malformed
      // and nothing has streamed to the browser yet. Retry exactly once
      // with a compact correction prompt, non-streamed.
      logSafe("malformed control block on first attempt — retrying once");
      const correctionRaw = await deps.chatCompletionOnce({
        modelId: config.lmStudioId,
        systemPrompt: buildCorrectionSystemPrompt(),
        userPrompt,
        maxTokens: config.maxTokens,
        stop: config.stopSequences,
        reasoningDisableParams: config.reasoningDisableParams,
      });

      const correctionText = correctionRaw ?? "";
      if (hasResponseMarker(correctionText)) {
        const narration = sanitizeNarration(
          textAfterResponseMarker(correctionText),
          HARD_MAX_NARRATION_WORDS,
        );
        if (narration) {
          const fields = parseControlBlock(correctionText);
          const { proposal, corrections } = buildProposal(fields, {
            bounds: body.bounds,
            clueAllowlist: body.clueAllowlist ?? [],
            itemAllowlist: body.itemAllowlist ?? [],
            endings: body.endings ?? [],
          });
          proposal.memory = sanitizeMemoryFact(fields.memory);
          writeEvent(res, { type: "delta", text: narration });
          writeEvent(res, {
            type: "control",
            proposal,
            fallback: false,
            corrected: true,
            corrections,
          });
          writeEvent(res, {
            type: "done",
            stats: { fallback: false, corrected: true, corrections: corrections.length },
          });
          logSafe("correction succeeded");
          res.end();
          return;
        }
      }

      logSafe("correction also failed — signaling fallback to deterministic engine");
      writeEvent(res, { type: "control", proposal: null, fallback: true, corrected: true });
      writeEvent(res, { type: "done", stats: { fallback: true, corrected: true } });
      res.end();
    } catch (err) {
      logSafe(`error: ${err instanceof Error ? err.message : "unknown"}`);
      if (!res.headersSent) {
        sendJson(res, 500, origin, { ok: false, error: "internal error" });
      } else if (!res.writableEnded) {
        writeEvent(res, { type: "error", message: "internal error" });
        res.end();
      }
    } finally {
      busy = false;
    }
  }

  return async function handler(req, res) {
    const origin = req.headers.origin;
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    // Reject any browser-supplied origin outside the approved list outright
    // — this bridge is not meant to serve arbitrary sites.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      sendJson(res, 403, undefined, { ok: false, error: "origin not allowed" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const config = await deps.resolveAlias(MODEL_ALIAS);
      if (!config) {
        sendJson(res, 200, origin, { ok: false, installed: false, loaded: false });
        return;
      }
      const state = await deps.getModelState(config.lmStudioId);
      sendJson(res, 200, origin, {
        ok: true,
        installed: true,
        loaded: state === "loaded",
        alias: MODEL_ALIAS,
        modelId: config.lmStudioId,
        friendlyName: friendlyModelName(config.lmStudioId),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/dungeon/ensure") {
      const config = await deps.resolveAlias(MODEL_ALIAS);
      if (!config) {
        sendJson(res, 200, origin, { ok: false, error: "model not installed" });
        return;
      }
      if (busy) {
        sendJson(res, 429, origin, { ok: false, error: "busy" });
        return;
      }
      busy = true;
      const startedAt = Date.now();
      try {
        const { alreadyLoaded } = await deps.ensureModelLoaded(config);
        sendJson(res, 200, origin, {
          ok: true,
          alreadyLoaded,
          modelId: config.lmStudioId,
          tookMs: Date.now() - startedAt,
        });
      } catch {
        sendJson(res, 200, origin, { ok: false, error: "load failed" });
      } finally {
        busy = false;
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/dungeon/release") {
      const config = getModelConfig(MODEL_ALIAS);
      if (!config) {
        sendJson(res, 200, origin, { ok: false, error: "no model configured" });
        return;
      }
      const released = await deps.releaseModel(config.lmStudioId);
      sendJson(res, 200, origin, { ok: released });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/dungeon/turn") {
      await handleTurnOrOpening(req, res, origin);
      return;
    }

    sendJson(res, 404, origin, { ok: false, error: "not found" });
  };
}

export function startServer() {
  const server = createServer(createRequestHandler());
  server.listen(PORT, HOST, () => {
    console.log(`AI Dungeon Door bridge listening on http://${HOST}:${PORT}`);
    console.log("Bound to loopback only — not reachable from other devices.");
  });

  function shutdown() {
    console.log("\nShutting down bridge...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isMainModule || process.argv[1]?.endsWith("server.mjs")) {
  startServer();
}
