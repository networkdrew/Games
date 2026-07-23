# AI People's Court status

## Current status

**Complete and playable.**

The route at `/ai-peoples-court/` contains three original fictional civil
cases. A player can read both opening statements, inspect exhibits, question
each party, deliver a verdict, receive a preparation/accuracy score, and call
the next case.

## Gameplay ownership

- Case facts and supporting rulings are authored in
  `src/games/ai-peoples-court/logic/cases.ts`.
- Investigation progress, verdict finality, and scoring are controlled by
  the pure engine in `logic/engine.ts`.
- The human player always chooses the verdict.
- No network, local bridge, LM Studio process, cloud service, or paid API is
  required. The game is classified as a browser game in the site registry.
- Every person, company, event, and dispute in the case library is fictional.

## Site integration

- The game is registered as playable and featured in
  `src/lib/games/registry.ts`.
- The registry drives its homepage card, simulation category, tags, play
  time, and canonical `/ai-peoples-court/` route.
- `src/pages/ai-peoples-court/index.astro` mounts the React game through the
  shared `GameLayout` and `GameAppShell`.
- Court-specific responsive styles are scoped under `.peoples-court`.

## Verification

Component tests cover the initial case, evidence review, questioning, verdict,
result, and next-case flow. Pure engine tests cover immutable record progress,
invalid exhibit rejection, verdict finality, and full-score calculation.
