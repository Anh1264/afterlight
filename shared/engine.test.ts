import assert from 'node:assert/strict';
import { CARDS } from './cards';
import { GameState, PIdx, applyAction, createGame, targetSpecFor, totals, viewFor } from './engine';

function setup(h0: any, h1: any, hand0: string[], hand1: string[]) {
  const { state: g } = createGame({ houses: [h0, h1], seed: 5, first: 0 });
  g.players[0].hand = hand0.map((c, i) => ({ uid: 'a' + i, cardId: c }));
  g.players[1].hand = hand1.map((c, i) => ({ uid: 'b' + i, cardId: c }));
  return g;
}
const act = (g: GameState, p: PIdx, a: any) => { const r = applyAction(g, p, a); if ('error' in r) throw new Error(r.error); return r.events; };

// Guard hides back row from targeted effects
{
  const g = setup('EMBER', 'ORDER', ['cinder-imp', 'pyre-hound', 'pyre-hound'], ['shieldbearer', 'chaplain', 'lancer']);
  act(g, 0, { type: 'play', uid: 'a1', row: 'F' });
  act(g, 1, { type: 'play', uid: 'b0', row: 'F' });
  act(g, 0, { type: 'play', uid: 'a2', row: 'F' });
  act(g, 1, { type: 'play', uid: 'b1', row: 'B', targets: ['b0'] });
  const spec = targetSpecFor(g, 0, 'burn2');
  assert.equal(spec.kind, 'units');
  assert.deepEqual((spec as any).pool, ['b0']);
  console.log('guard ok');
}
// Resolve fires only after opponent passed; Vorok Burn 8
{
  const g = setup('EMBER', 'ECHO', ['vorok', 'pyre-hound'], ['patchwork', 'static-runner', 'glitch-rat']);
  act(g, 0, { type: 'play', uid: 'a1', row: 'F' });
  act(g, 1, { type: 'play', uid: 'b0', row: 'F' });
  act(g, 0, { type: 'pass' });
  // P1 continues alone; now player 0 passed
  act(g, 1, { type: 'play', uid: 'b1', row: 'F' });
  act(g, 1, { type: 'pass' });
  assert.equal(g.round, 2);
  assert.equal(g.players[1].wins, 1);
  console.log('round flow ok', g.results);
}
{
  const g = setup('EMBER', 'ECHO', ['vorok', 'pyre-hound'], ['patchwork', 'static-runner']);
  act(g, 0, { type: 'play', uid: 'a1', row: 'F' });
  act(g, 1, { type: 'play', uid: 'b0', row: 'F' });
  act(g, 0, { type: 'pass' });
  act(g, 1, { type: 'pass' }); // round 1 ends 7 vs 6 -> p0 wins (first light)
  assert.equal(g.results[0].winner, 0);
  assert.equal(g.current, 0);
  // round 2: p1 plays then passes; p0 Vorok Resolve
  g.players[1].hand.push({ uid: 'b9', cardId: 'lancer' });
  act(g, 0, { type: 'play', uid: g.players[0].hand.find(c => c.cardId === 'pyre-hound')?.uid ?? 'x', row: 'F' }).length;
}
// Duel: Aiden (Resolve) 9 vs Skarr 12 -> Skarr dies, Aiden ends at 6
{
  const g = setup('ECHO', 'EMBER', ['aiden', 'patchwork'], []);
  g.players[1].units.push({ uid: 'sk', cardId: 'skarr', name: 'Skarr', owner: 1, house: 'EMBER', power: 12, base: 6, row: 'F', grow: false, guard: false, shield: false, poison: false, token: false, silenced: false });
  g.players[1].passed = true;
  const ev = act(g, 0, { type: 'play', uid: 'a0', row: 'F', targets: ['sk'] });
  assert.ok(ev.some(e => e.t === 'resolve'));
  assert.equal(g.players[1].units.length, 0);
  assert.equal(g.players[0].units.find(u => u.cardId === 'aiden')?.power, 6);
  assert.deepEqual(totals(g), [7, 0]);
  console.log('duel ok');
}
// view redaction
{
  const g = setup('COVEN', 'ORDER', ['thornling'], ['lancer']);
  const v = viewFor(g, 0);
  assert.ok(v.players[0].hand && !v.players[1].hand);
  assert.equal(JSON.stringify(v).includes('"deck"'), false);
  console.log('view ok');
}
console.log('all tests passed');
