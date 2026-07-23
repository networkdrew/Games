import { gameMetaSchema, type GameMeta } from "./schema";

/**
 * The authoritative list of every game on the site (real and "coming soon"
 * placeholders). Pages, the homepage grid/filter, and the sitemap all read
 * from here — see docs/adding-a-game.md before adding a new one.
 */
const rawGames = [
  {
    id: "ai-dungeon-door",
    slug: "ai-dungeon-door",
    name: "AI Dungeon Door",
    tagline:
      "A locked door, a hidden secret, and a small local model to narrate what happens when you push your luck.",
    description: [
      "You're standing in front of a dungeon door. Something is behind it. Listen, knock, search the wall, try your rusty key, or just kick it in — every action is read by a deterministic game engine that decides what actually happens, then handed to a tiny language model running on your own PC to describe it in one atmospheric line.",
      "Each run picks a hidden scenario at random — a sleeping creature, a trapped adventurer, a mimic, a guard who wants a password, and more — with real health, a small inventory, rising tension, and a handful of turns to find the way through before something goes wrong.",
    ],
    categoryId: "text-adventure",
    kind: "local-ai",
    tags: ["text adventure", "local ai", "roguelite", "dungeon", "replayable"],
    playTime: "5–10 turns",
    featured: true,
    addedAt: "2026-07-22",
    playable: true,
  },
  {
    id: "ai-peoples-court",
    slug: "ai-peoples-court",
    name: "AI People’s Court",
    tagline:
      "A forthcoming local-AI courtroom game where you will judge endlessly generated fictional disputes.",
    description: [
      "You will serve as the judge in fictional disputes generated and performed by a language model running locally through LM Studio. You—not the model—will always decide the verdict.",
      "The courtroom is currently in Phase 1: its route and place in the Games portal are ready, but case generation and gameplay have not been implemented yet.",
    ],
    categoryId: "simulation",
    kind: "local-ai",
    tags: ["courtroom", "judge", "simulation", "local ai", "fictional cases"],
    playTime: "Phase 1 preview",
    featured: false,
    addedAt: "2026-07-22",
    playable: true,
  },
] as const;

export const games: readonly GameMeta[] = rawGames.map((g) =>
  gameMetaSchema.parse(g),
);

export function getGameBySlug(slug: string): GameMeta | undefined {
  return games.find((g) => g.slug === slug);
}

export function getGameById(id: string): GameMeta | undefined {
  return games.find((g) => g.id === id);
}

export function getFeaturedGames(): GameMeta[] {
  return games.filter((g) => g.featured);
}

export function getGamesByCategory(categoryId: string): GameMeta[] {
  return games.filter((g) => g.categoryId === categoryId);
}

export function getGamesByKind(kind: GameMeta["kind"]): GameMeta[] {
  return games.filter((g) => g.kind === kind);
}

const NEW_WINDOW_DAYS = 30;

export function isNewGame(game: GameMeta, now = new Date()): boolean {
  const added = new Date(`${game.addedAt}T00:00:00Z`);
  const ageMs = now.getTime() - added.getTime();
  return ageMs >= 0 && ageMs <= NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
