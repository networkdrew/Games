/**
 * Browser-side client for the local AI Dungeon Door bridge (see bridge/
 * at the repo root and docs/bridge.md). Talks only to a loopback origin,
 * never to LM Studio directly, never to a cloud AI service. Responsible for:
 * - a single lightweight health check (no polling loop)
 * - exactly one in-flight narration request at a time, with the previous
 *   one aborted if a new action is submitted before it resolves
 * - a client-side timeout so a hung local model can't freeze the game
 */

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8934";
const REQUEST_TIMEOUT_MS = 12_000;
const HEALTH_TIMEOUT_MS = 2_500;

export type BridgeStatus = "unknown" | "checking" | "connected" | "unavailable";

export interface HealthResult {
  status: "connected" | "unavailable";
  modelId?: string;
}

export interface NarrateRequestBody {
  doorPersonality: string;
  tension: number;
  outcomeSummary: string;
}

export interface NarrateResult {
  text: string | null;
  /** True only when the request was aborted because a newer one superseded it — callers should not treat this as a failure. */
  aborted?: boolean;
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
      const data = (await res.json()) as { modelId?: string; ok?: boolean };
      if (!data.ok) return { status: "unavailable" };
      return { status: "connected", modelId: data.modelId };
    } catch {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cancels any in-flight narration request — used when a run resets or a new action supersedes an old one. */
  cancelPending(): void {
    this.inFlight?.abort();
    this.inFlight = null;
  }

  /**
   * Exactly one request per call. Any previous still-pending request is
   * aborted first, so at most one narration call is ever in flight.
   */
  async narrate(body: NarrateRequestBody): Promise<NarrateResult> {
    this.cancelPending();
    const controller = new AbortController();
    this.inFlight = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${this.baseUrl}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) return { text: null };
      const data = (await res.json()) as { text?: string };
      return { text: typeof data.text === "string" ? data.text : null };
    } catch {
      if (controller.signal.aborted) return { text: null, aborted: true };
      return { text: null };
    } finally {
      clearTimeout(timer);
      if (this.inFlight === controller) this.inFlight = null;
    }
  }
}
