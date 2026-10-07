// Structured logging. One single-line JSON per event on stdout; Railway reads `level` and `message`.
// Never put a token, an IP or a player name in a line.
export interface LogLine { level: 'info' | 'warn' | 'error'; message: string; ts: string; [k: string]: unknown }
export type LogSink = (line: LogLine) => void;

export const consoleSink: LogSink = line => { console.log(JSON.stringify(line)); };

const errParts = (e: unknown) => {
  if (e instanceof Error) return { err: e.message.slice(0, 200), stack: (e.stack ?? '').split('\n').slice(0, 6).join('\n').slice(0, 1200) };
  return { err: String(e).slice(0, 200), stack: '' };
};

/** One `error` line. `where` is e.g. 'handler:room:create', 'timer:bot' or 'process:uncaughtException'. `rid` is the room's random log id. */
export function logError(log: LogSink, where: string, e: unknown, rid: string | null = null): void {
  try {
    log({ level: 'error', message: 'error', ts: new Date().toISOString(), where, rid, ...errParts(e) });
  } catch (sinkErr) {
    process.stderr.write(`log sink failed: ${String(sinkErr)}\n`);
  }
}

/** N4: log both, never silent. After an uncaughtException Node cannot resume, so exit 1 and let Railway restart us. */
export function installProcessHandlers(proc: Pick<NodeJS.Process, 'on' | 'exit'>, log: LogSink): void {
  proc.on('uncaughtException', e => { logError(log, 'process:uncaughtException', e); proc.exit(1); });
  proc.on('unhandledRejection', e => { logError(log, 'process:unhandledRejection', e); });
}
