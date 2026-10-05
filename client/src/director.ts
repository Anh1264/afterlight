// Plays server event batches back as a timed sequence, so every Burn, Poison tick and Duel
// lands one beat at a time instead of the board snapping to the final state.
import { CARDS } from '../../shared/cards';
import type { GEvent, PIdx, PlayerView, Unit } from '../../shared/engine';
import type { GameMsg } from '../../shared/protocol';

export type FxKind =
  | 'burn' | 'poison' | 'duel' | 'lose' | 'self' | 'block' | 'grow' | 'rally' | 'boost' | 'sacrifice'
  | 'st-poison' | 'st-grow' | 'st-shield' | 'st-silence' | 'destroy' | 'summon' | 'steal' | 'move' | 'land';

export interface Fx { id: number; kind: FxKind; x: number; y: number; n?: number; house?: string }
export interface Banner { id: number; kind: 'resolve' | 'round' | 'roundEnd' | 'turn' | 'pass'; title: string; sub?: string; p?: PIdx; tone?: 'win' | 'lose' | 'tie' }
export interface Reveal { uid: string; cardId: string; p: PIdx; resolve: boolean }
export interface LogLine { id: number; p: PIdx | null; text: string }

export interface DirectorState {
  shown: PlayerView | null;
  fx: Fx[];
  banner: Banner | null;
  reveal: Reveal | null;
  pulses: Record<string, { kind: string; key: number; dx?: number; dy?: number }>;
  log: LogLine[];
  busy: boolean;
  deadline: number | null;
  shake: number;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let uidN = 1;

export class Director {
  s: DirectorState = { shown: null, fx: [], banner: null, reveal: null, pulses: {}, log: [], busy: false, deadline: null, shake: 0 };
  private q: GameMsg[] = [];
  private running = false;
  private subs = new Set<() => void>();
  lastSeq = 0;
  /** Set by the board: returns a unit's centre in stage coordinates. */
  locate: (uid: string) => { x: number; y: number } | null = () => null;
  rowLocate: (p: PIdx, row: 'F' | 'B') => { x: number; y: number } | null = () => null;

  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.s;
  private set(patch: Partial<DirectorState>) { this.s = { ...this.s, ...patch }; this.subs.forEach(f => f()); }

  reset() { this.q = []; this.lastSeq = 0; this.set({ shown: null, fx: [], banner: null, reveal: null, log: [], busy: false, deadline: null }); }

  push(m: GameMsg) {
    this.q.push(m);
    if (!this.running) void this.run();
  }

  private fx(kind: FxKind, uid: string | null, extra: Partial<Fx> = {}, at?: { x: number; y: number } | null) {
    const pos = at ?? (uid ? this.locate(uid) : null);
    if (!pos) return;
    const f: Fx = { id: uidN++, kind, x: pos.x, y: pos.y, ...extra };
    this.set({ fx: [...this.s.fx, f] });
    setTimeout(() => this.set({ fx: this.s.fx.filter(x => x.id !== f.id) }), 1600);
  }
  private pulse(uid: string, kind: string, extra: { dx?: number; dy?: number } = {}) {
    this.set({ pulses: { ...this.s.pulses, [uid]: { kind, key: uidN++, ...extra } } });
  }
  private logLine(p: PIdx | null, text: string) {
    this.set({ log: [...this.s.log.slice(-30), { id: uidN++, p, text }] });
  }

  private async run() {
    this.running = true;
    while (this.q.length) {
      const m = this.q.shift()!;
      const fast = this.q.length > 1 ? 0.3 : 1;
      if (!this.s.shown || !m.events.length || m.seq !== this.lastSeq + 1) {
        this.lastSeq = m.seq;
        this.set({ shown: m.view, deadline: m.deadline, busy: false });
        continue;
      }
      this.lastSeq = m.seq;
      this.set({ busy: true, deadline: null });
      const w: PlayerView = structuredClone(this.s.shown);
      w.me = m.view.me;
      for (const e of m.events) await this.step(w, e, m.view, fast);
      this.set({ shown: m.view, busy: false, deadline: m.deadline, reveal: null });
    }
    this.running = false;
  }

  private commit(w: PlayerView) { this.set({ shown: structuredClone(w) }); }

  private find(w: PlayerView, uid: string): { u: Unit; p: PIdx } | null {
    for (const p of [0, 1] as PIdx[]) { const u = w.players[p].units.find(x => x.uid === uid); if (u) return { u, p }; }
    return null;
  }

