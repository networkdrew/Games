/**
 * Browser-side client for the local AI Dungeon Door bridge (see bridge/
 * at the repo root and docs/bridge.md). Talks only to a loopback origin,
 * never to LM Studio directly, never to a cloud AI service. Responsible for:
 * - a single lightweight health check (no polling loop)
 * - exactly one in-flight turn request at a time, aborting any previous one
 *   the moment a new action is submitted (or a run resets)
 * - real token-by-token streaming: parses the bridge's newline-delimited
 *   JSON event stream as it arrives via a ReadableStream, never buffering
 *   the whole response before "revealing" it
 */

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8934";
const TURN_TIMEOUT_MS = 25_000;
const HEALTH_TIMEOUT_MS = 2_500;

export type BridgeStatus = "unknown" | "checking" | "connected" | "unavailable";
export type ModelTier = "primary" | "tiny";

export interface HealthResult {
  status: "connected" | "unavailable";
  primaryModelId?: string;
  tinyModelId?: string;
}

export interface TurnLegalOutcome {
  id: string;
  description: string;
}

export interface TurnRecentExchange {
  action: string;
  narration: string;
}

export interface TurnRequestBody {
  modelTier: ModelTier;
  characterPrompt: string;
  secretTruth: string;
  stateSummary: string;
  legalOutcomes: TurnLegalOutcome[];
  memoryFacts: string[];
  recentExchanges: TurnRecentExchange[];
  playerAction: string;
}

export type TurnEvent =
  | { type: "start"; requestId: string }
  | { type: "model"; modelId: string | null; tier: ModelTier }
  | { type: "delta"; text: string }
  | {
      type: "outcome";
      id: string | null;
      memoryFact?: string | null;
      fallback: boolean;
      corrected: boolean;
    }
  | { type: "done"; stats: Record<string, unknown> }
  | { type: "error"; message: string };

export interface StreamTurnCallbacks {
  /** Called for every event as it's parsed off the stream — use this to render deltas live. */
  onEvent?: (event: TurnEvent) => void;
}

export interface StreamTurnResult {
  outcomeId: string | null;
  memoryFact: string | null;
  /** True if the bridge could not produce a valid AI turn (no model, or the model's output failed validation twice) — the caller should fall back to its own deterministic engine. */
  fallback: boolean;
  corrected: boolean;
  /** Full narration text accumulated from `delta` events, in order. */
  narration: string;
  /** True only when the request was aborted because a newer one superseded it, the run reset, or the component unmounted — never treat this as a failure to report to the player. */
  aborted?: boolean;
  stats?: Record<string, unknown>;
}

export class BridgeClient {
  private baseUrl: string;
  private inFlight: AbortController | null = null;

  constructor(baseUrl: string = DEFAULT_BRIDGE_URL) {
    this.baseUrl = baseUrl;
  }

  /** One lightweight GET, used on load and when the player presses "Reconnect" — never polled on an interval. */
  async checkHealth(): Promise<HealthResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      if (!res.ok) return { status: "unavailable" };
      const data = (await res.json()) as {
        ok?: boolean;
        primaryModelId?: string;
        tinyModelId?: string;
      };
      if (!data.ok) return { status: "unavailable" };
      return {
        status: "connected",
        primaryModelId: data.primaryModelId,
        tinyModelId: data.tinyModelId,
      };
    } catch {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cancels any in-flight turn request — used when a run resets, a new action supersedes an old one, or the component unmounts. */
  cancelPending(): void {
    this.inFlight?.abort();
    this.inFlight = null;
  }

  get hasPendingRequest(): boolean {
    return this.inFlight !== null;
  }

  /**
   * Streams one dungeon turn. At most one request is ever in flight — a
   * previous still-pending request is aborted first. Events are delivered
   * to `callbacks.onEvent` as each NDJSON line arrives off the response's
   * ReadableStream, so narration renders as the model generates it rather
   * than all at once at the end.
   */
  async streamTurn(
    body: TurnRequestBody,
    callbacks: StreamTurnCallbacks = {},
  ): Promise<StreamTurnResult> {
    this.cancelPending();
    const controller = new AbortController();
    this.inFlight = controller;
    const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

    let narration = "";
    let outcomeId: string | null = null;
    let memoryFact: string | null = null;
    let fallback = false;
    let corrected = false;
    let stats: Record<string, unknown> | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;
      let event: TurnEvent;
      try {
        event = JSON.parse(trimmed) as TurnEvent;
      } catch {
        return;
      }
      callbacks.onEvent?.(event);
      if (event.type === "delta") {
        narration += event.text;
      } else if (event.type === "outcome") {
        outcomeId = event.id;
        memoryFact = event.memoryFact ?? null;
        fallback = event.fallback;
        corrected = event.corrected;
      } else if (event.type === "done") {
        stats = event.stats;
      }
    };

    try {
      const res = await fetch(`${this.baseUrl}/api/dungeon/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        return {
          outcomeId: null,
          memoryFact: null,
          fallback: true,
          corrected: false,
          narration: "",
        };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      if (buffer.trim().length > 0) handleLine(buffer);

      return { outcomeId, memoryFact, fallback, corrected, narration, stats };
    } catch {
      if (controller.signal.aborted) {
        return {
          outcomeId: null,
          memoryFact: null,
          fallback: true,
          corrected: false,
          narration,
          aborted: true,
        };
      }
      return {
        outcomeId: null,
        memoryFact: null,
        fallback: true,
        corrected: false,
        narration,
      };
    } finally {
      clearTimeout(timer);
      if (this.inFlight === controller) this.inFlight = null;
    }
  }
}
