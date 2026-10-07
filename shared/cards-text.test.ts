import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARDS, keywordsOf } from './cards';
import { Action, CardInst, GameState, PIdx, Unit, applyAction, createGame, targetSpecFor } from './engine';

const textOf = (id: string) => CARDS[id].text.map(a => [a.kw, a.t].filter(Boolean).join(' ')).join(' ') || '—';

function setup(h0: CardInst[], h1: CardInst[]): GameState {
  const { state: g } = createGame({ houses: ['ECHO', 'EMBER'], seed: 5, first: 0 });
  g.players[0].hand = h0;
  g.players[1].hand = h1;
  return g;
}
const inst = (uid: string, cardId: string): CardInst => ({ uid, cardId });
const act = (g: GameState, p: PIdx, a: Action) => { const r = applyAction(g, p, a); if ('error' in r) throw new Error(r.error); };
const shape = (us: Unit[]) => us.map(u => `${u.name} ${u.power} ${u.row}`).sort();

describe('card text describes the engine (DM-3 c5)', () => {
  it('c5 Drake-07 engine: Back row gives two Echo 3 in Front', () => {
    const g = setup([inst('d', 'drake')], [inst('x', 'thornling')]);
    act(g, 0, { type: 'play', uid: 'd', row: 'B' });
    expect(shape(g.players[0].units)).toEqual(['Drake-07 3 B', 'Echo 3 F', 'Echo 3 F']);
  });

  it('c5 Drake-07 engine: Front row gives one Echo 3 in Back and one in Front', () => {
    const g = setup([inst('d', 'drake')], [inst('x', 'thornling')]);
    act(g, 0, { type: 'play', uid: 'd', row: 'F' });
    expect(shape(g.players[0].units)).toEqual(['Drake-07 3 F', 'Echo 3 B', 'Echo 3 F']);
  });

  it('c5 Drake-07 text says the Echo keyword summons in the other row', () => {
    expect(textOf('drake')).toMatch(/other row/);
  });

  it('c5 Lattice engine: every token on its owner\'s side gains 2, whatever its name; Lattice and enemy tokens do not', () => {
    const g = setup(
      [inst('r', 'glitch-rat'), inst('w', 'ember-whelp'), inst('l', 'lattice')],
      [inst('x', 'glitch-rat'), inst('y', 'thornling'), inst('z', 'thornling')],
    );
    act(g, 0, { type: 'play', uid: 'r', row: 'B' });
    act(g, 1, { type: 'play', uid: 'x', row: 'B' });
    act(g, 0, { type: 'play', uid: 'w', row: 'F' });
    act(g, 1, { type: 'play', uid: 'y', row: 'F' });
    act(g, 0, { type: 'play', uid: 'l', row: 'B' });
    const mine = g.players[0].units.filter(u => u.token).map(u => `${u.name} ${u.power}`).sort();
    expect(mine).toEqual(['Echo 5', 'Spark 4']);
    expect(g.players[0].units.find(u => u.name === 'Lattice')?.power).toBe(4);
    expect(g.players[1].units.filter(u => u.token).map(u => u.power)).toEqual([3]);
  });

  it('c5 Lattice text does not claim to affect only Echo tokens', () => {
    expect(textOf('lattice')).not.toMatch(/Echo tokens/);
  });
});

