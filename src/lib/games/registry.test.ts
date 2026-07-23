import { describe, expect, it } from "vitest";
import { games, getGameBySlug, isNewGame } from "./registry";
import { categories } from "./categories";

describe("games registry", () => {
  it("has at least one game", () => {
    expect(games.length).toBeGreaterThan(0);
  });

  it("has unique ids and slugs", () => {
    const ids = games.map((g) => g.id);
    const slugs = games.map((g) => g.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only references categories that exist", () => {
    const categoryIds = new Set(categories.map((c) => c.id));
    for (const game of games) {
      expect(categoryIds.has(game.categoryId)).toBe(true);
    }
  });

  it("finds a game by slug", () => {
    expect(getGameBySlug("ai-dungeon-door")?.name).toBe("AI Dungeon Door");
    expect(getGameBySlug("ai-peoples-court")?.name).toBe("AI People's Court");
    expect(getGameBySlug("does-not-exist")).toBeUndefined();
  });

  it("treats a game added today as new, and one from last year as not new", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const today = { ...games[0]!, addedAt: "2026-07-22" };
    const lastYear = { ...games[0]!, addedAt: "2025-01-01" };
    expect(isNewGame(today, now)).toBe(true);
    expect(isNewGame(lastYear, now)).toBe(false);
  });
});
