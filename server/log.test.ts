import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleSink, installProcessHandlers } from './log';

// c3 / N4: process-level handlers log one `error` line and are never silent.
// A rejection is logged and the process lives; an uncaught exception is logged and the process exits 1.

type Handler = (...args: unknown[]) => void;
type ProcLike = Parameters<typeof installProcessHandlers>[0];
type Sink = Parameters<typeof installProcessHandlers>[1];

function fakeProcess() {
  const handlers = new Map<string, Handler[]>();
  const exits: { code: number | undefined; linesAtExit: number }[] = [];
  const state = { lines: 0 };
  const proc = {
    on(ev: string, fn: Handler) { handlers.set(ev, [...(handlers.get(ev) ?? []), fn]); return proc; },
    exit(code?: number) { exits.push({ code, linesAtExit: state.lines }); },
  };
  const emit = (ev: string, ...args: unknown[]) => { for (const h of handlers.get(ev) ?? []) h(...args); };
  return { proc: proc as unknown as ProcLike, emit, exits, state, handlers };
}

function capture(state: { lines: number }) {
  const lines: Record<string, unknown>[] = [];
  const sink = ((line: Record<string, unknown>) => { lines.push(line); state.lines = lines.length; }) as unknown as Sink;
  return { lines, sink };
}

describe('installProcessHandlers', () => {
  it('c3: registers uncaughtException and unhandledRejection handlers', () => {
    const f = fakeProcess();
    installProcessHandlers(f.proc, capture(f.state).sink);
    expect(f.handlers.get('uncaughtException')?.length).toBe(1);
    expect(f.handlers.get('unhandledRejection')?.length).toBe(1);
  });

  it('c3: uncaughtException writes exactly one error line, then exits with code 1', () => {
    const f = fakeProcess();
    const { lines, sink } = capture(f.state);
    installProcessHandlers(f.proc, sink);
    f.emit('uncaughtException', new Error('boom from a timer'), 'uncaughtException');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'error', message: 'error', where: 'process:uncaughtException' });
    expect(String(lines[0].err)).toContain('boom from a timer');
    expect(f.exits).toEqual([{ code: 1, linesAtExit: 1 }]); // the line was written before the exit
  });

  it('c3: unhandledRejection writes exactly one error line and does not exit', () => {
    const f = fakeProcess();
    const { lines, sink } = capture(f.state);
    installProcessHandlers(f.proc, sink);
    f.emit('unhandledRejection', new Error('rejected somewhere'), Promise.resolve());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'error', message: 'error', where: 'process:unhandledRejection' });
    expect(String(lines[0].err)).toContain('rejected somewhere');
    expect(f.exits).toEqual([]);
  });

  it('c3: a non-Error throw or rejection is still logged', () => {
    const f = fakeProcess();
    const { lines, sink } = capture(f.state);
    installProcessHandlers(f.proc, sink);
    f.emit('unhandledRejection', 'a plain string', Promise.resolve());
    f.emit('uncaughtException', { weird: true }, 'uncaughtException');
    expect(lines).toHaveLength(2);
    expect(lines.every(l => l.level === 'error')).toBe(true);
    expect(f.exits.map(e => e.code)).toEqual([1]);
  });

  it('c3: err is capped at 200 characters and stack at 6 lines; every line carries level, message and ts', () => {
    const f = fakeProcess();
    const { lines, sink } = capture(f.state);
    installProcessHandlers(f.proc, sink);
    f.emit('unhandledRejection', new Error('x'.repeat(500)), Promise.resolve());
    const l = lines[0];
    expect(String(l.err).length).toBeLessThanOrEqual(200);
    expect(String(l.stack).split('\n').length).toBeLessThanOrEqual(6);
    expect(l.level).toBe('error');
    expect(l.message).toBe('error');
    expect(l.ts).toBeDefined();
  });
});

describe('consoleSink', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('c3: writes each line as one single-line JSON string on stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const line = { level: 'error', message: 'error', ts: 1, where: 'timer:bot', err: 'a\nb' };
    (consoleSink as unknown as (l: unknown) => void)(line);
    expect(spy).toHaveBeenCalledTimes(1);
    const out = spy.mock.calls[0][0];
    expect(typeof out).toBe('string');
    expect(String(out)).not.toContain('\n');
    expect(JSON.parse(String(out))).toEqual(line);
  });
});
