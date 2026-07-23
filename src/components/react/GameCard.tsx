import Icon from "@/components/react/Icon";
import { badge } from "@/components/react/styles";
import type { GameMeta } from "@/lib/games/schema";

export interface GameCardData extends Pick<
  GameMeta,
  "slug" | "name" | "tagline" | "kind" | "tags" | "playTime" | "categoryId"
> {
  isNew: boolean;
}

interface GameCardProps {
  game: GameCardData;
  categoryName?: string;
}

export default function GameCard({ game, categoryName }: GameCardProps) {
  return (
    <a
      href={`/${game.slug}/`}
      className="group border-border bg-bg-elevated hover:border-accent flex flex-col gap-3 rounded-lg border p-5 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`${badge} ${
            game.kind === "local-ai"
              ? "bg-accent/10 text-accent"
              : "bg-bg-sunken text-text-muted"
          }`}
        >
          <Icon
            name={game.kind === "local-ai" ? "message-circle" : "scroll-text"}
            className="h-3 w-3"
          />
          {game.kind === "local-ai" ? "Local AI" : "Browser game"}
        </span>
        {game.isNew && (
          <span className={`${badge} bg-accent/10 text-accent`}>New</span>
        )}
      </div>
      <div>
        <h3 className="text-text font-semibold">{game.name}</h3>
        <p className="text-text-muted mt-1 text-sm">{game.tagline}</p>
      </div>
      <div className="text-text-muted mt-auto flex items-center justify-between gap-2 pt-2 text-xs">
        <span>{categoryName}</span>
        <span>{game.playTime}</span>
      </div>
    </a>
  );
}
