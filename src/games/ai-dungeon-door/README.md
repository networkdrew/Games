# AI Dungeon Door

Implementation for the registry id and route slug `ai-dungeon-door`.

- `AIDungeonDoorGame.tsx` is the React entry mounted by
  `src/pages/ai-dungeon-door/index.astro`.
- `components/` contains game-only presentation and the bridge connection
  state hook.
- `logic/` contains deterministic, framework-free state and scenario rules
  with colocated tests.
- Shared browser transport remains at `src/lib/bridge/client.ts`.
- The single local Node bridge remains at the repository-root `bridge/`.
- The existing Windows entry points remain `Start AI Dungeon Door.bat` and
  `Start-AIDungeonDoor.ps1`.

Public URL: `/ai-dungeon-door/`.
