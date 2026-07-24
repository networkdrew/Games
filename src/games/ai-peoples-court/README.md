# AI People's Court

Local-LLM courtroom simulation at `/ai-peoples-court/`.

- `AIPeoplesCourtGame.tsx` is the chat interface and player-controlled judge.
- `CourtBridgeClient.ts` speaks only to the fixed loopback court endpoints.
- `logic/cases.ts` owns fictional case truth, exhibits, cast voices, motives,
  and private knowledge for authored regression cases.
- `logic/generator.ts` combines seeded content packs into endless,
  reproducible cases with changing difficulty and complexity.
- `logic/archive.ts` caches generated cases and verdicts in a versioned local
  archive.
- `logic/engine.ts` owns transcript, rolling memory, turn count, and verdict.
- `bridge/court-protocol.mjs` confines each generation to one code-selected
  role and streams dialogue after hidden memory/control fields.

Start the production game and local cast with `npm run court:play` or
`Start AI Peoples Court.bat`. Add `-Dev` when invoking the PowerShell launcher
to use the local Astro server.
