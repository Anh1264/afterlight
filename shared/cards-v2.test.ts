// CARDS-V2 wave 1 (docs/specs/cards-v2.md section 1): the 41 new cards and the `cultist:M:K` variant.
// Written from the spec alone. Every card gets: data (house, tier, power, row, statics, effect ids), exact rules text,
// one behaviour test that plays it on a staged board (invariant 5: the text says what the engine does) and, where the
// card has a target or a condition, an edge case. Wave-2 cards are out of scope: when wave 2 lands, extend W1 and the
// pool totals in the 'AC1 pool' block.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_HOUSES, CARDS, CardDef, CardHouse, DECK_RULES, House, RULES, RowRule, Tier, deckPool, validateDeck } from './cards';
import {
  Action, GEvent, GameState, PIdx, Row, TargetSpec, Unit, activeEffect, applyAction, createGame, legalRows, rowUnits, targetSpecFor, targetable,
} from './engine';
import { decide, candidatePlays } from './bot';
import { checkInvariants, mulberry } from './sim';

// ================================================================ the spec, transcribed
interface Spec {
  id: string; name: string; epithet?: string; house: CardHouse; tier: Tier; kind: 'unit' | 'special';
  power?: number; rows?: RowRule; text: string;
  grow?: boolean; guard?: boolean; shield?: boolean; rally?: number; echo?: number; token?: string;
  eff?: string; resolve?: string; lastWords?: string;
}
type Extra = Partial<Pick<Spec, 'epithet' | 'grow' | 'guard' | 'shield' | 'rally' | 'echo' | 'token' | 'eff' | 'resolve' | 'lastWords'>>;
const U = (house: CardHouse, tier: Tier, id: string, name: string, power: number, rows: RowRule, text: string, x: Extra = {}): Spec =>
  ({ id, name, house, tier, kind: 'unit', power, rows, text, ...x });
const S = (house: CardHouse, tier: Tier, id: string, name: string, text: string, x: Extra = {}): Spec =>
  ({ id, name, house, tier, kind: 'special', epithet: 'SPECIAL', text, ...x });

const W1: Spec[] = [
  // ---- Coven (5 C, 3 R, 2 L)
  U('COVEN', 'COMMON', 'brood-sac', 'Brood Sac', 1, 'B', 'Grow. Last Words: Summon two 2-power Grubs in this row.', { grow: true, token: 'Grub', lastWords: 'token2:2' }),
  U('COVEN', 'COMMON', 'husk-beetle', 'Husk Beetle', 3, 'F', 'Last Words: Summon a 3-power Husk in this row.', { token: 'Husk', lastWords: 'token:3' }),
  U('COVEN', 'COMMON', 'pit-maw', 'Pit Maw', 2, 'F', 'Deploy: You may Sacrifice another allied unit with 4 or less power; this gains its power +3.', { eff: 'cultist:4:3' }),
  U('COVEN', 'COMMON', 'bog-bloater', 'Bog Bloater', 7, 'F', 'Deploy: Poison this unit.', { eff: 'selfpoison' }),
  U('COVEN', 'COMMON', 'bramblehide', 'Bramblehide', 3, 'F', 'Grow. Shield.', { grow: true, shield: true }),
  U('COVEN', 'RARE', 'marsh-lurker', 'Marsh Lurker', 4, 'F', 'Deploy: A Poisoned enemy unit loses 3 and this gains 3.', { eff: 'drain:3' }),
  U('COVEN', 'RARE', 'gut-hag', 'Gut Hag', 3, 'F',
    'Deploy: You may Sacrifice another allied unit with 4 or less power; this gains its power +3. Last Words: Summon a 3-power Husk in this row.',
    { token: 'Husk', eff: 'cultist:4:3', lastWords: 'token:3' }),
  U('COVEN', 'RARE', 'bog-widow', 'Bog Widow', 5, 'B', 'Resolve: Every Poisoned enemy unit loses 2.', { resolve: 'vespera' }),
  U('COVEN', 'LEGEND', 'the-bottomless', 'The Bottomless', 4, 'F', 'Deploy: You may Sacrifice another allied unit; this gains its power +3.', { epithet: 'the maw below', eff: 'cultist:any:3' }),
  U('COVEN', 'LEGEND', 'gulletmaw', 'Gulletmaw', 4, 'F', 'Deploy: A Poisoned enemy unit loses 5 and this gains 5.', { epithet: 'the drowned jaw', eff: 'drain:5' }),
  // ---- Order (4 C, 3 R, 2 L)
  U('ORDER', 'COMMON', 'conscript', 'Conscript', 3, 'F', 'Rally 1. Other units in this row gain 1.', { rally: 1 }),
  U('ORDER', 'COMMON', 'war-drummer', 'War Drummer', 1, 'B', 'Deploy: Your other units gain 1.', { eff: 'allboost:1' }),
  U('ORDER', 'COMMON', 'drill-sergeant', 'Drill Sergeant', 3, 'F', 'Echo 2. Summon a 2-power Recruit in your other row.', { echo: 2, token: 'Recruit' }),
  U('ORDER', 'COMMON', 'gate-warden', 'Gate Warden', 3, 'F', 'Guard. Last Words: Summon a 3-power Recruit in this row.', { guard: true, token: 'Recruit', lastWords: 'token:3' }),
  U('ORDER', 'RARE', 'arbalest-line', 'Arbalest Line', 4, 'B', 'Deploy: Burn 1 to every enemy unit in a row.', { eff: 'rowburn:1' }),
  U('ORDER', 'RARE', 'tower-warden', 'Tower Warden', 7, 'F', 'Guard.', { guard: true }),
  S('ORDER', 'RARE', 'bastion', 'Bastion', 'Give Shield to up to 3 allied units.', { eff: 'shield:3' }),
  U('ORDER', 'LEGEND', 'bellwarden', 'The Bellwarden', 1, 'B', 'Deploy: Your other units gain 2.', { epithet: 'the muster bell', eff: 'allboost:2' }),
  U('ORDER', 'LEGEND', 'brannoc', 'Ser Brannoc', 5, 'F', 'Shield. Deploy: Duel an enemy unit with 5 or less power.', { epithet: 'the challenger', shield: true, eff: 'duellow:5' }),
  // ---- Ember (5 C, 2 R, 1 L)
  U('EMBER', 'COMMON', 'spark-flinger', 'Spark Flinger', 2, 'B', 'Deploy: Burn 1 to up to 3 enemy units.', { eff: 'burnmulti:1:3' }),
  U('EMBER', 'COMMON', 'cinder-reaper', 'Cinder Reaper', 3, 'F', 'Deploy: Destroy an enemy unit with 3 or less power.', { eff: 'execute:3' }),
  U('EMBER', 'COMMON', 'torchbearer', 'Torchbearer', 5, 'F', 'Resolve: Burn 1 to up to 3 enemy units.', { resolve: 'burnmulti:1:3' }),
  U('EMBER', 'COMMON', 'furnace-brute', 'Furnace Brute', 8, 'F', 'Deploy: Your other units lose 1.', { eff: 'allylose:1' }),
  U('EMBER', 'COMMON', 'ash-lancer', 'Ash Lancer', 4, 'F', 'Deploy: Burn 2 to the strongest enemy unit.', { eff: 'burnstrongest:2' }),
  S('EMBER', 'RARE', 'ember-storm', 'Ember Storm', 'Burn 2 to up to 3 enemy units.', { eff: 'burnmulti:2:3' }),
  U('EMBER', 'RARE', 'ember-wraith', 'Ember Wraith', 3, 'B', 'Last Words: Burn 4 to a random enemy unit.', { lastWords: 'burnrandom:4' }),
  U('EMBER', 'LEGEND', 'sulka', 'Sulka', 4, 'B', 'Deploy: Every enemy unit with 3 or less power loses 3.', { epithet: 'the cinder bride', eff: 'sweep:3:3' }),
  // ---- Echo (4 C, 4 R, 1 L)
  U('ECHO', 'COMMON', 'mirror-mote', 'Mirror Mote', 2, 'B', 'Deploy: Choose another allied unit with 4 or less power. Summon an Echo with its power in its other row.', { eff: 'copyally:4' }),
  S('ECHO', 'COMMON', 'reroute', 'Reroute', 'Move an enemy unit to its other row; it loses 3.', { eff: 'shift:3' }),
  U('ECHO', 'COMMON', 'decoy-drone', 'Decoy Drone', 2, 'F', 'Guard. Echo 2. Summon a 2-power token in your other row.', { guard: true, echo: 2 }),
  U('ECHO', 'COMMON', 'fork-runner', 'Fork Runner', 4, 'F', 'Echo 3. Summon a 3-power token in your other row.', { echo: 3 }),
  U('ECHO', 'RARE', 'looking-glass', 'Looking Glass', 1, 'F', 'Deploy: Choose an enemy unit. If it has more power, this becomes its power.', { eff: 'mirror' }),
  U('ECHO', 'RARE', 'echo-lens', 'Echo Lens', 3, 'B',
    "Deploy: Summon an Echo with the power of your strongest unit (this one counts; if tied, the one that reached the board first) in that unit's other row.", { eff: 'afterimage' }),
  U('ECHO', 'RARE', 'signal-tower', 'Signal Tower', 5, 'B', 'Resolve: Summon a 4-power Echo in your other row.', { resolve: 'echo4' }),
  S('ECHO', 'RARE', 'amplify', 'Amplify', 'Your tokens gain 2.', { eff: 'tokenboost:2' }),
  U('ECHO', 'LEGEND', 'facet-queen', 'Facet Queen', 4, 'B', 'Deploy: Choose another allied unit with 10 or less power. Summon an Echo with its power in its other row.',
    { epithet: 'the thousand faces', eff: 'copyally:10' }),
  // ---- Neutral (3 C, 2 R, 0 L)
  S('NEUTRAL', 'RARE', 'rockslide', 'Rockslide', 'Burn 2 to every enemy unit in a row.', { eff: 'rowburn:2' }),
  U('NEUTRAL', 'RARE', 'executioner', 'Executioner', 4, 'F', 'Deploy: Destroy an enemy unit with 4 or less power.', { eff: 'execute:4' }),
  U('NEUTRAL', 'COMMON', 'lamplighter', 'Lamplighter', 3, 'B', 'Resolve: Boost another allied unit by 4.', { resolve: 'boost:4' }),
  U('NEUTRAL', 'COMMON', 'tinker', 'Tinker', 3, 'B', 'Deploy: Give another allied unit Shield.', { eff: 'shield:1' }),
  U('NEUTRAL', 'COMMON', 'scrap-golem', 'Scrap Golem', 4, 'F', 'Last Words: Summon a 2-power Scrap in this row.', { token: 'Scrap', lastWords: 'token:2' }),
];
const W1_IDS = W1.map(s => s.id);

