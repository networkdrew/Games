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
  mode: "turn",
  characterPrompt: "hushed",
  secretTruth: "secret",
  environment: "a cold corridor",
  stateSummary: "health=100/100",
  bounds: { healthMagnitude: 30, tensionMagnitude: 25, trustMagnitude: 25 },
  clueAllowlist: [],
  itemAllowlist: [],
  endings: [],
  memoryFacts: [],
  recentExchanges: [],
  playerAction: "listen",
};

describe("BridgeClient.checkHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports reachable+installed+loaded on a healthy bridge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          installed: true,
          loaded: true,
          alias: "dungeon-chat",
          modelId: "qwen/qwen3.5-9b",
          friendlyName: "Qwen3.5 9B",
        }),
      ),
    );
    const client = new BridgeClient("http://127.0.0.1:8934");
    const result = await client.checkHealth();
    expect(result.reachable).toBe(true);
    expect(result.installed).toBe(true);
    expect(result.loaded).toBe(true);
    expect(result.modelId).toBe("qwen/qwen3.5-9b");
  });

  it("reports not installed when the bridge responds but the model isn't found", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ok: false, installed: false, loaded: false }),
        ),
    );
    const client = new BridgeClient();
    const result = await client.checkHealth();
    expect(result.reachable).toBe(true);
    expect(result.installed).toBe(false);
  });

  it("reports unreachable when fetch throws (bridge not running)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );
    const client = new BridgeClient();
    expect((await client.checkHealth()).reachable).toBe(false);
  });
});

describe("BridgeClient.ensureModel / releaseModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("triggers a model load and reports the result", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ok: true, modelId: "qwen/qwen3.5-9b", tookMs: 4000 }),
        ),
    );
    const client = new BridgeClient();
    const result = await client.ensureModel();
    expect(result.ok).toBe(true);
    expect(result.modelId).toBe("qwen/qwen3.5-9b");
  });

  it("releases the model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: true })),
    );
    const client = new BridgeClient();
    expect(await client.releaseModel()).toBe(true);
  });

  it("returns false when release fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("nope")));
    const client = new BridgeClient();
    expect(await client.releaseModel()).toBe(false);
  });
});

describe("BridgeClient.streamTurn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams delta events live and returns the accumulated narration and control proposal", async () => {
    const events: TurnEvent[] = [
      { type: "start", requestId: "abc123" },
      { type: "model", modelId: "qwen/qwen3.5-9b", alias: "dungeon-chat" },
      { type: "delta", text: "A soft " },
      { type: "delta", text: "sigh answers." },
      {
        type: "control",
        proposal: {
          intent: "listening",
          healthDelta: 0,
          tensionDelta: -2,
          trustDelta: 0,
          discoverClue: null,
          gainItem: null,
          consumeItem: null,
          advanceStage: false,
          ending: null,
          memory: "player was gentle",
        },
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
    expect(result.proposal?.memory).toBe("player was gentle");
    expect(result.proposal?.tensionDelta).toBe(-2);
    expect(result.fallback).toBe(false);
    expect(seenEvents.map((e) => e.type)).toEqual([
      "start",
      "model",
      "delta",
      "delta",
      "control",
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
      {
        type: "control",
        proposal: {
          intent: "x",
          healthDelta: 0,
          tensionDelta: 0,
          trustDelta: 0,
          discoverClue: null,
          gainItem: null,
          consumeItem: null,
          advanceStage: false,
          ending: null,
          memory: null,
        },
        fallback: false,
        corrected: false,
      },
      { type: "done", stats: {} },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse(events, false)),
    );
    const client = new BridgeClient();
    const result = await client.streamTurn(BASE_TURN);
    expect(result.narration).toBe("Hello");
    expect(result.proposal?.intent).toBe("x");
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

  it("streams an opening scene without a control proposal", async () => {
    const events: TurnEvent[] = [
      { type: "start", requestId: "x" },
      { type: "delta", text: "The door is silent, and cold." },
      { type: "opening", ok: true, fallback: false },
      { type: "done", stats: {} },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse(events)));
    const client = new BridgeClient();
    const result = await client.streamTurn({
      mode: "opening",
      characterPrompt: "hushed",
      secretTruth: "secret",
      environment: "a cold corridor",
    });
    expect(result.narration).toBe("The door is silent, and cold.");
    expect(result.fallback).toBe(false);
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
              type: "control",
              proposal: {
                intent: "x",
                healthDelta: 0,
                tensionDelta: 0,
                trustDelta: 0,
                discoverClue: null,
                gainItem: null,
                consumeItem: null,
                advanceStage: false,
                ending: null,
                memory: null,
              },
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
