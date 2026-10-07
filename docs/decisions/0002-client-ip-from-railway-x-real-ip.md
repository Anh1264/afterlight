# 0002 - Per-IP limits keyed on Railway's X-Real-IP

Date: 2026-10-06, revised the same day after red-team's design challenge    Status: proposed (needs the production check below)    Deciders: Aiden + architect

## Context
P0-4 needs per-IP limits on room creation and open sockets. Behind Railway's edge proxy, `socket.handshake.address` is the proxy's address, so keying on it turns a per-IP limit into one global limit (red-team #2).

Railway's networking docs (docs.railway.com, "Public Networking: Specs & Limits", fetched 2026-10-06) say the edge adds `X-Real-IP` "for identifying client's remote IP". They don't say whether a client-supplied `X-Real-IP` is overwritten, and they don't mention `X-Forwarded-For`.

## Options
1. Trust `X-Real-IP` when running on Railway (`RAILWAY_ENVIRONMENT_NAME` is set), otherwise the socket address. For: documented by Railway, one header, no parsing. Against: spoof-resistance is unverified, and it breaks if a CDN proxy (e.g. Cloudflare orange cloud) sits in front.
2. Rightmost `X-Forwarded-For` entry. Against: undocumented on Railway, and the hop count is unknown.
3. No per-IP limits, only per-socket limits plus the global cap. For: nothing to trust. Against: one script with many sockets fills the cap.

## Objections that mattered
- red-team #2 (spec challenge): a per-IP limit keyed on the proxy address becomes global and can lock everyone out.
- red-team design #2: the first production check (70 sockets, judged by creates past 60) could never pass once a 40-socket cap exists, and its fallback left sockets unbounded.
- red-team design #3: a per-IP socket counter leaks, because a socket that closes during the middleware fires no `disconnect` (socket.io 4.8.4 namespace.js:222-226).

## Decision
Option 1, overridable with `TRUST_PROXY=x-real-ip|none`:
- `clientIp()` accepts the header only if `net.isIP()` passes. It falls back to the socket address. If Railway appends to a client-sent header instead of replacing it, Node joins the two (`"a, b"`), `isIP` fails, and the request keys on the proxy's address. Spoofers then share one bucket, and ordinary visitors keep their own.
- Limits key on `ipKey()`: IPv4 as is, IPv4-mapped IPv6 as its IPv4, any other IPv6 as its /64 prefix.
- Open sockets per IP (40) are counted from live sockets, not with a counter.
- A cap of 2,000 open sockets and 10,000 rooms applies whatever `LIMIT_PER_IP` says.
- The IP is held in memory only. It is never logged or shown on `/health`.
- No custom domain this week (Aiden, Oct 6). If one is added later, its DNS record stays "DNS only": a proxying CDN would make every visitor look like a few IPs.

Production check, Thu after PR 2b deploys and again Mon at rehearsal. Close other AFTERLIGHT tabs first.
- `scripts/abuse.ts spoof` opens 41 sockets one at a time, each sending a different `X-Real-IP`. It waits up to 5 s for `connect` or `connect_error` on each, prints how many connected, then closes them all.
- Pass: a socket is refused with "Too many connections from your network" (the 41st, or sooner if a tab was left open). Every socket counted as Aiden's IP, so the header can't dodge the limit.
- Fail: all 41 connect. Set `TRUST_PROXY=none` and `LIMIT_PER_IP=off` in Railway. The per-socket create window and both global caps remain, so memory stays bounded. One script could then fill a cap until this is fixed: a denial of service, not a crash.

| | Player impact | Risk | Effort | Reversibility | Invariants |
| --- | --- | --- | --- | --- | --- |
| 1 X-Real-IP | 4 | 3 | 5 | 5 | 5 |
| 2 XFF rightmost | 4 | 2 | 4 | 5 | 5 |
| 3 no per-IP | 3 | 2 | 5 | 5 | 5 |

## Revisit if
- The production check fails.
- A CDN is put in front of Railway.
- Railway documents different header semantics.
- Abuse arrives from IPv6 ranges wider than a /64.
