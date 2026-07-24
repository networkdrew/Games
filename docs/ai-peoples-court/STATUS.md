# AI People's Court status

## Current status

AI People's Court is an endless, procedural local-LLM courtroom simulation.
The human player presides as judge, speaks freely, manages the hearing, and
alone controls the verdict.

Each new case is generated from a reproducible seed with changing:

- fictional names and roles;
- dispute archetype, subject, stakes, and case truth;
- evidence and which side it supports;
- witness knowledge and reliability;
- difficulty from 1–5 and layered complications;
- character voices, motives, admissions, evasions, and dialogue.

Generated cases and outcomes are cached locally in a versioned 30-case
archive. The current generator includes borrowed-property, service-scope, and
delivery-custody content packs, with a stable interface for more.

## Local-model reliability

Court dialogue now uses the same hidden-control/visible-response shape proven
by AI Dungeon Door. Code chooses one active role per generation. The bridge
buffers hidden memory, accepts both inline and newline `RESPONSE:` markers,
streams only visible dialogue, and retries malformed output once.

Interruptions are separate code-selected generations, so a witness cannot
accidentally inherit the defendant's identity or private experience.

## Continuity and safety

The local model receives immutable truth, character-private knowledge,
exhibits, attributed rolling memory, durable facts, and recent transcript.
Memory is capped and attributed before reuse. The model cannot speak as the
judge, choose the verdict, invent a speaker id, or access a cloud service.

Run `npm run court:play` to launch the game and local bridge. Run
`npm run court:verify -- "your test question"` to inspect a real local-model
court response and parser result.

For always-ready use, `npm run background:install` registers a hidden
per-user Windows logon task. It starts and monitors LM Studio and the bridge,
keeps the shared court model loaded, and lets the hosted page reconnect
automatically without a launcher or manual Retry click. It also adds the exact
hosted games origin to Edge and Chrome's loopback allowlists so current
Local Network Access restrictions do not leave the page waiting for permission.
