import type { HealthResult } from "@/lib/bridge/client";
import type { ConnectionState } from "./useBridgeConnection";
import Icon from "@/components/react/Icon";
import { iconButton } from "@/components/react/styles";

interface ConnectionStatusProps {
  state: ConnectionState;
  health: HealthResult | null;
  onRetry: () => void;
}

/** Plain-language, non-technical labels — no model ids, no jargon. Full technical detail lives in DiagnosticsPanel. */
function computeLabel(state: ConnectionState): string {
  switch (state) {
    case "connecting":
      return "Connecting…";
    case "loading-model":
    case "warming":
      return "Waking local storyteller…";
    case "ready":
      return "Local storyteller ready";
    case "reconnecting":
      return "Reconnecting…";
    case "offline":
    case "failed":
      return "Offline story mode";
  }
}

export default function ConnectionStatus({
  state,
  onRetry,
}: ConnectionStatusProps) {
  const label = computeLabel(state);
  const showRetry = state === "offline" || state === "failed";
  const dotClass =
    state === "ready"
      ? "bg-success"
      : state === "offline" || state === "failed"
        ? "bg-text-muted"
        : "bg-accent animate-pulse";

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
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={iconButton}
          aria-label="Retry connecting to local storyteller"
          title="Retry"
        >
          <Icon name="refresh-cw" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
