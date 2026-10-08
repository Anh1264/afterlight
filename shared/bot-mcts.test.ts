import { describe, it, expect } from 'vitest';
import { ALL_HOUSES } from './cards';
import { Action, GameState, PIdx, applyAction, createGame, validate } from './engine';
import { decide } from './bot';
import { decideMcts, determinize, rootMoves, searchMcts } from './bot-mcts';
import { mulberry } from './sim';

const ids = (cs: { cardId: string }[]) => cs.map(c => c.cardId).sort();

function game(s: number): GameState {
  return createGame({ houses: [ALL_HOUSES[s % 4], ALL_HOUSES[(s + 1) % 4]], seed: s, first: (s % 2) as PIdx }).state;
}

describe('determinize', () => {
  it('keeps everything the bot can see and only reshuffles what it cannot', () => {
    const g = game(3);
    const s = determinize(g, 0, mulberry(1));
    expect(s.players[0].hand).toEqual(g.players[0].hand);
    expect(ids(s.players[0].deck)).toEqual(ids(g.players[0].deck));
    expect(s.players[1].hand.length).toBe(g.players[1].hand.length);
    expect(ids([...s.players[1].hand, ...s.players[1].deck])).toEqual(ids([...g.players[1].hand, ...g.players[1].deck]));
    expect(s.players.map(p => p.units)).toEqual(g.players.map(p => p.units));
    expect(g.players[1].hand).toEqual(game(3).players[1].hand); // the real state is untouched
  });

  it('samples different opponent hands rather than copying the real one', () => {
    const g = game(4);
    const real = ids(g.players[1].hand).join();
    const rnd = mulberry(2);
    let same = 0;
    for (let i = 0; i < 50; i++) if (ids(determinize(g, 0, rnd).players[1].hand).join() === real) same++;
    expect(same).toBeLessThan(5);
  });
});

describe('Level 2 search', () => {
  it('always offers pass and only legal root moves', () => {
    for (let s = 0; s < 8; s++) {
      const g = game(s);
      const moves = rootMoves(g, g.current, 6, mulberry(s));
      expect(moves[0]).toEqual({ type: 'pass' });
      for (const a of moves) expect(validate(g, g.current, a)).toBeNull();
    }
  });

  it('reports visit statistics that add up to the iteration budget', () => {
    const g = game(5);
    const { action, stats } = searchMcts(g, g.current, mulberry(9), { iterations: 30 });
    expect(stats.reduce((n, x) => n + x.visits, 0)).toBe(30);
    expect(validate(g, g.current, action)).toBeNull();
  });

  it('plays a full legal match against the Level 1 bot', { timeout: 60_000 }, () => {
    const g = game(6);
    const rnd = mulberry(6);
    for (let i = 0; i < 400 && !g.over; i++) {
      const p = g.current;
      const a: Action = p === 0 ? decideMcts(g, p, rnd, { iterations: 12 }) : decide(g, p, rnd);
      const r = applyAction(g, p, a);
      expect('error' in r ? r.error : null).toBeNull();
    }
    expect(g.over).toBe(true);
  });
});
