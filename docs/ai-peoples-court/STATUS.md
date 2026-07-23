# AI People’s Court status

## Current phase

**Phase 1 — repository inspection, baseline verification, architecture
mapping, and minimal route scaffolding.**

The route exists and accurately identifies itself as under construction.
There is no playable court case, model connection, generated testimony,
courtroom engine, or fake status data.

## Baseline before Phase 1 changes

Baseline was run on the existing dirty worktree with Node `v24.18.0`.
PowerShell's script policy blocked the `npm.ps1` shim, so repository commands
were run through the equivalent Windows executable, `npm.cmd`.

| Check                      | Baseline result                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `npm test`                 | Failed: 92 tests total, 76 passed and 16 failed across 3 files; 10 unhandled jsdom errors |
| `npm run bridge:test`      | Passed: 18/18                                                                             |
| `npm run check`            | Failed: 14 errors, 0 warnings, 1 hint                                                     |
| `npm run typecheck`        | Same configured command as `check` (`astro check`); not duplicated                        |
| `npm run lint`             | Failed: 3 errors and 1 warning                                                            |
| `npm run format:check`     | Failed: 20 pre-existing files reported                                                    |
| `npm run build`            | Passed outside the managed filesystem sandbox; 3 pages built                              |
| Browser/direct-route tests | No Playwright, Cypress, or browser-test command is configured                             |

Recorded pre-existing failures:

- `src/lib/bridge/client.test.ts` expects an older health shape and
  outcome/memory wire protocol than `src/lib/bridge/client.ts` currently
  exposes.
- `src/games/ai-dungeon-door/logic/scenarios.test.ts` expects removed
  `startingSuggestions`.
- All 10 `AIDungeonDoorGame.test.tsx` tests error because jsdom has no
  `window.matchMedia` stub for `EventLog.tsx`.
- Astro Check reports the same stale client/scenario test types (14 errors)
  plus an unused-test-helper hint.
- ESLint reports three unknown
  `react-hooks/exhaustive-deps` rule references and one unused helper warning.
- Prettier reports 20 existing files, chiefly the in-progress Dungeon/bridge
  changes and evaluation artifacts.
- Inside the managed sandbox, the Cloudflare prerender worker cannot write
  Wrangler logs/registry under the user profile. The approved unsandboxed
  build passed, confirming this is an environment restriction rather than a
  repository build failure.

These unrelated failures were not fixed in Phase 1.

## Work completed

- Inspected the portal, configuration, deployment, registry, layouts, React
  islands, game state, bridge security/streaming/cancellation, offline
  behavior, model discovery, launchers, docs, and tests.
- Registered AI People’s Court as the second local-AI game.
- Added the broad `simulation` category.
- Added the final direct Astro route at `/ai-peoples-court/`.
- Mounted a minimal React island through the existing chromeless
  `GameLayout` and shared `GameAppShell`.
- Added an original, lightweight navy/brass courtroom identity scoped to
  `.peoples-court`.
- Added an honest Phase 1 message and homepage navigation.
- Added a focused component test and expanded the registry test.
- Added no bridge, model client, prompts, model output, connection status,
  metrics, cases, testimony, or gameplay state.

## Exact files changed

Added:

- `docs/ai-peoples-court/ARCHITECTURE.md`
- `docs/ai-peoples-court/STATUS.md`
- `src/pages/ai-peoples-court/index.astro`
- `src/games/ai-peoples-court/AIPeoplesCourtGame.tsx`
- `src/games/ai-peoples-court/AIPeoplesCourtGame.test.tsx`

Updated:

- `src/lib/games/registry.ts`
- `src/lib/games/categories.ts`
- `src/lib/games/registry.test.ts`
- `src/pages/index.astro`
- `src/styles/global.css`

No `bridge/`, AI Dungeon Door, launcher, package, Astro configuration, or
Cloudflare configuration file was changed for this phase.

## Architectural decisions

- This is a route and React island inside the existing Astro application, not
  a separate app.
- The homepage card is entirely registry-driven.
- The route uses the established `GameLayout` -> `BaseLayout(shell)` ->
  `GameAppShell` stack.
- The Phase 1 island does not instantiate `BridgeClient`. A connection would
  be misleading before the game contract exists.
- Court styles are scoped, so they do not alter AI Dungeon Door's visual
  tokens.
- The new game is not featured; the existing featured Dungeon presentation
  remains intact.
- A future court contract must extend the single existing loopback bridge and
  keep case truth and verdict authority in code.

## Known risks

- The repository started with substantial uncommitted Dungeon/bridge work and
  a red regression baseline.
- Existing bridge/client tests and some docs do not match the current
  in-progress protocol.
- The current browser bridge client is Dungeon-specific and will need careful
  extraction/generalization, not duplication.
- There is no gameplay save-state abstraction yet.
- Hosted-page access to loopback HTTP can vary with browser Private Network
  Access and managed-device policy.
- Court content needs strict fictionalization, truth ownership, evidence
  consistency, procedural boundaries, and an explicit no-legal-advice
  presentation.

## Post-change verification

| Check                                    | Final result                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Focused registry + court component tests | Passed: 6/6                                                                                                                          |
| Full `npm test`                          | Passed: 101/101 across 8 files                                                                                                       |
| `npm run bridge:test`                    | Passed: 18/18                                                                                                                        |
| `npm run check` / type checking          | Passed: 0 errors, warnings, or hints                                                                                                 |
| `npm run lint`                           | Passed                                                                                                                               |
| `npm run format:check`                   | Still fails on one unrelated existing file, `docs/dungeon-chat-model-selection.md`; all Phase 1 files pass a targeted Prettier check |
| `npm run build`                          | Passed: 4 static pages built                                                                                                         |
| `/ai-peoples-court/`                     | `dist/client/ai-peoples-court/index.html` exists with the correct canonical URL, metadata, React bundle, and under-construction copy |
| Homepage card                            | Built homepage contains the linked card, `Simulations` category, and `Phase 1 preview` label                                         |
| AI Dungeon Door                          | Its 10 component tests pass and `dist/client/ai-dungeon-door/index.html` is still generated with its canonical metadata              |
| Duplicate bridge check                   | No second bridge/client tree was added; the only bridge remains `bridge/`                                                            |

Between the recorded baseline and final verification, unrelated
AI Dungeon Door test/support files in the already-dirty worktree changed
outside the Phase 1 file set (including stale client/scenario expectations and
the jsdom setup). The final suite therefore no longer reproduces the baseline
test, type, or lint failures. Phase 1 did not edit those files and does not
claim those unrelated fixes; the before/after results above record the states
actually observed.

## Remaining work

Phase 1 deliberately leaves all gameplay and model behavior unimplemented.
The permanent invariants are recorded in `ARCHITECTURE.md`.

## Next phase

Phase 2 should design and test the code-owned court domain before building the
full interface or evaluating prompts:

- a versioned fictional case representation and save format;
- deterministic ownership of hidden truth, evidence availability, procedure,
  verdict options, and scoring;
- explicit fictional-name/business generation and content constraints;
- a bounded, court-specific protocol added to the existing bridge;
- reuse/generalization seams for health, exact model discovery, streaming,
  cancellation, reconnection, and model lifecycle;
- truthful offline/unavailable behavior;
- unit, contract, component, direct-route, and real local-model evaluation
  criteria.

Phase 2 must not let the model decide ground truth or the player's verdict,
must not create another bridge or public proxy, and must not claim legal
advice.
