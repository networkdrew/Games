import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequestHandler } from "./server.mjs";

const ALLOWED_ORIGIN = "https://games.drewcassidy.dev";

function withServer(deps, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer(createRequestHandler(deps));
    server.listen(0, "127.0.0.1", async () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      try {
        await fn(baseUrl);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

/** Simulates streamChatCompletion by chunking a full protocol-shaped response through onDelta, honoring an abort signal like the real implementation would. */
function mockStream(fullText, { chunkSize = 6 } = {}) {
  return async ({ onDelta, signal }) => {
    let chunks = 0;
    for (let i = 0; i < fullText.length; i += chunkSize) {
      if (signal?.aborted) break;
      const chunk = fullText.slice(i, i + chunkSize);
      onDelta(chunk);
      chunks++;
    }
    return { text: fullText, firstTokenMs: 12, totalMs: 80, chunks };
  };
}

async function readNdjson(res) {
  const text = await res.text();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

const BASE_BODY = {
  modelTier: "primary",
  characterPrompt: "A hushed, patient door.",
  secretTruth: "Something sleeps behind it.",
  stateSummary: "health=100/100 tension=10/100",
  legalOutcomes: [
    { id: "NO_EFFECT", description: "nothing happens" },
    { id: "DOOR_RESPONDS", description: "the entity speaks" },
  ],
  memoryFacts: [],
  recentExchanges: [],
  playerAction: "listen at the door",
};

test("health reports both tiers", async () => {
  await withServer(
    {
      resolveModels: async () => ({
        primaryModelId: "ornith-1.0-9b",
        tinyModelId: "qwen2.5-0.5b-instruct",
      }),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.equal(data.primaryModelId, "ornith-1.0-9b");
      assert.equal(data.tinyModelId, "qwen2.5-0.5b-instruct");
    },
  );
});

test("health reports not ok when neither tier has a model", async () => {
  await withServer(
    {
      resolveModels: async () => ({ primaryModelId: null, tinyModelId: null }),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      const data = await res.json();
      assert.equal(data.ok, false);
    },
  );
});

test("turn: streams narration and a valid outcome on success", async () => {
  await withServer(
    {
      resolveModels: async () => ({
        primaryModelId: "ornith-1.0-9b",
        tinyModelId: null,
      }),
      streamChatCompletion: mockStream(
        "OUTCOME: DOOR_RESPONDS\nMEMORY: The player is polite.\nNARRATION:\nA low voice answers softly from behind the wood.",
      ),
      chatCompletionOnce: async () => null,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_BODY),
      });
      assert.equal(res.status, 200);
      const events = await readNdjson(res);

      assert.equal(events[0].type, "start");
      assert.equal(events[1].type, "model");
      assert.equal(events[1].modelId, "ornith-1.0-9b");

      const deltas = events.filter((e) => e.type === "delta");
      assert.ok(
        deltas.length > 1,
        "expected more than one streamed delta chunk",
      );
      const joined = deltas.map((d) => d.text).join("");
      assert.match(joined, /A low voice answers softly/);
      // Protocol metadata must never leak into what's streamed to the player.
      assert.doesNotMatch(joined, /OUTCOME:/);
      assert.doesNotMatch(joined, /MEMORY:/);

      const outcomeEvent = events.find((e) => e.type === "outcome");
      assert.equal(outcomeEvent.id, "DOOR_RESPONDS");
      assert.equal(outcomeEvent.fallback, false);
      assert.equal(outcomeEvent.memoryFact, "The player is polite.");

      const doneEvent = events.find((e) => e.type === "done");
      assert.equal(doneEvent.stats.fallback, false);
    },
  );
});

test("turn: retries once on an invalid outcome and succeeds on correction", async () => {
  await withServer(
    {
      resolveModels: async () => ({
        primaryModelId: "ornith-1.0-9b",
        tinyModelId: null,
      }),
      streamChatCompletion: mockStream(
        "OUTCOME: NOT_A_REAL_OUTCOME\nMEMORY: NONE\nNARRATION:\nSomething vague.",
      ),
      chatCompletionOnce: async () =>
        "OUTCOME: DOOR_RESPONDS\nMEMORY: NONE\nNARRATION:\nA corrected reply comes through the door.",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_BODY),
      });
      const events = await readNdjson(res);
      const outcomeEvent = events.find((e) => e.type === "outcome");
      assert.equal(outcomeEvent.id, "DOOR_RESPONDS");
      assert.equal(outcomeEvent.corrected, true);
      assert.equal(outcomeEvent.fallback, false);

      const deltas = events.filter((e) => e.type === "delta");
      const joined = deltas.map((d) => d.text).join("");
      assert.match(joined, /corrected reply/);
      // The invalid first attempt's narration must never reach the player.
      assert.doesNotMatch(joined, /Something vague/);
    },
  );
});

