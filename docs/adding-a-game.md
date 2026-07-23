# Adding the next game

1. **Pick a category** (`src/lib/games/categories.ts`) or add a new one if
   none fits — keep the list short; a game's own tags/kind carry most of the
   distinguishing detail, not an ever-growing category list.
2. **Add a registry entry** in `src/lib/games/registry.ts`: `id`/`slug`
   (kebab-case, permanent — never reuse or repurpose one), `name`, `tagline`,
   `description` paragraphs, `categoryId`, `kind` (`"local-ai"` if it talks to
   the bridge, `"browser"` if it needs no model at all), `tags`, `playTime`,
   `featured`, `addedAt` (drives the "New" badge for 30 days).
3. **Create one feature folder** at `src/games/<game-id>/`. Keep the React
   entry at the folder root, game-only UI in `components/`, pure framework-free
   rules in `logic/`, and `*.test.ts`/`*.test.tsx` beside the code they protect.
   Logic must not depend on React or the DOM. If it's a `local-ai` game, follow
   AI Dungeon Door's pattern: the
   model may interpret free text and propose a small, _bounded_ state change
   (numeric deltas within scenario-defined limits, ids from scenario-defined
   allowlists) — but your own engine code is always the one that clamps,
   validates, and applies it (`applyControlProposal` in
   `engine.ts` is the template). See `architecture.md`'s "two parallel
   paths" section. Do not let a model mutate state directly, and do not
   build a game that requires one to be fully playable — always keep an
   equivalent deterministic/offline path.
4. **Add a thin route adapter** at `src/pages/<slug>/index.astro` using
   `GameLayout.astro`, following
   `src/pages/ai-dungeon-door/index.astro` as the template. Reuse
   `src/components/react/GameAppShell.tsx` for the title bar/loading-screen
   structure — it provides layout only, not visual identity, so your game
   can still look nothing like AI Dungeon Door.
5. **If it's a local-AI game**, do not add a new bridge — extend the
   existing one only if the new game's needs genuinely differ from the
   `CONTROL:`/`RESPONSE:` bounded-proposal protocol (see `bridge.md`). Most
   future local-AI games should be able to reuse `bridge/server.mjs`'s
   `/api/dungeon/turn` shape with a different scenario/character prompt and
   allowlists, and add their own alias to `bridge/models.mjs` rather than
   hardcoding a model id anywhere else.
6. **Test it**: logic tests for every state transition and win/loss path
   (see `src/games/ai-dungeon-door/logic/engine.test.ts` and
   `scenarios.test.ts` for the shape), a component test for the game entry
   (see `src/games/ai-dungeon-door/AIDungeonDoorGame.test.tsx`), and a
   `registry.test.ts` update if you added a new category.
7. **Run `npm run verify`** before calling it done.

Nothing else should hardcode a game's name, route, or metadata — if you find
yourself editing the homepage to add a card by hand, something's wrong; the
grid is entirely registry-driven.
