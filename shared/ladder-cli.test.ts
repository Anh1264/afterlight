// BL-1 c3, the command: `npm run ladder` / `npm run sim:bots` (scripts/ladder.ts) end to end on the smallest schedule.
// One process, one pairing of cheap bots, in-process (--jobs 1): the worker pool and the 448-deal Hard run are not tested here.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { LadderRecord, LadderSummary } from './ladder';
import { must } from './bot-fixtures';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('c3: the ladder command', () => {
  it('package.json wires ladder, sim:bots (the name criterion 3 uses) and bot-golden to their scripts, and the old head-to-head is gone', () => {
    expect(String(pkg.scripts.ladder), 'npm run ladder').toContain('scripts/ladder.ts');
    expect(String(pkg.scripts['sim:bots']), 'npm run sim:bots').toContain('scripts/ladder.ts');
    expect(String(pkg.scripts['bot-golden']), 'npm run bot-golden').toContain('scripts/bot-golden.ts');
    expect(existsSync(join(root, 'scripts/ladder.ts'))).toBe(true);
    expect(existsSync(join(root, 'scripts/bot-golden.ts'))).toBe(true);
    expect(existsSync(join(root, 'shared/simulate-bots.ts')), 'replaced by the ladder').toBe(false);
  });

  it('runs 64 Medium-vs-Easy deals in process and writes summary.json, summary.md and matches.jsonl.gz; --assert exits 1 exactly when a c3 bar fails', { timeout: 120_000 }, async () => {
    const { replayRecord } = await import('./ladder');
    const out = mkdtempSync(join(tmpdir(), 'afterlight-ladder-'));
    try {
      const run = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/ladder.ts', '--games', '64', '--seed', '12345', '--pairs', 'medium-easy', '--jobs', '1', '--out', out, '--assert'],
        { cwd: root, encoding: 'utf8', timeout: 100_000 },
      );
      const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as LadderSummary;
      expect(summary.v).toBe(1);
      expect(summary.baseSeed).toBe(12345);
      expect(summary.gamesPerPairing).toBe(64);
      expect(summary.workers).toBe(1);
      expect(typeof summary.buildSha).toBe('string');
      expect(summary.pairs).toHaveLength(1);
      const pair = must(summary.pairs[0], 'a pair');
      expect(pair.pairing).toBe('medium-easy');
      expect(pair.a).toBe('medium:heur-2');
      expect(pair.b).toBe('easy:heur-easy-1');
      expect(pair.games).toBe(64);
      expect(pair.errors).toBe(0);
      expect(pair.ci95[0]).toBeLessThan(pair.aScore);

      const md = readFileSync(join(out, 'summary.md'), 'utf8');
      expect(md).toContain('medium-easy');

      const lines = gunzipSync(readFileSync(join(out, 'matches.jsonl.gz'))).toString('utf8').split('\n').filter(l => l.length > 0);
      expect(lines).toHaveLength(64);
      const records = lines.map(l => JSON.parse(l) as LadderRecord);
      expect(records.map(r => r.i), 'sorted by (pairing, i)').toEqual(Array.from({ length: 64 }, (_, i) => i));
      for (const r of records) {
        expect(r.mode).toBe('ladder');
        expect(r.pairing).toBe('medium-easy');
        expect(r.seed).toBeGreaterThanOrEqual(12345);
        expect(r.seed).toBeLessThan(12345 + 64);
        expect(replayRecord(r), r.id).toBe(true);
      }

      const barsPass = summary.criteria.length > 0 && summary.criteria.every(c => c.pass);
      expect(summary.criteria.map(c => c.id)).toEqual(['c3-medium-easy']);
      expect(run.status, `--assert must exit ${barsPass ? 0 : 1} (bars ${barsPass ? 'pass' : 'fail'}); stderr: ${run.stderr}`).toBe(barsPass ? 0 : 1);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
