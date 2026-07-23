# AI People's Court architecture

## Overview

AI People's Court is a complete browser game within the existing Astro Games
portal. It uses the shared full-screen shell but has no runtime service or
model dependency.

```text
registry metadata
  -> /ai-peoples-court/ Astro route
    -> shared GameLayout
      -> AIPeoplesCourtGame React island
        -> code-owned case library + deterministic court engine
```

## Files

- `src/lib/games/registry.ts` is the discovery and homepage source of truth.
- `src/pages/ai-peoples-court/index.astro` owns the canonical route and
  structured game metadata.
- `src/games/ai-peoples-court/AIPeoplesCourtGame.tsx` renders and coordinates
  the hearing.
- `src/games/ai-peoples-court/logic/types.ts` defines the court domain.
- `src/games/ai-peoples-court/logic/cases.ts` contains immutable fictional
  case records.
- `src/games/ai-peoples-court/logic/engine.ts` validates record actions,
  finalizes verdicts, and calculates scores.
- `src/styles/global.css` contains court visuals under the
  `.peoples-court` scope.

## State model

The React island owns a `CourtSession`:

- current case id;
- inspected exhibit ids;
- asked question ids;
- the player's final verdict;
- the resulting score.

The pure engine validates exhibit and question ids against the active case.
It ignores unknown ids and duplicate actions. Once entered, a verdict is
immutable for that session. Calling the next case creates a fresh session and
cycles through the case library.

Scoring rewards review coverage, questioning coverage, preparation, and an
evidence-supported verdict. The explanatory ruling is revealed only after the
player decides.

## Permanent boundaries

- All cases and parties are fictional.
- The player, never a model, controls the verdict.
- Case truth, evidence, procedure, and scoring remain code-owned.
- The court game does not call the Dungeon bridge or LM Studio.
- The game remains playable offline after its static assets load.
- It reuses the registry, `GameLayout`, `GameAppShell`, React, Tailwind, Zod,
  Vitest, and the static Cloudflare deployment.
- Court styles remain scoped and do not affect AI Dungeon Door.
