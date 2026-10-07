import { createGameServer } from '../server/app';
import type { ServerLimits } from '../server/limits';

/**
 * Test-only server entry (needs PR 2a's createGameServer). Env knobs:
 *   PORT, BOT_IDLE_MS (default 900000), MAX_SOCKETS_PER_IP (default 40; takes effect with PR 2b), FAIL_BOT_TURN=1 (the bot timer throws).
 */
// The intersection goes away when 2b adds maxSocketsPerIp to ServerLimits.
const limits: Partial<ServerLimits> & { maxSocketsPerIp?: number } = {
  botIdleMs: Number(process.env.BOT_IDLE_MS || 900000),
  maxSocketsPerIp: Number(process.env.MAX_SOCKETS_PER_IP || 40),
};
const srv = createGameServer({
  distDir: 'dist',
  limits,
  hooks: process.env.FAIL_BOT_TURN
    ? { onTimer: k => { if (k === 'bot') throw new Error('e2e'); } }
    : undefined,
});
await srv.listen(Number(process.env.PORT ?? 3001));
