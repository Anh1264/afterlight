import { AnimatePresence, motion, useSpring, useTransform } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CARDS, HOUSES, House, RULES } from '../../../shared/cards';
import {
  Action, PIdx, PlayerView, Row, TargetSpec, Unit, activeEffect, legalRows, targetSpecFor, targetable, totals,
} from '../../../shared/engine';
import { PassOutcome, passMatch, passPromise } from '../../../shared/pass';
import { TURN_SECONDS, type RoomSnapshot } from '../../../shared/protocol';
import { FEEDBACK_URL } from '../links';
import type { Director } from '../director';
import { socket } from '../net';
import { CardFace, CardTextBody, PowerBadge, Sigil } from './Card';
import { KeywordHelp } from './Help';
import { Rules } from './Screens';
import { housePSrc } from '../art';
import { Banners, FxLayer } from './Fx';
import { MiniUnit } from './Unit';
import { useStageScale } from './Stage';
import { useFullscreen } from './FullscreenButton';

type Sel = {
  uid: string; cardId: string;
  step: 'row' | 'mode' | 'targets' | 'targetRow' | 'confirm';
  row?: Row; mode?: number; targets: string[]; spec: TargetSpec;
};

const opp = (p: PIdx): PIdx => (p === 0 ? 1 : 0);
const sum = (us: Unit[]) => us.reduce((s, u) => s + u.power, 0);
const MATCH_LABEL: Record<'win' | 'lose' | 'draw', string> = { win: 'PASS · WIN MATCH', lose: 'PASS · LOSE MATCH', draw: 'PASS · DRAW MATCH' };
const PASS_LABEL: Record<PassOutcome, string> = { win: 'PASS · WIN ROUND', tie: 'PASS · TIE ROUND', lose: 'PASS · LOSE ROUND' };

