// AI Dungeon Door's local bridge: a tiny, single-purpose HTTP server that
// runs only on this PC, binds to loopback by default, and is the sole thing
// allowed to talk to LM Studio. It exposes exactly two routes — /health and
// /api/dungeon/turn — and nothing resembling a general-purpose LM Studio
// proxy. See docs/bridge.md for the full contract and threat model.
//
// /api/dungeon/turn is a real LLM-driven turn: the client sends a compact,
// already-bounded description of the current scenario/state and the set of
// outcomes that are legal right now (see docs/architecture.md); the model
// interprets the player's free-text action, picks exactly one of those
// outcome ids, and narrates it — streamed back chunk by chunk as LM Studio
// generates it. The bridge validates the chosen id against the caller's own
// legal-outcomes list before ever forwarding narration to the browser; an
// invalid choice gets one compact correction retry, then a `fallback: true`
// signal that tells the client to fall back to its own deterministic
// engine — the bridge never invents game content itself.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  ALLOWED_ORIGINS,
  HARD_MAX_NARRATION_WORDS,
  HOST,
  KNOWN_OUTCOME_IDS,
  MAX_BODY_BYTES,
  MAX_EXCHANGE_FIELD_LENGTH,
  MAX_FIELD_LENGTH,
  MAX_LEGAL_OUTCOMES,
  MAX_MEMORY_FACTS,
  MAX_MEMORY_FACT_LENGTH,
  MAX_OUTCOME_DESCRIPTION_LENGTH,
  MAX_PLAYER_ACTION_LENGTH,
  MAX_RECENT_EXCHANGES,
  MAX_STATE_SUMMARY_LENGTH,
  MAX_TOKENS,
  MIN_REQUEST_INTERVAL_MS,
  PORT,
} from "./config.mjs";
import {
  buildCorrectionSystemPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  hasNarrationMarker,
  isValidOutcomeId,
  parseModelResponse,
  sanitizeMemoryFact,
  sanitizeNarration,
  textAfterNarrationMarker,
} from "./protocol.mjs";
import {
  chatCompletionOnce,
  resolveModels,
  streamChatCompletion,
} from "./lmstudio.mjs";

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
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...corsHeaders(origin),
  });
  res.end(JSON.stringify(body));
}

class PayloadTooLargeError extends Error {}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
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

function validateTurnBody(body) {
  if (typeof body !== "object" || body === null) return "invalid body";
  if (body.modelTier !== "primary" && body.modelTier !== "tiny") {
    return "modelTier must be 'primary' or 'tiny'";
  }
  if (!isNonEmptyString(body.characterPrompt, MAX_FIELD_LENGTH))
    return "invalid characterPrompt";
  if (!isNonEmptyString(body.secretTruth, MAX_FIELD_LENGTH))
    return "invalid secretTruth";
  if (!isNonEmptyString(body.stateSummary, MAX_STATE_SUMMARY_LENGTH))
    return "invalid stateSummary";
  if (!isNonEmptyString(body.playerAction, MAX_PLAYER_ACTION_LENGTH))
    return "invalid playerAction";

  if (!Array.isArray(body.legalOutcomes) || body.legalOutcomes.length === 0) {
    return "legalOutcomes must be a non-empty array";
  }
  if (body.legalOutcomes.length > MAX_LEGAL_OUTCOMES)
    return "too many legalOutcomes";
  for (const outcome of body.legalOutcomes) {
    if (typeof outcome !== "object" || outcome === null)
      return "invalid legal outcome entry";
    if (!KNOWN_OUTCOME_IDS.includes(outcome.id))
      return "unknown legal outcome id";
    if (
      !isNonEmptyString(outcome.description, MAX_OUTCOME_DESCRIPTION_LENGTH)
    ) {
      return "invalid legal outcome description";
    }
  }

  if (body.memoryFacts !== undefined) {
    if (
      !Array.isArray(body.memoryFacts) ||
      body.memoryFacts.length > MAX_MEMORY_FACTS
    ) {
      return "invalid memoryFacts";
    }
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
      if (typeof ex !== "object" || ex === null)
        return "invalid recent exchange entry";
      if (
        typeof ex.action !== "string" ||
        ex.action.length > MAX_EXCHANGE_FIELD_LENGTH
      ) {
        return "invalid recent exchange action";
      }
      if (
        typeof ex.narration !== "string" ||
        ex.narration.length > MAX_EXCHANGE_FIELD_LENGTH
      ) {
        return "invalid recent exchange narration";
      }
    }
  }

  return null;
}

/** Writes one NDJSON event line — every line is a complete, independently-parseable JSON object, so the client can split on "\n" without buffering a full SSE frame. */
function writeEvent(res, event) {
  if (res.writableEnded || res.destroyed) return;
  res.write(JSON.stringify(event) + "\n");
}

/**
 * `deps` lets tests substitute fake LM Studio functions without a real
 * model running — production always uses the real lmstudio.mjs functions.
 */
