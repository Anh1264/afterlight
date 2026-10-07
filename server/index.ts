// Entry point: boot the game server from the environment.
import { createGameServer } from './app';
import { optionsFromEnv } from './env';
import { consoleSink, installProcessHandlers } from './log';

installProcessHandlers(process, consoleSink);

const opts = optionsFromEnv(process.env);
const srv = createGameServer(opts);
const port = await srv.listen(Number(process.env.PORT ?? 3001));
consoleSink({
  level: 'info', message: 'server_start', ts: new Date().toISOString(), sha: opts.buildSha, port,
  trust: opts.trustProxy, perIp: opts.limits.maxSocketsPerIp === Infinity ? 'off' : 'on',
});
