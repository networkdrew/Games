import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequestHandler } from "./server.mjs";

const ALLOWED_ORIGIN = "https://games.drewcassidy.dev";

const CONFIG = {
  lmStudioId: "qwen/qwen3.5-9b",
  temperature: 0.8,
  topP: 0.9,
  maxTokens: 220,
  contextLength: 8192,
  gpuOffload: "max",
  stopSequences: [],
  reasoningDisableParams: {},
};

function withServer(deps, fn) {
  const fullDeps = {
    resolveAlias: async () => CONFIG,
    getModelState: async () => "loaded",
    ensureModelLoaded: async () => ({ alreadyLoaded: true }),
    releaseModel: async () => true,
    streamChatCompletion: async () => ({ text: "", firstTokenMs: null, totalMs: 0, chunks: 0 }),
    chatCompletionOnce: async () => null,
    ...deps,
  };
  return new Promise((resolve, reject) => {
    const server = createServer(createRequestHandler(fullDeps));
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

const BOUNDS = { healthMagnitude: 30, tensionMagnitude: 25, trustMagnitude: 25 };
const CLUES = [{ id: "labored-breathing", hint: "revealed by listening" }];
const ENDINGS = [{ id: "freed", kind: "WIN", hint: "trust >= 50" }];

const BASE_TURN_BODY = {
  mode: "turn",
  characterPrompt: "A hushed, patient door.",
  secretTruth: "Something sleeps behind it.",
  environment: "A cold stone corridor.",
  stateSummary: "health=100/100 tension=10/100 trust=30/100",
  bounds: BOUNDS,
  clueAllowlist: CLUES,
  itemAllowlist: [],
  endings: ENDINGS,
  memoryFacts: [],
  recentExchanges: [],
  playerAction: "listen at the door",
};

const BASE_OPENING_BODY = {
  mode: "opening",
  characterPrompt: "A hushed, patient door.",
  secretTruth: "Something sleeps behind it.",
  environment: "A cold stone corridor.",
};

test("health reports installed+loaded", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.installed, true);
    assert.equal(data.loaded, true);
    assert.equal(data.modelId, "qwen/qwen3.5-9b");
  });
});

test("health reports not installed when the alias can't be resolved", async () => {
  await withServer({ resolveAlias: async () => null }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.installed, false);
  });
});

test("turn: streams narration and a valid control proposal on success", async () => {
  await withServer(
    {
      streamChatCompletion: mockStream(
        "CONTROL:\nintent=listening\nhealth_delta=0\ntension_delta=-2\ntrust_delta=0\ndiscover_clue=labored-breathing\ngain_item=NONE\nconsume_item=NONE\nadvance_stage=false\nending=NONE\nmemory=NONE\nRESPONSE:\nA low voice answers softly from behind the wood.",
      ),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_TURN_BODY),
      });
      assert.equal(res.status, 200);
      const events = await readNdjson(res);

      assert.equal(events[0].type, "start");
      assert.equal(events[1].type, "model");
      assert.equal(events[1].modelId, "qwen/qwen3.5-9b");

      const deltas = events.filter((e) => e.type === "delta");
      assert.ok(deltas.length > 1, "expected more than one streamed delta chunk");
      const joined = deltas.map((d) => d.text).join("");
      assert.match(joined, /A low voice answers softly/);
      // Control metadata must never leak into what's streamed to the player.
      assert.doesNotMatch(joined, /CONTROL:/);
      assert.doesNotMatch(joined, /health_delta/);

      const controlEvent = events.find((e) => e.type === "control");
      assert.equal(controlEvent.fallback, false);
      assert.equal(controlEvent.proposal.discoverClue, "labored-breathing");
      assert.equal(controlEvent.proposal.tensionDelta, -2);

      const doneEvent = events.find((e) => e.type === "done");
      assert.equal(doneEvent.stats.fallback, false);
    },
  );
});

test("turn: clamps an out-of-bounds delta rather than rejecting the whole turn", async () => {
  await withServer(
    {
      streamChatCompletion: mockStream(
        "CONTROL:\nintent=overreacting\nhealth_delta=-999\ntension_delta=5\ntrust_delta=0\ndiscover_clue=NONE\ngain_item=NONE\nconsume_item=NONE\nadvance_stage=false\nending=NONE\nmemory=NONE\nRESPONSE:\nSomething happens.",
      ),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_TURN_BODY),
      });
      const events = await readNdjson(res);
      const controlEvent = events.find((e) => e.type === "control");
      assert.equal(controlEvent.proposal.healthDelta, -BOUNDS.healthMagnitude);
    },
  );
});

test("turn: ignores an unlisted clue id individually without discarding good narration", async () => {
  await withServer(
    {
      streamChatCompletion: mockStream(
        "CONTROL:\nintent=exploring\nhealth_delta=0\ntension_delta=0\ntrust_delta=0\ndiscover_clue=made-up-clue\ngain_item=NONE\nconsume_item=NONE\nadvance_stage=false\nending=NONE\nmemory=NONE\nRESPONSE:\nA fine, well-narrated moment.",
      ),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_TURN_BODY),
      });
      const events = await readNdjson(res);
      const deltas = events.filter((e) => e.type === "delta");
      assert.match(deltas.map((d) => d.text).join(""), /well-narrated moment/);
      const controlEvent = events.find((e) => e.type === "control");
      assert.equal(controlEvent.proposal.discoverClue, null);
      assert.equal(controlEvent.fallback, false);
      assert.ok(controlEvent.corrections.some((c) => c.includes("discover_clue")));
    },
  );
});