/** The 108 cards that existed at foundation 7e39dd2. */
const BASELINE = new Set(('mawroot simmer vespera thornling blight-moth bog-brute rootkeeper witch-brew halden kestra warden shieldbearer squire lancer chaplain '
  + 'hold-the-line vorok skarr hue cinder-imp pyre-hound ash-cultist brimstone-ogre hellfire null9 drake aiden glitch-rat static-runner relay-drone patchwork '
  + 'afterimage grandmother-rot hollow-bloom mire-toad ilse aurel crossbowman matron-cinder gorehorn ember-whelp mirrorjack lattice signal-ghost sporeling '
  + 'leech-vine moss-golem hex-doll gravecap overgrowth mother-of-thorns plague-doctor swamp-colossus bog-oracle venom-spitter seed-keeper elder-tree pikeman '
  + 'herald shield-maiden militia archer fortify inquisitor field-medic standard-bearer siege-ballista paladin quartermaster odric ember-sprite flame-juggler '
  + 'lava-golem acolyte pyromancer fireball demon-butcher flame-warden infernal-hound brand-priest magma-titan phoenix-whelp azhar shard-bot ping-drone '
  + 'splitter hacker wire-hound static-burst phase-stalker signal-jammer replicator data-wraith gridlock-golem puppeteer oracle-prime sellsword scout veteran '
  + 'apothecary brawler second-wind bounty-hunter merc-captain wayfarer-sage iron-golem lantern-keeper fallen-colossus').split(' '));

// ================================================================ helpers
const norm = (s: string) => s.replace(/[‘’]/g, "'");
const textOf = (d: CardDef) => norm(d.text.map(a => [a.kw, a.t].filter(Boolean).join(' ')).join(' '));

/** CARDS[id], or a failure that names the missing card (the right reason for a test to fail before the cards exist). */
function card(id: string): CardDef {
  const d = CARDS[id];
  if (!d) throw new Error(`card "${id}" is missing from CARDS`);
  return d;
}

const FILLER = 'sellsword'; // vanilla 6-power Neutral; keeps both hands non-empty so turns and rounds never advance by surprise
let seq = 0;

function stage(first: PIdx = 0): GameState {
  const { state: g } = createGame({ houses: ['ORDER', 'EMBER'], seed: 4242, first });
  g.players[0].hand = [{ uid: 'filler-0', cardId: FILLER }];
  g.players[1].hand = [{ uid: 'filler-1', cardId: FILLER }];
  return g;
}

function put(g: GameState, p: PIdx, id: string, row: Row, patch: Partial<Unit> = {}): Unit {
  const d = card(id);
  const power = d.power ?? 0;
  const u: Unit = {
    uid: `u-${++seq}-${id}`, cardId: id, name: d.name, owner: p, house: d.house, power, base: power, row,
    grow: !!d.grow, guard: !!d.guard, shield: !!d.shield, poison: false, token: false, silenced: false, ...patch,
  };
  g.players[p].units.push(u);
  return u;
}
/** A plain unit of any power (a Sellsword with its power overridden). */
const body = (g: GameState, p: PIdx, row: Row, power: number, patch: Partial<Unit> = {}) => put(g, p, 'sellsword', row, { power, base: power, ...patch });
const token = (g: GameState, p: PIdx, name: string, power: number, row: Row): Unit => {
  const u: Unit = {
    uid: `u-${++seq}-tok`, cardId: null, name, owner: p, house: g.players[p].house, power, base: power, row,
    grow: false, guard: false, shield: false, poison: false, token: true, silenced: false,
  };
  g.players[p].units.push(u);
  return u;
};
const fill = (g: GameState, p: PIdx, row: Row, n: number) => { for (let i = 0; i < n; i++) body(g, p, row, 1); };

interface PlayOpts { row?: Row; targets?: Unit[]; targetRow?: Row; mode?: number }
function give(g: GameState, p: PIdx, id: string): string {
  card(id);
  const uid = `h-${++seq}-${id}`;
  g.players[p].hand.push({ uid, cardId: id });
  return uid;
}
function tryPlay(g: GameState, p: PIdx, id: string, o: PlayOpts = {}) {
  const uid = give(g, p, id);
  return applyAction(g, p, { type: 'play', uid, row: o.row, targets: o.targets?.map(t => t.uid), targetRow: o.targetRow, mode: o.mode });
}
function play(g: GameState, p: PIdx, id: string, o: PlayOpts = {}): GEvent[] {
  const r = tryPlay(g, p, id, o);
  if ('error' in r) throw new Error(`playing ${id}: ${r.error}`);
  return r.events;
}
/** What the engine will ask for if `p` plays card `id` now (Resolve-aware, like validate()). */
function specOf(g: GameState, p: PIdx, id: string): TargetSpec {
  const opp = g.players[p === 0 ? 1 : 0];
  return targetSpecFor(g, p, activeEffect(card(id), opp.passed).eff);
}
const poolOf = (s: TargetSpec): string[] => (s.kind === 'units' ? s.pool : []);

const shape = (us: Unit[]) => us.map(u => `${u.name} ${u.power} ${u.row}`).sort();
const find = (g: GameState, uid: string): Unit | undefined => g.players.flatMap(p => p.units).find(u => u.uid === uid);
const powerOf = (g: GameState, u: Unit): number | undefined => find(g, u.uid)?.power;
function unitOf(g: GameState, p: PIdx, id: string): Unit {
  const u = g.players[p].units.find(x => x.cardId === id);
  if (!u) throw new Error(`${id} is not on player ${p}'s board`);
  return u;
}
const discardIds = (g: GameState, p: PIdx) => g.players[p].discard.map(c => c.cardId);
const names = (g: GameState, p: PIdx) => g.players[p].units.map(u => u.name).sort();
/** Player 1 (who must be the one to act: stage(1)) burns `victim` with Fireball (Burn 4). */
const killWithFireball = (g: GameState, victim: Unit) => play(g, 1, 'fireball', { targets: [victim] });

// ================================================================ AC1: per-card data, text, behaviour, edges
const behaviours: Record<string, () => void> = {};

// ---------------------------------------------------------------- shared recipes
/** Last Words that summon one token of `tokenName` with `tokenPower` into the dying unit's row. */
function lastWordsToken(id: string, tokenName: string, tokenPower: number) {
  it(`inv5 ${id}: Last Words summon a ${tokenPower}-power ${tokenName} in this row (Front)`, () => {
    const g = stage(1);
    const victim = put(g, 0, id, 'F');
    killWithFireball(g, victim);
    expect(shape(g.players[0].units)).toEqual([`${tokenName} ${tokenPower} F`]);
    expect(g.players[0].units.every(u => u.token)).toBe(true);
    expect(discardIds(g, 0)).toContain(id);
  });
  it(`inv5 ${id} edge: dying in the Back row, the ${tokenName} lands in the Back row`, () => {
    const g = stage(1);
    const victim = put(g, 0, id, 'B');
    killWithFireball(g, victim);
    expect(shape(g.players[0].units)).toEqual([`${tokenName} ${tokenPower} B`]);
  });
  it(`inv5 ${id} edge: the board clearing at the end of a round does not fire Last Words`, () => {
    const g = stage(0);
    put(g, 0, id, 'F');
    expect('error' in applyAction(g, 0, { type: 'pass' })).toBe(false);
    expect('error' in applyAction(g, 1, { type: 'pass' })).toBe(false);
    expect(g.round).toBe(2);
    expect(g.players[0].units).toEqual([]);
    expect(g.players[1].units).toEqual([]);
  });
}

/** cultist:4:3 (Pit Maw, Gut Hag): Sacrifice another allied unit with 4 or less power; gain its power +3. */
function cultistCap4(id: string, startPower: number) {
  it(`inv5 ${id}: Deploy Sacrifices an allied unit with 4 or less power and this gains its power +3`, () => {
    const g = stage(0);
    const food = put(g, 0, 'bog-brute', 'F'); // 4 power: the cap itself
    const ev = play(g, 0, id, { row: 'F', targets: [food] });
    const me = unitOf(g, 0, id);
    expect(me.power).toBe(startPower + 4 + 3);
    expect(find(g, food.uid)).toBeUndefined();
    expect(discardIds(g, 0)).toContain('bog-brute');
    expect(ev).toContainEqual({ t: 'sacrifice', uid: food.uid, by: me.uid });
  });
  it(`inv5 ${id} edge: an ally with 5 power is not a legal Sacrifice`, () => {
    const g = stage(0);
    const big = body(g, 0, 'F', 5);
    const small = body(g, 0, 'B', 4);
    const spec = specOf(g, 0, id);
    expect(spec.kind).toBe('units');
    expect(poolOf(spec)).toEqual([small.uid]);
    expect(tryPlay(g, 0, id, { row: 'F', targets: [big] })).toHaveProperty('error');
  });
  it(`inv5 ${id} edge: "you may": with a legal ally on the board, playing it with no target sacrifices nothing`, () => {
    const g = stage(0);
    const ally = body(g, 0, 'F', 3);
    play(g, 0, id, { row: 'F' });
    expect(find(g, ally.uid)?.power).toBe(3);
    expect(unitOf(g, 0, id).power).toBe(startPower);
  });
  it(`inv5 ${id} edge: with only a 6-power ally there is no legal target and the card plays with no effect`, () => {
    const g = stage(0);
    body(g, 0, 'F', 6);
    expect(specOf(g, 0, id).kind).toBe('none');
    play(g, 0, id, { row: 'B' });
    expect(unitOf(g, 0, id).power).toBe(startPower);
    expect(g.players[0].units).toHaveLength(2);
  });
}

