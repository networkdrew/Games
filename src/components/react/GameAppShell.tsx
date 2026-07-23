import type { ReactNode } from "react";
import { iconButton } from "@/components/react/styles";
import Icon from "@/components/react/Icon";

/**
 * Reusable "standalone app" chrome for a game workspace page: a minimal
 * title bar (back link, title, optional slots, new-game control) plus a
 * slot that swaps the whole body for a loading screen. Provides structure
 * only — visual identity (fonts, colors, background texture) is entirely up
 * to the game via `className`/children, never baked in here so future games
 * aren't forced to look like AI Dungeon Door.
 */
interface GameAppShellProps {
  gameTitle: string;
  backHref?: string;
  backLabel?: string;
  onNewGame?: () => void;
  newGameLabel?: string;
  /** Rendered before the new-game control, e.g. a connection indicator. */
  connectionSlot?: ReactNode;
  /** Rendered before `connectionSlot`, e.g. a sound/settings toggle. */
  actionsSlot?: ReactNode;
  /** When set, replaces `children` entirely — the shell's loading-screen slot. */
  loading?: ReactNode;
  /** Applied to the shell's root element — use this to scope a game's own CSS (e.g. "dungeon-door"). */
  className?: string;
  children: ReactNode;
}

export default function GameAppShell({
  gameTitle,
  backHref = "/",
  backLabel = "Games",
  onNewGame,
  newGameLabel = "New game",
  connectionSlot,
  actionsSlot,
  loading,
  className,
  children,
}: GameAppShellProps) {
  return (
    <div
      className={`${className ?? ""} bg-bg text-text flex h-full min-h-0 flex-col`}
    >
      <header className="border-border bg-bg flex h-14 shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:px-4">
        <a
          href={backHref}
          className="text-text-muted hover:bg-bg-sunken hover:text-text inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm transition-colors"
        >
          <Icon name="home" className="h-4 w-4" />
          <span className="hidden sm:inline">{backLabel}</span>
        </a>
        <span className="text-text truncate text-sm font-semibold sm:text-base">
          {gameTitle}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {actionsSlot}
          {connectionSlot}
          {onNewGame && (
            <button
              type="button"
              onClick={onNewGame}
              className={iconButton}
              aria-label={newGameLabel}
              title={newGameLabel}
            >
              <Icon name="refresh-cw" className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        {loading ?? children}
      </div>
    </div>
  );
}
