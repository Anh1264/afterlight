// Entry point: boot the game server from the environment.
import { createGameServer } from './app';
import { consoleSink, installProcessHandlers } from './log';

installProcessHandlers(process, consoleSink);
const srv = createGameServer();
const port = await srv.listen(Number(process.env.PORT ?? 3001));
consoleSink({ level: 'info', message: 'server_start', ts: new Date().toISOString(), sha: 'dev', port });
