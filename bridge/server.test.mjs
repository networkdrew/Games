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

test("health reports connected with a model id", async () => {
  await withServer(
    {
      resolveModelId: async () => "qwen2.5-0.5b-instruct",
      chatCompletion: async () => "unused",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.equal(data.modelId, "qwen2.5-0.5b-instruct");
    },
  );
});

test("health reports not ok when no model is available", async () => {
  await withServer(
    { resolveModelId: async () => null, chatCompletion: async () => null },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      const data = await res.json();
      assert.equal(data.ok, false);
    },
  );
});

test("narrate returns sanitized text on success", async () => {
  await withServer(
    {
      resolveModelId: async () => "qwen2.5-0.5b-instruct",
      chatCompletion: async () => "You hear breathing in the dark.",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({
          doorPersonality: "hushed",
          tension: 10,
          outcomeSummary: "The player listens.",
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.text, "You hear breathing in the dark.");
    },
  );
});

test("narrate falls back to null text when no model is available", async () => {
  await withServer(
    { resolveModelId: async () => null, chatCompletion: async () => null },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({
          doorPersonality: "hushed",
          tension: 10,
          outcomeSummary: "The player listens.",
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.equal(data.text, null);
    },
  );
});

test("rejects requests from an unapproved origin", async () => {
  await withServer(
    {
      resolveModelId: async () => "qwen2.5-0.5b-instruct",
      chatCompletion: async () => "text",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/narrate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({
          doorPersonality: "hushed",
          tension: 10,
          outcomeSummary: "The player listens.",
        }),
      });
      assert.equal(res.status, 403);
    },
  );
});

test("rejects an invalid request body", async () => {
  await withServer(
    {
      resolveModelId: async () => "qwen2.5-0.5b-instruct",
      chatCompletion: async () => "text",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({ doorPersonality: "hushed" }), // missing fields
      });
      assert.equal(res.status, 400);
    },
  );
});

test("rejects an oversized request body", async () => {
  await withServer(
    {
      resolveModelId: async () => "qwen2.5-0.5b-instruct",
      chatCompletion: async () => "text",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({
          doorPersonality: "x".repeat(10_000),
          tension: 10,
          outcomeSummary: "The player listens.",
        }),
      });
      assert.equal(res.status, 413);
    },
  );
});

test("rate limits a second narrate request made immediately after the first", async () => {
  await withServer(
    {
      resolveModelId: async () => "qwen2.5-0.5b-instruct",
      chatCompletion: async () => "text",
    },
    async (baseUrl) => {
      const makeRequest = () =>
        fetch(`${baseUrl}/narrate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: ALLOWED_ORIGIN,
          },
          body: JSON.stringify({
            doorPersonality: "hushed",
            tension: 10,
            outcomeSummary: "The player listens.",
          }),
        });
      const first = await makeRequest();
      assert.equal(first.status, 200);
      const second = await makeRequest();
      assert.equal(second.status, 429);
    },
  );
});

test("answers a CORS preflight for an approved origin", async () => {
  await withServer(
    { resolveModelId: async () => null, chatCompletion: async () => null },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/narrate`, {
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
    { resolveModelId: async () => null, chatCompletion: async () => null },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/not-a-real-route`);
      assert.equal(res.status, 404);
    },
  );
});
