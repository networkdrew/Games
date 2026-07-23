import { useMemo, useState } from "react";
import GameCard, { type GameCardData } from "@/components/react/GameCard";
import Icon from "@/components/react/Icon";
import { textField } from "@/components/react/styles";

interface GameGridProps {
  games: GameCardData[];
  categoryNames: Record<string, string>;
}

type KindFilter = "all" | "local-ai" | "browser";

/**
 * Client-side search/filter over the game registry. Deliberately no search
 * library or index — with a handful of games a plain substring match over
 * name/tagline/tags is instant and needs no dependency. Structured so
 * adding a game to the registry (src/lib/games/registry.ts) is the only
 * thing needed for it to show up here, filterable, automatically.
 */
export default function GameGrid({ games, categoryNames }: GameGridProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games.filter((game) => {
      if (kind !== "all" && game.kind !== kind) return false;
      if (q.length === 0) return true;
      const haystack = [game.name, game.tagline, ...game.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [games, query, kind]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="text-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games…"
            aria-label="Search games"
            className={`${textField} pl-9`}
          />
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter by kind">
          {(
            [
              { value: "all", label: "All" },
              { value: "local-ai", label: "Local AI" },
              { value: "browser", label: "Browser" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                kind === option.value
                  ? "bg-accent text-accent-contrast"
                  : "bg-bg-sunken text-text-muted hover:text-text"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-text-muted py-8 text-center text-sm">
          No games match "{query}" yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((game) => (
            <GameCard
              key={game.slug}
              game={game}
              categoryName={categoryNames[game.categoryId]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