test("turn: retries once on a malformed control block and succeeds on correction", async () => {
  await withServer(
    {
      streamChatCompletion: mockStream("I refuse to follow the format today."),
      chatCompletionOnce: async () =>
        "CONTROL:\nintent=retry\nhealth_delta=0\ntension_delta=0\ntrust_delta=0\ndiscover_clue=NONE\ngain_item=NONE\nconsume_item=NONE\nadvance_stage=false\nending=NONE\nmemory=NONE\nRESPONSE:\nA corrected reply comes through the door.",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_TURN_BODY),
      });
      const events = await readNdjson(res);
      const controlEvent = events.find((e) => e.type === "control");
      assert.equal(controlEvent.corrected, true);
      assert.equal(controlEvent.fallback, false);

      const deltas = events.filter((e) => e.type === "delta");
      const joined = deltas.map((d) => d.text).join("");
      assert.match(joined, /corrected reply/);
      assert.doesNotMatch(joined, /I refuse/);
    },
  );
});

test("turn: falls back to deterministic mode when correction also fails", async () => {
  await withServer(
    {
      streamChatCompletion: mockStream("still not following the format"),
      chatCompletionOnce: async () => "still not following the format, sorry",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_TURN_BODY),
      });
      const events = await readNdjson(res);
      const controlEvent = events.find((e) => e.type === "control");
      assert.equal(controlEvent.fallback, true);
      assert.equal(events.filter((e) => e.type === "delta").length, 0);
    },
  );
});

test("turn: auto-loads the model when it isn't loaded yet, before generating", async () => {
  let ensureCalled = false;
  await withServer(
    {
      getModelState: async () => "not-loaded",
      ensureModelLoaded: async () => {
        ensureCalled = true;
        return { alreadyLoaded: false };
      },
      streamChatCompletion: mockStream(
        "CONTROL:\nintent=x\nhealth_delta=0\ntension_delta=0\ntrust_delta=0\ndiscover_clue=NONE\ngain_item=NONE\nconsume_item=NONE\nadvance_stage=false\nending=NONE\nmemory=NONE\nRESPONSE:\nHello.",
      ),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_TURN_BODY),
      });
      const events = await readNdjson(res);
      assert.ok(ensureCalled, "expected ensureModelLoaded to be called");
      assert.ok(events.some((e) => e.type === "loading"));
    },
  );
});

test("opening: streams the opening scene with no control block required", async () => {
  await withServer(
    {
      streamChatCompletion: mockStream(
        "A cold wind seeps beneath the door as something shifts in the dark beyond it.",
      ),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify(BASE_OPENING_BODY),
      });
      const events = await readNdjson(res);
      const deltas = events.filter((e) => e.type === "delta");
      assert.ok(deltas.length > 0);
      assert.match(deltas.map((d) => d.text).join(""), /cold wind seeps/);
      const openingEvent = events.find((e) => e.type === "opening");
      assert.equal(openingEvent.ok, true);
      assert.equal(openingEvent.fallback, false);
    },
  );
});

test("turn: signals fallback immediately when the configured model isn't installed", async () => {
  await withServer(
    {
      resolveAlias: async () => null,
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
        body: JSON.stringify(BASE_TURN_BODY),
      });
      const events = await readNdjson(res);
      const controlEvent = events.find((e) => e.type === "control");
      assert.equal(controlEvent.fallback, true);
      assert.equal(events.filter((e) => e.type === "delta").length, 0);
    },
  );
});

test("ensure: single request triggers a load and reports it", async () => {
  await withServer(
    { getModelState: async () => "not-loaded" },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/ensure`, {
        method: "POST",
        headers: { Origin: ALLOWED_ORIGIN },
      });
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(data.modelId, "qwen/qwen3.5-9b");
    },
  );
});

test("release: unloads the configured model", async () => {
  let releasedId = null;
  await withServer(
    { releaseModel: async (id) => { releasedId = id; return true; } },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/dungeon/release`, {
        method: "POST",
        headers: { Origin: ALLOWED_ORIGIN },
      });
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(releasedId, "qwen/qwen3.5-9b");
    },
  );
});

test("turn: rejects requests from an unapproved origin", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify(BASE_TURN_BODY),
    });
    assert.equal(res.status, 403);
  });
});

test("turn: rejects an invalid body (missing bounds)", async () => {
  await withServer({}, async (baseUrl) => {
    const { bounds: _drop, ...withoutBounds } = BASE_TURN_BODY;
    const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: JSON.stringify(withoutBounds),
    });
    assert.equal(res.status, 400);
  });
});

test("turn: rejects an oversized request body", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ ...BASE_TURN_BODY, playerAction: "x".repeat(20_000) }),
    });
    assert.equal(res.status, 413);
  });
});

test("turn: rate limits a second request made immediately after the first", async () => {
  await withServer(
    {
      streamChatCompletion: mockStream(
        "CONTROL:\nintent=x\nhealth_delta=0\ntension_delta=0\ntrust_delta=0\ndiscover_clue=NONE\ngain_item=NONE\nconsume_item=NONE\nadvance_stage=false\nending=NONE\nmemory=NONE\nRESPONSE:\nNothing happens.",
      ),
    },
    async (baseUrl) => {
      const makeRequest = () =>
        fetch(`${baseUrl}/api/dungeon/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
          body: JSON.stringify(BASE_TURN_BODY),
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
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/dungeon/turn`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  });
});

test("404s an unknown route", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/not-a-real-route`);
    assert.equal(res.status, 404);
  });
});