export function createRequestHandler(
  deps = { resolveModels, streamChatCompletion, chatCompletionOnce },
) {
  let lastRequestAt = 0;
  let busy = false;

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
      const { primaryModelId, tinyModelId } = await deps.resolveModels();
      sendJson(res, 200, origin, {
        ok: primaryModelId !== null || tinyModelId !== null,
        primaryModelId: primaryModelId ?? undefined,
        tinyModelId: tinyModelId ?? undefined,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/dungeon/turn") {
      let raw;
      try {
        raw = await readBody(req);
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

      const validationError = validateTurnBody(body);
      if (validationError) {
        sendJson(res, 400, origin, { ok: false, error: validationError });
        return;
      }

      if (busy) {
        sendJson(res, 429, origin, {
          ok: false,
          error: "a generation is already in progress",
        });
        return;
      }
      const now = Date.now();
      if (now - lastRequestAt < MIN_REQUEST_INTERVAL_MS) {
        sendJson(res, 429, origin, {
          ok: false,
          error: "rate limited, slow down",
        });
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
        const { primaryModelId, tinyModelId } = await deps.resolveModels();
        const modelId =
          body.modelTier === "primary" ? primaryModelId : tinyModelId;

        writeEvent(res, { type: "start", requestId });
        writeEvent(res, {
          type: "model",
          modelId: modelId ?? null,
          tier: body.modelTier,
        });

        if (!modelId) {
          logSafe(
            `no model available for tier=${body.modelTier} — signaling fallback`,
          );
          writeEvent(res, {
            type: "outcome",
            id: null,
            fallback: true,
            corrected: false,
          });
          writeEvent(res, { type: "done", stats: { fallback: true } });
          res.end();
          return;
        }

        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(body);
        logSafe(
          `model=${modelId} stream=true prompt_chars≈${systemPrompt.length + userPrompt.length}`,
        );

        let buffer = "";
        let outcomeId = null;
        let outcomeValidated = false;
        let outcomeInvalid = false;
        let narrationStarted = false;

        const onDelta = (chunk) => {
          if (narrationStarted) {
            writeEvent(res, { type: "delta", text: chunk });
            return;
          }
          buffer += chunk;
          if (!outcomeValidated && !outcomeInvalid) {
            const match = buffer.match(/OUTCOME:\s*([A-Z_]+)/);
            if (match && buffer.includes("\n")) {
              outcomeId = match[1];
              if (isValidOutcomeId(outcomeId, body.legalOutcomes)) {
                outcomeValidated = true;
              } else {
                outcomeInvalid = true;
                turnAbortController.abort();
                return;
              }
            }
          }
          if (outcomeValidated && hasNarrationMarker(buffer)) {
            narrationStarted = true;
            const remainder = textAfterNarrationMarker(buffer);
            if (remainder.length > 0)
              writeEvent(res, { type: "delta", text: remainder });
          }
        };

        const result = await deps.streamChatCompletion({
          modelId,
          systemPrompt,
          userPrompt,
          maxTokens: MAX_TOKENS,
          onDelta,
          signal: turnAbortController.signal,
        });

        if (outcomeValidated && !outcomeInvalid) {
          // `buffer` holds everything accumulated up to the NARRATION: marker
          // (the OUTCOME/MEMORY header) — narration itself was streamed
          // directly and never appended to it, so this parse only ever
          // needs to recover the MEMORY line.
          const parsed = parseModelResponse(buffer);
          const memoryFact = sanitizeMemoryFact(parsed.memoryFact);
          logSafe(
            `first_token=${result.firstTokenMs}ms total=${result.totalMs}ms chunks=${result.chunks} outcome=${outcomeId} fallback=false`,
          );
          writeEvent(res, {
            type: "outcome",
            id: outcomeId,
            memoryFact,
            fallback: false,
            corrected: false,
          });
          writeEvent(res, {
            type: "done",
            stats: {
              firstTokenMs: result.firstTokenMs,
              totalMs: result.totalMs,
              chunks: result.chunks,
              fallback: false,
              corrected: false,
            },
          });
          res.end();
          return;
        }

        // Invalid (or no) outcome id was chosen before any narration was
        // streamed — nothing has reached the browser yet. Try exactly once
        // more with a compact correction prompt, non-streamed.
        logSafe(
          `invalid outcome on first attempt (got "${outcomeId}") — retrying once`,
        );
        const correctionRaw = await deps.chatCompletionOnce({
          modelId,
          systemPrompt: buildCorrectionSystemPrompt(),
          userPrompt,
          maxTokens: MAX_TOKENS,
        });
        const correctionParsed = parseModelResponse(correctionRaw ?? "");

        if (isValidOutcomeId(correctionParsed.outcomeId, body.legalOutcomes)) {
          const narration = sanitizeNarration(
            correctionParsed.narration,
            HARD_MAX_NARRATION_WORDS,
          );
          if (narration) {
            writeEvent(res, { type: "delta", text: narration });
            writeEvent(res, {
              type: "outcome",
              id: correctionParsed.outcomeId,
              memoryFact: sanitizeMemoryFact(correctionParsed.memoryFact),
              fallback: false,
              corrected: true,
            });
            writeEvent(res, {
              type: "done",
              stats: { fallback: false, corrected: true },
            });
            logSafe(
              `correction succeeded outcome=${correctionParsed.outcomeId}`,
            );
            res.end();
            return;
          }
        }

        logSafe(
          "correction also failed — signaling fallback to deterministic engine",
        );
        writeEvent(res, {
          type: "outcome",
          id: null,
          fallback: true,
          corrected: true,
        });
        writeEvent(res, {
          type: "done",
          stats: { fallback: true, corrected: true },
        });
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