/** drain:N (Marsh Lurker 3, Gulletmaw 5): a Poisoned enemy unit loses N and this gains N. */
function drain(id: string, n: number, startPower: number) {
  it(`inv5 ${id}: a Poisoned enemy unit loses ${n} and this gains ${n}`, () => {
    const g = stage(0);
    const sick = body(g, 1, 'F', 9, { poison: true });
    const clean = body(g, 1, 'F', 9);
    expect(poolOf(specOf(g, 0, id))).toEqual([sick.uid]);
    play(g, 0, id, { row: 'F', targets: [sick] });
    expect(powerOf(g, sick)).toBe(9 - n);
    expect(powerOf(g, clean)).toBe(9);
    expect(unitOf(g, 0, id).power).toBe(startPower + n);
  });
  it(`inv5 ${id} edge: with no Poisoned enemy unit there is no target and no gain`, () => {
    const g = stage(0);
    const clean = body(g, 1, 'F', 9);
    expect(specOf(g, 0, id).kind).toBe('none');
    play(g, 0, id, { row: 'F' });
    expect(powerOf(g, clean)).toBe(9);
    expect(unitOf(g, 0, id).power).toBe(startPower);
  });
  it(`inv5 ${id} edge: a Poisoned unit that dies from the loss is destroyed and this still gains ${n}`, () => {
    const g = stage(0);
    const weak = body(g, 1, 'F', n, { poison: true });
    play(g, 0, id, { row: 'F', targets: [weak] });
    expect(find(g, weak.uid)).toBeUndefined();
    expect(discardIds(g, 1)).toContain('sellsword');
    expect(unitOf(g, 0, id).power).toBe(startPower + n);
  });
  it(`inv5 ${id} edge: a Poisoned unit hidden in the Back row behind an enemy Guard is not a legal target`, () => {
    const g = stage(0);
    put(g, 1, 'pikeman', 'F');
    body(g, 1, 'B', 9, { poison: true });
    expect(specOf(g, 0, id).kind).toBe('none');
  });
}

/** allboost:N (War Drummer 1, Bellwarden 2): your other units gain N. */
function allBoost(id: string, n: number, selfPower: number) {
  it(`inv5 ${id}: your other units in both rows gain ${n}; this and the enemy do not`, () => {
    const g = stage(0);
    const a = body(g, 0, 'F', 4);
    const b = body(g, 0, 'B', 5);
    const e = body(g, 1, 'F', 5);
    play(g, 0, id, { row: 'B' });
    expect(powerOf(g, a)).toBe(4 + n);
    expect(powerOf(g, b)).toBe(5 + n);
    expect(powerOf(g, e)).toBe(5);
    expect(unitOf(g, 0, id).power).toBe(selfPower);
  });
  it(`inv5 ${id} edge: played onto an empty board it stays at ${selfPower}`, () => {
    const g = stage(0);
    play(g, 0, id, { row: 'B' });
    expect(shape(g.players[0].units)).toEqual([`${card(id).name} ${selfPower} B`]);
  });
}

/** burnmulti:N:3 ("Burn N to up to 3 enemy units"): Spark Flinger and Torchbearer (Resolve), Ember Storm (special). */
function burnUpTo3(id: string, n: number, opts: { resolve?: boolean; special?: boolean }) {
  const row: Row | undefined = opts.special ? undefined : 'F';
  const setup = () => { const g = stage(0); if (opts.resolve) g.players[1].passed = true; return g; };
  it(`inv5 ${id}: Burn ${n} to each of 3 chosen enemy units, and only those`, () => {
    const g = setup();
    const [a, b, c, d] = [body(g, 1, 'F', 6), body(g, 1, 'F', 5), body(g, 1, 'B', 4), body(g, 1, 'B', 6)];
    play(g, 0, id, { row, targets: [a, b, c] });
    expect([a, b, c, d].map(u => powerOf(g, u))).toEqual([6 - n, 5 - n, 4 - n, 6]);
  });
  it(`inv5 ${id} edge: "up to 3": one target is fine, four are not`, () => {
    const g = setup();
    const e = [1, 2, 3, 4, 5].map(i => body(g, 1, i % 2 ? 'F' : 'B', 5 + i));
    const spec = specOf(g, 0, id);
    expect(spec.kind).toBe('units');
    expect(spec.kind === 'units' ? [spec.min, spec.max] : []).toEqual([1, 3]);
    expect(tryPlay(g, 0, id, { row, targets: e.slice(0, 4) })).toHaveProperty('error');
    expect(tryPlay(g, 0, id, { row, targets: [e[0]] })).not.toHaveProperty('error');
    expect(powerOf(g, e[0])).toBe(6 - n);
  });
  it(`inv5 ${id} edge: a ${n}-power enemy unit is destroyed, a Shielded one only loses its Shield`, () => {
    const g = setup();
    const weak = body(g, 1, 'F', n);
    const warded = body(g, 1, 'F', 7, { shield: true });
    play(g, 0, id, { row, targets: [weak, warded] });
    expect(find(g, weak.uid)).toBeUndefined();
    expect(find(g, warded.uid)).toMatchObject({ power: 7, shield: false });
  });
  it(`inv5 ${id} edge: with no enemy unit there is no target and the card still plays`, () => {
    const g = setup();
    expect(specOf(g, 0, id).kind).toBe('none');
    play(g, 0, id, { row });
    expect(g.players[1].units).toEqual([]);
  });
}

/** token echo (Drill Sergeant, Decoy Drone, Fork Runner): a token appears in the other row. */
function echoToken(id: string, power: number, tokenName: string, startPower: number) {
  it(`inv5 ${id} edge: with the other row full the unit still lands and no ${tokenName} is summoned`, () => {
    const g = stage(0);
    fill(g, 0, 'B', RULES.ROW_MAX);
    play(g, 0, id, { row: 'F' });
    expect(rowUnits(g.players[0], 'B')).toHaveLength(RULES.ROW_MAX);
    expect(g.players[0].units.filter(u => u.token)).toEqual([]);
    expect(unitOf(g, 0, id).power).toBe(startPower);
  });
  it(`inv5 ${id}: played in the Back row, the ${power}-power ${tokenName} appears in the Front row`, () => {
    const g = stage(0);
    play(g, 0, id, { row: 'B' });
    expect(shape(g.players[0].units)).toEqual([`${tokenName} ${power} F`, `${card(id).name} ${startPower} B`].sort());
  });
}

// ---------------------------------------------------------------- Coven
behaviours['brood-sac'] = () => {
  it('inv5 brood-sac: Grow, it gains 1 at the end of its owner\'s turn', () => {
    const g = stage(0);
    const ev = play(g, 0, 'brood-sac', { row: 'B' });
    const u = unitOf(g, 0, 'brood-sac');
    expect(u.grow).toBe(true);
    expect(u.power).toBe(2);
    expect(ev).toContainEqual({ t: 'boost', uid: u.uid, n: 1, src: 'grow', power: 2 });
  });
  it('inv5 brood-sac: Last Words summon two 2-power Grubs in this row', () => {
    const g = stage(1);
    const victim = put(g, 0, 'brood-sac', 'F');
    killWithFireball(g, victim);
    expect(shape(g.players[0].units)).toEqual(['Grub 2 F', 'Grub 2 F']);
    expect(g.players[0].units.every(u => u.token)).toBe(true);
    expect(discardIds(g, 0)).toContain('brood-sac');
  });
  it('inv5 brood-sac edge: dying in a full row, only the one Grub that fits is summoned', () => {
    const g = stage(1);
    const victim = put(g, 0, 'brood-sac', 'B');
    fill(g, 0, 'B', RULES.ROW_MAX - 1);
    killWithFireball(g, victim);
    expect(rowUnits(g.players[0], 'B')).toHaveLength(RULES.ROW_MAX);
    expect(g.players[0].units.filter(u => u.name === 'Grub')).toHaveLength(1);
  });
  it('inv5 brood-sac edge: the board clearing at the end of a round does not fire Last Words', () => {
    const g = stage(0);
    put(g, 0, 'brood-sac', 'F');
    applyAction(g, 0, { type: 'pass' });
    applyAction(g, 1, { type: 'pass' });
    expect(g.round).toBe(2);
    expect(g.players[0].units).toEqual([]);
  });
};
behaviours['husk-beetle'] = () => lastWordsToken('husk-beetle', 'Husk', 3);
behaviours['pit-maw'] = () => cultistCap4('pit-maw', 2);
behaviours['bog-bloater'] = () => {
  it('inv5 bog-bloater: Deploy Poisons this unit, so it loses 1 at the end of its owner\'s turn', () => {
    const g = stage(0);
    const ev = play(g, 0, 'bog-bloater', { row: 'F' });
    const u = unitOf(g, 0, 'bog-bloater');
    expect(u.poison).toBe(true);
    expect(u.power).toBe(6);
    expect(ev).toContainEqual({ t: 'status', uid: u.uid, s: 'poison' });
  });
  it('inv5 bog-bloater edge: it needs no target, so it plays on a board with other units on both sides', () => {
    const g = stage(0);
    body(g, 0, 'F', 3);
    body(g, 1, 'F', 3);
    expect(specOf(g, 0, 'bog-bloater').kind).toBe('none');
    play(g, 0, 'bog-bloater', { row: 'B' });
    expect(g.players[1].units.every(u => !u.poison)).toBe(true);
  });
};
behaviours['bramblehide'] = () => {
  it('inv5 bramblehide: Grow gains 1 at the end of its owner\'s turn', () => {
    const g = stage(0);
    play(g, 0, 'bramblehide', { row: 'F' });
    expect(unitOf(g, 0, 'bramblehide')).toMatchObject({ grow: true, power: 4 });
  });
  it('inv5 bramblehide: Shield blocks the next hit and then breaks', () => {
    const g = stage(0);
    play(g, 0, 'bramblehide', { row: 'F' });
    const u = unitOf(g, 0, 'bramblehide');
    expect(u.shield).toBe(true);
    const ev = play(g, 1, 'fireball', { targets: [u] });
    expect(ev).toContainEqual({ t: 'block', uid: u.uid });
    expect(find(g, u.uid)).toMatchObject({ power: 4, shield: false });
  });
};
behaviours['marsh-lurker'] = () => drain('marsh-lurker', 3, 4);
behaviours['gut-hag'] = () => {
  cultistCap4('gut-hag', 3);
  lastWordsToken('gut-hag', 'Husk', 3);
};
behaviours['bog-widow'] = () => {
  it('inv5 bog-widow: Resolve (opponent passed) makes every Poisoned enemy unit lose 2', () => {
    const g = stage(0);
    const a = body(g, 1, 'F', 6, { poison: true });
    const b = body(g, 1, 'F', 6);
    const c = body(g, 1, 'B', 5, { poison: true });
    g.players[1].passed = true;
    const ev = play(g, 0, 'bog-widow', { row: 'B' });
    expect([a, b, c].map(u => powerOf(g, u))).toEqual([4, 6, 3]);
    expect(ev).toContainEqual({ t: 'resolve', p: 0, cardId: 'bog-widow' });
    expect(unitOf(g, 0, 'bog-widow').power).toBe(5);
  });
  it('inv5 bog-widow edge: before the opponent passes it is a plain 5-power unit and nothing is hurt', () => {
    const g = stage(0);
    const a = body(g, 1, 'F', 6, { poison: true });
    const ev = play(g, 0, 'bog-widow', { row: 'B' });
    expect(powerOf(g, a)).toBe(6);
    expect(ev.some(e => e.t === 'resolve')).toBe(false);
    expect(unitOf(g, 0, 'bog-widow').power).toBe(5);
  });
};
behaviours['the-bottomless'] = () => {
  it('inv5 the-bottomless: Deploy Sacrifices an allied unit of any power and this gains its power +3', () => {
    const g = stage(0);
    const feast = body(g, 0, 'B', 12);
    const ev = play(g, 0, 'the-bottomless', { row: 'F', targets: [feast] });
    const me = unitOf(g, 0, 'the-bottomless');
    expect(me.power).toBe(4 + 12 + 3);
    expect(find(g, feast.uid)).toBeUndefined();
    expect(ev).toContainEqual({ t: 'sacrifice', uid: feast.uid, by: me.uid });
  });
  it('inv5 the-bottomless edge: "you may": playing it with no target sacrifices nothing', () => {
    const g = stage(0);
    const ally = body(g, 0, 'B', 5);
    play(g, 0, 'the-bottomless', { row: 'F' });
    expect(powerOf(g, ally)).toBe(5);
    expect(unitOf(g, 0, 'the-bottomless').power).toBe(4);
  });
  it('inv5 the-bottomless edge: with no other allied unit there is no target and it plays as a 4-power unit', () => {
    const g = stage(0);
    body(g, 1, 'F', 5);
    expect(specOf(g, 0, 'the-bottomless').kind).toBe('none');
    play(g, 0, 'the-bottomless', { row: 'F' });
    expect(shape(g.players[0].units)).toEqual(['The Bottomless 4 F']);
  });
};
behaviours['gulletmaw'] = () => drain('gulletmaw', 5, 4);

