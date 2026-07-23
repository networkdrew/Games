import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAction,
  appendHistory,
  createNewGame,
} from "@/lib/games-logic/ai-dungeon-door/engine";
import { getScenario } from "@/lib/games-logic/ai-dungeon-door/scenarios";
import { resolveNarration } from "@/lib/games-logic/ai-dungeon-door/narration";
import type { GameState } from "@/lib/games-logic/ai-dungeon-door/types";
import { BridgeClient, type BridgeStatus } from "@/lib/bridge/client";
import { buttonSecondary } from "@/components/react/styles";
import Icon from "@/components/react/Icon";
import DoorScene from "./DoorScene";
import StatusBar from "./StatusBar";
import EventLog from "./EventLog";
import ActionInput from "./ActionInput";
import ConnectionStatus from "./ConnectionStatus";

/**
 * Owns the single source of truth for one run: the deterministic GameState
 * (from engine.ts) plus UI-only concerns (bridge connection status, whether
 * a request is in flight). The model is only ever asked to narrate an
 * outcome the engine already decided — see docs/bridge.md and the module
 * docstring in games-logic/ai-dungeon-door/types.ts.
 */
interface AIDungeonDoorGameProps {
  /** Only ever passed in tests, to make a run deterministic — production always omits it. */
  initialSeed?: number;
}

export default function AIDungeonDoorGame({
  initialSeed,
}: AIDungeonDoorGameProps = {}) {
  const [gameState, setGameState] = useState<GameState>(() =>
    createNewGame(initialSeed),
  );
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("unknown");
  const [modelId, setModelId] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const bridgeRef = useRef<BridgeClient | null>(null);

  if (!bridgeRef.current) {
    bridgeRef.current = new BridgeClient();
  }

  const checkConnection = useCallback(async () => {
    setBridgeStatus("checking");
    const result = await bridgeRef.current!.checkHealth();
    setBridgeStatus(result.status);
    setModelId(result.modelId);
  }, []);

  useEffect(() => {
    // Exactly one health check on mount — never polled on an interval.
    checkConnection();
    return () => {
      bridgeRef.current?.cancelPending();
    };
  }, [checkConnection]);

  const scenario = getScenario(gameState.scenarioId);

  async function handleAction(rawInput: string) {
    if (pending || gameState.status !== "playing") return;
    setPending(true);

    const {
      state: nextState,
      outcome,
      free,
    } = applyAction(gameState, rawInput);

    if (free) {
      // Meta actions (inventory check) never cost a turn and never call the model.
      setGameState(
        appendHistory(nextState, rawInput, outcome.fallbackNarration, false),
      );
      setPending(false);
      return;
    }

    setGameState(nextState);

    let rawModelResponse: string | null = null;
    if (bridgeStatus === "connected") {
      const result = await bridgeRef.current!.narrate({
        doorPersonality: scenario.doorPersonality,
        tension: nextState.tension,
        outcomeSummary: outcome.summary,
      });
      rawModelResponse = result.text;
    }

    const { text, aiNarrated } = resolveNarration(outcome, rawModelResponse);
    setGameState((current) =>
      appendHistory(current, rawInput, text, aiNarrated),
    );
    setPending(false);
  }

  function handleNewRun() {
    bridgeRef.current?.cancelPending();
    setGameState(createNewGame());
    setPending(false);
  }

  const gameEnded = gameState.status !== "playing";

  return (
    <div className="dungeon-door bg-bg text-text flex h-full min-h-0 flex-col">
      <header className="border-border bg-bg flex h-14 shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] sm:px-4">
        <a
          href="/"
          className="text-text-muted hover:bg-bg-sunken hover:text-text inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors"
        >
          <Icon name="home" className="h-4 w-4" />
          <span className="hidden sm:inline">Games</span>
        </a>
        <span className="text-text truncate text-sm font-semibold sm:text-base">
          AI Dungeon Door
        </span>
        <div className="ml-auto flex items-center gap-3">
          <ConnectionStatus
            status={bridgeStatus}
            modelId={modelId}
            onReconnect={checkConnection}
          />
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-6">
        <DoorScene tension={gameState.tension} status={gameState.status} />
        <StatusBar state={gameState} />
        <EventLog
          intro={scenario.intro}
          history={gameState.history}
          pendingAction={pending && !gameEnded ? "pending" : null}
          ending={gameState.ending}
        />

        {gameEnded ? (
          <button
            type="button"
            onClick={handleNewRun}
            className={buttonSecondary}
          >
            <Icon name="refresh-cw" className="h-4 w-4" />
            Start a new run
          </button>
        ) : (
          <>
            <ActionInput
              suggestedActions={gameState.suggestedActions}
              disabled={pending}
              onSubmit={handleAction}
            />
            <button
              type="button"
              onClick={handleNewRun}
              className="text-text-muted hover:text-text self-start text-xs underline-offset-2 hover:underline"
            >
              Restart with a new door
            </button>
          </>
        )}

        {bridgeStatus === "unavailable" && (
          <p className="text-text-muted text-xs">
            All AI processing happens locally on your own PC — nothing you type
            is ever sent to a cloud service. Right now the local bridge isn't
            reachable, so the door is narrating itself with prewritten text
            instead. The game is fully playable either way.
          </p>
        )}
      </div>
    </div>
  );
}
