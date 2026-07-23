// AI Dungeon Door's local bridge: a tiny, single-purpose HTTP server that
// runs only on this PC, binds to loopback by default, and is the sole thing
// allowed to talk to LM Studio. It exposes exactly two routes — /health and
// /narrate — and nothing resembling a general-purpose LM Studio proxy. See
// docs/bridge.md for the full contract and threat model.

import { createServer } from "node:http";
import {
  ALLOWED_ORIGINS,
  HARD_MAX_TOKENS,
  HOST,
  MAX_BODY_BYTES,
  MAX_FIELD_LENGTH,
  MAX_TOKENS,
  MIN_REQUEST_INTERVAL_MS,
  PORT,
} from "./config.mjs";
import {
  buildSystemPrompt,
  buildUserPrompt,
  sanitizeNarration,
} from "./prompt.mjs";
import { chatCompletion, resolveModelId } from "./lmstudio.mjs";

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function send(res, status, origin, body) {
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders(origin),
  };
  res.writeHead(status, headers);
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

function isValidNarrateBody(body) {
  if (typeof body !== "object" || body === null) return false;
  const { doorPersonality, tension, outcomeSummary } = body;
  if (typeof doorPersonality !== "string" || doorPersonality.length === 0)
    return false;
  if (doorPersonality.length > MAX_FIELD_LENGTH) return false;
  if (typeof outcomeSummary !== "string" || outcomeSummary.length === 0)
    return false;
  if (outcomeSummary.length > MAX_FIELD_LENGTH) return false;
  if (typeof tension !== "number" || Number.isNaN(tension)) return false;
  if (tension < 0 || tension > 100) return false;
  return true;
}

/**
 * `deps` lets tests substitute a fake LM Studio client without a real model
 * running — production always uses the real lmstudio.mjs functions.
 */
export function createRequestHandler(
  deps = { resolveModelId, chatCompletion },
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
      send(res, 403, undefined, { ok: false, error: "origin not allowed" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const modelId = await deps.resolveModelId();
      send(res, 200, origin, {
        ok: modelId !== null,
        modelId: modelId ?? undefined,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/narrate") {
      let raw;
      try {
        raw = await readBody(req);
      } catch {
        send(res, 413, origin, { ok: false, error: "payload too large" });
        return;
      }

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, origin, { ok: false, error: "invalid JSON" });
        return;
      }

      if (!isValidNarrateBody(body)) {
        send(res, 400, origin, { ok: false, error: "invalid request body" });
        return;
      }

      if (busy) {
        send(res, 429, origin, {
          ok: false,
          error: "a generation is already in progress",
        });
        return;
      }
      const now = Date.now();
      if (now - lastRequestAt < MIN_REQUEST_INTERVAL_MS) {
        send(res, 429, origin, { ok: false, error: "rate limited, slow down" });
        return;
      }

      busy = true;
      lastRequestAt = now;
      try {
        const modelId = await deps.resolveModelId();
        if (!modelId) {
          // Not an error the caller needs to see as a failure — the client
          // falls back to deterministic narration when text is null.
          send(res, 200, origin, { ok: true, text: null });
          return;
        }

        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt({
          doorPersonality: body.doorPersonality,
          tension: body.tension,
          outcomeSummary: body.outcomeSummary,
        });
        const raw = await deps.chatCompletion({
          modelId,
          systemPrompt,
          userPrompt,
          maxTokens: MAX_TOKENS,
        });
        const text =
          raw === null ? null : sanitizeNarration(raw, HARD_MAX_TOKENS);
        send(res, 200, origin, { ok: true, text });
      } finally {
        busy = false;
      }
      return;
    }

    send(res, 404, origin, { ok: false, error: "not found" });
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
    // Force-exit if close hangs for any reason.
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
