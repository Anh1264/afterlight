// Server limits. 2a: durations only. 2b adds the abuse limits, clientIp, ipKey and FixedWindow.
import { TURN_SECONDS } from '../shared/protocol';

export interface ServerLimits {
  /** PvP turn clock */
  turnMs: number;
  /** how long a dropped seat in a running match has to come back */
  dropGraceMs: number;
  /** a bot match with no human action for this long is ended ('idle') */
  botIdleMs: number;
  lobbyIdleMs: number;
  /** a room with no connected human, untouched this long, is swept */
  roomIdleMs: number;
  sweepEveryMs: number;
}

export const DEFAULT_LIMITS: ServerLimits = {
  turnMs: TURN_SECONDS * 1000,
  dropGraceMs: 60_000,
  botIdleMs: 15 * 60_000,
  lobbyIdleMs: 2 * 60_000,
  roomIdleMs: 30 * 60_000,
  sweepEveryMs: 30_000,
};
