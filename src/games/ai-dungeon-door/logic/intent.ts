import type { BaseIntent, ParsedAction } from "./types";

/**
 * Lightweight keyword/intent matching — deliberately not an LLM call. The
 * model never decides what the player did; this pure function does, and the
 * engine treats its output as authoritative. Order matters: item-aware
 * checks (use/offer) run first so "use the rusty key" doesn't get caught by
 * a more generic pattern first.
 */

const KEYWORD_RULES: Array<{ intent: BaseIntent; patterns: RegExp[] }> = [
  { intent: "use-key", patterns: [/\bkey\b/, /\bunlock\b/] },
  {
    intent: "knock",
    patterns: [/\bknock\b/, /\bbang\b/, /\btap\b/, /\bpound\b/],
  },
  {
    intent: "listen",
    patterns: [/\blisten\b/, /\bear\b/, /\bhear\b/, /\bsound\b/],
  },
  {
    intent: "look-under",
    patterns: [
      /\bunder(neath)?\b/,
      /\bbeneath\b/,
      /\bgap\b/,
      /\bcrack\b/,
      /\bfloor\b/,
    ],
  },
  {
    intent: "force",
    patterns: [
      /\bkick\b/,
      /\bforce\b/,
      /\bbreak\b/,
      /\bbash\b/,
      /\bsmash\b/,
      /\bshoulder\b/,
      /\bshove\b/,
      /\bram\b/,
    ],
  },
  {
    intent: "ask",
    patterns: [
      /\bask\b/,
      /who'?s? there/,
      /who is (there|inside|behind)/,
      /\btalk\b/,
      /\bspeak\b/,
      /\bcall out\b/,
      /\bhello\b/,
      /\bshout\b/,
    ],
  },
  {
    intent: "offer",
    patterns: [/\boffer\b/, /\bgive\b/, /\bfeed\b/, /\bfood\b/],
  },
  {
    intent: "wait",
    patterns: [/\bwait\b/, /\bdo nothing\b/, /\bpause\b/, /\bhold\b/],
  },
  {
    intent: "inventory",
    patterns: [
      /\binventory\b/,
      /\bwhat.*carrying\b/,
      /\bcheck.*(items|bag|pack)\b/,
    ],
  },
  {
    intent: "search-wall",
    patterns: [
      /\bwall(s)?\b/,
      /\bstone(s)?\b/,
      /\bsearch\b/,
      /\bexamine\b/,
      /\blook around\b/,
      /\binspect\b/,
    ],
  },
];

function normalize(raw: string): string {
  return raw.toLowerCase().trim();
}

/** Extracts an inventory item name mentioned in the text, longest match first (so "rusty key" beats "key"). */
function findMentionedItem(
  text: string,
  inventory: readonly string[],
): string | undefined {
  const candidates = [...inventory].sort((a, b) => b.length - a.length);
  return candidates.find((item) => text.includes(item.toLowerCase()));
}

export function parseAction(
  raw: string,
  inventory: readonly string[],
): ParsedAction {
  const text = normalize(raw);

  if (text.length === 0) {
    return { intent: "freeform", raw };
  }

  const offersVerb = /\boffer\b|\bgive\b|\bfeed\b/.test(text);
  const mentionedItem = findMentionedItem(text, inventory);

  if (offersVerb && mentionedItem) {
    return { intent: "offer", item: mentionedItem, raw };
  }
  if (mentionedItem) {
    // Naming a carried item at all (with or without "use") is treated as an
    // attempt to use it, e.g. "rusty key on the lock" or "use the torch".
    return { intent: "use-item", item: mentionedItem, raw };
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { intent: rule.intent, raw };
    }
  }

  return { intent: "freeform", raw };
}
