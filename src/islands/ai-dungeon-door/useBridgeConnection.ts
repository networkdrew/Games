import { useCallback, useEffect, useRef, useState } from "react";
import type { BridgeClient, HealthResult } from "@/lib/bridge/client";

/**
 * The full connection lifecycle the game shell surfaces to the player (see
 * docs/architecture.md's "connection state machine" section):
 *
 * connecting      — checking whether the bridge process is reachable at all
 * loading-model   — bridge is up, model isn't loaded yet, load in progress
 * warming         — model loaded, waiting for the opening scene's first token
 * ready           — a real generation has completed at least once
 * reconnecting    — was ready, lost the bridge mid-play, retrying quietly
 * offline         — bridge unreachable (exhausted retries) or model not
 *                    installed — gameplay continues via the deterministic
 *                    engine, clearly labeled; manual retry available
 * failed          — same as offline but reserved for the *first* connection
 *                    attempt failing outright, so the loading screen can
 *                    show an actionable explanation instead of transitioning
 *                    straight into gameplay
 */
export type ConnectionState =
  | "connecting"
  | "loading-model"
  | "warming"
  | "ready"
  | "reconnecting"
  | "offline"
  | "failed";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const MAX_ATTEMPTS = BACKOFF_MS.length;

export interface UseBridgeConnectionResult {
  state: ConnectionState;
  health: HealthResult | null;
  /** Manual retry — only ever meaningfully exposed to the UI in the "failed"/"offline" states. */
  retry: () => void;
  /** Call once a real generation (opening or a turn) has actually completed successfully. */
  markReady: () => void;
  /** Call when an in-flight generation reveals the bridge is unreachable, without needing a full remount. */
  reportDisconnect: () => void;
  /** True once the caller should attempt the opening-scene generation (loading/model-ensure finished, or already warm). */
  readyToWarm: boolean;
}

export function useBridgeConnection(bridge: BridgeClient): UseBridgeConnectionResult {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [readyToWarm, setReadyToWarm] = useState(false);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const generationRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const connect = useCallback(
    async (mode: "initial" | "reconnect") => {
      const myGeneration = generationRef.current;
      const result = await bridge.checkHealth();
      if (cancelledRef.current || myGeneration !== generationRef.current) return;
      setHealth(result);

      if (!result.reachable) {
        attemptRef.current += 1;
        if (attemptRef.current > MAX_ATTEMPTS) {
          setState(mode === "reconnect" ? "offline" : "failed");
          setReadyToWarm(false);
          return;
        }
        setState(mode === "reconnect" ? "reconnecting" : "connecting");
        const delay = BACKOFF_MS[attemptRef.current - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
        timerRef.current = setTimeout(() => connect(mode), delay);
        return;
      }

      attemptRef.current = 0;

      if (!result.installed) {
        setState("offline");
        setReadyToWarm(false);
        return;
      }

      if (result.loaded) {
        setState("warming");
        setReadyToWarm(true);
        return;
      }

      setState("loading-model");
      const ensured = await bridge.ensureModel();
      if (cancelledRef.current || myGeneration !== generationRef.current) return;
      if (!ensured.ok) {
        // Another tab may be mid-load (bridge single-flights) — a short
        // health recheck resolves that without treating it as a failure.
        timerRef.current = setTimeout(() => connect(mode), 2000);
        return;
      }
      setState("warming");
      setReadyToWarm(true);
    },
    [bridge],
  );

  useEffect(() => {
    cancelledRef.current = false;
    attemptRef.current = 0;
    generationRef.current += 1;
    connect("initial");
    return () => {
      cancelledRef.current = true;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(() => {
    clearTimer();
    cancelledRef.current = false;
    attemptRef.current = 0;
    generationRef.current += 1;
    connect(state === "reconnecting" || state === "offline" ? "reconnect" : "initial");
  }, [connect, state]);

  const markReady = useCallback(() => {
    setState("ready");
    setReadyToWarm(false);
  }, []);

  const reportDisconnect = useCallback(() => {
    clearTimer();
    attemptRef.current = 0;
    generationRef.current += 1;
    setState("reconnecting");
    connect("reconnect");
  }, [connect]);

  return { state, health, retry, markReady, reportDisconnect, readyToWarm };
}