  private who(w: PlayerView, p: PIdx) { return p === w.me ? 'You' : w.players[p].name; }

  private async step(w: PlayerView, e: GEvent, final: PlayerView, k: number) {
    const D = (ms: number) => wait(ms * k);
    switch (e.t) {
      case 'play': {
        const def = CARDS[e.cardId];
        const pl = w.players[e.p];
        const mine = e.p === w.me;
        if (!mine || def.kind === 'special') {
          // reveal the card in the middle of the board first
          if (pl.hand) pl.hand = pl.hand.filter(c => c.uid !== e.uid);
          pl.handCount = Math.max(0, pl.handCount - 1);
          this.commit(w);
          this.set({ reveal: { uid: e.uid, cardId: e.cardId, p: e.p, resolve: e.resolve } });
          await D(mine ? 650 : 1100);
        }
        if (pl.hand) pl.hand = pl.hand.filter(c => c.uid !== e.uid);
        if (mine && def.kind === 'unit') pl.handCount = Math.max(0, (pl.hand?.length ?? pl.handCount));
        this.logLine(e.p, `${this.who(w, e.p)} played ${def.name}${e.resolve ? ' — Resolve' : ''}`);
        if (def.kind === 'unit' && e.row) {
          pl.units.push({
            uid: e.uid, cardId: def.id, name: def.name, owner: e.p, house: def.house, power: def.power!, base: def.power!,
            row: e.row, grow: !!def.grow, guard: !!def.guard, shield: !!def.shield, poison: false, token: false, silenced: false,
          });
          // swap the reveal for the unit in one render so the card flies into its row
          this.set({ reveal: null, shown: structuredClone(w) });
          await D(400);
          this.fx('land', e.uid, { house: def.house });
          await D(160);
        } else {
          pl.discardCount++;
          this.commit(w);
          await D(250);
          this.set({ reveal: null });
          await D(200);
        }
        break;
      }
      case 'resolve':
        this.set({ banner: { id: uidN++, kind: 'resolve', title: 'RESOLVE', sub: CARDS[e.cardId].name, p: e.p } });
        await D(900);
        this.set({ banner: null });
        break;
      case 'summon':
        w.players[e.p].units.push({ ...e.unit });
        this.commit(w);
        await D(120);
        this.fx('summon', e.unit.uid, { house: e.unit.house });
        await D(240);
        break;
      case 'dmg': {
        const f = this.find(w, e.uid);
        if (!f) break;
        f.u.power = e.power;
        this.commit(w);
        this.pulse(e.uid, 'hit');
        this.fx(e.src === 'duel' ? 'duel' : e.src, e.uid, { n: e.n });
        if (e.src !== 'poison' && e.n >= 4) this.set({ shake: uidN++ });
        await D(e.src === 'poison' ? 260 : e.src === 'duel' ? 420 : 380);
        break;
      }
      case 'block':
        { const f = this.find(w, e.uid); if (f) f.u.shield = false; }
        this.commit(w);
        this.fx('block', e.uid);
        this.pulse(e.uid, 'block');
        await D(380);
        break;
      case 'boost': {
        const f = this.find(w, e.uid);
        if (!f) break;
        f.u.power = e.power;
        this.commit(w);
        this.pulse(e.uid, 'boost');
        this.fx(e.src === 'grow' ? 'grow' : e.src === 'rally' ? 'rally' : e.src === 'sacrifice' ? 'sacrifice' : 'boost', e.uid, { n: e.n });
        await D(e.src === 'grow' ? 200 : 260);
        break;
      }
      case 'status': {
        const f = this.find(w, e.uid);
        if (!f) break;
        if (e.s === 'poison') f.u.poison = true;
        if (e.s === 'grow') f.u.grow = true;
        if (e.s === 'shield') f.u.shield = true;
        if (e.s === 'silence') { f.u.grow = f.u.guard = f.u.shield = f.u.poison = false; f.u.silenced = true; }
        this.commit(w);
        this.fx(('st-' + e.s) as FxKind, e.uid);
        this.pulse(e.uid, e.s);
        await D(320);
        break;
      }
      case 'destroy': {
        const f = this.find(w, e.uid);
        if (!f) break;
        const pos = this.locate(e.uid);
        this.fx('destroy', null, { house: f.u.house }, pos);
        w.players[f.p].units = w.players[f.p].units.filter(u => u.uid !== e.uid);
        if (!f.u.token) w.players[f.u.owner].discardCount++;
        this.logLine(null, `${f.u.name} was destroyed`);
        this.commit(w);
        await D(360);
        break;
      }
      case 'sacrifice': {
        const f = this.find(w, e.uid);
        if (!f) break;
        const from = this.locate(e.uid);
        this.fx('sacrifice', null, {}, from);
        w.players[f.p].units = w.players[f.p].units.filter(u => u.uid !== e.uid);
        if (!f.u.token) w.players[f.u.owner].discardCount++;
        this.commit(w);
        await D(320);
        break;
      }
      case 'move': {
        const f = this.find(w, e.uid);
        if (!f) break;
        f.u.row = e.row;
        this.commit(w);
        await D(80);
        this.fx('move', e.uid);
        await D(420);
        break;
      }
      case 'steal': {
        const f = this.find(w, e.uid);
        if (!f) break;
        w.players[f.p].units = w.players[f.p].units.filter(u => u.uid !== e.uid);
        f.u.row = e.row; f.u.poison = false;
        w.players[e.to].units.push(f.u);
        this.logLine(e.to, `${this.who(w, e.to)} took control of ${f.u.name}`);
        this.commit(w);
        await D(100);
        this.fx('steal', e.uid);
        await D(500);
        break;
      }
      case 'duel': {
        const a = this.locate(e.a), b = this.locate(e.b);
        if (a && b) this.pulse(e.a, 'lunge', { dx: (b.x - a.x) * 0.55, dy: (b.y - a.y) * 0.55 });
        await D(260);
        break;
      }
      case 'pass':
        w.players[e.p].passed = true;
        this.commit(w);
        this.logLine(e.p, `${this.who(w, e.p)} passed${e.auto ? ' (no cards left)' : ''}`);
        this.set({ banner: { id: uidN++, kind: 'pass', title: e.p === w.me ? 'YOU PASSED' : `${w.players[e.p].name.toUpperCase()} PASSED`, p: e.p } });
        await D(800);
        this.set({ banner: null });
        break;
      case 'turn': {
        const was = w.current;
        w.current = e.p;
        this.commit(w);
        if (e.p === w.me && was !== w.me && !w.players[w.me].passed) {
          const b: Banner = { id: uidN++, kind: 'turn', title: 'YOUR TURN' };
          this.set({ banner: b });
          setTimeout(() => { if (this.s.banner?.id === b.id) this.set({ banner: null }); }, 700);
        }
        break;
      }
      case 'roundEnd': {
        w.results = [...w.results, { round: e.round, scores: e.scores, winner: e.winner }];
        if (e.winner === 'tie') { w.players[0].wins++; w.players[1].wins++; } else w.players[e.winner].wins++;
        this.commit(w);
        const me = w.me;
        const tone = e.winner === 'tie' ? 'tie' : e.winner === me ? 'win' : 'lose';
        const title = tone === 'tie' ? 'ROUND TIED' : tone === 'win' ? 'ROUND WON' : 'ROUND LOST';
        this.logLine(null, `Round ${e.round}: ${e.scores[me]}–${e.scores[me === 0 ? 1 : 0]} ${tone === 'tie' ? 'tie' : tone === 'win' ? 'won' : 'lost'}`);
        this.set({ banner: { id: uidN++, kind: 'roundEnd', title, sub: `${e.scores[me]} – ${e.scores[me === 0 ? 1 : 0]}`, tone } });
        await D(2300);
        this.set({ banner: null });
        if (!final.over) {
          for (const p of w.players) { p.discardCount += p.units.filter(u => !u.token).length; p.units = []; }
          this.commit(w);
          await D(350);
        }
        break;
      }
      case 'roundStart': {
        if (e.round === 1) break;
        w.round = e.round; w.starter = e.starter;
        for (const p of w.players) p.passed = false;
        // hands and decks come from the final view once the batch ends
        w.players.forEach((p, i) => { p.handCount = final.players[i].handCount; p.deckCount = final.players[i].deckCount; if (p.hand) p.hand = final.players[i].hand; });
        this.commit(w);
        this.set({ banner: { id: uidN++, kind: 'round', title: `ROUND ${e.round}`, sub: e.starter === w.me ? 'You start' : `${w.players[e.starter].name} starts` } });
        await D(1300);
        this.set({ banner: null });
        break;
      }
      case 'matchEnd':
        w.over = true; w.winner = e.winner;
        break;
      case 'draw':
        break;
    }
  }
}