// ---------------------------------------------------------------- Order
behaviours['conscript'] = () => {
  it('inv5 conscript: Rally 1, other units already in this row gain 1; the other row, the enemy and itself do not', () => {
    const g = stage(0);
    const front = body(g, 0, 'F', 4);
    const back = body(g, 0, 'B', 4);
    const enemy = body(g, 1, 'F', 4);
    const ev = play(g, 0, 'conscript', { row: 'F' });
    expect([front, back, enemy].map(u => powerOf(g, u))).toEqual([5, 4, 4]);
    expect(unitOf(g, 0, 'conscript').power).toBe(3);
    expect(ev).toContainEqual({ t: 'boost', uid: front.uid, n: 1, src: 'rally', power: 5 });
  });
  it('inv5 conscript edge: played into an empty row it boosts nothing', () => {
    const g = stage(0);
    const back = body(g, 0, 'B', 4);
    play(g, 0, 'conscript', { row: 'F' });
    expect(powerOf(g, back)).toBe(4);
    expect(unitOf(g, 0, 'conscript').power).toBe(3);
  });
};
behaviours['war-drummer'] = () => allBoost('war-drummer', 1, 1);
behaviours['drill-sergeant'] = () => {
  it('inv5 drill-sergeant: Echo 2 summons a 2-power Recruit in the other row', () => {
    const g = stage(0);
    play(g, 0, 'drill-sergeant', { row: 'F' });
    expect(shape(g.players[0].units)).toEqual(['Drill Sergeant 3 F', 'Recruit 2 B']);
    expect(g.players[0].units.filter(u => u.token).map(u => u.name)).toEqual(['Recruit']);
  });
  echoToken('drill-sergeant', 2, 'Recruit', 3);
};
behaviours['gate-warden'] = () => {
  it('inv5 gate-warden: Guard in the Front row hides the Back row from enemy targeting', () => {
    const g = stage(0);
    const back = body(g, 0, 'B', 5);
    play(g, 0, 'gate-warden', { row: 'F' });
    const ward = unitOf(g, 0, 'gate-warden');
    const pool = poolOf(targetSpecFor(g, 1, 'burn:2'));
    expect(pool).toEqual([ward.uid]);
    expect(pool).not.toContain(back.uid);
  });
  it('inv5 gate-warden edge: in the Back row its Guard hides nothing', () => {
    const g = stage(0);
    const front = body(g, 0, 'F', 5);
    play(g, 0, 'gate-warden', { row: 'B' });
    expect(poolOf(targetSpecFor(g, 1, 'burn:2'))).toHaveLength(2);
    expect(targetable(g.players[0])).toContain(front);
  });
  lastWordsToken('gate-warden', 'Recruit', 3);
};
behaviours['arbalest-line'] = () => {
  it('inv5 arbalest-line: Deploy burns 1 to every enemy unit in the chosen row only', () => {
    const g = stage(0);
    const f1 = body(g, 1, 'F', 5);
    const f2 = body(g, 1, 'F', 3);
    const b1 = body(g, 1, 'B', 4);
    expect(specOf(g, 0, 'arbalest-line').kind).toBe('row');
    play(g, 0, 'arbalest-line', { row: 'B', targetRow: 'F' });
    expect([f1, f2, b1].map(u => powerOf(g, u))).toEqual([4, 2, 4]);
  });
  it('inv5 arbalest-line edge: a 1-power unit is destroyed, a Shielded one only loses its Shield', () => {
    const g = stage(0);
    const weak = body(g, 1, 'F', 1);
    const warded = body(g, 1, 'F', 6, { shield: true });
    play(g, 0, 'arbalest-line', { row: 'B', targetRow: 'F' });
    expect(find(g, weak.uid)).toBeUndefined();
    expect(find(g, warded.uid)).toMatchObject({ power: 6, shield: false });
  });
  it('inv5 arbalest-line edge: with enemy units on the board a row must be chosen; with none it needs no choice', () => {
    const g = stage(0);
    body(g, 1, 'F', 5);
    expect(tryPlay(g, 0, 'arbalest-line', { row: 'B' })).toHaveProperty('error');
    const h = stage(0);
    expect(specOf(h, 0, 'arbalest-line').kind).toBe('none');
    play(h, 0, 'arbalest-line', { row: 'B' });
    expect(shape(h.players[0].units)).toEqual(['Arbalest Line 4 B']);
  });
};
behaviours['tower-warden'] = () => {
  it('inv5 tower-warden: Guard in the Front row hides the Back row from enemy targeting', () => {
    const g = stage(0);
    const back = body(g, 0, 'B', 5);
    play(g, 0, 'tower-warden', { row: 'F' });
    const pool = poolOf(targetSpecFor(g, 1, 'burn:2'));
    expect(pool).toEqual([unitOf(g, 0, 'tower-warden').uid]);
    expect(pool).not.toContain(back.uid);
  });
  it('inv5 tower-warden edge: in the Back row its Guard protects nothing', () => {
    const g = stage(0);
    body(g, 0, 'F', 5);
    play(g, 0, 'tower-warden', { row: 'B' });
    expect(poolOf(targetSpecFor(g, 1, 'burn:2'))).toHaveLength(2);
  });
};
behaviours['bastion'] = () => {
  it('inv5 bastion: gives Shield to up to 3 allied units; a fourth stays unshielded', () => {
    const g = stage(0);
    const [a, b, c, d] = [body(g, 0, 'F', 4), body(g, 0, 'F', 4), body(g, 0, 'B', 4), body(g, 0, 'B', 4)];
    play(g, 0, 'bastion', { targets: [a, b, c] });
    expect([a, b, c, d].map(u => find(g, u.uid)?.shield)).toEqual([true, true, true, false]);
    expect(discardIds(g, 0)).toContain('bastion');
    expect(g.players[0].units).toHaveLength(4);
  });
  it('inv5 bastion edge: 4 targets are rejected; units that already have Shield are not offered', () => {
    const g = stage(0);
    const units = [1, 2, 3, 4].map(() => body(g, 0, 'F', 4));
    expect(tryPlay(g, 0, 'bastion', { targets: units })).toHaveProperty('error');
    const h = stage(0);
    const plain = body(h, 0, 'F', 4);
    body(h, 0, 'F', 4, { shield: true });
    expect(poolOf(specOf(h, 0, 'bastion'))).toEqual([plain.uid]);
  });
  it('inv5 bastion edge: with no allied unit (or all already Shielded) it has no target and still plays', () => {
    const g = stage(0);
    expect(specOf(g, 0, 'bastion').kind).toBe('none');
    play(g, 0, 'bastion');
    expect(discardIds(g, 0)).toContain('bastion');
    const h = stage(0);
    body(h, 0, 'F', 4, { shield: true });
    expect(specOf(h, 0, 'bastion').kind).toBe('none');
  });
};
behaviours['bellwarden'] = () => allBoost('bellwarden', 2, 1);
behaviours['brannoc'] = () => {
  it('inv5 brannoc: Shield, and Deploy Duels an enemy unit with 5 or less power, Brannoc striking first', () => {
    const g = stage(0);
    const foe = body(g, 1, 'F', 4);
    const ev = play(g, 0, 'brannoc', { row: 'F', targets: [foe] });
    expect(find(g, foe.uid)).toBeUndefined();
    expect(unitOf(g, 0, 'brannoc')).toMatchObject({ power: 5, shield: true });
    expect(ev.some(e => e.t === 'duel')).toBe(true);
  });
  it('inv5 brannoc edge: an enemy with 6 power is not a legal Duel target', () => {
    const g = stage(0);
    const five = body(g, 1, 'F', 5);
    const six = body(g, 1, 'B', 6);
    expect(poolOf(specOf(g, 0, 'brannoc'))).toEqual([five.uid]);
    expect(tryPlay(g, 0, 'brannoc', { row: 'F', targets: [six] })).toHaveProperty('error');
  });
  it('inv5 brannoc edge: against a Shielded 5-power enemy its own Shield eats the counter-blow and it keeps its full power', () => {
    const g = stage(0);
    const foe = body(g, 1, 'F', 5, { shield: true });
    play(g, 0, 'brannoc', { row: 'F', targets: [foe] });
    expect(find(g, foe.uid)).toBeUndefined();
    expect(unitOf(g, 0, 'brannoc')).toMatchObject({ power: 5, shield: false });
  });
};

