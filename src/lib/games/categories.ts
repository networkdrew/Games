import { categorySchema, type Category } from "./schema";

/**
 * Every category a game can belong to. Kept broad and few on purpose —
 * see docs/adding-a-game.md before adding a new one. Add an entry here only
 * once a real game needs it.
 */
const rawCategories = [
  {
    id: "text-adventure",
    name: "Text Adventures",
    description:
      "Type what you do; a deterministic engine decides what happens next.",
    icon: "scroll-text",
  },
] as const satisfies readonly Category[];

export const categories: readonly Category[] = rawCategories.map((c) =>
  categorySchema.parse(c),
);

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
