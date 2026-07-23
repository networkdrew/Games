import type { BridgeStatus, ModelTier } from "@/lib/bridge/client";
import { friendlyModelName } from "./modelNames";

export interface DiagnosticsData {
  requestId?: string;
  modelId?: string | null;
  tier?: ModelTier;
  firstTokenMs?: number | null;
  totalMs?: number | null;
  chunks?: number;
  approxPromptTokens?: number;
  approxCompletionTokens?: number;
  corrected?: boolean;
  fallback?: boolean;
}

interface DiagnosticsPanelProps {
  status: BridgeStatus;
  primaryModelId?: string;
  tinyModelId?: string;
  lastTurn: DiagnosticsData | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text font-mono text-xs">{value}</dd>
    </div>
  );
}

/**
 * Proves the local model is actually being used rather than a cosmetic
 * claim of "AI connected" — collapsed by default, expand to see exact
 * model ids, streaming timing, and whether this turn required a fallback.
 */
export default function DiagnosticsPanel({
  status,
  primaryModelId,
  tinyModelId,
  lastTurn,
}: DiagnosticsPanelProps) {
  return (
    <details className="border-border bg-bg-elevated/60 rounded-lg border text-xs">
      <summary className="text-text-muted cursor-pointer px-3 py-2 font-medium select-none">
        Diagnostics
      </summary>
      <dl className="flex flex-col gap-0.5 px-3 pb-3">
        <Row label="Bridge connection" value={status} />
        <Row
          label="Primary model"
          value={
            primaryModelId ? friendlyModelName(primaryModelId) : "not loaded"
          }
        />
        <Row
          label="Tiny model"
          value={tinyModelId ? friendlyModelName(tinyModelId) : "not loaded"}
        />
        {lastTurn ? (
          <>
            <Row label="Last request id" value={lastTurn.requestId ?? "—"} />
            <Row
              label="Last turn mode"
              value={
                lastTurn.fallback
                  ? "deterministic fallback"
                  : `AI (${lastTurn.tier ?? "?"}: ${friendlyModelName(lastTurn.modelId)})`
              }
            />
            <Row
              label="Time to first token"
              value={
                lastTurn.firstTokenMs != null
                  ? `${lastTurn.firstTokenMs}ms`
                  : "—"
              }
            />
            <Row
              label="Total generation time"
              value={lastTurn.totalMs != null ? `${lastTurn.totalMs}ms` : "—"}
            />
            <Row
              label="Streamed chunks"
              value={String(lastTurn.chunks ?? "—")}
            />
            <Row
              label="Approx. input tokens"
              value={
                lastTurn.approxPromptTokens != null
                  ? String(lastTurn.approxPromptTokens)
                  : "—"
              }
            />
            <Row
              label="Approx. output tokens"
              value={
                lastTurn.approxCompletionTokens != null
                  ? String(lastTurn.approxCompletionTokens)
                  : "—"
              }
            />
            <Row
              label="Required correction"
              value={lastTurn.corrected ? "yes" : "no"}
            />
            <Row
              label="Used fallback narration"
              value={lastTurn.fallback ? "yes" : "no"}
            />
          </>
        ) : (
          <p className="text-text-muted py-1">No turn taken yet this run.</p>
        )}
      </dl>
    </details>
  );
}
