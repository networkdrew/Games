import { afterEach, describe, expect, it, vi } from "vitest";
import { BridgeClient } from "./client";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("BridgeClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports connected with the model id on a healthy bridge", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ok: true, modelId: "qwen2.5-0.5b-instruct" }),
        ),
    );
    const client = new BridgeClient("http://127.0.0.1:8934");
    const result = await client.checkHealth();
    expect(result.status).toBe("connected");
    expect(result.modelId).toBe("qwen2.5-0.5b-instruct");
  });

  it("reports unavailable when the bridge responds but is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false }, false)),
    );
    const client = new BridgeClient();
    const result = await client.checkHealth();
    expect(result.status).toBe("unavailable");
  });

  it("reports unavailable when fetch throws (bridge not running)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );
    const client = new BridgeClient();
    const result = await client.checkHealth();
    expect(result.status).toBe("unavailable");
  });

  it("returns narration text from a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ text: "You hear breathing." })),
    );
    const client = new BridgeClient();
    const result = await client.narrate({
      doorPersonality: "hushed",
      tension: 10,
      outcomeSummary: "listened",
    });
    expect(result.text).toBe("You hear breathing.");
  });

  it("returns null text when the bridge responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const client = new BridgeClient();
    const result = await client.narrate({
      doorPersonality: "hushed",
      tension: 10,
      outcomeSummary: "listened",
    });
    expect(result.text).toBeNull();
  });

  it("aborts a previous in-flight narration request when a new one is submitted", async () => {
    let firstSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      if (!firstSignal) {
        firstSignal = init.signal;
        // Simulates a slow first request that real `fetch` would reject
        // with an AbortError once its signal fires.
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }
      return Promise.resolve(jsonResponse({ text: "second response" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BridgeClient();
    const firstCall = client.narrate({
      doorPersonality: "x",
      tension: 0,
      outcomeSummary: "first",
    });
    const secondCall = client.narrate({
      doorPersonality: "x",
      tension: 0,
      outcomeSummary: "second",
    });

    expect(firstSignal?.aborted).toBe(true);
    const secondResult = await secondCall;
    expect(secondResult.text).toBe("second response");
    const firstResult = await firstCall;
    expect(firstResult.aborted).toBe(true);
  });
});
