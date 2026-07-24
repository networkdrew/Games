import {
  DEFAULT_BRIDGE_URL,
  type EnsureModelResult,
  type HealthResult,
} from "@/lib/bridge/client";

export interface CourtParticipantWire {
  id: "bailiff" | "clerk" | "plaintiff" | "defendant" | "witness";
  name: string;
  role: string;
  voice: string;
  privateKnowledge: string;
}

export interface CourtRecentMessageWire {
  name: string;
  text: string;
}

export interface CourtTurnRequest {
  caseId: string;
  caseTitle: string;
  publicBrief: string;
  privateTruth: string;
  participants: CourtParticipantWire[];
  phase: "opening" | "hearing" | "deliberation";
  turnNumber: number;
  allowInterruptions: boolean;
  playerMessage: string;
  memorySummary: string;
  memoryFacts: string[];
  recentMessages: CourtRecentMessageWire[];
}

export interface CourtGeneratedMessage {
  speaker: CourtParticipantWire["id"];
  text: string;
}

export type CourtEvent =
  | { type: "start"; requestId: string }
  | {
      type: "model";
      modelId: string;
      alias: string;
      friendlyName?: string;
    }
  | { type: "loading" }
  | { type: "memory"; summary: string; fact: string | null }
  | ({ type: "message" } & CourtGeneratedMessage)
  | { type: "unavailable"; reason: string }
  | { type: "done"; stats: Record<string, unknown> }
  | { type: "error"; message: string };

export interface CourtTurnResult {
  messages: CourtGeneratedMessage[];
  memorySummary: string | null;
  memoryFact: string | null;
  unavailable: boolean;
  aborted?: boolean;
}

export interface CourtGameClient {
  checkHealth: () => Promise<HealthResult>;
  ensureModel: () => Promise<EnsureModelResult>;
  cancelPending: () => void;
  takeTurn: (
    body: CourtTurnRequest,
    onEvent?: (event: CourtEvent) => void,
  ) => Promise<CourtTurnResult>;
}

const HEALTH_TIMEOUT_MS = 2_500;
const ENSURE_TIMEOUT_MS = 130_000;
const TURN_TIMEOUT_MS = 35_000;

export class CourtBridgeClient implements CourtGameClient {
  private inFlight: AbortController | null = null;

  constructor(private readonly baseUrl = DEFAULT_BRIDGE_URL) {}

  async checkHealth(): Promise<HealthResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      if (!response.ok)
        return { reachable: false, installed: false, loaded: false };
      const data = (await response.json()) as {
        installed?: boolean;
        loaded?: boolean;
        alias?: string;
        modelId?: string;
        friendlyName?: string;
        capabilities?: string[];
      };
      const supportsCourt = data.capabilities?.includes("court-chat") ?? false;
      return {
        reachable: true,
        installed: Boolean(data.installed) && supportsCourt,
        loaded: Boolean(data.loaded),
        capabilities: data.capabilities,
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

  async ensureModel(): Promise<EnsureModelResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENSURE_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/api/court/ensure`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false };
      return (await response.json()) as EnsureModelResult;
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  cancelPending() {
    this.inFlight?.abort();
    this.inFlight = null;
  }

  async takeTurn(
    body: CourtTurnRequest,
    onEvent?: (event: CourtEvent) => void,
  ): Promise<CourtTurnResult> {
    this.cancelPending();
    const controller = new AbortController();
    this.inFlight = controller;
    const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
    const result: CourtTurnResult = {
      messages: [],
      memorySummary: null,
      memoryFact: null,
      unavailable: false,
    };

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let event: CourtEvent;
      try {
        event = JSON.parse(line) as CourtEvent;
      } catch {
        return;
      }
      onEvent?.(event);
      if (event.type === "message") {
        result.messages.push({ speaker: event.speaker, text: event.text });
      } else if (event.type === "memory") {
        result.memorySummary = event.summary;
        result.memoryFact = event.fact;
      } else if (event.type === "unavailable" || event.type === "error") {
        result.unavailable = true;
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/court/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        result.unavailable = true;
        return result;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      handleLine(buffer);
      return result;
    } catch {
      result.unavailable = true;
      result.aborted = controller.signal.aborted;
      return result;
    } finally {
      clearTimeout(timer);
      if (this.inFlight === controller) this.inFlight = null;
    }
  }
}
