import type { BridgeStatus, ModelTier } from "@/lib/bridge/client";
import Icon from "@/components/react/Icon";
import { iconButton } from "@/components/react/styles";
import { friendlyModelName } from "./modelNames";

interface ConnectionStatusProps {
  status: BridgeStatus;
  primaryModelId?: string;
  tinyModelId?: string;
  activeTier: ModelTier | "deterministic";
  generating: boolean;
  onReconnect: () => void;
}

function computeLabel(props: ConnectionStatusProps): string {
  const { status, primaryModelId, tinyModelId, activeTier, generating } = props;
  if (generating) return "Generating locally…";
  if (status === "unknown" || status === "checking")
    return "Checking local AI…";
  if (status === "unavailable")
    return "Local AI unavailable — Offline fallback mode";

  if (activeTier === "primary" && primaryModelId) {
    return `Local AI: ${friendlyModelName(primaryModelId)} connected`;
  }
  if (activeTier === "tiny" && tinyModelId) {
    return `Local AI: ${friendlyModelName(tinyModelId)} connected (experimental)`;
  }
  if (!primaryModelId && !tinyModelId)
    return "Local AI unavailable — Offline fallback mode";
  return "Offline fallback mode";
}

export default function ConnectionStatus(props: ConnectionStatusProps) {
  const { status, onReconnect } = props;
  const label = computeLabel(props);
  const dotClass = props.generating
    ? "bg-accent animate-pulse"
    : status === "unavailable"
      ? "bg-danger"
      : props.activeTier !== "deterministic"
        ? "bg-success"
        : "bg-text-muted";

  return (
    <div
      className="text-text-muted flex items-center gap-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span className="hidden sm:inline">{label}</span>
      {status === "unavailable" && (
        <button
          type="button"
          onClick={onReconnect}
          className={iconButton}
          aria-label="Reconnect to local AI"
          title="Reconnect to local AI"
        >
          <Icon name="refresh-cw" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
