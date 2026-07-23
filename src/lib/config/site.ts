/**
 * Single source of truth for site-wide identity and URLs.
 * `astro.config.mjs` imports SITE_URL from here to set Astro's `site` field,
 * so this file — not astro.config — is the one place to change the
 * production origin. Astro also exposes it at runtime as `Astro.site`.
 */

export const SITE_NAME = "OpenGames";

export const SITE_TAGLINE = "Small, atmospheric games you actually own";

export const SITE_DESCRIPTION =
  "A free collection of small, atmospheric browser games — some powered by a language model running entirely on your own PC, never in the cloud.";

/** Production canonical origin, no trailing slash. Mirrors astro.config.mjs `site`. */
export const SITE_URL = "https://games.drewcassidy.dev";

export const GITHUB_URL: string | undefined = undefined;

export const NAV_LINKS = [{ label: "All games", href: "/#games" }] as const;
