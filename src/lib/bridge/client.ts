/**
 * Browser-side client for the local AI Dungeon Door bridge (see bridge/
 * at the repo root and docs/bridge.md). Talks only to a loopback origin,
 * never to LM Studio directly, never to a cloud AI service. Responsible for:
 * - health/model-state checks (no continuous polling — see useBridgeConnection)
 * - triggering (and single-flighting) an explicit model load
 * - exactly one in-flight turn/opening request at a time, aborting any
 *   previous one the moment a new one is submitted (or a run resets)
 * - real token-by-token streaming: parses the bridge's newline-delimited
 *   JSON event stream as it arrives via a ReadableStream, never buffering
 *   the whole response before "revealing" it
 */

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8934";
const TURN_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 2_500;
const ENSURE_TIMEOUT_MS = 130_000; // cold-loading a multi-GB model can genuinely take this long

export interface HealthResult {
  reachable: boolean;
  installed: boolean;
  loaded: boolean;
  alias?: string;
  modelId?: string;
  friendlyName?: string;
}

export interface EnsureModelResult {
  ok: boolean;
  alreadyLoaded?: boolean;
  modelId?: string;
  tookMs?: number;
}

export interface AllowlistEntryWire {
  id: string;
  hint: string;
}

export interface EndingWire {
  id: string;
  kind: "WIN" | "LOSS";
  hint: string;
}

export interface TurnBoundsWire {
  healthMagnitude: number;
  tensionMagnitude: number;
  trustMagnitude: number;
}

export interface RecentExchangeWire {
  action: string;
  narration: string;
}

export interface TurnRequestBody {
  mode: "turn";
  characterPrompt: string;
  secretTruth: string;
  environment: string;
  stateSummary: string;
  bounds: TurnBoundsWire;
  clueAllowlist: AllowlistEntryWire[];
  itemAllowlist: AllowlistEntryWire[];
  endings: EndingWire[];
  memoryFacts: string[];
  recentExchanges: RecentExchangeWire[];
  playerAction: string;
}

export interface OpeningRequestBody {
  mode: "opening";
  characterPrompt: string;
  secretTruth: string;
  environment: string;
}

export interface ControlProposalWire {
  intent: string;
  healthDelta: number;
  tensionDelta: number;
  trustDelta: number;
  discoverClue: string | null;
  gainItem: string | null;
  consumeItem: string | null;
  advanceStage: boolean;
  ending: "WIN" | "LOSS" | null;
  memory: string | null;
}

export type TurnEvent =
  | { type: "start"; requestId: string }
  | {
      type: "model";
      modelId: string | null;
      alias: string;
      friendlyName?: string;
    }
  | { type: "loading" }
  | { type: "delta"; text: string }
  | {
      type: "control";
      proposal: ControlProposalWire | null;
      fallback: boolean;
      corrected: boolean;
      corrections?: string[];
    }
  | { type: "opening"; ok: boolean; fallback: boolean }
  | { type: "done"; stats: Record<string, unknown> }
  | { type: "error"; message: string };

export interface StreamTurnCallbacks {
  /** Called for every event as it's parsed off the stream — use this to render deltas live. */
  onEvent?: (event: TurnEvent) => void;
}

export interface StreamTurnResult {
  proposal: ControlProposalWire | null;
  /** True if the bridge could not produce a valid AI turn (no model installed, or the model's output failed validation twice) — the caller should fall back to its own deterministic engine. */
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

  /** One lightweight GET — the connection state machine calls this, never on a continuous interval once healthy. */
  async checkHealth(): Promise<HealthResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      if (!res.ok) return { reachable: false, installed: false, loaded: false };
      const data = (await res.json()) as {
        ok?: boolean;
        installed?: boolean;
        loaded?: boolean;
        alias?: string;
        modelId?: string;
        friendlyName?: string;
      };
      return {
        reachable: true,
        installed: Boolean(data.installed),
        loaded: Boolean(data.loaded),
        alias: data.alias,
        modelId: data.modelId,
        friendlyName: data.friendlyName,
      };
    } catch {
      return { reachable: false, installed: false, loaded: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Triggers (and, bridge-side, single-flights) an explicit model load. Resolves once loaded or failed — this is the "Loading model" state's actual work. */
  async ensureModel(): Promise<EnsureModelResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENSURE_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/api/dungeon/ensure`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false };
      return (await res.json()) as EnsureModelResult;
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Manual "Release local model" advanced-settings action — never called automatically. */
  async releaseModel(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/dungeon/release`, {
        method: "POST",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean };
      return Boolean(data.ok);
    } catch {
      return false;
    }
  }

  /** Cancels any in-flight turn/opening request — used when a run resets, a new action supersedes an old one, or the component unmounts. */
  cancelPending(): void {
    this.inFlight?.abort();
    this.inFlight = null;
  }

  get hasPendingRequest(): boolean {
    return this.inFlight !== null;
  }

  /**
   * Streams one dungeon turn or the opening scene. At most one request is
   * ever in flight — a previous still-pending request is aborted first.
   * Events are delivered to `callbacks.onEvent` as each NDJSON line arrives
   * off the response's ReadableStream, so narration renders as the model
   * generates it rather than all at once at the end.
   */
  async streamTurn(
    body: TurnRequestBody | OpeningRequestBody,
    callbacks: StreamTurnCallbacks = {},
  ): Promise<StreamTurnResult> {
    this.cancelPending();
    const controller = new AbortController();
    this.inFlight = controller;
    const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

    let narration = "";
    let proposal: ControlProposalWire | null = null;
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
      } else if (event.type === "control") {
        proposal = event.proposal;
        fallback = event.fallback;
        corrected = event.corrected;
      } else if (event.type === "opening") {
        fallback = event.fallback;
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
          proposal: null,
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

      return { proposal, fallback, corrected, narration, stats };
    } catch {
      if (controller.signal.aborted) {
        return {
          proposal: null,
          fallback: true,
          corrected: false,
          narration,
          aborted: true,
        };
      }
      return { proposal: null, fallback: true, corrected: false, narration };
    } finally {
      clearTimeout(timer);
      if (this.inFlight === controller) this.inFlight = null;
    }
  }
}
