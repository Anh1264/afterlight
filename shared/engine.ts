// AFTERLIGHT rules engine. Pure TypeScript, no I/O.
// The server owns the authoritative GameState and calls applyAction();
// clients only ever see a redacted PlayerView built by viewFor().

import { CARDS, CardDef, EffId, House, RULES, deckList } from './cards';

export type Row = 'F' | 'B';
export type PIdx = 0 | 1;

export interface CardInst { uid: string; cardId: string }

export interface Unit {
  uid: string;
  cardId: string | null; // null = Echo token
  name: string;
  owner: PIdx; // whose discard pile it goes to
  house: House;
  power: number;
  base: number;
  row: Row;
  grow: boolean;
  guard: boolean;
  shield: boolean;
  poison: boolean;
  token: boolean;
  silenced: boolean;
}

export interface PlayerState {
  name: string;
  house: House;
  deck: CardInst[];
  hand: CardInst[];
  discard: CardInst[];
  units: Unit[];
  passed: boolean;
  wins: number;
}

export interface RoundResult { round: number; scores: [number, number]; winner: PIdx | 'tie' }

export interface GameState {
  rng: number;
  nextId: number;
  players: [PlayerState, PlayerState];
  round: number;
  current: PIdx;
  starter: PIdx;
  first: PIdx;
  over: boolean;
  winner: PIdx | 'draw' | null;
  results: RoundResult[];
  turnNo: number;
}

export type Action =
  | { type: 'pass' }
  | { type: 'play'; uid: string; row?: Row; targets?: string[]; mode?: number; targetRow?: Row };

export type GEvent =
  | { t: 'play'; p: PIdx; cardId: string; uid: string; row?: Row; resolve: boolean }
  | { t: 'summon'; p: PIdx; unit: Unit }
  | { t: 'dmg'; uid: string; n: number; src: 'burn' | 'poison' | 'duel' | 'lose' | 'self'; power: number }
  | { t: 'block'; uid: string }
  | { t: 'boost'; uid: string; n: number; src: 'grow' | 'rally' | 'boost' | 'sacrifice'; power: number }
  | { t: 'status'; uid: string; s: 'poison' | 'grow' | 'shield' | 'silence' }
  | { t: 'destroy'; uid: string }
  | { t: 'move'; uid: string; row: Row }
  | { t: 'steal'; uid: string; to: PIdx; row: Row }
  | { t: 'sacrifice'; uid: string; by: string }
  | { t: 'duel'; a: string; b: string }
  | { t: 'resolve'; p: PIdx; cardId: string }
  | { t: 'pass'; p: PIdx; auto?: boolean }
  | { t: 'turn'; p: PIdx }
  | { t: 'roundEnd'; round: number; scores: [number, number]; winner: PIdx | 'tie' }
  | { t: 'roundStart'; round: number; starter: PIdx }
  | { t: 'draw'; p: PIdx; n: number }
  | { t: 'matchEnd'; winner: PIdx | 'draw' };

