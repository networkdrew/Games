import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendExchange,
  applyDeterministicAction,
  applyLegalOutcome,
  buildTurnContext,
  createNewGame,
  isInventoryCheck,
  pushMemoryFact,
} from "@/lib/games-logic/ai-dungeon-door/engine";
import { getScenario } from "@/lib/games-logic/ai-dungeon-door/scenarios";
import {
  findValidatedOutcome,
  sanitizeMemoryFact,
  sanitizeNarrationText,
} from "@/lib/games-logic/ai-dungeon-door/narration";
import type { GameState } from "@/lib/games-logic/ai-dungeon-door/types";
import {
  BridgeClient,
  type BridgeStatus,
  type ModelTier,
} from "@/lib/bridge/client";
import { buttonSecondary } from "@/components/react/styles";
import Icon from "@/components/react/Icon";
import DoorScene from "./DoorScene";
import StatusBar from "./StatusBar";
import EventLog from "./EventLog";
import ActionInput from "./ActionInput";
import ConnectionStatus from "./ConnectionStatus";
import DiagnosticsPanel, { type DiagnosticsData } from "./DiagnosticsPanel";
import { friendlyModelName } from "./modelNames";

/** Rough chars-per-token heuristic for the diagnostics panel's "approx tokens" display — LM Studio's streamed responses don't reliably report usage, so this is clearly labeled as approximate, never exact. */
function approxTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

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
  const [primaryModelId, setPrimaryModelId] = useState<string | undefined>(
    undefined,
  );
  const [tinyModelId, setTinyModelId] = useState<string | undefined>(undefined);
  const [preferredTier, setPreferredTier] = useState<"auto" | "tiny">("auto");
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);
  const [lastDiagnostics, setLastDiagnostics] =
    useState<DiagnosticsData | null>(null);
  const bridgeRef = useRef<BridgeClient | null>(null);

  if (!bridgeRef.current) {
    bridgeRef.current = new BridgeClient();
  }

  const checkConnection = useCallback(async () => {
    setBridgeStatus("checking");
    const result = await bridgeRef.current!.checkHealth();
    setBridgeStatus(result.status);
    setPrimaryModelId(result.primaryModelId);
    setTinyModelId(result.tinyModelId);
  }, []);

  useEffect(() => {
    // Exactly one health check on mount — never polled on an interval.
    checkConnection();
    return () => {
      bridgeRef.current?.cancelPending();
    };
  }, [checkConnection]);

  const scenario = getScenario(gameState.scenarioId);
  const activeTier: ModelTier | "deterministic" =
    bridgeStatus === "connected" &&
    (preferredTier === "tiny" ? tinyModelId : primaryModelId)
      ? preferredTier === "tiny"
        ? "tiny"
        : "primary"
      : "deterministic";

  async function handleAction(rawInput: string) {
    if (pending || gameState.status !== "playing") return;
    setPending(true);
    setStreamingText(null);
    setWaitingForFirstToken(false);

    if (isInventoryCheck(rawInput, gameState.inventory)) {
      const { state: nextState, narration } = applyDeterministicAction(
        gameState,
        rawInput,
      );
      setGameState(
        appendExchange(nextState, rawInput, narration, false, false),
      );
      setPending(false);
      return;
    }

    if (activeTier === "deterministic") {
      const { state: nextState } = applyDeterministicAction(
        gameState,
        rawInput,
      );
      setGameState(nextState);
      setLastDiagnostics({ fallback: true, tier: undefined, modelId: null });
      setPending(false);
      return;
    }

    const ctx = buildTurnContext(gameState);
    const wireLegalOutcomes = ctx.legalOutcomes.map((o) => ({
      id: o.id,
      description: o.description,
    }));
    const diag: DiagnosticsData = { tier: activeTier };
    let liveText = "";
    let sawFirstDelta = false;

    setWaitingForFirstToken(true);
    const result = await bridgeRef.current!.streamTurn(
      {
        modelTier: activeTier,
        characterPrompt: ctx.characterPrompt,
        secretTruth: ctx.secretTruth,
        stateSummary: ctx.stateSummary,
        legalOutcomes: wireLegalOutcomes,
        memoryFacts: ctx.memoryFacts,
        recentExchanges: ctx.recentExchanges,
        playerAction: rawInput,
      },
      {
        onEvent: (event) => {
          if (event.type === "start") {
            diag.requestId = event.requestId;
          } else if (event.type === "model") {
            diag.modelId = event.modelId;
          } else if (event.type === "delta") {
            if (!sawFirstDelta) {
              sawFirstDelta = true;
              setWaitingForFirstToken(false);
            }
            liveText += event.text;
            setStreamingText(liveText);
          } else if (event.type === "outcome") {
            diag.corrected = event.corrected;
            diag.fallback = event.fallback;
          } else if (event.type === "done") {
            const stats = event.stats as Record<string, unknown>;
            diag.firstTokenMs = (stats.firstTokenMs as number | null) ?? null;
            diag.totalMs = (stats.totalMs as number | null) ?? null;
            diag.chunks = stats.chunks as number | undefined;
          }
        },
      },
    );

    setWaitingForFirstToken(false);
    setStreamingText(null);

    if (result.aborted) {
      // Superseded by a reset (New Run) or unmount — the caller that
      // superseded us already owns `pending`/state; never touch either here.
      return;
    }

    const validated =
      !result.fallback && result.outcomeId
        ? findValidatedOutcome(result.outcomeId, ctx.legalOutcomes)
        : null;

    if (!validated) {
      // No model available, the model's output failed validation twice, or
      // (defense in depth) the bridge claimed an outcome that isn't
      // actually in our own legal list — fall back to the exact same
      // deterministic engine used fully offline.
      const { state: nextState } = applyDeterministicAction(
        gameState,
        rawInput,
        true,
      );
      setGameState(nextState);
      setLastDiagnostics({ ...diag, fallback: true });
      setPending(false);
      return;
    }

    const sanitized = sanitizeNarrationText(result.narration);
    const finalNarration = sanitized ?? validated.fallbackNarration;
    const aiNarrated = sanitized !== null;
    const memoryFact = sanitizeMemoryFact(result.memoryFact);

    const { state: appliedState } = applyLegalOutcome(gameState, validated);
    const withMemory = pushMemoryFact(appliedState, memoryFact);
    const finalState = appendExchange(
      withMemory,
      rawInput,
      finalNarration,
      aiNarrated,
      !aiNarrated,
    );

    setGameState(finalState);
    setLastDiagnostics({
      ...diag,
      approxPromptTokens: approxTokens(
        ctx.characterPrompt + ctx.secretTruth + ctx.stateSummary,
      ),
      approxCompletionTokens: approxTokens(finalNarration),
    });
    setPending(false);
  }

  function handleNewRun() {
    bridgeRef.current?.cancelPending();
    setGameState(createNewGame());
    setStreamingText(null);
    setWaitingForFirstToken(false);
    setLastDiagnostics(null);
    setPending(false);
  }

  const gameEnded = gameState.status !== "playing";
  const tinyModeSelectable =
    Boolean(tinyModelId) && bridgeStatus === "connected";

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
          {tinyModeSelectable && (
            <label className="text-text-muted hidden items-center gap-1.5 text-xs sm:flex">
              <input
                type="checkbox"
                checked={preferredTier === "tiny"}
                onChange={(e) =>
                  setPreferredTier(e.target.checked ? "tiny" : "auto")
                }
              />
              Tiny Model (experimental)
            </label>
          )}
          <ConnectionStatus
            status={bridgeStatus}
            primaryModelId={primaryModelId}
            tinyModelId={tinyModelId}
            activeTier={activeTier}
            generating={pending && activeTier !== "deterministic"}
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
          streamingText={streamingText}
          waitingForFirstToken={waitingForFirstToken}
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

        {bridgeStatus === "connected" && !primaryModelId && (
          <p className="text-text-muted text-xs">
            No capable model is currently loaded in LM Studio, so this run uses
            deterministic narration
            {tinyModelId
              ? ` (or check "Tiny Model" above for an experimental, lower-quality AI option using ${friendlyModelName(tinyModelId)})`
              : ""}
            .
          </p>
        )}

        <DiagnosticsPanel
          status={bridgeStatus}
          primaryModelId={primaryModelId}
          tinyModelId={tinyModelId}
          lastTurn={lastDiagnostics}
        />
      </div>
    </div>
  );
}