// ---------------------------------------------------------------- Ember
behaviours['spark-flinger'] = () => burnUpTo3('spark-flinger', 1, {});
behaviours['cinder-reaper'] = () => {
  it('inv5 cinder-reaper: Deploy destroys an enemy unit with 3 or less power, Shield or not', () => {
    const g = stage(0);
    const warded = body(g, 1, 'F', 3, { shield: true });
    const other = body(g, 1, 'F', 3);
    const ev = play(g, 0, 'cinder-reaper', { row: 'F', targets: [warded] });
    expect(find(g, warded.uid)).toBeUndefined();
    expect(powerOf(g, other)).toBe(3);
    expect(ev).toContainEqual({ t: 'destroy', uid: warded.uid });
    expect(discardIds(g, 1)).toContain('sellsword');
  });
  it('inv5 cinder-reaper edge: a 4-power enemy is not a legal target; with only such enemies there is no target', () => {
    const g = stage(0);
    const four = body(g, 1, 'F', 4);
    expect(specOf(g, 0, 'cinder-reaper').kind).toBe('none');
    play(g, 0, 'cinder-reaper', { row: 'F' });
    expect(powerOf(g, four)).toBe(4);
  });
};
behaviours['torchbearer'] = () => {
  burnUpTo3('torchbearer', 1, { resolve: true });
  it('inv5 torchbearer edge: before the opponent passes it is a plain 5-power unit that needs no target and burns nothing', () => {
    const g = stage(0);
    const foe = body(g, 1, 'F', 6);
    expect(specOf(g, 0, 'torchbearer').kind).toBe('none');
    const ev = play(g, 0, 'torchbearer', { row: 'F' });
    expect(powerOf(g, foe)).toBe(6);
    expect(ev.some(e => e.t === 'resolve')).toBe(false);
  });
};
behaviours['furnace-brute'] = () => {
  it('inv5 furnace-brute: Deploy makes your other units lose 1; the Brute itself and the enemy do not', () => {
    const g = stage(0);
    const a = body(g, 0, 'F', 4);
    const b = body(g, 0, 'B', 3);
    const e = body(g, 1, 'F', 4);
    play(g, 0, 'furnace-brute', { row: 'F' });
    expect([a, b, e].map(u => powerOf(g, u))).toEqual([3, 2, 4]);
    expect(unitOf(g, 0, 'furnace-brute').power).toBe(8);
  });
  it('inv5 furnace-brute edge: a 1-power ally is destroyed and goes to your discard pile', () => {
    const g = stage(0);
    const doomed = put(g, 0, 'ember-sprite', 'B'); // 1 power
    play(g, 0, 'furnace-brute', { row: 'F' });
    expect(find(g, doomed.uid)).toBeUndefined();
    expect(discardIds(g, 0)).toContain('ember-sprite');
  });
};
behaviours['ash-lancer'] = () => {
  it('inv5 ash-lancer: Deploy burns 2 to the strongest enemy unit only', () => {
    const g = stage(0);
    const weak = body(g, 1, 'F', 5);
    const strong = body(g, 1, 'F', 7);
    play(g, 0, 'ash-lancer', { row: 'F' });
    expect([weak, strong].map(u => powerOf(g, u))).toEqual([5, 5]);
  });
  it('inv5 ash-lancer edge: with two tied strongest units exactly one of them is burned', () => {
    const g = stage(0);
    const a = body(g, 1, 'F', 6);
    const b = body(g, 1, 'B', 6);
    play(g, 0, 'ash-lancer', { row: 'F' });
    expect([a, b].map(u => powerOf(g, u)).sort()).toEqual([4, 6]);
  });
  it('inv5 ash-lancer edge: with no enemy unit it plays and nothing happens', () => {
    const g = stage(0);
    expect(specOf(g, 0, 'ash-lancer').kind).toBe('none');
    play(g, 0, 'ash-lancer', { row: 'F' });
    expect(shape(g.players[0].units)).toEqual(['Ash Lancer 4 F']);
  });
};
behaviours['ember-storm'] = () => burnUpTo3('ember-storm', 2, { special: true });
behaviours['ember-wraith'] = () => {
  it('inv5 ember-wraith: Last Words burn 4 to a random enemy unit (here the only one)', () => {
    const g = stage(1);
    const victim = put(g, 0, 'ember-wraith', 'B');
    const foe = body(g, 1, 'F', 6);
    killWithFireball(g, victim);
    expect(powerOf(g, foe)).toBe(2);
    expect(discardIds(g, 0)).toContain('ember-wraith');
  });
  it('inv5 ember-wraith edge: with two enemy units exactly one of them takes the 4', () => {
    const g = stage(1);
    const victim = put(g, 0, 'ember-wraith', 'B');
    const a = body(g, 1, 'F', 6);
    const b = body(g, 1, 'B', 7);
    killWithFireball(g, victim);
    const after = [a, b].map(u => powerOf(g, u) ?? 0);
    expect(after[0] + after[1]).toBe(13 - 4);
    expect(after.filter(p => p === 6 || p === 7)).toHaveLength(1);
  });
  it('inv5 ember-wraith edge: with no enemy unit to burn, dying does nothing', () => {
    const g = stage(1);
    const victim = put(g, 0, 'ember-wraith', 'B');
    killWithFireball(g, victim);
    expect(g.players[1].units).toEqual([]);
    expect(g.players[0].units).toEqual([]);
  });
};
behaviours['sulka'] = () => {
  it('inv5 sulka: Deploy makes every enemy unit with 3 or less power lose 3; stronger units are untouched', () => {
    const g = stage(0);
    const two = body(g, 1, 'F', 2);
    const three = body(g, 1, 'B', 3);
    const four = body(g, 1, 'F', 4);
    const five = body(g, 1, 'B', 5);
    play(g, 0, 'sulka', { row: 'B' });
    expect([two, three, four, five].map(u => powerOf(g, u))).toEqual([undefined, undefined, 4, 5]);
    expect(discardIds(g, 1).filter(x => x === 'sellsword')).toHaveLength(2);
  });
  it('inv5 sulka edge: "every" units get through Guard, and a Shield only blocks the loss', () => {
    const g = stage(0);
    put(g, 1, 'pikeman', 'F'); // Guard, 4 power: hides the Back row from targeting but not from "every"
    const hidden = body(g, 1, 'B', 3);
    const warded = body(g, 1, 'B', 3, { shield: true });
    play(g, 0, 'sulka', { row: 'B' });
    expect(find(g, hidden.uid)).toBeUndefined();
    expect(find(g, warded.uid)).toMatchObject({ power: 3, shield: false });
  });
};

