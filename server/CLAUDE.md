# server/ - netcode rules

- State today: one in-memory `rooms` Map plus setTimeout timers. A restart loses every match (backlog O2). Don't add more in-memory-only state that matters after a restart.
- Every handler: validate the payload (zod, P0-1), tolerate a missing `ack`, never throw out of the handler, check the socket owns the seat (P0-4).
- Turn clock and bot delays must not encode client animation durations (backlog N3).
- Never send RNG seeds, deck order or the opponent's hand. `viewFor()` is the only way state reaches a client.
- Never log player tokens.
