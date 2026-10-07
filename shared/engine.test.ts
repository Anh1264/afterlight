import { describe, it, expect } from 'vitest';
import { RULES, STARTERS, ALL_HOUSES, House, validateDeck } from './cards';
import { Action, GameState, PIdx, applyAction, createGame, targetSpecFor, totals, viewFor } from './engine';

function setup(h0: House, h1: House, hand0: string[], hand1: string[]): GameState {
  const { state: g } = createGame({ houses: [h0, h1], seed: 5, first: 0 });
  g.players[0].hand = hand0.map((c, i) => ({ uid: 'a' + i, cardId: c }));
  g.players[1].hand = hand1.map((c, i) => ({ uid: 'b' + i, cardId: c }));
  return g;
}
const act = (g: GameState, p: PIdx, a: Action) => { const r = applyAction(g, p, a); if ('error' in r) throw new Error(r.error); return r.events; };

describe('engine', () => {
  it('guard hides back row from targeted effects', () => {
    const g = setup('EMBER', 'ORDER', ['cinder-imp', 'pyre-hound', 'pyre-hound'], ['shieldbearer', 'chaplain', 'lancer']);
    act(g, 0, { type: 'play', uid: 'a1', row: 'F' });
    act(g, 1, { type: 'play', uid: 'b0', row: 'F' });
    act(g, 0, { type: 'play', uid: 'a2', row: 'F' });
    act(g, 1, { type: 'play', uid: 'b1', row: 'B', targets: ['b0'] });
    const spec = targetSpecFor(g, 0, 'burn2');
    expect(spec.kind).toBe('units');
    if (spec.kind !== 'units') throw new Error('expected a units target spec, got ' + spec.kind);
    expect(spec.pool).toEqual(['b0']);
  });

  it('round flow: a round ends once both players have passed', () => {
    const g = setup('EMBER', 'ECHO', ['vorok', 'pyre-hound'], ['patchwork', 'static-runner', 'glitch-rat']);
    act(g, 0, { type: 'play', uid: 'a1', row: 'F' });
    act(g, 1, { type: 'play', uid: 'b0', row: 'F' });
    act(g, 0, { type: 'pass' });
    // P1 continues alone; now player 0 passed
    act(g, 1, { type: 'play', uid: 'b1', row: 'F' });
    act(g, 1, { type: 'pass' });
    expect(g.round).toBe(2);
    expect(g.players[1].wins).toBe(1);
  });

  it('any unit can go in either row; new cards behave', () => {
    const g = setup('EMBER', 'COVEN', ['gorehorn', 'pyre-hound', 'ember-whelp'], ['grandmother-rot', 'thornling', 'hollow-bloom']);
    act(g, 0, { type: 'play', uid: 'a1', row: 'B' }); // Pyre Hound (printed Front) into Back
    expect(g.players[0].units[0].row).toBe('B');
    act(g, 1, { type: 'play', uid: 'b1', row: 'F' });
    act(g, 0, { type: 'play', uid: 'a2', row: 'B' }); // whelp B, spark F
    expect(g.players[0].units.some(u => u.token && u.name === 'Spark' && u.row === 'F')).toBe(true);
    act(g, 1, { type: 'play', uid: 'b0', row: 'B', targetRow: 'B' }); // rot poisons whelp(2) + hound(6? no, >4)
    const whelp = g.players[0].units.find(u => u.cardId === 'ember-whelp');
    expect(!whelp || whelp.poison || whelp.power < 2).toBe(true);
    const hound = g.players[0].units.find(u => u.cardId === 'pyre-hound');
    if (!hound) throw new Error('pyre-hound missing from board');
    expect(hound.poison).toBe(false);
    act(g, 0, { type: 'play', uid: 'a0', row: 'F' }); // gorehorn hits spark in front
    expect(g.players[0].units.some(u => u.name === 'Spark')).toBe(false);
  });

  it('duel: Aiden (Resolve) 9 vs Skarr 12 -> Skarr dies, Aiden ends at 6', () => {
    const g = setup('ECHO', 'EMBER', ['aiden', 'patchwork'], []);
    g.players[1].units.push({ uid: 'sk', cardId: 'skarr', name: 'Skarr', owner: 1, house: 'EMBER', power: 12, base: 6, row: 'F', grow: false, guard: false, shield: false, poison: false, token: false, silenced: false });
    g.players[1].passed = true;
    const ev = act(g, 0, { type: 'play', uid: 'a0', row: 'F', targets: ['sk'] });
    expect(ev.some(e => e.t === 'resolve')).toBe(true);
    expect(g.players[1].units.length).toBe(0);
    expect(g.players[0].units.find(u => u.cardId === 'aiden')?.power).toBe(6);
    expect(totals(g)).toEqual([6 + RULES.FIRST_LIGHT, 0]);
  });

  it('view redaction hides the opponent hand and deck', () => {
    const g = setup('COVEN', 'ORDER', ['thornling'], ['lancer']);
    const v = viewFor(g, 0);
    expect(v.players[0].hand && !v.players[1].hand).toBeTruthy();
    expect(JSON.stringify(v).includes('"deck"')).toBe(false);
  });

  it('starter decks are valid and an illegal deck is rejected', () => {
    for (const h of ALL_HOUSES) expect(validateDeck(h, STARTERS[h]), h).toBeNull();
    expect(validateDeck('COVEN', [...STARTERS.COVEN.slice(1), 'aiden'])).not.toBeNull();
  });

  it('Last Words: Phoenix Whelp dies to burn -> 5-power Phoenix token in same row', () => {
    const g = setup('EMBER', 'EMBER', ['phoenix-whelp', 'pyre-hound'], ['fireball', 'pyre-hound']);
    act(g, 0, { type: 'play', uid: 'a0', row: 'B' });
    const whelp = g.players[0].units[0].uid;
    const ev = act(g, 1, { type: 'play', uid: 'b0', targets: [whelp] });
    expect(ev.some(e => e.t === 'lastwords')).toBe(true);
    const ph = g.players[0].units.find(u => u.name === 'Phoenix');
    expect(ph?.power).toBe(5);
    expect(ph?.row).toBe('B');
  });

  it('Draw: Oracle Prime with Resolve draws 2', () => {
    const g = setup('ECHO', 'COVEN', ['oracle-prime', 'patchwork'], []);
    g.players[1].passed = true;
    const before = g.players[0].hand.length;
    act(g, 0, { type: 'play', uid: 'a0', row: 'F' });
    expect(g.players[0].hand.length).toBe(before - 1 + 2);
  });

  it('Execute ignores Shield', () => {
    const g = setup('EMBER', 'ORDER', ['azhar', 'pyre-hound'], ['shieldbearer', 'lancer']);
    act(g, 0, { type: 'play', uid: 'a1', row: 'F' });
    act(g, 1, { type: 'play', uid: 'b0', row: 'F' });
    act(g, 0, { type: 'play', uid: 'a0', row: 'F', targets: ['b0'] });
    expect(g.players[1].units.length).toBe(0);
  });
});