// ---------------------------------------------------------------- Echo
behaviours['mirror-mote'] = () => {
  it('inv5 mirror-mote: Deploy summons an Echo with the chosen ally\'s power in that ally\'s other row', () => {
    const g = stage(0);
    const ally = put(g, 0, 'bog-brute', 'F'); // 4 power: the cap itself
    play(g, 0, 'mirror-mote', { row: 'B', targets: [ally] });
    expect(shape(g.players[0].units)).toEqual(['Bog Brute 4 F', 'Echo 4 B', 'Mirror Mote 2 B']);
    expect(g.players[0].units.filter(u => u.token)).toHaveLength(1);
  });
  it('inv5 mirror-mote edge: an ally with 5 power is not a legal choice; with only such allies there is no target and no Echo', () => {
    const g = stage(0);
    const big = body(g, 0, 'F', 5);
    expect(poolOf(specOf(g, 0, 'mirror-mote'))).not.toContain(big.uid);
    expect(specOf(g, 0, 'mirror-mote').kind).toBe('none');
    play(g, 0, 'mirror-mote', { row: 'B' });
    expect(g.players[0].units.filter(u => u.token)).toEqual([]);
  });
};
behaviours['reroute'] = () => {
  it('inv5 reroute: moves an enemy unit to its other row and it loses 3', () => {
    const g = stage(0);
    const foe = body(g, 1, 'F', 5);
    const ev = play(g, 0, 'reroute', { targets: [foe] });
    expect(find(g, foe.uid)).toMatchObject({ row: 'B', power: 2 });
    expect(ev).toContainEqual({ t: 'move', uid: foe.uid, row: 'B' });
    expect(discardIds(g, 0)).toContain('reroute');
  });
  it('inv5 reroute edge: a 3-power unit is moved and destroyed by the loss', () => {
    const g = stage(0);
    const foe = body(g, 1, 'F', 3);
    play(g, 0, 'reroute', { targets: [foe] });
    expect(find(g, foe.uid)).toBeUndefined();
  });
  it('inv5 reroute edge: with no enemy unit there is no target and the card is spent with no effect', () => {
    const g = stage(0);
    expect(specOf(g, 0, 'reroute').kind).toBe('none');
    play(g, 0, 'reroute');
    expect(discardIds(g, 0)).toContain('reroute');
  });
};
behaviours['decoy-drone'] = () => {
  it('inv5 decoy-drone: Guard hides the Back row, and Echo 2 summons a 2-power token in the other row', () => {
    const g = stage(0);
    const back = body(g, 0, 'B', 5);
    play(g, 0, 'decoy-drone', { row: 'F' });
    const drone = unitOf(g, 0, 'decoy-drone');
    const echo = g.players[0].units.find(u => u.token);
    expect(echo).toMatchObject({ name: 'Echo', power: 2, row: 'B' });
    expect(poolOf(targetSpecFor(g, 1, 'burn:2'))).toEqual([drone.uid]);
    expect(poolOf(targetSpecFor(g, 1, 'burn:2'))).not.toContain(back.uid);
  });
  echoToken('decoy-drone', 2, 'Echo', 2);
};
behaviours['fork-runner'] = () => {
  it('inv5 fork-runner: Echo 3 summons a 3-power token in the other row', () => {
    const g = stage(0);
    play(g, 0, 'fork-runner', { row: 'F' });
    expect(shape(g.players[0].units)).toEqual(['Echo 3 B', 'Fork Runner 4 F']);
    expect(g.players[0].units.filter(u => u.token)).toHaveLength(1);
  });
  echoToken('fork-runner', 3, 'Echo', 4);
};
behaviours['looking-glass'] = () => {
  it('inv5 looking-glass: Deploy makes this become the power of a chosen enemy unit that has more', () => {
    const g = stage(0);
    const foe = body(g, 1, 'F', 8);
    play(g, 0, 'looking-glass', { row: 'F', targets: [foe] });
    expect(unitOf(g, 0, 'looking-glass').power).toBe(8);
    expect(powerOf(g, foe)).toBe(8);
  });
  it('inv5 looking-glass edge: an enemy with equal power changes nothing (this never goes down)', () => {
    const g = stage(0);
    const foe = body(g, 1, 'F', 1);
    play(g, 0, 'looking-glass', { row: 'F', targets: [foe] });
    expect(unitOf(g, 0, 'looking-glass').power).toBe(1);
  });
  it('inv5 looking-glass edge: with no enemy unit there is no target and it is a 1-power unit', () => {
    const g = stage(0);
    expect(specOf(g, 0, 'looking-glass').kind).toBe('none');
    play(g, 0, 'looking-glass', { row: 'F' });
    expect(shape(g.players[0].units)).toEqual(['Looking Glass 1 F']);
  });
};
behaviours['echo-lens'] = () => {
  it('inv5 echo-lens: Deploy summons an Echo with your strongest unit\'s power in that unit\'s other row', () => {
    const g = stage(0);
    body(g, 0, 'F', 6);
    play(g, 0, 'echo-lens', { row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Echo 6 B', 'Echo Lens 3 B', 'Sellsword 6 F']);
  });
  it('inv5 echo-lens edge: "this one counts": when the Lens is the strongest, the Echo copies it into its other row', () => {
    const g = stage(0);
    body(g, 0, 'F', 2);
    play(g, 0, 'echo-lens', { row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Echo 3 F', 'Echo Lens 3 B', 'Sellsword 2 F']);
  });
  it('inv5 echo-lens edge: on a tie the unit that reached the board first is copied, not the Lens', () => {
    const g = stage(0);
    body(g, 0, 'F', 3); // arrived first, ties with the Lens
    play(g, 0, 'echo-lens', { row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Echo 3 B', 'Echo Lens 3 B', 'Sellsword 3 F']);
  });
  it('inv5 echo-lens edge: if the strongest unit\'s other row is full, no Echo is summoned', () => {
    const g = stage(0);
    body(g, 0, 'F', 6); // the strongest unit, in the Front row
    fill(g, 0, 'B', RULES.ROW_MAX - 1); // the Lens fills the Back row to 6
    play(g, 0, 'echo-lens', { row: 'B' });
    expect(rowUnits(g.players[0], 'B')).toHaveLength(RULES.ROW_MAX);
    expect(g.players[0].units.filter(u => u.token)).toEqual([]);
    expect(unitOf(g, 0, 'echo-lens').power).toBe(3);
  });
};
behaviours['signal-tower'] = () => {
  it('inv5 signal-tower: Resolve (opponent passed) summons a 4-power Echo in the other row', () => {
    const g = stage(0);
    g.players[1].passed = true;
    const ev = play(g, 0, 'signal-tower', { row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Echo 4 F', 'Signal Tower 5 B']);
    expect(ev).toContainEqual({ t: 'resolve', p: 0, cardId: 'signal-tower' });
  });
  it('inv5 signal-tower edge: before the opponent passes it is a plain 5-power unit with no Echo', () => {
    const g = stage(0);
    play(g, 0, 'signal-tower', { row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Signal Tower 5 B']);
  });
  it('inv5 signal-tower edge: Resolve with the other row full still lands the unit and summons no Echo', () => {
    const g = stage(0);
    g.players[1].passed = true;
    fill(g, 0, 'F', RULES.ROW_MAX);
    play(g, 0, 'signal-tower', { row: 'B' });
    expect(g.players[0].units.filter(u => u.token)).toEqual([]);
    expect(unitOf(g, 0, 'signal-tower').power).toBe(5);
  });
};
behaviours['amplify'] = () => {
  it('inv5 amplify: your tokens gain 2; your other units and the enemy\'s tokens do not', () => {
    const g = stage(0);
    const mine = token(g, 0, 'Echo', 3, 'F');
    const spark = token(g, 0, 'Spark', 2, 'B');
    const plain = body(g, 0, 'F', 4);
    const theirs = token(g, 1, 'Echo', 3, 'F');
    play(g, 0, 'amplify');
    expect([mine, spark, plain, theirs].map(u => powerOf(g, u))).toEqual([5, 4, 4, 3]);
    expect(discardIds(g, 0)).toContain('amplify');
  });
  it('inv5 amplify edge: with no tokens on your side nothing changes', () => {
    const g = stage(0);
    const plain = body(g, 0, 'F', 4);
    const theirs = token(g, 1, 'Echo', 3, 'F');
    play(g, 0, 'amplify');
    expect([plain, theirs].map(u => powerOf(g, u))).toEqual([4, 3]);
  });
};
behaviours['facet-queen'] = () => {
  it('inv5 facet-queen: Deploy summons an Echo with the chosen ally\'s power (10 or less) in that ally\'s other row', () => {
    const g = stage(0);
    const ally = body(g, 0, 'F', 10);
    play(g, 0, 'facet-queen', { row: 'B', targets: [ally] });
    expect(shape(g.players[0].units)).toEqual(['Echo 10 B', 'Facet Queen 4 B', 'Sellsword 10 F']);
  });
  it('inv5 facet-queen edge: an ally with 11 power is not a legal choice', () => {
    const g = stage(0);
    const huge = body(g, 0, 'F', 11);
    const ok = body(g, 0, 'B', 9);
    expect(poolOf(specOf(g, 0, 'facet-queen'))).toEqual([ok.uid]);
    expect(tryPlay(g, 0, 'facet-queen', { row: 'B', targets: [huge] })).toHaveProperty('error');
  });
  it('inv5 facet-queen edge: with no other allied unit it cannot copy itself: no target, no Echo', () => {
    const g = stage(0);
    expect(specOf(g, 0, 'facet-queen').kind).toBe('none');
    play(g, 0, 'facet-queen', { row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Facet Queen 4 B']);
  });
};

// ---------------------------------------------------------------- Neutral
/** rowburn:N, for Rockslide (special, N=2). */
behaviours['rockslide'] = () => {
  it('inv5 rockslide: burns 2 to every enemy unit in the chosen row only', () => {
    const g = stage(0);
    const f1 = body(g, 1, 'F', 5);
    const f2 = body(g, 1, 'F', 3);
    const b1 = body(g, 1, 'B', 4);
    expect(specOf(g, 0, 'rockslide').kind).toBe('row');
    play(g, 0, 'rockslide', { targetRow: 'B' });
    expect([f1, f2, b1].map(u => powerOf(g, u))).toEqual([5, 3, 2]);
    expect(discardIds(g, 0)).toContain('rockslide');
  });
  it('inv5 rockslide edge: a 2-power unit is destroyed, a Shielded one only loses its Shield', () => {
    const g = stage(0);
    const weak = body(g, 1, 'F', 2);
    const warded = body(g, 1, 'F', 6, { shield: true });
    play(g, 0, 'rockslide', { targetRow: 'F' });
    expect(find(g, weak.uid)).toBeUndefined();
    expect(find(g, warded.uid)).toMatchObject({ power: 6, shield: false });
  });
  it('inv5 rockslide edge: with no enemy unit there is no row to choose and the card still plays', () => {
    const g = stage(0);
    expect(specOf(g, 0, 'rockslide').kind).toBe('none');
    play(g, 0, 'rockslide');
    expect(discardIds(g, 0)).toContain('rockslide');
  });
};
behaviours['executioner'] = () => {
  it('inv5 executioner: Deploy destroys an enemy unit with 4 or less power, Shield or not', () => {
    const g = stage(0);
    const warded = body(g, 1, 'F', 4, { shield: true });
    play(g, 0, 'executioner', { row: 'F', targets: [warded] });
    expect(find(g, warded.uid)).toBeUndefined();
    expect(discardIds(g, 1)).toContain('sellsword');
  });
  it('inv5 executioner edge: a 5-power enemy is not a legal target; with only such enemies there is no target', () => {
    const g = stage(0);
    const five = body(g, 1, 'F', 5);
    expect(specOf(g, 0, 'executioner').kind).toBe('none');
    play(g, 0, 'executioner', { row: 'F' });
    expect(powerOf(g, five)).toBe(5);
  });
  it('inv5 executioner edge: the destroyed unit\'s Last Words fire for its owner', () => {
    const g = stage(0);
    const beetle = put(g, 1, 'husk-beetle', 'F');
    play(g, 0, 'executioner', { row: 'F', targets: [beetle] });
    expect(shape(g.players[1].units)).toEqual(['Husk 3 F']);
  });
};
behaviours['lamplighter'] = () => {
  it('inv5 lamplighter: Resolve (opponent passed) boosts another allied unit by 4', () => {
    const g = stage(0);
    g.players[1].passed = true;
    const ally = body(g, 0, 'F', 4);
    const ev = play(g, 0, 'lamplighter', { row: 'B', targets: [ally] });
    expect(powerOf(g, ally)).toBe(8);
    expect(unitOf(g, 0, 'lamplighter').power).toBe(3);
    expect(ev).toContainEqual({ t: 'resolve', p: 0, cardId: 'lamplighter' });
  });
  it('inv5 lamplighter edge: before the opponent passes it needs no target and boosts nothing', () => {
    const g = stage(0);
    const ally = body(g, 0, 'F', 4);
    expect(specOf(g, 0, 'lamplighter').kind).toBe('none');
    play(g, 0, 'lamplighter', { row: 'B' });
    expect(powerOf(g, ally)).toBe(4);
  });
  it('inv5 lamplighter edge: Resolve with no other allied unit has no target (it cannot boost itself)', () => {
    const g = stage(0);
    g.players[1].passed = true;
    expect(specOf(g, 0, 'lamplighter').kind).toBe('none');
    play(g, 0, 'lamplighter', { row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Lamplighter 3 B']);
  });
};
behaviours['tinker'] = () => {
  it('inv5 tinker: Deploy gives another allied unit Shield; Tinker itself gets none', () => {
    const g = stage(0);
    const ally = body(g, 0, 'F', 4);
    const ev = play(g, 0, 'tinker', { row: 'B', targets: [ally] });
    expect(find(g, ally.uid)?.shield).toBe(true);
    expect(unitOf(g, 0, 'tinker').shield).toBe(false);
    expect(ev).toContainEqual({ t: 'status', uid: ally.uid, s: 'shield' });
  });
  it('inv5 tinker edge: an ally that already has Shield is not offered; with no one to Shield it still plays', () => {
    const g = stage(0);
    body(g, 0, 'F', 4, { shield: true });
    expect(specOf(g, 0, 'tinker').kind).toBe('none');
    play(g, 0, 'tinker', { row: 'B' });
    expect(unitOf(g, 0, 'tinker').shield).toBe(false);
  });
};
behaviours['scrap-golem'] = () => lastWordsToken('scrap-golem', 'Scrap', 2);

// ---------------------------------------------------------------- invariant 2: no smuggled targets
// When a card's target spec is `none` (no legal target) the server must not accept a target uid anyway: the effects
// apply whatever uid they are handed. Seam: validate() in engine.ts only checks targets when the spec is `units`.
describe('inv2 a card with no legal target accepts no target', () => {
  it('inv2 baseline Azhar (Destroy 6 or less): a 9-power enemy cannot be destroyed by sending its uid when nothing is legal', () => {
    const g = stage(0);
    const big = body(g, 1, 'F', 9);
    expect(specOf(g, 0, 'azhar').kind).toBe('none');
    expect(tryPlay(g, 0, 'azhar', { row: 'F', targets: [big] })).toHaveProperty('error');
  });
  const smuggle: { id: string; row?: Row; setup: (g: GameState) => Unit }[] = [
    { id: 'cinder-reaper', row: 'F', setup: g => body(g, 1, 'F', 4) },
    { id: 'executioner', row: 'F', setup: g => body(g, 1, 'F', 5) },
    { id: 'brannoc', row: 'F', setup: g => body(g, 1, 'F', 6) },
    { id: 'marsh-lurker', row: 'F', setup: g => body(g, 1, 'F', 9) },
    { id: 'gulletmaw', row: 'F', setup: g => body(g, 1, 'F', 9) },
    { id: 'pit-maw', row: 'F', setup: g => body(g, 0, 'F', 5) },
    { id: 'gut-hag', row: 'F', setup: g => body(g, 0, 'F', 5) },
    { id: 'the-bottomless', row: 'F', setup: g => body(g, 1, 'F', 5) },
    { id: 'mirror-mote', row: 'B', setup: g => body(g, 0, 'F', 5) },
    { id: 'facet-queen', row: 'B', setup: g => body(g, 0, 'F', 11) },
    { id: 'bastion', setup: g => body(g, 1, 'F', 4) },
    { id: 'lamplighter', row: 'B', setup: g => { g.players[1].passed = true; return body(g, 1, 'F', 4); } },
  ];
  for (const c of smuggle) {
    it(`inv2 ${c.id}: with no legal target, a target uid in the action is rejected`, () => {
      const g = stage(0);
      const planted = c.setup(g);
      expect(specOf(g, 0, c.id).kind).toBe('none');
      expect(tryPlay(g, 0, c.id, { row: c.row, targets: [planted] })).toHaveProperty('error');
    });
  }
});

// ---------------------------------------------------------------- emit one describe per card
describe('AC1 wave-1 cards (cards-v2.md section 1)', () => {
  for (const s of W1) {
    describe(`${s.id} (${s.name})`, () => {
      it(`AC1 ${s.id}: exists with the spec's house, tier, kind, power and row rule`, () => {
        const d = card(s.id);
        expect({ id: d.id, name: d.name, house: d.house, tier: d.tier, kind: d.kind, power: d.power, rows: d.rows })
          .toEqual({ id: s.id, name: s.name, house: s.house, tier: s.tier, kind: s.kind, power: s.power, rows: s.rows });
        if (s.epithet) expect(d.epithet.toLowerCase()).toBe(s.epithet.toLowerCase());
      });
      it(`AC1 ${s.id}: statics and effect ids are the spec's`, () => {
        const d = card(s.id);
        expect({
          grow: !!d.grow, guard: !!d.guard, shield: !!d.shield, rally: d.rally, echo: d.echo, token: d.token,
          eff: d.eff, resolve: d.resolve, lastWords: d.lastWords,
        }).toEqual({
          grow: !!s.grow, guard: !!s.guard, shield: !!s.shield, rally: s.rally, echo: s.echo, token: s.token,
          eff: s.eff, resolve: s.resolve, lastWords: s.lastWords,
        });
      });
      it(`AC1 ${s.id}: rules text is the spec's exact sentence`, () => {
        expect(textOf(card(s.id))).toBe(norm(s.text));
      });
      if (s.kind === 'unit') {
        it(`AC1 ${s.id}: can be played in either row (the row is only a hint)`, () => {
          const g = stage(0);
          expect(legalRows(g, 0, card(s.id))).toEqual(['F', 'B']);
        });
      }
      const behaviour = behaviours[s.id];
      if (behaviour) behaviour();
    });
  }
});

// ================================================================ AC2: cultist:M:K
describe('AC2 cultist:M:K', () => {
  it('AC2 legacy cultist (Ash Cultist) is unchanged: Sacrifice a unit with 3 or less power, gain its power +2', () => {
    expect(card('ash-cultist').eff).toBe('cultist');
    const g = stage(0);
    const food = body(g, 0, 'F', 3);
    const ev = play(g, 0, 'ash-cultist', { row: 'B', targets: [food] });
    expect(unitOf(g, 0, 'ash-cultist').power).toBe(3 + 3 + 2);
    expect(find(g, food.uid)).toBeUndefined();
    expect(ev.some(e => e.t === 'sacrifice')).toBe(true);
  });
  it('AC2 legacy cultist offers no 4-power unit, while a cultist:4:3 card (Pit Maw) offers it', () => {
    const g = stage(0);
    const four = body(g, 0, 'F', 4);
    expect(poolOf(specOf(g, 0, 'ash-cultist'))).toEqual([]);
    expect(poolOf(specOf(g, 0, 'pit-maw'))).toEqual([four.uid]);
  });
  it('AC2 cultist:3:2 is exactly the legacy cultist (same targets, same outcome)', () => {
    const probe = 'zz-cultist-3-2-probe';
    CARDS[probe] = { ...card('ash-cultist'), id: probe, name: 'Probe', eff: 'cultist:3:2' };
    try {
      const board = (g: GameState) => ({ a: body(g, 0, 'F', 3), b: body(g, 0, 'B', 2), c: body(g, 0, 'F', 4) });
      const g1 = stage(0), g2 = stage(0);
      const x = board(g1), y = board(g2);
      expect(poolOf(specOf(g1, 0, 'ash-cultist'))).toEqual([x.a.uid, x.b.uid]);
      expect(poolOf(specOf(g2, 0, probe))).toEqual([y.a.uid, y.b.uid]);
      play(g1, 0, 'ash-cultist', { row: 'B', targets: [x.a] });
      play(g2, 0, probe, { row: 'B', targets: [y.a] });
      expect(g2.players[0].units.map(u => u.power).sort()).toEqual(g1.players[0].units.map(u => u.power).sort());
      expect(g2.players[0].units.map(u => u.power).sort()).toEqual([2, 4, 8]);
    } finally {
      delete CARDS[probe];
    }
  });
  it('AC2 M = any accepts any other allied unit, tokens included, whatever its power', () => {
    const g = stage(0);
    const huge = body(g, 0, 'F', 12);
    const tok = token(g, 0, 'Echo', 2, 'B');
    const spec = specOf(g, 0, 'the-bottomless');
    expect(spec.kind).toBe('units');
    expect(poolOf(spec).sort()).toEqual([huge.uid, tok.uid].sort());
    play(g, 0, 'the-bottomless', { row: 'F', targets: [tok] });
    expect(unitOf(g, 0, 'the-bottomless').power).toBe(4 + 2 + 3);
    expect(find(g, tok.uid)).toBeUndefined();
  });
  it('AC2 the Sacrificed unit\'s Last Words fire (M = any: The Bottomless eats a Husk Beetle)', () => {
    const g = stage(0);
    const beetle = put(g, 0, 'husk-beetle', 'B');
    play(g, 0, 'the-bottomless', { row: 'F', targets: [beetle] });
    expect(shape(g.players[0].units)).toEqual(['Husk 3 B', 'The Bottomless 10 F']);
    expect(discardIds(g, 0)).toContain('husk-beetle');
  });
  it('AC2 the Sacrificed unit\'s Last Words fire (M = 4: Pit Maw eats a Husk Beetle)', () => {
    const g = stage(0);
    const beetle = put(g, 0, 'husk-beetle', 'B');
    play(g, 0, 'pit-maw', { row: 'F', targets: [beetle] });
    expect(shape(g.players[0].units)).toEqual(['Husk 3 B', 'Pit Maw 8 F']);
  });
});

// ================================================================ AC1 pool: counts, uniqueness, IP
describe('AC1 pool', () => {
  const tiers: Tier[] = ['COMMON', 'RARE', 'LEGEND'];
  const W1_COUNTS: Record<CardHouse, Record<Tier, number>> = {
    COVEN: { COMMON: 5, RARE: 3, LEGEND: 2 },
    ORDER: { COMMON: 4, RARE: 3, LEGEND: 2 },
    EMBER: { COMMON: 5, RARE: 2, LEGEND: 1 },
    ECHO: { COMMON: 4, RARE: 4, LEGEND: 1 },
    NEUTRAL: { COMMON: 3, RARE: 2, LEGEND: 0 },
  };
  const POOL_TOTALS: Record<CardHouse, number> = { COVEN: 34, ORDER: 33, EMBER: 32, ECHO: 33, NEUTRAL: 17 };
  const added = () => Object.values(CARDS).filter(c => !BASELINE.has(c.id));

  it('AC1 pool: the baseline 108 cards are all still there', () => {
    expect([...BASELINE].filter(id => !CARDS[id])).toEqual([]);
  });
  it('AC1 pool: CARDS has exactly the 41 wave-1 cards on top of the 108 (149 in all)', () => {
    expect(added().map(c => c.id).sort()).toEqual([...W1_IDS].sort());
    expect(Object.keys(CARDS)).toHaveLength(149);
  });
  for (const h of ['COVEN', 'ORDER', 'EMBER', 'ECHO', 'NEUTRAL'] as CardHouse[]) {
    it(`AC1 pool: ${h} gains ${tiers.map(t => `${W1_COUNTS[h][t]} ${t}`).join(' / ')} and ends with ${POOL_TOTALS[h]} cards`, () => {
      const mine = added().filter(c => c.house === h);
      expect(Object.fromEntries(tiers.map(t => [t, mine.filter(c => c.tier === t).length]))).toEqual(W1_COUNTS[h]);
      expect(Object.values(CARDS).filter(c => c.house === h)).toHaveLength(POOL_TOTALS[h]);
    });
  }
  it('AC1 pool: the wave-1 table sums to 41 cards, 21 Common / 14 Rare / 6 Legend', () => {
    const w1 = Object.values(W1_COUNTS);
    const sum = (t: Tier) => w1.reduce((n, h) => n + h[t], 0);
    expect([sum('COMMON'), sum('RARE'), sum('LEGEND')]).toEqual([21, 14, 6]);
    expect(added()).toHaveLength(41);
  });
  it('AC1 pool: ids are unique (no card silently overwritten in cards.ts) and each key is its card\'s id', () => {
    const src = readFileSync(fileURLToPath(new URL('./cards.ts', import.meta.url)), 'utf8');
    const ids = [...src.matchAll(/\bid: '([a-z0-9-]+)'/g)].map(m => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids).toHaveLength(Object.keys(CARDS).length);
    expect(W1_IDS.filter(id => ids.filter(x => x === id).length !== 1), 'wave-1 ids that are not defined exactly once').toEqual([]);
    for (const [k, c] of Object.entries(CARDS)) expect(c.id, k).toBe(k);
  });
  it('AC1 pool: card names are unique across the whole pool', () => {
    const all = Object.values(CARDS).map(c => c.name.toLowerCase());
    expect(all.filter((n, i) => all.indexOf(n) !== i)).toEqual([]);
    expect(W1.filter(w => !all.includes(w.name.toLowerCase())).map(w => w.name), 'wave-1 names missing from the pool').toEqual([]);
  });
  it('AC1 pool: every wave-1 card can go in a deck of its house (Neutral in all four) and tier copy limits are the deck rules', () => {
    for (const s of W1) {
      const houses: House[] = s.house === 'NEUTRAL' ? ALL_HOUSES : [s.house as House];
      for (const h of houses) expect(deckPool(h), `${s.id} in ${h}`).toContain(s.id);
      for (const h of ALL_HOUSES.filter(x => x !== s.house && s.house !== 'NEUTRAL')) expect(deckPool(h), `${s.id} in ${h}`).not.toContain(s.id);
    }
  });
  it('AC1 pool: the never-ship list (research section 5): no Gwent/Witcher names, factions or original keyword names', () => {
    const bannedTerms = /gwent|witcher|nilfgaard|northern realms|scoia|skellige|syndicate|monsters/i;
    const bannedKeywords = /\b(bond|consume|thrive|berserk|resurrect|spying|resilience|deathwish|bleeding|scorch)\b/i;
    const bannedNames = new Set(['scorch', "commander's horn", 'tight bond', 'ghoul', 'geralt', 'yennefer', 'triss', 'ciri', 'dandelion', 'vesemir', 'roach',
      'biting frost', 'clear weather', 'impenetrable fog', 'torrential rain', 'skellige storm', 'decoy', 'mardroeme', 'emhyr', 'foltest', 'eredin',
      'cockatrice', 'nekker', 'harpy', 'griffin', 'fiend', 'leshen', 'kayran', 'ice giant', 'wyvern', 'gargoyle', 'botchling', 'vran', 'endrega',
      'foglet', 'cerys', 'letho', 'dijkstra', 'philippa', 'cahir', 'vilgefortz', 'zoltan', 'regis', 'olgierd', 'avallach']);
    for (const s of W1) {
      const d = card(s.id);
      const all = `${d.name} ${d.epithet} ${textOf(d)}`;
      expect(all, s.id).not.toMatch(bannedTerms);
      expect(`${d.name} ${textOf(d)}`, s.id).not.toMatch(bannedKeywords);
      expect(bannedNames.has(d.name.toLowerCase().replace(/^the /, '')), `${s.id} is named ${d.name}`).toBe(false);
    }
  });
  it('AC1 pool: wave 1 adds no keyword (no wave-2 keyword word in any wave-1 card text, invariant 5)', () => {
    const wave2Keywords = /\b(kinship|muster|devour|flourish|enrage|rekindle|infiltrate|endure|last light|damaged)\b/i;
    for (const s of W1) expect(textOf(card(s.id)), s.id).not.toMatch(wave2Keywords);
  });
  it('AC1 pool: README says 149 cards with the per-house split (spec section 5)', () => {
    const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
    expect(readme).toMatch(/149 cards[^\n]*Coven 34[^\n]*Order 33[^\n]*Ember 32[^\n]*Echo 33[^\n]*Neutral 17/);
  });
});

// ================================================================ fuzz
describe('fuzz with the wave-1 cards', () => {
  /** A random legal deck drawn only from wave-1 cards (the house's own plus Neutral), so every match leans on the new cards. */
  function w1Deck(h: House, rnd: () => number): string[] {
    const absent = W1_IDS.filter(id => !CARDS[id]);
    if (absent.length) throw new Error(`${absent.length} wave-1 cards are missing from CARDS, first: ${absent[0]}`);
    const pool = deckPool(h).filter(id => W1_IDS.includes(id));
    const out: string[] = [];
    for (let guard = 0; out.length < DECK_RULES.SIZE && guard < 5000; guard++) {
      const id = pool[Math.floor(rnd() * pool.length)];
      const trial = [...out, id];
      const tierOf = (x: string) => CARDS[x].tier;
      if (trial.filter(x => x === id).length > DECK_RULES.COPIES[tierOf(id)]) continue;
      if (trial.filter(x => tierOf(x) === 'LEGEND').length > DECK_RULES.MAX_LEGENDS) continue;
      if (trial.filter(x => tierOf(x) === 'RARE').length > DECK_RULES.MAX_RARES) continue;
      out.push(id);
    }
    const err = validateDeck(h, out);
    if (err) throw new Error(`w1Deck(${h}): ${err}`);
    return out;
  }

  function playW1Match(h0: House, h1: House, seed: number, first: PIdx, randomBots: boolean) {
    const rnd = mulberry(seed * 7 + 1);
    const decks: [string[], string[]] = [w1Deck(h0, rnd), w1Deck(h1, rnd)];
    const { state: g, events } = createGame({ houses: [h0, h1], seed, first, decks });
    const log: GEvent[] = [...events];
    const played = new Set<string>();
    for (let i = 0; i < 400 && !g.over; i++) {
      const p = g.current;
      let a: Action;
      if (randomBots) {
        const c = candidatePlays(g, p);
        a = rnd() < 0.12 || !c.length ? { type: 'pass' as const } : c[Math.floor(rnd() * c.length)];
      } else a = decide(g, p, rnd);
      const r = applyAction(g, p, a);
      if ('error' in r) throw new Error(`illegal ${JSON.stringify(a)}: ${r.error}`);
      for (const e of r.events) { log.push(e); if (e.t === 'play') played.add(e.cardId); }
      checkInvariants(g);
      for (const pl of g.players) for (const row of ['F', 'B'] as Row[]) {
        if (rowUnits(pl, row).length > RULES.ROW_MAX) throw new Error(`row ${row} over ${RULES.ROW_MAX}`);
      }
    }
    return { g, played, log };
  }

  it('fuzz: 300 matches with random legal wave-1 decks finish cleanly (invariants hold after every action) and play every wave-1 card', { timeout: 120_000 }, () => {
    const played = new Set<string>();
    for (let s = 0; s < 300; s++) {
      const seed = 120000 + s;
      const r = playW1Match(ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4], seed, (s % 2) as PIdx, s % 2 === 0);
      expect(r.g.over, `seed ${seed}`).toBe(true);
      for (const id of r.played) played.add(id);
    }
    expect(W1_IDS.filter(id => !played.has(id)), 'wave-1 cards never played in 300 matches').toEqual([]);
  });

  it('inv1 determinism: the same seed, decks and choices give the same events with the wave-1 cards', { timeout: 60_000 }, () => {
    for (let s = 0; s < 12; s++) {
      const seed = 130000 + s;
      const run = () => playW1Match(ALL_HOUSES[s % 4], ALL_HOUSES[(s + 1) % 4], seed, (s % 2) as PIdx, s % 3 !== 0).log;
      expect(JSON.stringify(run()), `seed ${seed}`).toBe(JSON.stringify(run()));
    }
  });
});
