import { motion, useAnimationControls } from 'framer-motion';
import { useEffect } from 'react';
import { HOUSES } from '../../../shared/cards';
import type { Unit } from '../../../shared/engine';
import { GRAIN, artSrc, layoutOf, particleSrc, useHasArt } from '../art';
import { Sigil } from './Card';

export type Pulse = { kind: string; key: number; dx?: number; dy?: number } | undefined;

export function StatusIcons({ u }: { u: Unit }) {
  return (
    <div className="unit-status">
      {u.guard && <span title="Guard" className="st st-guard"><svg viewBox="0 0 16 16"><path d="M8 1 L14 3.5 V8 C14 11.5 11.4 13.8 8 15 C4.6 13.8 2 11.5 2 8 V3.5 Z" /></svg></span>}
      {u.shield && <span title="Shield" className="st st-shield"><svg viewBox="0 0 16 16"><path d="M8 1 L14 4.5 V11.5 L8 15 L2 11.5 V4.5 Z" /></svg></span>}
      {u.grow && <span title="Grow" className="st st-grow"><svg viewBox="0 0 16 16"><path d="M8 15 V7 M8 9 C4 9 2.5 6 3 3 C6 3 8 5 8 9 Z M8 7 C8 4 10 2 13 2 C13 5 11 7 8 7 Z" /></svg></span>}
      {u.poison && <span title="Poison" className="st st-poison"><svg viewBox="0 0 16 16"><path d="M8 1 C10 5 13 7.5 13 10.5 A5 5 0 0 1 3 10.5 C3 7.5 6 5 8 1 Z" /></svg></span>}
      {u.silenced && <span title="Silenced" className="st st-silence"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M4 12 L12 4" /></svg></span>}
    </div>
  );
}

export function MiniUnit({
  u, pulse, onClick, onHover, glow, picked, regEl,
}: {
  u: Unit; pulse: Pulse; onClick?: () => void; onHover?: (u: Unit | null) => void;
  glow?: 'enemy' | 'ally' | null; picked?: boolean; regEl: (uid: string, el: HTMLElement | null) => void;
}) {
  const H = HOUSES[u.house];
  const ctl = useAnimationControls();
  useEffect(() => {
    if (!pulse) return;
    if (pulse.kind === 'hit') void ctl.start({ x: [0, -7, 7, -5, 4, 0], transition: { duration: 0.36 } });
    else if (pulse.kind === 'lunge') void ctl.start({ x: [0, pulse.dx ?? 0, 0], y: [0, pulse.dy ?? 0, 0], scale: [1, 1.12, 1], transition: { duration: 0.42, times: [0, 0.45, 1], ease: 'easeInOut' } });
    else if (pulse.kind === 'boost') void ctl.start({ scale: [1, 1.1, 1], transition: { duration: 0.3 } });
    else void ctl.start({ scale: [1, 1.06, 1], transition: { duration: 0.28 } });
  }, [pulse?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const has = useHasArt(u.cardId);
  const art = u.cardId && has ? layoutOf(u.cardId) : undefined;
  const delta = u.power - u.base;
  return (
    <motion.div
      layoutId={u.uid}
      ref={el => regEl(u.uid, el)}
      className={`unit${u.token ? ' token' : ''}${glow ? ' glow-' + glow : ''}${picked ? ' picked' : ''}`}
      style={{ borderColor: u.token ? H.accent : H.frame, zIndex: pulse?.kind === 'lunge' ? 5 : undefined }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5, filter: 'blur(6px) brightness(1.6)', transition: { duration: 0.35 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      onClick={onClick}
      onMouseEnter={() => onHover?.(u)}
      onMouseLeave={() => onHover?.(null)}
    >
      <motion.div className="unit-inner" animate={ctl} style={{ background: H.paper }}>
        <img className="abs full" src={GRAIN} alt="" style={{ mixBlendMode: 'multiply', opacity: 0.35 }} />
        <img className="abs unit-p" src={particleSrc(u.cardId, u.house)} alt="" />
        {u.token ? (
          <div className="token-face">
            <div style={{ opacity: 0.35 }}><Sigil house={u.house} size={46} stroke={3} color={H.accent} /></div>
            <span className="mono" style={{ color: H.accent }}>{u.name.toUpperCase()}</span>
          </div>
        ) : art ? (
          <img className="abs unit-art" src={artSrc(u.cardId!)} alt={u.name}
            style={art.mini ? { left: art.mini.x, top: art.mini.y, width: art.mini.w } : undefined} />
        ) : (
          <div className="unit-common">
            <div style={{ opacity: 0.22 }}><Sigil house={u.house} size={50} stroke={3} /></div>
          </div>
        )}
        {!u.token && !art && <span className="unit-name" style={{ color: H.accent }}>{u.name}</span>}
        <StatusIcons u={u} />
        <motion.span
          key={u.power}
          className={`unit-power${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`}
          initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        >{u.power}</motion.span>
        {picked && <span className="unit-check">✓</span>}
      </motion.div>
    </motion.div>
  );
}
