# 0001 - Two optional protocol fields: server-ended match and device class

Date: 2026-10-06    Status: proposed    Deciders: Aiden + architect (red-team to review in "Design challenge")

## Context
DEMO-MVP (docs/specs/demo-mvp.md) needs two things the protocol can't express today:
- The server must be able to end a match on its own (an error in a bot turn or timer, or 15 idle minutes vs the bot). The client only shows an end screen when `view.over`, and a forfeit would print VICTORY or DEFEAT, which the spec forbids.
- The `connect` funnel log needs the visitor's device class, so we can count phones turned away by the desktop-only screen. A user agent alone counts iPads as Macs.

Invariants: the server stays authoritative (2), hidden information stays on the server (6), and an old client must keep working, because PR 2 deploys about a day before the client half (PR 5).

## Options
1. Optional `GameMsg.ended` plus handshake `auth.device`. For: no new event, old clients ignore both fields, one message carries the final view. Against: `GameMsg` gains a field that is absent on almost every message.
2. A new `server:ended` event plus a `hello` event carrying the device. For: explicit. Against: two new event names, and the device arrives after `connect`, so the `connect` log line can't include it.
3. End by forfeit (no protocol change) and parse the device from the user agent on the server. Against: shows VICTORY/DEFEAT (breaks PR 5 criterion 7), and iPadOS sends a Mac user agent.

## Objections that mattered
- red-team #4: "The protocol does change." The end screen only renders when `v.over`, so a new signal is unavoidable.

## Decision
Option 1, in shared/protocol.ts:
- `GameMsg.ended?: 'error' | 'idle'`. It is set only on the last message of a match the server ended itself. The room is deleted right after. Events are `[]`, and the view comes from `viewFor()`, or the seat's last sent view if that throws.
- `HandshakeAuth { device?: 'phone' | 'tablet' | 'desktop' }`, sent with `io({ auth })`. The server reads it with `parseDevice()`. Anything else becomes `'unknown'`. It is used only for logging and never changes behaviour, so a lie costs nothing.

What an old client does:
- `ended`: the director snaps to an unchanged view, so the board freezes. The server also sends a `toast` explaining the end, and later actions get "Not in a match."
- `device`: an old client sends none, so the line logs `unknown`.

| | Player impact | Risk | Effort | Reversibility | Invariants |
| --- | --- | --- | --- | --- | --- |
| 1 optional fields | 4 | 4 | 5 | 4 | 5 |
| 2 new events | 4 | 3 | 3 | 3 | 5 |
| 3 forfeit + UA | 2 | 3 | 5 | 5 | 4 |

## Revisit if
- O2 (persist/rehydrate) lands: `ended` may gain `'restart'`.
- A1 (self-describing events) lands: `ended` could become a `matchEnd` event with a reason.
