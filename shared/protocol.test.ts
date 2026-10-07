import { describe, it, expect } from 'vitest';
import { ALL_HOUSES, type House } from './cards';
import { applyAction, createGame, type PIdx } from './engine';
import { candidatePlays, decide } from './bot';
import { mulberry } from './sim';
import {
  BAD_REQUEST, GENERIC_ERROR, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
  parseAction, parseCreate, parseDeck, parseDevice, parseHouse, parseJoin, parseReady,
} from './protocol';

// c2: every inbound event is parsed before use. `field` names the first bad field, never its value.

const TOKEN = 'a0b1c2d3e4f5061728394a5b6c7d8e9f';

function rejected(r: { ok: boolean }, field?: string) {
  expect(r.ok).toBe(false);
  if (r.ok) return;
  const f = (r as unknown as { field: unknown }).field;
  expect(typeof f).toBe('string');
  expect((f as string).length).toBeGreaterThan(0);
  if (field) expect(f).toBe(field);
}

describe('protocol constants', () => {
  it('c2: the two client-visible error texts are pinned', () => {
    expect(BAD_REQUEST).toBe('Bad request.');
    expect(GENERIC_ERROR).toBe('Something went wrong. Please try again.');
  });
  it('c2: room codes are 5 characters from the existing alphabet', () => {
    expect(ROOM_CODE_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    expect(ROOM_CODE_LENGTH).toBe(5);
  });
});

describe('parseCreate', () => {
  it('c2: accepts {name, vsBot}', () => {
    expect(parseCreate({ name: 'Ann', vsBot: true })).toEqual({ ok: true, v: { name: 'Ann', vsBot: true } });
    expect(parseCreate({ name: '', vsBot: false }).ok).toBe(true);
    expect(parseCreate({ name: 'x'.repeat(64), vsBot: false }).ok).toBe(true);
  });
  it('c2: rejects non-objects with field "payload"', () => {
    for (const bad of [undefined, null, 'x', 42, true, [], ['a']]) rejected(parseCreate(bad), 'payload');
  });
  it('c2: rejects a bad name or vsBot and names the field', () => {
    rejected(parseCreate({ name: 5, vsBot: true }), 'name');
    rejected(parseCreate({ name: 'x'.repeat(65), vsBot: true }), 'name');
    rejected(parseCreate({ name: 'Ann', vsBot: 'yes' }), 'vsBot');
    rejected(parseCreate({ name: 'Ann' }), 'vsBot');
  });
});

describe('parseJoin', () => {
  it('c2: accepts a code (uppercased), a name and an optional token', () => {
    const a = parseJoin({ code: 'abcde', name: 'Bo' });
    expect(a).toEqual({ ok: true, v: { code: 'ABCDE', name: 'Bo' } });
    expect(parseJoin({ code: 'ABCDE', name: 'Bo', token: TOKEN })).toEqual({ ok: true, v: { code: 'ABCDE', name: 'Bo', token: TOKEN } });
    expect(parseJoin({ code: 'ABCDE', name: 'Bo', token: undefined }).ok).toBe(true); // JSON drops it; the client sends undefined
  });
  it('c2: rejects non-objects with field "payload"', () => {
    for (const bad of [undefined, null, 12345, 'ABCDE', []]) rejected(parseJoin(bad), 'payload');
  });
  it('c2: rejects a bad code', () => {
    rejected(parseJoin({ code: 12345, name: 'Bo' }), 'code');
    rejected(parseJoin({ code: 'ABCD', name: 'Bo' }), 'code'); // too short
    rejected(parseJoin({ code: 'ABCDEF', name: 'Bo' }), 'code'); // too long
    rejected(parseJoin({ code: 'ABCD0', name: 'Bo' }), 'code'); // 0 is not in the alphabet
    rejected(parseJoin({ code: 'ABCDI', name: 'Bo' }), 'code'); // nor is I
    rejected(parseJoin({ code: 'A'.repeat(17), name: 'Bo' }), 'code');
    rejected(parseJoin({ name: 'Bo' }), 'code');
  });
  it('c2: rejects a bad name or token', () => {
    rejected(parseJoin({ code: 'ABCDE', name: 7 }), 'name');
    rejected(parseJoin({ code: 'ABCDE', name: 'x'.repeat(65) }), 'name');
    rejected(parseJoin({ code: 'ABCDE', name: 'Bo', token: 'zz' }), 'token');
    rejected(parseJoin({ code: 'ABCDE', name: 'Bo', token: TOKEN.toUpperCase() }), 'token');
    rejected(parseJoin({ code: 'ABCDE', name: 'Bo', token: TOKEN + '0' }), 'token');
    rejected(parseJoin({ code: 'ABCDE', name: 'Bo', token: 5 }), 'token');
  });
});

describe('parseHouse', () => {
  it('c2: accepts each house', () => {
    for (const h of ALL_HOUSES) expect(parseHouse(h)).toEqual({ ok: true, v: h });
  });
  it('c2: rejects anything else', () => {
    for (const bad of ['NEUTRAL', 'coven', '', 5, null, undefined, {}, ['COVEN']]) rejected(parseHouse(bad));
  });
});

describe('parseDeck', () => {
  it('c2: accepts null and up to 64 ids of up to 40 characters', () => {
    expect(parseDeck(null)).toEqual({ ok: true, v: null });
    expect(parseDeck(['a', 'b'])).toEqual({ ok: true, v: ['a', 'b'] });
    expect(parseDeck(Array.from({ length: 64 }, () => 'x'.repeat(40))).ok).toBe(true);
  });
  it('c2: rejects 65 or 10,000 ids, long or non-string ids, and non-arrays', () => {
    rejected(parseDeck(Array.from({ length: 65 }, () => 'x')));
    rejected(parseDeck(Array.from({ length: 10_000 }, (_, i) => 'card-' + i)));
    rejected(parseDeck(['x'.repeat(41)]));
    rejected(parseDeck(['ok', 5]));
    rejected(parseDeck([null]));
    for (const bad of [undefined, 'a,b', 5, {}, { length: 2 }]) rejected(parseDeck(bad));
  });
});

describe('parseReady', () => {
  it('c2: accepts only booleans', () => {
    expect(parseReady(true)).toEqual({ ok: true, v: true });
    expect(parseReady(false)).toEqual({ ok: true, v: false });
    for (const bad of [1, 0, 'true', null, undefined, {}, []]) rejected(parseReady(bad));
  });
});

describe('parseAction', () => {
  it('c2: accepts pass and drops other keys', () => {
    expect(parseAction({ type: 'pass' })).toEqual({ ok: true, v: { type: 'pass' } });
    const r = parseAction({ type: 'pass', junk: 1 });
    expect(r).toEqual({ ok: true, v: { type: 'pass' } });
  });
  it('c2: accepts play with every optional field and builds a fresh object without extra keys', () => {
    const input = { type: 'play', uid: 'c1', row: 'F', targets: ['c2', 'c3'], mode: 1, targetRow: 'B', extra: 'drop me' };
    const r = parseAction(input);
    expect(r).toEqual({ ok: true, v: { type: 'play', uid: 'c1', row: 'F', targets: ['c2', 'c3'], mode: 1, targetRow: 'B' } });
    if (r.ok) expect(r.v).not.toBe(input);
  });
  it("c2: accepts today's client payloads (undefined keys, empty targets)", () => {
    expect(parseAction({ type: 'play', uid: 'c1', row: undefined, targets: [], mode: undefined, targetRow: undefined }).ok).toBe(true);
    expect(parseAction({ type: 'play', uid: 'c1' }).ok).toBe(true);
  });
  it('c2: rejects non-objects and unknown types', () => {
    for (const bad of [undefined, null, 'play', 42, [], [{ type: 'pass' }]]) rejected(parseAction(bad), 'payload');
    rejected(parseAction({ type: 'launch' }));
    rejected(parseAction({}));
  });
  it('c2: rejects a bad uid', () => {
    rejected(parseAction({ type: 'play', uid: 42 }), 'uid');
    rejected(parseAction({ type: 'play' }), 'uid');
    rejected(parseAction({ type: 'play', uid: '' }), 'uid');
    rejected(parseAction({ type: 'play', uid: 'x'.repeat(17) }), 'uid');
    expect(parseAction({ type: 'play', uid: 'x'.repeat(16) }).ok).toBe(true);
  });
  it('c2: rejects a bad row, targets, mode or targetRow and names the field', () => {
    rejected(parseAction({ type: 'play', uid: 'c1', row: 'X' }), 'row');
    rejected(parseAction({ type: 'play', uid: 'c1', row: 'f' }), 'row');
    rejected(parseAction({ type: 'play', uid: 'c1', targets: 'c2' }), 'targets');
    rejected(parseAction({ type: 'play', uid: 'c1', targets: Array.from({ length: 9 }, (_, i) => 'c' + i) }), 'targets');
    rejected(parseAction({ type: 'play', uid: 'c1', targets: [''] }), 'targets');
    rejected(parseAction({ type: 'play', uid: 'c1', targets: ['x'.repeat(17)] }), 'targets');
    rejected(parseAction({ type: 'play', uid: 'c1', targets: [7] }), 'targets');
    expect(parseAction({ type: 'play', uid: 'c1', targets: Array.from({ length: 8 }, (_, i) => 'c' + i) }).ok).toBe(true);
    rejected(parseAction({ type: 'play', uid: 'c1', mode: 8 }), 'mode');
    rejected(parseAction({ type: 'play', uid: 'c1', mode: -1 }), 'mode');
    rejected(parseAction({ type: 'play', uid: 'c1', mode: 1.5 }), 'mode');
    rejected(parseAction({ type: 'play', uid: 'c1', mode: '1' }), 'mode');
    expect(parseAction({ type: 'play', uid: 'c1', mode: 0 }).ok).toBe(true);
    expect(parseAction({ type: 'play', uid: 'c1', mode: 7 }).ok).toBe(true);
    rejected(parseAction({ type: 'play', uid: 'c1', targetRow: 'Z' }), 'targetRow');
  });
  it('c2: the rejection never echoes the offending value', () => {
    const r = parseAction({ type: 'play', uid: 'SECRET-VALUE-' + 'x'.repeat(40) });
    expect(JSON.stringify(r)).not.toContain('SECRET-VALUE');
  });
});

describe('every legal bot play survives the wire', () => {
  it('c2: candidatePlays() from 50 seeded bot-vs-bot games, through JSON, parse and deep-equal', { timeout: 60_000 }, () => {
    let checked = 0;
    for (let n = 0; n < 50; n++) {
      const seed = 31000 + n;
      const h0: House = ALL_HOUSES[n % 4], h1: House = ALL_HOUSES[(n >> 2) % 4];
      const first = (n % 2) as PIdx;
      const rnd = mulberry(seed);
      const { state: g } = createGame({ houses: [h0, h1], seed, first });
      for (let step = 0; step < 400 && !g.over; step++) {
        const p = g.current;
        for (const play of candidatePlays(g, p)) {
          const wire: unknown = JSON.parse(JSON.stringify(play));
          const r = parseAction(wire);
          expect(r.ok, `seed ${seed} step ${step}: ${JSON.stringify(play)}`).toBe(true);
          if (r.ok) expect(r.v).toEqual(play);
          checked++;
        }
        const a = decide(g, p, rnd);
        const res = applyAction(g, p, a);
        if ('error' in res) throw new Error(`illegal bot action ${JSON.stringify(a)}: ${res.error}`);
      }
      expect(g.over, `seed ${seed} finished`).toBe(true);
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('parseDevice', () => {
  it('c2: accepts the three device classes in the handshake auth', () => {
    for (const device of ['phone', 'tablet', 'desktop'] as const) expect(parseDevice({ device })).toBe(device);
  });
  it('c2: anything else is "unknown"', () => {
    const bad: unknown[] = [undefined, null, {}, { device: 'watch' }, { device: 1 }, { device: 'Phone' }, 'phone', ['phone'], 'x'.repeat(1000), { device: 'x'.repeat(1000) }];
    for (const b of bad) expect(parseDevice(b)).toBe('unknown');
  });
});