describe('card text describes the engine: Replicator, Afterimage, Wire Hound (DM-3 c5)', () => {
  it('c5 Replicator engine: targeting Shieldbearer summons a plain Echo 5 in its other row (no Guard, Shield or Grow)', () => {
    const g = setup([inst('s', 'shieldbearer'), inst('r', 'replicator')], [inst('x', 'thornling'), inst('y', 'thornling')]);
    act(g, 0, { type: 'play', uid: 's', row: 'F' });
    act(g, 1, { type: 'play', uid: 'x', row: 'F' });
    act(g, 0, { type: 'play', uid: 'r', row: 'F', targets: ['s'] });
    const echoes = g.players[0].units.filter(u => u.token);
    expect(echoes.map(u => `${u.name} ${u.power} ${u.row}`)).toEqual(['Echo 5 B']);
    expect(echoes.map(u => [u.guard, u.shield, u.grow])).toEqual([[false, false, false]]);
  });

  it('c5 Afterimage engine: Ser Halden as strongest unit gives a plain Echo 6 in Halden\'s other row', () => {
    const g = setup([inst('h', 'halden'), inst('a', 'afterimage')], [inst('x', 'thornling'), inst('y', 'thornling')]);
    act(g, 0, { type: 'play', uid: 'h', row: 'F' });
    act(g, 1, { type: 'play', uid: 'x', row: 'F' });
    act(g, 0, { type: 'play', uid: 'a' });
    const echoes = g.players[0].units.filter(u => u.token);
    expect(echoes.map(u => `${u.name} ${u.power} ${u.row}`)).toEqual(['Echo 6 B']);
    expect(echoes.map(u => [u.guard, u.shield, u.grow])).toEqual([[false, false, false]]);
  });

  it('c5 Afterimage engine: with no units on your side it summons nothing', () => {
    const g = setup([inst('a', 'afterimage')], [inst('x', 'thornling')]);
    act(g, 0, { type: 'play', uid: 'a' });
    expect(g.players[0].units).toEqual([]);
  });

  it('c5 Wire Hound engine: your own Spark gains 1; an enemy token and a non-token unit do not', () => {
    const g = setup(
      [inst('w', 'ember-whelp'), inst('t', 'bog-brute'), inst('h', 'wire-hound'), inst('k', 'thornling')],
      [inst('x', 'glitch-rat'), inst('y', 'thornling'), inst('z', 'thornling')],
    );
    act(g, 0, { type: 'play', uid: 'w', row: 'F' });
    act(g, 1, { type: 'play', uid: 'x', row: 'F' });
    act(g, 0, { type: 'play', uid: 't', row: 'B' });
    act(g, 1, { type: 'play', uid: 'y', row: 'B' });
    act(g, 0, { type: 'play', uid: 'h', row: 'F' });
    expect(g.players[0].units.map(u => `${u.name} ${u.power}`).sort()).toEqual(['Bog Brute 4', 'Ember Whelp 2', 'Spark 3', 'Wire Hound 5']);
    expect(g.players[1].units.filter(u => u.token).map(u => u.power)).toEqual([3]);
  });

  it('c5 Replicator text says it summons an Echo with its power, not a copy', () => {
    expect(textOf('replicator')).toMatch(/Summon an Echo with its power/);
    expect(textOf('replicator')).not.toMatch(/copy/i);
  });

  it('c5 Afterimage text says it summons an Echo with your strongest unit\'s power, not a copy', () => {
    expect(textOf('afterimage')).toMatch(/Summon an Echo with the power of your strongest unit/);
    expect(textOf('afterimage')).not.toMatch(/copy/i);
  });

  it('c5 Wire Hound text says your tokens gain 1, not only Echo tokens', () => {
    expect(textOf('wire-hound')).toMatch(/Your tokens gain 1\./);
    expect(textOf('wire-hound')).not.toMatch(/Echo tokens/);
  });
});

describe('keyword tooltips follow the text (DM-3 c5)', () => {
  // keywordsOf lives in shared/cards.ts, so it is tested directly (no React import).
  it('c5 Lattice and Wire Hound still get the Echo tooltip after their text stops saying "Echo tokens"', () => {
    for (const id of ['lattice', 'wire-hound']) {
      expect(keywordsOf(CARDS[id]).map(k => k.kw), id).toContain('Echo');
    }
  });
});

describe('README card tables match cards.ts (DM-3 c5)', () => {
  const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
  const byName = new Map(Object.values(CARDS).map(c => [c.name, c.id]));
  const rows = readme.split('\n')
    .filter(l => l.startsWith('| '))
    .map(l => l.slice(1, l.lastIndexOf('|')).split('|').map(c => c.trim()))
    .filter(c => c.length === 5)
    .map(c => ({ name: c[0].replace(/\s*\*\(.*\)\*$/, ''), cells: c }))
    .filter(r => byName.has(r.name));

  it('README lists every card exactly once', () => {
    expect(rows.map(r => r.name).sort()).toEqual([...byName.keys()].sort());
  });

  for (const r of rows) {
    const id = byName.get(r.name) ?? '';
    it(`README ability cell for ${r.name} equals the card text`, () => {
      expect(r.cells[4]).toBe(textOf(id));
    });
  }
});

describe('Replicator targeting prompt matches its card text (DM-3)', () => {
  it('P4 Replicator prompt says Choose an allied unit with 5 or less power to Echo', () => {
    const g = setup([inst('r', 'replicator')], [inst('x', 'thornling')]);
    g.players[0].units = [{
      uid: 'a0', cardId: 'bog-brute', name: 'Bog Brute', owner: 0, house: 'COVEN', power: 4, base: 4, row: 'F',
      grow: false, guard: false, shield: false, poison: false, token: false, silenced: false,
    }];
    const spec = targetSpecFor(g, 0, CARDS.replicator.eff);
    expect(spec.kind).toBe('units');
    const prompt = spec.kind === 'units' ? spec.prompt : '';
    expect(prompt).toBe('Choose an allied unit with 5 or less power to Echo');
    expect(prompt).not.toContain('Copy');
  });
});
