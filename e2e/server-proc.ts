import { spawn } from 'node:child_process';

/** Spawned-server helpers for restart and outage specs (PR 5). */

/** Base port for spawned servers; set E2E_SPAWN_PORT when other worktrees share the machine. Each test uses base + its own offset. */
export const spawnBase = (): number => Number(process.env.E2E_SPAWN_PORT ?? 3102);
export const spawnPort = (offset: number): number => spawnBase() + offset;

export interface SpawnedServer {
  url: string;
  stop(sig?: NodeJS.Signals): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Start a server entry file on `port` with node directly (not npx), so a signal reaches the server itself.
 * Polls /health for up to 20 s and fails if the child exits first (e.g. EADDRINUSE). stop() resolves on the child's exit.
 */
export async function spawnServer(port: number, entry: 'server/index.ts' | 'e2e/test-server.ts', env: Record<string, string> = {}): Promise<SpawnedServer> {
  const url = `http://localhost:${port}`;
  // A leftover server on this port would satisfy the /health poll below and hide a failed spawn.
  const leftover = await fetch(`${url}/health`).then(() => true, (e: unknown) => { if (e instanceof TypeError) return false; throw e; });
  if (leftover) throw new Error(`port ${port} already answers /health; refusing to spawn ${entry} on top of it`);
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { output += d.toString(); });
  let exited: number | null | undefined;
  const exitP = new Promise<void>(res => child.once('exit', code => { exited = code; res(); }));
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (exited !== undefined) throw new Error(`${entry} exited (code ${String(exited)}) before /health answered:\n${output}`);
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      await exitP;
      throw new Error(`${entry} did not answer /health within 20 s:\n${output}`);
    }
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) break;
    } catch (e) {
      if (!(e instanceof TypeError)) {
        child.kill('SIGKILL');
        await exitP;
        throw e;
      }
      // connection refused while booting is a TypeError from fetch
    }
    await sleep(150);
  }
  return {
    url,
    async stop(sig: NodeJS.Signals = 'SIGTERM') {
      if (exited === undefined) child.kill(sig);
      await exitP;
    },
  };
}

/**
 * Poll /health until the server reports uptimeS >= minS. The client decides "restarted" by comparing boot times
 * with a 5 s tolerance (BOOT_TOLERANCE_MS) that absorbs the floored uptime plus round trip, so a server that is
 * stopped after about 1 s looks like the same server to it. Real servers live for minutes; tests must let theirs age.
 */
export async function waitForUptime(url: string, minS = 6): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const j: unknown = await (await fetch(`${url}/health`)).json();
    const u = typeof j === 'object' && j !== null ? (j as { uptimeS?: unknown }).uptimeS : undefined;
    if (typeof u === 'number' && u >= minS) return;
    if (Date.now() > deadline) throw new Error(`server at ${url} never reached uptimeS ${minS}`);
    await sleep(250);
  }
}
