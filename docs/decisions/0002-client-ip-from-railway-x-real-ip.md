# 0002 - Per-IP limits keyed on Railway's X-Real-IP

Date: 2026-10-06    Status: proposed (needs the production check below)    Deciders: Aiden + architect

## Context
P0-4 needs per-IP limits on room creation and open sockets. Behind Railway's edge proxy, `socket.handshake.address` is the proxy's address, so keying on it turns a per-IP limit into one global limit (red-team #2).

Railway's networking docs (docs.railway.com, "Public Networking: Specs & Limits", fetched 2026-10-06) say the edge adds `X-Real-IP` "for identifying client's remote IP". They don't say whether a client-supplied `X-Real-IP` is overwritten, and they don't mention `X-Forwarded-For`.

## Options
1. Trust `X-Real-IP` when running on Railway (`RAILWAY_ENVIRONMENT_NAME` is set), otherwise the socket address. For: documented by Railway, one header, no parsing. Against: spoof-resistance is unverified, and it breaks if a CDN proxy (e.g. Cloudflare orange cloud) sits in front.
2. Rightmost `X-Forwarded-For` entry. Against: undocumented on Railway, and the hop count is unknown.
3. No per-IP limits, only per-socket limits plus the global cap. For: nothing to trust. Against: one script with many sockets fills the cap.

## Objections that mattered
- red-team #2: a per-IP limit keyed on the proxy address becomes global and can lock everyone out.

## Decision
Option 1, overridable with `TRUST_PROXY=x-real-ip|none`:
- `clientIp()` accepts the header only if `net.isIP()` passes. It falls back to the socket address.
- The IP is held in memory only. It is never logged or shown on `/health`.
- Aiden keeps the custom domain's DNS record "DNS only". A proxying CDN would make every visitor look like a few IPs.

Production check, Thu after PR 2 deploys and again Mon at rehearsal: `scripts/abuse.ts spoof` opens 70 sockets, each sending a different `X-Real-IP`, and each creates one room.
- Pass: creates past 60 in the minute get "Too many new matches". Railway overwrote the header.
- Fail: all 70 succeed. Set `TRUST_PROXY=none` and `LIMIT_PER_IP=off` in Railway. Per-socket limits and the 10,000-room cap remain.

| | Player impact | Risk | Effort | Reversibility | Invariants |
| --- | --- | --- | --- | --- | --- |
| 1 X-Real-IP | 4 | 3 | 5 | 5 | 5 |
| 2 XFF rightmost | 4 | 2 | 4 | 5 | 5 |
| 3 no per-IP | 3 | 2 | 5 | 5 | 5 |

## Revisit if
- The production check fails.
- A CDN is put in front of Railway.
- Railway documents different header semantics.
