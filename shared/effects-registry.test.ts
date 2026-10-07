// Effect-id registry check. An effect id is a string that engine.ts dispatches on; a typo or a missing parameter
// is not an error there, it silently does nothing (burnn:2) or does arithmetic on NaN (cultist:4 -> Number(undefined)).
// This file pins down which names exist and what parameters each takes, then checks every eff, resolve and lastWords
// id of every card in CARDS against that list. It runs over the whole pool, so a wave-2 card is checked the day it lands.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARDS, CardDef } from './cards';

// ================================================================ the dispatch list, transcribed from engine.ts
/** `arity`: the parameter counts the engine reads for this name. `any`: 0-based parameter positions that may be the word 'any'. */
interface Sig { arity: number[]; any?: number[] }
const P = (n: number): Sig => ({ arity: [n] });

// Source: shared/engine.ts, `applyEffect()`, the two switches that dispatch eff and resolve (targetSpecFor() mirrors them).
//  - first switch, on the name before the first ':' (`const [nm, a1, a2] = eff.split(':')`; n1 = Number(a1), n2 = Number(a2)):
//    the arity is how many of a1/a2 the case reads. A bare name is only valid where the case guards on `if (a1)` and falls
//    through to the exact-string switch (givegrow, shift, cultist).
//  - second switch, on the whole string (`switch (eff)`): exact ids, no parameters.
// Update this list when engine.ts gains or loses a case; the 'agrees with engine.ts' tests below fail if it goes stale.
const EFFECT_SIGS: Record<string, Sig> = {
  // first switch, name:params
  burn: P(1), burnlow: P(2), burnmulti: P(2), weaken: P(1), drain: P(1), venom: P(0), strip: P(0), silence0: P(0),
  execute: P(1), boost: P(1), shield: P(1), shieldboost: P(1), copyally: P(1), sacburn: P(0), sacdraw: P(0),
  rowburn: P(1), draw: P(1), growboost: P(1), backboost: P(1), tokenboost: P(1), allboost: P(1), marshal: P(0),
  allylose: P(1), hurtstrongest: P(1), burnstrongest: P(1), boardlose: P(1), sweep: P(2), selfpoison: P(0),
  eldertree: P(0), seize: P(1), duellow: P(1),
  // first switch with an `if (a1)` guard, plus the bare legacy id in the second switch
  givegrow: { arity: [0, 1] },
  shift: { arity: [0, 1] },
  cultist: { arity: [0, 2], any: [0] }, // cultist:M:K, M = max power of the Sacrifice or 'any', K = bonus; bare 'cultist' = legacy (3, +2)
  // second switch, exact ids
  poison1: P(0), poison2: P(0), poison3: P(0), poisonrow: P(0), rotrow: P(0), bloom: P(0), toad: P(0), aurel: P(0),
  shieldfront: P(0), burn2x2: P(0), gorehorn: P(0), mirror: P(0), lattice: P(0), echo4: P(0), vespera: P(0),
  chaplain: P(0), holdline: P(0), boostall1: P(0), silence: P(0), burn2: P(0), burn4: P(0), burn8: P(0),
  burnall1: P(0), hellfire: P(0), skarr: P(0), ogre: P(0), seize4: P(0), echo3front: P(0), afterimage: P(0),
  duel: P(0), duel3: P(0),
};

// Source: shared/engine.ts, `lastWords()`: `const [nm, a1] = eff.split(':')`, one switch on nm. Only a1 is ever read.
const LAST_WORDS_SIGS: Record<string, Sig> = {
  token: P(1), token2: P(1), rowboost: P(1), boostrandom: P(1), burnrandom: P(1), poisonrandom: P(0),
};

// ================================================================ the check
type Field = 'eff' | 'resolve' | 'lastWords';
const SIGS: Record<Field, Record<string, Sig>> = { eff: EFFECT_SIGS, resolve: EFFECT_SIGS, lastWords: LAST_WORDS_SIGS };
const FIELDS: Field[] = ['eff', 'resolve', 'lastWords'];
/** A finite number, written plainly (no empty string: Number('') is 0, which would pass a bare isFinite). */
const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Why `id` is not an id the engine dispatches in `field`, or null if it is. */
function whyBad(field: Field, id: string): string | null {
  const [name, ...params] = id.split(':');
  const table = SIGS[field];
  if (!has(table, name)) {
    const other = field === 'lastWords' ? EFFECT_SIGS : LAST_WORDS_SIGS;
    return `"${name}" is not a name engine.ts dispatches for ${field}${has(other, name) ? ' (it is dispatched for the other kind of effect)' : ''}`;
  }
  const sig = table[name];
  if (!sig.arity.includes(params.length)) return `"${name}" takes ${sig.arity.join(' or ')} parameter(s), got ${params.length}`;
  const bad = params.findIndex((p, i) => !isNum(p) && !(sig.any?.includes(i) && p === 'any'));
  if (bad >= 0) return `parameter ${bad + 1} ("${params[bad]}") is not a finite number${sig.any?.includes(bad) ? " or 'any'" : ''}`;
  return null;
}

interface Problem { card: string; field: Field; id: string; why: string }
/** Every eff, resolve and lastWords id of every card in CARDS that the engine would not dispatch correctly. */
function problems(): Problem[] {
  const out: Problem[] = [];
  for (const d of Object.values(CARDS)) {
    for (const field of FIELDS) {
      const id = d[field];
      if (id === undefined) continue;
      const why = whyBad(field, id);
      if (why) out.push({ card: d.id, field, id, why });
    }
  }
  return out;
}

