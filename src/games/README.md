# Game feature folders

Every game has exactly one implementation folder here:

- `ai-dungeon-door/`
- `ai-peoples-court/`

Each folder owns its React entry, game-only components, pure game logic, and
colocated tests. New games must follow `src/games/<game-id>/`.

Some files intentionally remain shared:

- `src/pages/<slug>/index.astro` is a thin route adapter required by Astro's
  filesystem router.
- `src/lib/games/` is the Zod-validated portal registry and category list.
- `src/components/` and `src/layouts/` provide portal-wide UI and the shared
  full-screen game shell.
- `src/lib/bridge/` and the repository-root `bridge/` are the one shared local
  LM Studio connection path. A game must not create a competing bridge.
- `src/styles/global.css` contains portal tokens and explicitly scoped
  game-specific CSS because it is loaded once by the shared Astro layout.
- Public assets remain in `public/`, and Windows launchers remain at the
  repository root so existing URLs and double-click entry points do not move.

Game folders are implementation boundaries, not separate applications. All
games continue to build and deploy together as one static Astro site.
