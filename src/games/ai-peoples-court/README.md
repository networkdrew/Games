# AI People's Court

Complete browser courtroom game for registry id and route slug
`ai-peoples-court`.

- `AIPeoplesCourtGame.tsx` owns the interactive hearing, evidence reader,
  questioning, verdict, score, and next-case flow.
- `logic/cases.ts` contains the original fictional case records.
- `logic/engine.ts` owns investigation progress, immutable verdicts, and
  scoring. Case truth and the player's decision are never delegated to a
  model.
- Colocated tests cover game flow and the pure court engine.

The game has no network dependency and is fully playable at
`/ai-peoples-court/`.