// ================================================================ the real pool
describe('effect registry: every effect id in CARDS is one engine.ts dispatches', () => {
  it('scans the whole pool (at least the 149 cards of waves 0 and 1) and finds effect ids to check', () => {
    const cards = Object.values(CARDS);
    expect(cards.length).toBeGreaterThanOrEqual(149);
    const ids = cards.flatMap(d => FIELDS.map(f => d[f]).filter(Boolean));
    expect(ids.length).toBeGreaterThan(100);
  });

  it('every eff, resolve and lastWords id names an effect the engine dispatches and takes finite-number (or any) parameters', () => {
    expect(problems().map(p => `${p.card}.${p.field} = "${p.id}": ${p.why}`)).toEqual([]);
  });
});

// ================================================================ the checker itself, proven with probe cards
// Same technique as the AC2 tests in cards-v2.test.ts: put a card in CARDS, look, remove it in `finally`.
describe('effect registry: the check fails for a bad id (probe card injected into CARDS)', () => {
  const PROBE = 'zz-registry-probe';
  const probeCard = (patch: Partial<CardDef>): CardDef => ({
    id: PROBE, name: 'Registry Probe', epithet: '', house: 'NEUTRAL', tier: 'COMMON', kind: 'unit', power: 1, text: [], ...patch,
  });
  /** The registry problems the probe card causes, with the probe removed again afterwards. */
  function probe(patch: Partial<CardDef>): Problem[] {
    CARDS[PROBE] = probeCard(patch);
    try {
      return problems().filter(p => p.card === PROBE);
    } finally {
      delete CARDS[PROBE];
    }
  }

  it('the pool is clean without a probe, so any problem below is the probe\'s', () => {
    expect(problems()).toEqual([]);
    expect(CARDS[PROBE]).toBeUndefined();
  });

  const bad: [string, string][] = [
    ['cultist:4', 'missing the bonus parameter K'],
    ['cultist:any', "'any' cap but no bonus parameter K"],
    ['cultist:4:x', 'bonus is not a number'],
    ['burnn:2', 'typo in the name'],
    ['cultist:4:', 'empty bonus (Number("") is 0)'],
    ['cultist:any:any', "'any' is only allowed as the cap M"],
    ['cultist:4:3:1', 'too many parameters'],
    ['burn:any', "'any' is only allowed for cultist's M"],
    ['burn:NaN', 'NaN is not a finite number'],
    ['burn:Infinity', 'Infinity is not finite'],
    ['burn', 'burn needs its amount'],
    ['burn2:3', 'burn2 is an exact id with no parameters'],
    ['token:3', 'a Last Words id is not an eff id'],
  ];
  for (const [id, because] of bad) {
    it(`eff "${id}" is flagged (${because})`, () => {
      const found = probe({ eff: id });
      expect(found.map(p => `${p.field}=${p.id}`)).toEqual([`eff=${id}`]);
    });
  }
  for (const id of ['cultist:4', 'cultist:4:x', 'burnn:2']) {
    it(`resolve "${id}" is flagged`, () => {
      expect(probe({ resolve: id }).map(p => `${p.field}=${p.id}`)).toEqual([`resolve=${id}`]);
    });
  }
  for (const [id, because] of [
    ['burnrandomm:4', 'typo in the name'],
    ['burnrandom:x', 'amount is not a number'],
    ['burnrandom', 'burnrandom needs its amount'],
    ['token2:2:1', 'too many parameters'],
    ['burn:2', 'an eff id is not a Last Words id'],
    ['cultist:4:3', 'cultist is not a Last Words effect'],
  ]) {
    it(`lastWords "${id}" is flagged (${because})`, () => {
      expect(probe({ lastWords: id }).map(p => `${p.field}=${p.id}`)).toEqual([`lastWords=${id}`]);
    });
  }

  it('the probe is gone from CARDS after each probe, even though the check found problems', () => {
    probe({ eff: 'burnn:2' });
    expect(CARDS[PROBE]).toBeUndefined();
    expect(problems()).toEqual([]);
  });

  for (const id of ['cultist', 'cultist:4:3', 'cultist:any:3', 'cultist:3:2', 'burn:2', 'burnmulti:1:3', 'sweep:3:3', 'givegrow', 'givegrow:2', 'shift', 'shift:3', 'hellfire', 'poison1']) {
    it(`eff "${id}" is accepted (the check has no false positives on the legitimate forms)`, () => {
      expect(probe({ eff: id })).toEqual([]);
    });
  }
  for (const id of ['token:3', 'token2:2', 'rowboost:2', 'boostrandom:3', 'burnrandom:4', 'poisonrandom']) {
    it(`lastWords "${id}" is accepted`, () => {
      expect(probe({ lastWords: id })).toEqual([]);
    });
  }
});

// ================================================================ the hard-coded list agrees with engine.ts
describe('effect registry: the hard-coded dispatch list agrees with engine.ts (so it cannot go stale unnoticed)', () => {
  const src = readFileSync(fileURLToPath(new URL('./engine.ts', import.meta.url)), 'utf8');
  /** The text of a top-level function: from `function name(` to the first closing brace in column 0. */
  function bodyOf(name: string): string {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`engine.ts has no function ${name}()`);
    const end = src.indexOf('\n}\n', start);
    if (end < 0) throw new Error(`could not find the end of ${name}() in engine.ts`);
    return src.slice(start, end);
  }
  const casesOf = (body: string) => [...body.matchAll(/case '([a-z0-9]+)'/g)].map(m => m[1]);

  it('applyEffect() has a case for exactly the names in the eff/resolve list', () => {
    expect([...new Set(casesOf(bodyOf('applyEffect')))].sort()).toEqual(Object.keys(EFFECT_SIGS).sort());
  });
  it('lastWords() has a case for exactly the names in the Last Words list', () => {
    expect([...new Set(casesOf(bodyOf('lastWords')))].sort()).toEqual(Object.keys(LAST_WORDS_SIGS).sort());
  });
});
