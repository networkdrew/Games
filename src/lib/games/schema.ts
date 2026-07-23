import { z } from "zod";

const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How a game gets its narrative/response content. "local-ai" games send a
 * compact, deterministic outcome to a local LM Studio model for one-line
 * flavor text (see docs/bridge.md) and always keep working without it via
 * deterministic fallback narration. "browser" games need no model at all.
 * This is the axis the homepage uses to visually separate the two kinds —
 * never implied by category alone.
 */
export const gameKindSchema = z.enum(["local-ai", "browser"]);
export type GameKind = z.infer<typeof gameKindSchema>;

/**
 * The authoritative shape of one game's discovery metadata. Nothing else
 * should hardcode a game's name, description, or route — see
 * src/lib/games/registry.ts and docs/adding-a-game.md.
 */
export const gameMetaSchema = z.object({
  /** Permanent internal identifier. Never reuse or repurpose after publishing. */
  id: z.string().regex(kebab, "id must be kebab-case"),
  /** URL path segment, served at a top-level route (e.g. /ai-dungeon-door/). */
  slug: z.string().regex(kebab, "slug must be kebab-case"),

  name: z.string().min(1),
  tagline: z.string().min(1).max(160),
  /** Paragraphs shown in the game's info panel. */
  description: z.array(z.string().min(1)).min(1),

  categoryId: z.string().min(1),
  kind: gameKindSchema,
  tags: z.array(z.string().min(1)).default([]),

  /** Rough played-in-one-sitting length, shown on the card. */
  playTime: z.string().min(1),

  featured: z.boolean().default(false),
  /** ISO date (YYYY-MM-DD) the game was first published. Drives "new" badges. */
  addedAt: z.string().regex(isoDate, "addedAt must be YYYY-MM-DD"),

  /** Whether this game's page currently exists — lets "coming soon" cards share the same schema/grid as real games. */
  playable: z.boolean().default(true),
});

export type GameMeta = z.infer<typeof gameMetaSchema>;

export const categorySchema = z.object({
  id: z.string().regex(kebab, "id must be kebab-case"),
  name: z.string().min(1),
  description: z.string().min(1),
  /** lucide icon name, rendered via src/components/astro/Icon.astro. */
  icon: z.string().min(1),
});

export type Category = z.infer<typeof categorySchema>;
