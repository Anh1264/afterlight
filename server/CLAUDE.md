# server/ - netcode rules

- Every socket handler: parse the payload with the hand-written parsers in shared/protocol.ts (no zod), tolerate a missing `ack`, never let an exception escape, and check that the acting socket owns the seat.
- `viewFor()` is the only way state reaches a client.
- Never log player tokens.
- Turn clock and bot delays must not encode client animation durations (backlog N3).
- State today: one in-memory `rooms` Map plus setTimeout timers; a restart loses every match (backlog O2). Add no more in-memory-only state that matters after a restart.
