import type { BridgeStatus } from "@/lib/bridge/client";
import Icon from "@/components/react/Icon";
import { iconButton } from "@/components/react/styles";

interface ConnectionStatusProps {
  status: BridgeStatus;
  modelId?: string;
  onReconnect: () => void;
}

const LABELS: Record<BridgeStatus, string> = {
  unknown: "Checking local AI…",
  checking: "Connecting to local AI…",
  connected: "Local AI connected",
  unavailable: "Local AI unavailable — deterministic story mode",
};

export default function ConnectionStatus({
  status,
  modelId,
  onReconnect,
}: ConnectionStatusProps) {
  const label = LABELS[status];
  const dotClass =
    status === "connected"
      ? "bg-success"
      : status === "unavailable"
        ? "bg-danger"
        : "bg-text-muted animate-pulse";

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
      <span className="hidden sm:inline">
        {label}
        {status === "connected" && modelId ? ` (${modelId})` : ""}
      </span>
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