test("turn: falls back to deterministic mode when correction also fails", async () => {
  await withServer(
    {
      resolveModels: async () => ({
        primaryModelId: "ornith-1.0-9b",
        tinyModelId: null,
      }),
      streamChatCompletion: mockStream(
        "OUTCOME: NOT_A_REAL_OUTCOME\nMEMORY: NONE\nNARRATION:\nSomething vague.",
      ),
      chatCompletionOnce: async () => "still not a real outcome, sorry",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_BODY),
      });
      const events = await readNdjson(res);
      const outcomeEvent = events.find((e) => e.type === "outcome");
      assert.equal(outcomeEvent.fallback, true);
      assert.equal(events.filter((e) => e.type === "delta").length, 0);
    },
  );
});

test("turn: accepts a realistic ~100-word recent-exchange narration (regression: was rejected by too-small a cap)", async () => {
  await withServer(
    {
      resolveModels: async () => ({
        primaryModelId: "ornith-1.0-9b",
        tinyModelId: null,
      }),
      streamChatCompletion: mockStream(
        "OUTCOME: NO_EFFECT\nMEMORY: NONE\nNARRATION:\nNothing happens.",
      ),
      chatCompletionOnce: async () => null,
    },
    async (baseUrl) => {
      const longNarration = Array(100).fill("word").join(" "); // ~500 chars, realistic for a full-length Ornith response
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({
          ...BASE_BODY,
          recentExchanges: [
            { action: "listen at the door", narration: longNarration },
          ],
        }),
      });
      assert.equal(res.status, 200);
    },
  );
});

test("turn: signals fallback immediately when no model is available for the requested tier", async () => {
  await withServer(
    {
      resolveModels: async () => ({
        primaryModelId: null,
        tinyModelId: "qwen2.5-0.5b-instruct",
      }),
      streamChatCompletion: async () => {
        throw new Error("should not be called");
      },
      chatCompletionOnce: async () => {
        throw new Error("should not be called");
      },
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_BODY), // requests "primary", which is unavailable
      });
      const events = await readNdjson(res);
      const outcomeEvent = events.find((e) => e.type === "outcome");
      assert.equal(outcomeEvent.fallback, true);
      assert.equal(events.filter((e) => e.type === "delta").length, 0);
    },
  );
});

test("turn: rejects requests from an unapproved origin", async () => {
  await withServer(
    { resolveModels: async () => ({ primaryModelId: "x", tinyModelId: null }) },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify(BASE_BODY),
      });
      assert.equal(res.status, 403);
    },
  );
});

test("turn: rejects an invalid body (bad modelTier)", async () => {
  await withServer(
    { resolveModels: async () => ({ primaryModelId: "x", tinyModelId: null }) },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({ ...BASE_BODY, modelTier: "ultra" }),
      });
      assert.equal(res.status, 400);
    },
  );
});

test("turn: rejects a legal outcome id outside the known vocabulary", async () => {
  await withServer(
    { resolveModels: async () => ({ primaryModelId: "x", tinyModelId: null }) },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({
          ...BASE_BODY,
          legalOutcomes: [{ id: "MAKE_ME_A_SANDWICH", description: "x" }],
        }),
      });
      assert.equal(res.status, 400);
    },
  );
});

test("turn: rejects an oversized request body", async () => {
  await withServer(
    { resolveModels: async () => ({ primaryModelId: "x", tinyModelId: null }) },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({
          ...BASE_BODY,
          playerAction: "x".repeat(20_000),
        }),
      });
      assert.equal(res.status, 413);
    },
  );
});

test("turn: rate limits a second request made immediately after the first", async () => {
  await withServer(
    {
      resolveModels: async () => ({
        primaryModelId: "ornith-1.0-9b",
        tinyModelId: null,
      }),
      streamChatCompletion: mockStream(
        "OUTCOME: NO_EFFECT\nMEMORY: NONE\nNARRATION:\nNothing happens.",
      ),
      chatCompletionOnce: async () => null,
    },
    async (baseUrl) => {
      const makeRequest = () =>
        fetch(`${baseUrl}/api/dungeon/turn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: ALLOWED_ORIGIN,
          },
          body: JSON.stringify(BASE_BODY),
        });
      const first = await makeRequest();
      assert.equal(first.status, 200);
      await first.text();
      const second = await makeRequest();
      assert.equal(second.status, 429);
    },
  );
});

test("answers a CORS preflight for an approved origin", async () => {
  await withServer(
    {
      resolveModels: async () => ({ primaryModelId: null, tinyModelId: null }),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "OPTIONS",
        headers: { Origin: ALLOWED_ORIGIN },
      });
      assert.equal(res.status, 204);
      assert.equal(
        res.headers.get("access-control-allow-origin"),
        ALLOWED_ORIGIN,
      );
    },
  );
});

test("404s an unknown route", async () => {
  await withServer(
    {
      resolveModels: async () => ({ primaryModelId: null, tinyModelId: null }),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/not-a-real-route`);
      assert.equal(res.status, 404);
    },
  );
});
