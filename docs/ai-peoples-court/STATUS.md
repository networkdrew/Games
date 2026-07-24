# AI People's Court status

## Current status

AI People's Court is a local-LLM chat simulation. The human player presides as
judge and can address anyone in free text, call the witness, manage order, and
deliver the final verdict.

The local model performs a cast with separate identities:

- bailiff and clerk;
- plaintiff and defendant;
- one case-specific witness.

The model can produce a natural follow-up or interruption on selected turns.
Generated messages are labeled and rendered individually in the transcript.

## Continuity

Each request includes three memory layers:

1. immutable code-authored case truth and each character's private knowledge;
2. a compact rolling summary and up to eight durable testimony facts;
3. the ten most recent visible transcript messages.

The bridge hides memory metadata from the player-facing chat, rejects unknown
speaker identities, prevents the model from speaking as the judge, and retries
one malformed response. The player and code remain authoritative over the
verdict.

## Runtime

The game requires the same local stack as AI Dungeon Door:

- LM Studio's local server;
- the single loopback OpenGames bridge on `127.0.0.1:8934`;
- the configured local model.

There is no cloud AI or paid API. Launch with `npm run court:play` or
`Start AI Peoples Court.bat`. If the local cast is unavailable, the interface
reports that truthfully and does not substitute fake scripted dialogue.