function Num({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const sp = useSpring(value, { stiffness: 140, damping: 20 });
  const txt = useTransform(sp, v => Math.round(v).toString());
  useEffect(() => { sp.set(value); }, [value, sp]);
  return <motion.span className={className} style={style} data-value={value}>{txt}</motion.span>;
}

function Diamonds({ wins, color }: { wins: number; color: string }) {
  return <div className="diamonds">{Array.from({ length: RULES.WINS_NEEDED }, (_, i) => i).map(i => (
    <motion.span key={i} className="diamond" style={{ borderColor: color, background: i < wins ? color : 'transparent' }}
      animate={{ scale: i < wins ? [1, 1.5, 1] : 1 }} transition={{ duration: 0.5 }} />
  ))}</div>;
}

function Timer({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (left > TURN_SECONDS) return null;
  return <span className={`timer${left <= 15 ? ' warn' : ''}`}>{left}s</span>;
}

function PlayerPanel({ v, p, label, deadline, busy }: { v: PlayerView; p: PIdx; label: string; deadline: number | null; busy: boolean }) {
  const pl = v.players[p];
  const H = HOUSES[pl.house];
  const active = !v.over && v.current === p && !pl.passed;
  return (
    <div className={`panel${active ? ' active' : ''}`} style={{ borderColor: H.frame, background: H.paper, ['--acc' as string]: H.accent }}>
      <div className="panel-head">
        <Sigil house={pl.house} size={34} />
        <div className="panel-names">
          <span className="mono" style={{ color: H.accent }}>{label}</span>
          <strong>{pl.name}</strong>
        </div>
      </div>
      <div className="panel-row">
        <span className="mono dim">ROUNDS</span>
        <Diamonds wins={pl.wins} color={H.accent} />
        <AnimatePresence mode="wait">
          {pl.passed ? <motion.span key="p" className="chip solid" style={{ background: H.accent }} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>PASSED</motion.span>
            : active ? <motion.span key="t" className="chip" style={{ color: H.accent, borderColor: H.accent }} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              {p === v.me ? 'YOUR TURN' : 'THINKING'}{deadline && !busy && p === v.me ? <> · <Timer deadline={deadline} /></> : null}</motion.span>
              : <span key="n" />}
        </AnimatePresence>
      </div>
      <div className="panel-row counts mono dim">
        <span>{house(pl.house)}</span>
        <span>HAND <b>{pl.handCount}</b></span>
        <span>DECK <b>{pl.deckCount}</b></span>
        <span>DISCARD <b>{pl.discardCount}</b></span>
      </div>
    </div>
  );
}
const house = (h: House) => HOUSES[h].tagline.toUpperCase();

export function Game({ room, director, onHome }: { room: RoomSnapshot; director: Director; onHome: () => void }) {
  const ds = useSyncExternalStore(director.subscribe, director.get);
  const v = ds.shown!;
  const me = v.me, op = opp(me);
  const scale = useStageScale();
  const [sel, setSel] = useState<Sel | null>(null);
  const [hover, setHover] = useState<{ cardId: string | null; power?: number; unit?: Unit } | null>(null);
  const [sending, setSending] = useState(false);
  const [passArm, setPassArm] = useState(false);
  const fs = useFullscreen();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const rowEls = useRef(new Map<string, HTMLElement>());

  const regEl = useCallback((uid: string, el: HTMLElement | null) => { if (el) els.current.set(uid, el); else els.current.delete(uid); }, []);
  useEffect(() => {
    const centre = (el: HTMLElement | undefined) => {
      const st = stageRef.current;
      if (!el || !st) return null;
      const r = el.getBoundingClientRect(), s = st.getBoundingClientRect();
      return { x: (r.left + r.width / 2 - s.left) / scale, y: (r.top + r.height / 2 - s.top) / scale };
    };
    director.locate = uid => centre(els.current.get(uid));
    director.rowLocate = (p, row) => centre(rowEls.current.get(`${p}${row}`));
  }, [director, scale]);

  useEffect(() => {
    const t = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };
    socket.on('toast', t);
    return () => { socket.off('toast', t); };
  }, []);

  const myTurn = !ds.busy && !sending && v.current === me && !v.over && !v.players[me].passed;
  useEffect(() => { if (!myTurn) setSel(null); }, [myTurn]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const send = (a: Action) => {
    setSending(true); setSel(null); setPassArm(false);
    socket.emit('game:action', a, r => {
      setSending(false);
      if ('error' in r) { setToast(r.error); setTimeout(() => setToast(null), 3000); }
    });
  };

  // ------------------------------------------------------------ selection flow
  const specFor = (cardId: string) => targetSpecFor(v, me, activeEffect(CARDS[cardId], v.players[op].passed).eff);
  const nextStep = (s: Sel): Sel | null => {
    const def = CARDS[s.cardId];
    if (def.kind === 'unit' && !s.row) return { ...s, step: 'row' };
    let spec = s.spec;
    if (spec.kind === 'mode') {
      if (s.mode === undefined) return { ...s, step: 'mode' };
      spec = spec.options[s.mode].spec;
    }
    if (spec.kind === 'units') return { ...s, step: 'targets' };
    if (spec.kind === 'row') return { ...s, step: 'targetRow' };
    if (def.kind === 'special') return { ...s, step: 'confirm' };
    return null; // ready
  };
  const fire = (s: Sel, extra: Partial<Action & { type: 'play' }> = {}) => {
    send({ type: 'play', uid: s.uid, row: s.row, targets: s.targets, mode: s.mode, ...extra } as Action);
  };
  const advanceSel = (s: Sel) => { const n = nextStep(s); if (n) setSel(n); else fire(s); };

  const dragged = useRef(false);
  const dropOnRow = (uid: string, cardId: string, row: Row) => {
    if (!myTurn || !legalRows(v, me, CARDS[cardId]).includes(row)) return;
    advanceSel({ uid, cardId, step: 'row', row, targets: [], spec: specFor(cardId) });
  };
  const pickCard = (uid: string, cardId: string) => {
    if (!myTurn) return;
    if (sel?.uid === uid) {
      if (sel.step === 'confirm') return fire(sel);
      return setSel(null);
    }
    const def = CARDS[cardId];
    const s: Sel = { uid, cardId, step: 'row', targets: [], spec: specFor(cardId) };
    if (def.kind === 'unit') {
      const rows = legalRows(v, me, def);
      if (!rows.length) { setToast('No room in that row.'); setTimeout(() => setToast(null), 2000); return; }
      if (rows.length === 1) return advanceSel({ ...s, row: rows[0] });
      return setSel(s);
    }
    advanceSel(s);
  };

  const activeSpec: TargetSpec | null = sel ? (sel.spec.kind === 'mode' && sel.mode !== undefined ? sel.spec.options[sel.mode].spec : sel.spec) : null;
  const unitSpec = sel?.step === 'targets' && activeSpec?.kind === 'units' ? activeSpec : null;

  const clickUnit = (u: Unit) => {
    if (!sel || !unitSpec || !unitSpec.pool.includes(u.uid)) return;
    const has = sel.targets.includes(u.uid);
    const targets = has ? sel.targets.filter(t => t !== u.uid) : [...sel.targets, u.uid];
    if (targets.length > unitSpec.max) return;
    const s2 = { ...sel, targets };
    if (targets.length === unitSpec.max) fire(s2); else setSel(s2);
  };
  const clickRow = (p: PIdx, row: Row) => {
    if (!sel) return;
    if (sel.step === 'row' && p === me && legalRows(v, me, CARDS[sel.cardId]).includes(row)) return advanceSel({ ...sel, row });
    if (sel.step === 'targetRow' && p === op) return fire(sel, { targetRow: row });
  };

  // ------------------------------------------------------------ prompt
  const oppPassed = v.players[op].passed;
  const t = totals(v);
  const myTotal = t[me], opTotal = t[op];
  const promise = passPromise(v, me);
  const matchEnd = passMatch(v, me);
  let prompt = '';
  if (v.over) prompt = '';
  else if (ds.busy || sending) prompt = '';
  else if (v.players[me].passed) prompt = `You passed. ${v.players[op].name} is playing out the round.`;
  else if (v.current !== me) prompt = `${v.players[op].name} is thinking…`;
  else if (!sel) prompt = oppPassed ? (promise === 'win' ? 'You’re ahead and they passed. Pass to take the round, or keep building.' : 'They passed. Every card you play now triggers Resolve.') : 'Your turn. Drag a card onto a row (or click it), or pass.';
  else if (sel.step === 'row') prompt = `Click Front or Back to place ${CARDS[sel.cardId].name}`;
  else if (sel.step === 'mode') prompt = `${CARDS[sel.cardId].name}: choose one`;
  else if (sel.step === 'targets' && unitSpec) prompt = `${unitSpec.prompt}${unitSpec.max > 1 ? ` (${sel.targets.length}/${unitSpec.max})` : ''}`;
  else if (sel.step === 'targetRow' && activeSpec?.kind === 'row') prompt = activeSpec.prompt;
  else if (sel.step === 'confirm') prompt = `Cast ${CARDS[sel.cardId].name}?`;

  const inspect = hover ?? (sel ? { cardId: sel.cardId } : null);
  const meH = HOUSES[v.players[me].house], opH = HOUSES[v.players[op].house];

  // ------------------------------------------------------------ render helpers
  const renderRow = (p: PIdx, row: Row) => {
    const pl = v.players[p];
    const H = HOUSES[pl.house];
    const units = pl.units.filter(u => u.row === row);
    const placing = sel?.step === 'row' && p === me && legalRows(v, me, CARDS[sel.cardId]).includes(row);
    const rowTarget = sel?.step === 'targetRow' && p === op;
    const guarded = p === op && row === 'B' && unitSpec?.side === 'enemy' && targetable(pl).length !== pl.units.length;
    const isMine = p === me;
    return (
      <div key={`${p}${row}`} data-p={p} data-row={row} ref={el => { if (el) rowEls.current.set(`${p}${row}`, el); }}
        className={`row${placing ? ' placing' : ''}${rowTarget ? ' row-target' : ''}`}
        style={{ background: H.paper, borderColor: placing || rowTarget ? (rowTarget ? '#C21F33' : meH.accent) : H.frame, ['--acc' as string]: H.accent }}
        onClick={() => clickRow(p, row)}>
        <div className="row-bg" style={{ backgroundImage: `url(${housePSrc(pl.house)})` }} />
        <div className="row-sigil"><Sigil house={pl.house} size={92} stroke={2} /></div>
        <div className="row-head">
          <span className="mono" style={{ color: H.accent }}>{row === 'F' ? 'FRONT' : 'BACK'}</span>
          <span className="row-score" style={{ borderColor: H.accent }}><Num value={sum(units)} /></span>
          {guarded && <span className="mono guarded">GUARDED</span>}
        </div>
        <div className="row-units">
          <AnimatePresence mode="popLayout">
            {units.map(u => {
              const inPool = !!unitSpec && unitSpec.pool.includes(u.uid);
              return <MiniUnit key={u.uid} u={u} pulse={ds.pulses[u.uid]} regEl={regEl}
                glow={inPool ? (unitSpec!.side === 'enemy' ? 'enemy' : 'ally') : null}
                picked={!!sel?.targets.includes(u.uid)}
                onClick={inPool ? () => clickUnit(u) : undefined}
                onHover={x => setHover(x ? { cardId: x.cardId, power: x.power, unit: x } : null)} />;
            })}
          </AnimatePresence>
          {placing && <motion.div className="slot-ghost" style={{ borderColor: meH.accent }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{isMine ? (row === 'F' ? 'PLACE IN FRONT' : 'PLACE IN BACK') : ''}</motion.div>}
        </div>
      </div>
    );
  };

  const hand = v.players[me].hand ?? [];
  const n = hand.length;
  const spread = Math.min(112, 820 / Math.max(n, 1));

  const passLabel = (() => {
    if (!myTurn) return 'PASS';
    if (matchEnd) return MATCH_LABEL[matchEnd];
    if (promise) return PASS_LABEL[promise];
    return passArm ? 'CLICK AGAIN TO PASS' : 'PASS';
  })();

  return (
    <motion.div ref={stageRef} className="game" style={{ ['--me' as string]: meH.accent }}
      animate={ds.shake ? { x: [0, -6, 6, -3, 0] } : {}} key={'shake' + ds.shake} transition={{ duration: 0.3 }}
      onContextMenu={e => { if (sel) { e.preventDefault(); setSel(null); } }}>
      {/* left column */}
      <div className="col-left">
        <PlayerPanel v={v} p={op} label="OPPONENT" deadline={null} busy={ds.busy} />
        <div className="log">
          <span className="mono dim">MATCH LOG</span>
          <div className="log-lines">
            <AnimatePresence initial={false}>
              {ds.log.slice(-9).map(l => (
                <motion.div key={l.id} className="log-line" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  style={{ borderColor: l.p === null ? '#C9C6CF' : HOUSES[v.players[l.p].house].accent }}>{l.text}</motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <PlayerPanel v={v} p={me} label="YOU" deadline={ds.deadline} busy={ds.busy} />
      </div>

      {/* board */}
      <div className="board">
        {renderRow(op, 'B')}
        {renderRow(op, 'F')}
        <div className="divider">
          <span className="mono">ROUND {v.round} OF {RULES.ROUNDS}</span>
          {v.round === 1 && <span className="chip ghost mono" title={`The first player gets +${RULES.FIRST_LIGHT} in Round 1`}>FIRST LIGHT +{RULES.FIRST_LIGHT} · {v.first === me ? 'YOU' : v.players[op].name.toUpperCase()}</span>}
          {oppPassed && !v.players[me].passed && <motion.span className="chip solid mono" style={{ background: '#0E0E12' }} initial={{ scale: 0.6 }} animate={{ scale: 1 }}>OPPONENT PASSED · RESOLVE IS LIVE</motion.span>}
          <div className="divider-line" />
        </div>
        {renderRow(me, 'F')}
        {renderRow(me, 'B')}
      </div>

      {/* right column */}
      <div className="col-right">
        <div className="total" style={{ color: opH.accent }}>
          <span className="mono">{v.players[op].house} TOTAL</span>
          <Num value={opTotal} className="total-n" />
        </div>
        <div className="inspect">
          <AnimatePresence mode="wait">
            {inspect ? (
              <motion.div key={(inspect.cardId ?? inspect.unit?.uid) + String(inspect.power ?? '')} className="inspect-body" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {inspect.cardId ? (
                  <div className="card-text inspect-text"><CardTextBody cardId={inspect.cardId} withPower power={inspect.power} base={inspect.unit?.base} /></div>
                ) : inspect.unit ? (
                  <div className="card-text inspect-text">
                    <span className="mono" style={{ color: HOUSES[inspect.unit.house].accent }}>TOKEN</span>
                    <div className="name-row"><h2>{inspect.unit.name}</h2><PowerBadge power={inspect.unit.power} base={inspect.unit.base} /></div>
                  </div>
                ) : null}
                <KeywordHelp cardId={inspect.cardId} unit={inspect.unit} />
              </motion.div>
            ) : (
              <motion.div key="hint" className="inspect-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <span className="mono dim">HOVER ANY CARD TO READ IT</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="total" style={{ color: meH.accent }}>
          <Num value={myTotal} className="total-n" />
          <span className="mono">YOUR TOTAL</span>
        </div>
      </div>

      {/* prompt + hand */}
      <div className="prompt">
        <AnimatePresence mode="wait">
          {prompt && <motion.span key={prompt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{prompt}</motion.span>}
        </AnimatePresence>
        {sel?.step === 'mode' && sel.spec.kind === 'mode' && sel.spec.options.map((o, i) => (
          <button key={i} className="btn small" onClick={() => advanceSel({ ...sel, mode: i })}>{o.label}</button>
        ))}
        {sel?.step === 'targets' && unitSpec && sel.targets.length >= unitSpec.min && (
          <button className="btn small dark" onClick={() => fire(sel)}>{sel.targets.length ? `Confirm (${sel.targets.length})` : 'Skip'}</button>
        )}
        {sel?.step === 'confirm' && <button className="btn small dark" onClick={() => fire(sel)}>Cast</button>}
        {sel && <button className="btn small ghost" onClick={() => setSel(null)}>Cancel</button>}
      </div>

      <div className="hand">
        <AnimatePresence>
          {hand.map((c, i) => {
            const mid = (n - 1) / 2;
            const off = i - mid;
            const isSel = sel?.uid === c.uid;
            return (
              <motion.div key={c.uid} layoutId={c.uid} className={`hand-card${isSel ? ' sel' : ''}${myTurn ? ' live' : ''}`}
                style={{ zIndex: isSel ? 50 : i, left: `calc(50% + ${off * spread - 79}px)` }}
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: isSel ? -70 : Math.abs(off) * Math.abs(off) * 2.2, rotate: isSel ? 0 : off * 2.4, opacity: 1 }}
                whileHover={{ y: isSel ? -70 : -40, rotate: 0, scale: 1.08, zIndex: 60, transition: { duration: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                onMouseEnter={() => setHover({ cardId: c.cardId })}
                onMouseLeave={() => setHover(null)}
                onClick={() => { if (!dragged.current) pickCard(c.uid, c.cardId); }}
                drag={myTurn && CARDS[c.cardId].kind === 'unit'} dragSnapToOrigin dragElastic={1} dragMomentum={false}
                onDragStart={() => { dragged.current = true; setSel(null); }}
                onDragEnd={(_e, info) => {
                  setTimeout(() => { dragged.current = false; }, 50);
                  const hit = document.elementsFromPoint(info.point.x - window.scrollX, info.point.y - window.scrollY)
                    .map(el => (el as HTMLElement).closest?.('[data-row]') as HTMLElement | null).find(Boolean);
                  if (!hit || Number(hit.dataset.p) !== me) return;
                  dropOnRow(c.uid, c.cardId, hit.dataset.row as Row);
                }}>
                <CardFace cardId={c.cardId} scale={0.3} />
                {CARDS[c.cardId].resolve && oppPassed && <span className="resolve-tag">RESOLVE</span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="actions">
        <button className={`btn pass${myTurn ? ' live' : ''}${passArm ? ' armed' : ''}${myTurn && promise ? ((matchEnd ?? promise) === 'win' ? ' good' : ' bad') : ''}`}
          disabled={!myTurn}
          onClick={() => {
            if (oppPassed) return send({ type: 'pass' });
            if (!passArm) { setPassArm(true); setTimeout(() => setPassArm(false), 2500); return; }
            send({ type: 'pass' });
          }}>{passLabel}</button>
        <div className="action-links">
          <button className="btn tiny ghost" onClick={() => setRulesOpen(true)}>Rules &amp; keywords</button>
          {fs.available && <button className="btn tiny ghost" onClick={fs.enter}>Fullscreen</button>}
          <button className="btn tiny ghost" onClick={() => { if (confirm('Forfeit this match?')) socket.emit('game:forfeit'); }}>Forfeit</button>
        </div>
      </div>

      {/* reveal of a card being played */}
      <AnimatePresence>
        {ds.reveal && (
          <motion.div key={'rv' + ds.reveal.uid} layoutId={ds.reveal.uid} className="reveal"
            initial={{ opacity: 0, y: ds.reveal.p === me ? 160 : -200, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
            <CardFace cardId={ds.reveal.cardId} scale={0.5} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{rulesOpen && <Rules onClose={() => setRulesOpen(false)} />}</AnimatePresence>
      <FxLayer fx={ds.fx} />
      <Banners b={ds.banner} meHouse={v.players[me].house} oppHouse={v.players[op].house} me={me} />

      <AnimatePresence>{toast && <motion.div className="toast" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>{toast}</motion.div>}</AnimatePresence>

      {v.over && !ds.busy && <EndScreen v={v} room={room} onHome={onHome} />}
      {room.seats[op] && !room.seats[op]!.connected && !v.over && <div className="disconnected mono">OPPONENT DISCONNECTED · WAITING 60s</div>}
    </motion.div>
  );
}

function EndScreen({ v, room, onHome }: { v: PlayerView; room: RoomSnapshot; onHome: () => void }) {
  const me = v.me;
  const tone = v.winner === 'draw' ? 'draw' : v.winner === me ? 'win' : 'lose';
  const H = HOUSES[v.players[me].house];
  const asked = room.rematch[me];
  const theyAsked = room.rematch[opp(me)];
  return (
    <motion.div className="end" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="end-card" initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }}>
        <span className="mono" style={{ color: H.accent }}>{v.players[0].name} vs {v.players[1].name}</span>
        <h1 className={`end-title ${tone}`}>{tone === 'win' ? 'VICTORY' : tone === 'lose' ? 'DEFEAT' : 'DRAW'}</h1>
        <div className="end-rounds">
          {v.results.map(r => (
            <div key={r.round} className="end-round">
              <span className="mono dim">ROUND {r.round}</span>
              <strong>{r.scores[me]} – {r.scores[opp(me)]}</strong>
              <span className="mono">{r.winner === 'tie' ? 'TIE' : r.winner === me ? 'WON' : 'LOST'}</span>
            </div>
          ))}
          {!v.results.length && <span className="mono dim">Match ended by forfeit</span>}
        </div>
        <div className="end-actions">
          <button className="btn dark" disabled={asked} onClick={() => socket.emit('game:rematch')}>
            {asked ? 'Waiting for opponent…' : theyAsked ? 'Accept rematch' : 'Rematch'}
          </button>
          <button className="btn ghost" onClick={onHome}>Home</button>
          {FEEDBACK_URL && <a className="btn ghost" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give feedback</a>}
        </div>
      </motion.div>
    </motion.div>
  );
}