// ---------------------------------------------------------------- rng
function rand(g: GameState): number {
  // mulberry32
  let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(g: GameState, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const id = (g: GameState, pre: string) => `${pre}${(g.nextId++).toString(36)}`;

// ---------------------------------------------------------------- setup
export function createGame(opts: {
  houses: [House, House]; names?: [string, string]; seed?: number; first?: PIdx;
}): { state: GameState; events: GEvent[] } {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const g: GameState = {
    rng: seed >>> 0, nextId: 1, round: 1, current: 0, starter: 0, first: 0,
    over: false, winner: null, results: [], turnNo: 0,
    players: [0, 1].map(i => ({
      name: opts.names?.[i] ?? `Player ${i + 1}`, house: opts.houses[i],
      deck: [], hand: [], discard: [], units: [], passed: false, wins: 0,
    })) as unknown as [PlayerState, PlayerState],
  };
  for (const p of g.players) {
    p.deck = shuffle(g, deckList(p.house).map(cardId => ({ uid: id(g, 'c'), cardId })));
  }
  const first: PIdx = opts.first ?? (rand(g) < 0.5 ? 0 : 1);
  g.first = g.starter = g.current = first;
  const events: GEvent[] = [];
  draw(g, 0, RULES.OPEN_HAND, events);
  draw(g, 1, RULES.OPEN_HAND, events);
  events.push({ t: 'roundStart', round: 1, starter: first }, { t: 'turn', p: first });
  return { state: g, events };
}

function draw(g: GameState, p: PIdx, n: number, ev: GEvent[]) {
  const pl = g.players[p];
  let got = 0;
  for (let i = 0; i < n; i++) {
    const c = pl.deck.pop();
    if (!c) break;
    if (pl.hand.length < RULES.HAND_MAX) { pl.hand.push(c); got++; } else pl.discard.push(c);
  }
  if (got) ev.push({ t: 'draw', p, n: got });
}

// ---------------------------------------------------------------- helpers
const other = (p: PIdx): PIdx => (p === 0 ? 1 : 0);
export const score = (pl: PlayerState) => pl.units.reduce((s, u) => s + u.power, 0);
export const rowUnits = (pl: PlayerState, r: Row) => pl.units.filter(u => u.row === r);
const otherRow = (r: Row): Row => (r === 'F' ? 'B' : 'F');

export function totals(g: { players: { units: Unit[] }[]; round: number; first: PIdx }): [number, number] {
  const t = g.players.map(p => p.units.reduce((s, u) => s + u.power, 0)) as [number, number];
  if (g.round === 1) t[g.first] += RULES.FIRST_LIGHT;
  return t;
}

function findUnit(g: GameState, uid: string): { u: Unit; p: PIdx } | null {
  for (const p of [0, 1] as PIdx[]) {
    const u = g.players[p].units.find(x => x.uid === uid);
    if (u) return { u, p };
  }
  return null;
}

/** Enemy units a targeted effect may pick: Guard in their Front row hides their Back row. */
export function targetable(pl: { units: Unit[] }): Unit[] {
  const guarded = pl.units.some(u => u.row === 'F' && u.guard);
  return pl.units.filter(u => !(guarded && u.row === 'B'));
}

function removeUnit(g: GameState, uid: string, ev: GEvent[], sac = false) {
  const f = findUnit(g, uid);
  if (!f) return;
  const pl = g.players[f.p];
  pl.units = pl.units.filter(x => x.uid !== uid);
  if (!f.u.token && f.u.cardId) g.players[f.u.owner].discard.push({ uid: f.u.uid, cardId: f.u.cardId });
  if (!sac) ev.push({ t: 'destroy', uid });
}

function lose(g: GameState, uid: string, n: number, src: 'burn' | 'poison' | 'duel' | 'lose' | 'self', ev: GEvent[]) {
  const f = findUnit(g, uid);
  if (!f || n <= 0) return;
  if (f.u.shield) { f.u.shield = false; ev.push({ t: 'block', uid }); return; }
  f.u.power -= n;
  ev.push({ t: 'dmg', uid, n, src, power: Math.max(0, f.u.power) });
  if (f.u.power <= 0) removeUnit(g, uid, ev);
}

function gain(u: Unit, n: number, src: 'grow' | 'rally' | 'boost' | 'sacrifice', ev: GEvent[]) {
  u.power += n;
  ev.push({ t: 'boost', uid: u.uid, n, src, power: u.power });
}

function makeUnit(g: GameState, p: PIdx, def: CardDef | null, row: Row, opts: { uid?: string; power?: number; house?: House; name?: string } = {}): Unit {
  const power = opts.power ?? def?.power ?? 0;
  return {
    uid: opts.uid ?? id(g, 't'), cardId: def?.id ?? null, name: def?.name ?? opts.name ?? 'Echo', owner: p,
    house: def?.house ?? opts.house ?? g.players[p].house, power, base: power, row,
    grow: !!def?.grow, guard: !!def?.guard, shield: !!def?.shield, poison: false,
    token: !def, silenced: false,
  };
}

function summonToken(g: GameState, p: PIdx, row: Row, power: number, ev: GEvent[], name = 'Echo') {
  const pl = g.players[p];
  if (rowUnits(pl, row).length >= RULES.ROW_MAX) return;
  const t = makeUnit(g, p, null, row, { power, name });
  pl.units.push(t);
  ev.push({ t: 'summon', p, unit: { ...t } });
}

// ---------------------------------------------------------------- targeting
export type TargetSpec =
  | { kind: 'none' }
  | { kind: 'units'; side: 'enemy' | 'ally'; min: number; max: number; pool: string[]; prompt: string }
  | { kind: 'row'; side: 'enemy'; prompt: string }
  | { kind: 'mode'; options: { label: string; spec: TargetSpec }[] };

/** The effect a card will use if played now (Resolve swaps it when the opponent has passed). */
export function activeEffect(def: CardDef, oppPassed: boolean): { eff?: EffId; resolve: boolean } {
  if (def.resolve && oppPassed) return { eff: def.resolve, resolve: true };
  return { eff: def.eff, resolve: false };
}

type BoardLike = { players: { units: Unit[]; passed: boolean }[] };

export function targetSpecFor(g: BoardLike, p: PIdx, eff: EffId | undefined): TargetSpec {
  const me = g.players[p], opp = g.players[other(p)];
  const enemy = (filter: (u: Unit) => boolean, max: number, prompt: string, min?: number): TargetSpec => {
    const pool = targetable(opp).filter(filter).map(u => u.uid);
    if (!pool.length) return { kind: 'none' };
    return { kind: 'units', side: 'enemy', min: Math.min(min ?? max, pool.length), max: Math.min(max, pool.length), pool, prompt };
  };
  const ally = (filter: (u: Unit) => boolean, min: number, max: number, prompt: string): TargetSpec => {
    const pool = me.units.filter(filter).map(u => u.uid);
    if (!pool.length) return { kind: 'none' };
    return { kind: 'units', side: 'ally', min: Math.min(min, pool.length), max: Math.min(max, pool.length), pool, prompt };
  };
  switch (eff) {
    case 'poison1': return enemy(u => !u.poison, 1, 'Poison an enemy unit');
    case 'poison2': return enemy(u => !u.poison, 2, 'Poison 2 enemy units');
    case 'poison3': return enemy(u => !u.poison, 3, 'Poison 3 enemy units');
    case 'silence': return enemy(() => true, 1, 'Silence an enemy unit (then it loses 2)');
    case 'burn2': return enemy(() => true, 1, 'Burn 2: choose an enemy unit');
    case 'burn4': return enemy(() => true, 1, 'Burn 4: choose an enemy unit');
    case 'burn8': return enemy(() => true, 1, 'Burn 8: choose an enemy unit');
    case 'shift': return enemy(() => true, 1, 'Move an enemy unit to its other row (it loses 2)');
    case 'seize4': return enemy(u => u.power <= 4, 1, 'Take control of an enemy unit with 4 or less power');
    case 'duel': return enemy(() => true, 1, 'Duel an enemy unit');
    case 'duel3': return enemy(() => true, 1, 'Aiden gains +3, then Duels an enemy unit');
    case 'givegrow': return ally(u => !u.grow, 1, 1, 'Give an allied unit Grow');
    case 'toad': return enemy(u => u.poison, 1, 'A Poisoned enemy unit loses 3');
    case 'aurel': return ally(u => !u.shield, 1, 2, 'Give Shield to up to 2 allied units', );
    case 'burn2x2': return enemy(() => true, 2, 'Burn 2: choose up to 2 enemy units', 1);
    case 'mirror': return enemy(() => true, 1, 'Copy the power of an enemy unit');
    case 'rotrow':
      return opp.units.length ? { kind: 'row', side: 'enemy', prompt: 'Choose an enemy row: Poison every unit there with 4 or less power' } : { kind: 'none' };
    case 'chaplain': return ally(() => true, 1, 1, 'Give an allied unit Shield and +1');
    case 'cultist': return ally(u => u.power <= 3, 0, 1, 'You may Sacrifice a unit with 3 or less power');
    case 'skarr': return ally(u => u.power <= 3, 0, 2, 'Sacrifice up to 2 units with 3 or less power');
    case 'poisonrow':
      return opp.units.length ? { kind: 'row', side: 'enemy', prompt: 'Choose an enemy row to Poison its 2 strongest units' } : { kind: 'none' };
    case 'hellfire': {
      const single = enemy(() => true, 1, 'Burn 5: choose an enemy unit');
      if (!opp.units.length) return { kind: 'none' };
      return {
        kind: 'mode', options: [
          { label: 'Burn 5 to one unit', spec: single },
          { label: 'Burn 2 to every unit in a row', spec: { kind: 'row', side: 'enemy', prompt: 'Choose an enemy row to Burn' } },
        ],
      };
    }
    default: return { kind: 'none' };
  }
}

export function legalRows(g: BoardLike, p: PIdx, def: CardDef): Row[] {
  if (def.kind !== 'unit') return [];
  // every unit may be placed in either row; the choice matters through Guard, Rally, Echo and row-wide effects
  const rows: Row[] = ['F', 'B'];
  return rows.filter(r => rowUnits(g.players[p] as PlayerState, r).length < RULES.ROW_MAX);
}

// ---------------------------------------------------------------- validation
export function validate(g: GameState, p: PIdx, a: Action): string | null {
  if (g.over) return 'The match is over.';
  if (g.current !== p) return 'Not your turn.';
  const me = g.players[p];
  if (me.passed) return 'You have passed this round.';
  if (a.type === 'pass') return null;
  const inst = me.hand.find(c => c.uid === a.uid);
  if (!inst) return 'That card is not in your hand.';
  const def = CARDS[inst.cardId];
  if (def.kind === 'unit') {
    const rows = legalRows(g, p, def);
    if (!a.row || !rows.includes(a.row)) return 'That row is not allowed or is full.';
  }
  const { eff } = activeEffect(def, g.players[other(p)].passed);
  let spec = targetSpecFor(g, p, eff);
  if (spec.kind === 'mode') {
    const m = spec.options[a.mode ?? -1];
    if (!m) return 'Choose a mode.';
    spec = m.spec;
  }
  if (spec.kind === 'units') {
    const ts = a.targets ?? [];
    if (new Set(ts).size !== ts.length) return 'Duplicate targets.';
    if (ts.length < spec.min || ts.length > spec.max) return `Choose ${spec.min === spec.max ? spec.min : `${spec.min}-${spec.max}`} target(s).`;
    if (ts.some(t => !spec.pool.includes(t))) return 'Illegal target.';
  }
  if (spec.kind === 'row' && a.targetRow !== 'F' && a.targetRow !== 'B') return 'Choose a row.';
  return null;
}

// ---------------------------------------------------------------- effects
function applyEffect(g: GameState, p: PIdx, eff: EffId | undefined, self: Unit | null, a: Extract<Action, { type: 'play' }>, ev: GEvent[]) {
  const me = g.players[p], opp = g.players[other(p)];
  const ts = a.targets ?? [];
  const get = (uid: string) => findUnit(g, uid)?.u;
  switch (eff) {
    case 'poison1': case 'poison2': case 'poison3':
      for (const t of ts) { const u = get(t); if (u && !u.poison) { u.poison = true; ev.push({ t: 'status', uid: t, s: 'poison' }); } }
      break;
    case 'poisonrow': {
      const row = a.targetRow as Row;
      const hit = rowUnits(opp, row).slice().sort((x, y) => y.power - x.power).slice(0, 2);
      for (const u of hit) if (!u.poison) { u.poison = true; ev.push({ t: 'status', uid: u.uid, s: 'poison' }); }
      break;
    }
    case 'rotrow':
      for (const u of rowUnits(opp, a.targetRow as Row)) if (u.power <= 4 && !u.poison) { u.poison = true; ev.push({ t: 'status', uid: u.uid, s: 'poison' }); }
      break;
    case 'bloom':
      for (const u of me.units) if (u !== self && u.grow) gain(u, 2, 'boost', ev);
      break;
    case 'toad': if (ts[0]) lose(g, ts[0], 3, 'lose', ev); break;
    case 'aurel':
      for (const t of ts) { const u = get(t); if (u) { u.shield = true; ev.push({ t: 'status', uid: t, s: 'shield' }); } }
      break;
    case 'shieldfront':
      for (const u of rowUnits(me, 'F')) if (!u.shield) { u.shield = true; ev.push({ t: 'status', uid: u.uid, s: 'shield' }); }
      break;
    case 'burn2x2': for (const t of ts) lose(g, t, 2, 'burn', ev); break;
    case 'gorehorn':
      if (self) for (const u of rowUnits(me, self.row)) if (u !== self) lose(g, u.uid, 2, 'self', ev);
      break;
    case 'mirror': {
      const u = get(ts[0]);
      if (u && self && u.power > self.power) gain(self, u.power - self.power, 'boost', ev);
      break;
    }
    case 'lattice': for (const u of me.units) if (u.token) gain(u, 2, 'boost', ev); break;
    case 'echo4': if (self) summonToken(g, p, otherRow(self.row), 4, ev); break;
    case 'vespera':
      for (const u of opp.units.slice()) if (u.poison) lose(g, u.uid, 2, 'lose', ev);
      break;
    case 'givegrow': { const u = get(ts[0]); if (u) { u.grow = true; ev.push({ t: 'status', uid: u.uid, s: 'grow' }); } break; }
    case 'chaplain': {
      const u = get(ts[0]);
      if (u) { u.shield = true; ev.push({ t: 'status', uid: u.uid, s: 'shield' }); gain(u, 1, 'boost', ev); }
      break;
    }
    case 'holdline': for (const u of rowUnits(me, 'F')) gain(u, 2, 'boost', ev); break;
    case 'boostall1': for (const u of me.units) gain(u, 1, 'boost', ev); break;
    case 'silence': {
      const u = get(ts[0]);
      if (u) {
        u.grow = u.guard = u.shield = u.poison = false; u.silenced = true;
        ev.push({ t: 'status', uid: u.uid, s: 'silence' });
        lose(g, u.uid, 2, 'lose', ev);
      }
      break;
    }
    case 'burn2': case 'burn4': case 'burn8':
      if (ts[0]) lose(g, ts[0], Number(eff.slice(4)), 'burn', ev);
      break;
    case 'burnall1': for (const u of opp.units.slice()) lose(g, u.uid, 1, 'burn', ev); break;
    case 'hellfire':
      if (a.mode === 0 && ts[0]) lose(g, ts[0], 5, 'burn', ev);
      if (a.mode === 1) for (const u of rowUnits(opp, a.targetRow as Row)) lose(g, u.uid, 2, 'burn', ev);
      break;
    case 'cultist': case 'skarr': {
      for (const t of ts) {
        const u = get(t);
        if (!u || !self) continue;
        const n = eff === 'skarr' ? 3 : u.power + 2;
        ev.push({ t: 'sacrifice', uid: t, by: self.uid });
        removeUnit(g, t, ev, true);
        gain(self, n, 'sacrifice', ev);
      }
      break;
    }
    case 'ogre': {
      const others = me.units.filter(u => u !== self);
      if (others.length) {
        const top = others.reduce((m, u) => (u.power > m.power ? u : m), others[0]);
        lose(g, top.uid, 3, 'self', ev);
      }
      break;
    }
    case 'shift': {
      const u = get(ts[0]);
      if (u) {
        const to = otherRow(u.row);
        if (rowUnits(opp, to).length < RULES.ROW_MAX) { u.row = to; ev.push({ t: 'move', uid: u.uid, row: to }); }
        lose(g, u.uid, 2, 'lose', ev);
      }
      break;
    }
    case 'seize4': {
      const u = get(ts[0]);
      if (!u) break;
      let row = u.row;
      if (rowUnits(me, row).length >= RULES.ROW_MAX) row = otherRow(row);
      if (rowUnits(me, row).length >= RULES.ROW_MAX) break;
      opp.units = opp.units.filter(x => x !== u);
      u.row = row; u.poison = false;
      me.units.push(u);
      ev.push({ t: 'steal', uid: u.uid, to: p, row });
      break;
    }
    case 'echo3front': summonToken(g, p, 'F', 3, ev); break;
    case 'afterimage': {
      if (!me.units.length) break;
      const top = me.units.reduce((m, u) => (u.power > m.power ? u : m), me.units[0]);
      summonToken(g, p, otherRow(top.row), top.power, ev);
      break;
    }
    case 'duel': case 'duel3': {
      if (!self) break;
      if (eff === 'duel3') gain(self, 3, 'boost', ev);
      const tgt = ts[0];
      if (!tgt) break;
      ev.push({ t: 'duel', a: self.uid, b: tgt });
      for (let guard = 0; guard < 40; guard++) {
        const A = get(self.uid), B = get(tgt);
        if (!A || !B) break;
        lose(g, B.uid, A.power, 'duel', ev);
        const A2 = get(self.uid), B2 = get(tgt);
        if (!A2 || !B2) break;
        lose(g, A2.uid, B2.power, 'duel', ev);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- turn flow
/** Play a card for player p without advancing the turn (used by the bot for look-ahead too). */
export function doPlay(g: GameState, p: PIdx, a: Extract<Action, { type: 'play' }>, ev: GEvent[]) {
  const me = g.players[p];
  const inst = me.hand.find(c => c.uid === a.uid)!;
  me.hand = me.hand.filter(c => c !== inst);
  const def = CARDS[inst.cardId];
  const { eff, resolve } = activeEffect(def, g.players[other(p)].passed);
  ev.push({ t: 'play', p, cardId: def.id, uid: inst.uid, row: def.kind === 'unit' ? a.row : undefined, resolve });
  if (resolve) ev.push({ t: 'resolve', p, cardId: def.id });
  let self: Unit | null = null;
  if (def.kind === 'unit') {
    const row = a.row as Row;
    self = makeUnit(g, p, def, row, { uid: inst.uid });
    me.units.push(self);
    if (def.rally) for (const v of rowUnits(me, row)) if (v !== self) gain(v, def.rally, 'rally', ev);
    if (def.echo) summonToken(g, p, otherRow(row), def.echo, ev, def.token ?? 'Echo');
  } else {
    me.discard.push(inst);
  }
  applyEffect(g, p, eff, self, a, ev);
}

export function endTurn(g: GameState, p: PIdx, ev: GEvent[]) {
  const me = g.players[p];
  for (const u of me.units) if (u.grow) gain(u, 1, 'grow', ev);
  for (const u of me.units.slice()) if (u.poison) lose(g, u.uid, 1, 'poison', ev);
}

/** Validate + apply an action, then advance turns / rounds. Returns events, or an error string. */
export function applyAction(g: GameState, p: PIdx, a: Action): { events: GEvent[] } | { error: string } {
  const err = validate(g, p, a);
  if (err) return { error: err };
  const ev: GEvent[] = [];
  if (a.type === 'pass') {
    g.players[p].passed = true;
    ev.push({ t: 'pass', p });
  } else {
    doPlay(g, p, a, ev);
    endTurn(g, p, ev);
  }
  g.turnNo++;
  advance(g, ev);
  return { events: ev };
}

function advance(g: GameState, ev: GEvent[]) {
  for (let guard = 0; guard < 10; guard++) {
    const [a, b] = g.players;
    if (a.passed && b.passed) {
      endRound(g, ev);
      if (g.over) return;
      continue;
    }
    // next player: alternate unless the other has passed
    const nxt = g.players[other(g.current)].passed ? g.current : other(g.current);
    g.current = nxt;
    const pl = g.players[nxt];
    if (!pl.hand.length) { pl.passed = true; ev.push({ t: 'pass', p: nxt, auto: true }); continue; }
    ev.push({ t: 'turn', p: nxt });
    return;
  }
}

function endRound(g: GameState, ev: GEvent[]) {
  const scores = totals(g);
  const winner: PIdx | 'tie' = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : 'tie';
  if (winner === 'tie') { g.players[0].wins++; g.players[1].wins++; } else g.players[winner].wins++;
  g.results.push({ round: g.round, scores, winner });
  ev.push({ t: 'roundEnd', round: g.round, scores, winner });
  const [w0, w1] = [g.players[0].wins, g.players[1].wins];
  if (w0 >= 2 || w1 >= 2 || g.round >= 3) {
    g.over = true;
    g.winner = w0 > w1 ? 0 : w1 > w0 ? 1 : 'draw';
    ev.push({ t: 'matchEnd', winner: g.winner });
    return;
  }
  for (const pl of g.players) {
    for (const u of pl.units) if (!u.token && u.cardId) g.players[u.owner].discard.push({ uid: u.uid, cardId: u.cardId });
    pl.units = [];
    pl.passed = false;
  }
  g.round++;
  draw(g, 0, RULES.ROUND_DRAW, ev);
  draw(g, 1, RULES.ROUND_DRAW, ev);
  g.starter = winner === 'tie' ? other(g.starter) : winner;
  // advance() flips current, so set it to the player before the starter
  g.current = other(g.starter);
  ev.push({ t: 'roundStart', round: g.round, starter: g.starter });
  // make advance() land on the starter even if the "other" check fires
  g.players[g.current].passed = false;
}

export function forfeit(g: GameState, loser: PIdx): GEvent[] {
  if (g.over) return [];
  g.over = true;
  g.winner = other(loser);
  return [{ t: 'matchEnd', winner: g.winner }];
}

// ---------------------------------------------------------------- views
export interface PublicPlayer {
  name: string; house: House; handCount: number; deckCount: number; discardCount: number;
  units: Unit[]; passed: boolean; wins: number; hand?: CardInst[];
}
export interface PlayerView {
  me: PIdx; round: number; current: PIdx; first: PIdx; starter: PIdx; over: boolean;
  winner: PIdx | 'draw' | null; results: RoundResult[]; turnNo: number;
  players: [PublicPlayer, PublicPlayer];
}

export function viewFor(g: GameState, me: PIdx): PlayerView {
  return {
    me, round: g.round, current: g.current, first: g.first, starter: g.starter, over: g.over,
    winner: g.winner, results: g.results, turnNo: g.turnNo,
    players: g.players.map((pl, i) => ({
      name: pl.name, house: pl.house, handCount: pl.hand.length, deckCount: pl.deck.length,
      discardCount: pl.discard.length, units: pl.units.map(u => ({ ...u })), passed: pl.passed, wins: pl.wins,
      hand: i === me ? pl.hand.map(c => ({ ...c })) : undefined,
    })) as [PublicPlayer, PublicPlayer],
  };
}

export function clone(g: GameState): GameState {
  return structuredClone(g);
}
