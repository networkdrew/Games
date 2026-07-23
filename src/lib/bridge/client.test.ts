import { afterEach, describe, expect, it, vi } from "vitest";
import { BridgeClient, type TurnEvent, type TurnRequestBody } from "./client";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

/** Builds a fetch Response whose body streams NDJSON lines one chunk at a time, like the real bridge. */
function ndjsonResponse(events: TurnEvent[], chunkPerEvent = true): Response {
  const lines = events.map((e) => JSON.stringify(e) + "\n");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      if (chunkPerEvent) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
      } else {
        controller.enqueue(encoder.encode(lines.join("")));
      }
      controller.close();
    },
  });
  return { ok: true, body: stream } as unknown as Response;
}

const BASE_TURN: TurnRequestBody = {
  modelTier: "primary",
  characterPrompt: "hushed",
  secretTruth: "secret",
  stateSummary: "health=100/100",
  legalOutcomes: [{ id: "NO_EFFECT", description: "nothing" }],
  memoryFacts: [],
  recentExchanges: [],
  playerAction: "listen",
};

describe("BridgeClient.checkHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports connected with both model tiers on a healthy bridge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          primaryModelId: "ornith-1.0-9b",
          tinyModelId: "qwen2.5-0.5b-instruct",
        }),
      ),
    );
    const client = new BridgeClient("http://127.0.0.1:8934");
    const result = await client.checkHealth();
    expect(result.status).toBe("connected");
    expect(result.primaryModelId).toBe("ornith-1.0-9b");
    expect(result.tinyModelId).toBe("qwen2.5-0.5b-instruct");
  });

  it("reports unavailable when the bridge responds but is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false }, false)),
    );
    const client = new BridgeClient();
    expect((await client.checkHealth()).status).toBe("unavailable");
  });

  it("reports unavailable when fetch throws (bridge not running)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );
    const client = new BridgeClient();
    expect((await client.checkHealth()).status).toBe("unavailable");
  });
});

describe("BridgeClient.streamTurn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams delta events live and returns the accumulated narration and outcome", async () => {
    const events: TurnEvent[] = [
      { type: "start", requestId: "abc123" },
      { type: "model", modelId: "ornith-1.0-9b", tier: "primary" },
      { type: "delta", text: "A soft " },
      { type: "delta", text: "sigh answers." },
      {
        type: "outcome",
        id: "DOOR_RESPONDS",
        memoryFact: "player was gentle",
        fallback: false,
        corrected: false,
      },
      { type: "done", stats: { firstTokenMs: 100, totalMs: 400, chunks: 2 } },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse(events)));

    const seenEvents: TurnEvent[] = [];
    const client = new BridgeClient();
    const result = await client.streamTurn(BASE_TURN, {
      onEvent: (e) => seenEvents.push(e),
    });

    expect(result.narration).toBe("A soft sigh answers.");
    expect(result.outcomeId).toBe("DOOR_RESPONDS");
    expect(result.memoryFact).toBe("player was gentle");
    expect(result.fallback).toBe(false);
    expect(seenEvents.map((e) => e.type)).toEqual([
      "start",
      "model",
      "delta",
      "delta",
      "outcome",
      "done",
    ]);
    // The two delta events must have been delivered as separate events, not
    // collapsed into a single fully-buffered chunk.
    const deltaEvents = seenEvents.filter((e) => e.type === "delta");
    expect(deltaEvents).toHaveLength(2);
  });

  it("handles NDJSON split across multiple stream reads (partial lines)", async () => {
    const events: TurnEvent[] = [
      { type: "start", requestId: "x" },
      { type: "delta", text: "Hello" },
      { type: "outcome", id: "NO_EFFECT", fallback: false, corrected: false },
      { type: "done", stats: {} },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse(events, false)),
    );
    const client = new BridgeClient();
    const result = await client.streamTurn(BASE_TURN);
    expect(result.narration).toBe("Hello");
    expect(result.outcomeId).toBe("NO_EFFECT");
  });

  it("reports fallback:true and empty narration when the bridge responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, body: null } as unknown as Response),
    );
    const client = new BridgeClient();
    const result = await client.streamTurn(BASE_TURN);
    expect(result.fallback).toBe(true);
    expect(result.narration).toBe("");
  });

  it("aborts a previous in-flight turn when a new one is submitted", async () => {
    let firstSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        if (!firstSignal) {
          firstSignal = init.signal ?? undefined;
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          });
        }
        return Promise.resolve(
          ndjsonResponse([
            { type: "delta", text: "second" },
            {
              type: "outcome",
              id: "NO_EFFECT",
              fallback: false,
              corrected: false,
            },
            { type: "done", stats: {} },
          ]),
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BridgeClient();
    const firstCall = client.streamTurn({
      ...BASE_TURN,
      playerAction: "first",
    });
    const secondCall = client.streamTurn({
      ...BASE_TURN,
      playerAction: "second",
    });

    expect(firstSignal?.aborted).toBe(true);
    const secondResult = await secondCall;
    expect(secondResult.narration).toBe("second");
    const firstResult = await firstCall;
    expect(firstResult.aborted).toBe(true);
  });

  it("exposes whether a request is currently pending", async () => {
    const client = new BridgeClient();
    expect(client.hasPendingRequest).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const pending = client.streamTurn(BASE_TURN);
    expect(client.hasPendingRequest).toBe(true);
    client.cancelPending();
    expect(client.hasPendingRequest).toBe(false);
    const result = await pending;
    expect(result.aborted).toBe(true);
  });
});
