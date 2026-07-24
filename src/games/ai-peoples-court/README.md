# AI People's Court

Local-LLM courtroom simulation at `/ai-peoples-court/`.

- `AIPeoplesCourtGame.tsx` is the chat interface and player-controlled judge.
- `CourtBridgeClient.ts` speaks only to the fixed loopback court endpoints.
- `logic/cases.ts` owns fictional case truth, exhibits, cast voices, motives,
  and private knowledge.
- `logic/engine.ts` owns transcript, rolling memory, turn count, and verdict.
- `bridge/court-protocol.mjs` constrains the local model to named courtroom
  participants and extracts hidden memory separately from visible dialogue.

Start the production game and local cast with `npm run court:play` or
`Start AI Peoples Court.bat`. Add `-Dev` when invoking the PowerShell launcher
to use the local Astro server.
