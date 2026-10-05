import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { HOUSES, House } from '../../../shared/cards';
import type { Banner, Fx } from '../director';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function Particles({ n, colors, spread, up = 0, size = [4, 9], dur = [0.5, 0.9], inward = false, shape = 'dot' }: {
  n: number; colors: string[]; spread: number; up?: number; size?: [number, number]; dur?: [number, number]; inward?: boolean; shape?: 'dot' | 'leaf' | 'bubble' | 'shard' | 'square';
}) {
  const ps = useMemo(() => Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2, r = rnd(spread * 0.4, spread);
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r - up * rnd(0.5, 1), s: rnd(size[0], size[1]), c: colors[Math.floor(Math.random() * colors.length)], d: rnd(dur[0], dur[1]), rot: rnd(-180, 180) };
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{ps.map((p, i) => (
    <motion.span key={i} className={`fx-p fx-${shape}`}
      style={{ width: p.s, height: shape === 'leaf' ? p.s * 0.55 : shape === 'shard' ? p.s * 0.35 : p.s, background: shape === 'bubble' ? 'transparent' : p.c, borderColor: p.c }}
      initial={inward ? { x: p.dx, y: p.dy, opacity: 0, scale: 1 } : { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
      animate={inward ? { x: 0, y: 0, opacity: [0, 1, 0], scale: 0.3 } : { x: p.dx, y: p.dy, opacity: 0, scale: 0.4, rotate: p.rot }}
      transition={{ duration: p.d, ease: 'easeOut' }} />
  ))}</>;
}

function Float({ text, color, delay = 0 }: { text: string; color: string; delay?: number }) {
  return (
    <motion.span className="fx-float" style={{ color }}
      initial={{ y: 0, opacity: 0, scale: 0.6 }}
      animate={{ y: -62, opacity: [0, 1, 1, 0], scale: [0.6, 1.25, 1, 1] }}
      transition={{ duration: 1.1, delay, times: [0, 0.15, 0.7, 1], ease: 'easeOut' }}>{text}</motion.span>
  );
}

function Ring({ color, from = 0.4, to = 1.8, w = 3, dur = 0.6, hex = false }: { color: string; from?: number; to?: number; w?: number; dur?: number; hex?: boolean }) {
  return (
    <motion.span className={hex ? 'fx-hex' : 'fx-ring'} style={{ borderColor: color, borderWidth: w, ...(hex ? { color } : {}) }}
      initial={{ scale: from, opacity: 0.95 }} animate={{ scale: to, opacity: 0 }} transition={{ duration: dur, ease: 'easeOut' }}>
      {hex && <svg viewBox="0 0 100 100"><path d="M50 4 L92 27 V73 L50 96 L8 73 V27 Z" fill="none" stroke="currentColor" strokeWidth="5" /></svg>}
    </motion.span>
  );
}

function Label({ text, color }: { text: string; color: string }) {
  return <motion.span className="fx-label" style={{ color, borderColor: color }} initial={{ y: 10, opacity: 0 }} animate={{ y: -46, opacity: [0, 1, 1, 0] }} transition={{ duration: 1.1, times: [0, 0.15, 0.75, 1] }}>{text}</motion.span>;
}

const FIRE = ['#FF4D2E', '#FF8A1F', '#FFC93C', '#C21F33', '#FFE7A3'];
const VENOM = ['#2F7A4B', '#5DBB63', '#9BE07A', '#1D4F31'];
const GOLD = ['#F2B630', '#FFE08A', '#FFFFFF', '#E58E1A'];

function FxItem({ f }: { f: Fx }) {
  const acc = f.house ? HOUSES[f.house as House].accent : '#0E0E12';
  let body: React.ReactNode = null;
  switch (f.kind) {
    case 'burn': case 'self':
      body = <>
        <motion.span className="fx-flash" style={{ background: 'radial-gradient(circle, rgba(255,214,120,.95) 0%, rgba(255,90,40,.7) 35%, rgba(194,31,51,0) 70%)' }}
          initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.55 }} />
        <Particles n={22} colors={FIRE} spread={90} up={50} size={[4, 10]} />
        <Float text={`-${f.n}`} color="#C21F33" />
      </>; break;
    case 'poison':
      body = <><Particles n={9} colors={VENOM} spread={30} up={60} size={[6, 12]} shape="bubble" dur={[0.7, 1.1]} /><Float text={`-${f.n}`} color="#2F7A4B" /></>; break;
    case 'duel':
      body = <>
        <motion.span className="fx-slash" initial={{ scaleX: 0, opacity: 1, rotate: -32 }} animate={{ scaleX: [0, 1.3, 1.3], opacity: [1, 1, 0] }} transition={{ duration: 0.38 }} />
        <motion.span className="fx-slash" initial={{ scaleX: 0, opacity: 1, rotate: 38 }} animate={{ scaleX: [0, 1.1, 1.1], opacity: [1, 1, 0] }} transition={{ duration: 0.38, delay: 0.06 }} />
        <Particles n={14} colors={['#FFFFFF', '#FFE08A', '#0B7F8E', '#7FD3DC']} spread={80} size={[3, 7]} shape="shard" />
        <Float text={`-${f.n}`} color="#0E0E12" />
      </>; break;
    case 'lose':
      body = <><motion.span className="fx-slash dark" initial={{ scaleX: 0, opacity: 1, rotate: -20 }} animate={{ scaleX: 1.2, opacity: 0 }} transition={{ duration: 0.45 }} /><Particles n={10} colors={['#3A2A4A', '#6A5A7A', '#0E0E12']} spread={60} /><Float text={`-${f.n}`} color="#3A2A4A" /></>; break;
    case 'block':
      body = <><Ring color="#3B42C4" hex from={0.7} to={1.5} dur={0.5} /><Particles n={12} colors={['#9196EA', '#3B42C4', '#FFFFFF']} spread={70} shape="shard" size={[6, 14]} /><Label text="BLOCKED" color="#3B42C4" /></>; break;
    case 'grow':
      body = <><Particles n={6} colors={VENOM} spread={26} up={55} shape="leaf" size={[10, 16]} dur={[0.7, 1]} /><Float text={`+${f.n}`} color="#2F7A4B" /></>; break;
    case 'rally': case 'boost':
      body = <><Particles n={12} colors={GOLD} spread={40} up={60} size={[3, 7]} shape="square" /><Float text={`+${f.n}`} color="#B37400" /></>; break;
    case 'sacrifice':
      body = <><Particles n={18} colors={['#C21F33', '#5A0A14', '#FF8A1F']} spread={70} inward /><Float text={f.n ? `+${f.n}` : 'SACRIFICED'} color="#7A0F1E" /></>; break;
    case 'st-poison':
      body = <><Ring color="#2F7A4B" w={4} /><Particles n={10} colors={VENOM} spread={50} up={20} shape="bubble" size={[6, 12]} /><Label text="POISONED" color="#2F7A4B" /></>; break;
    case 'st-grow':
      body = <><Particles n={8} colors={VENOM} spread={40} up={40} shape="leaf" size={[10, 18]} /><Label text="GROW" color="#2F7A4B" /></>; break;
    case 'st-shield':
      body = <><Ring color="#3B42C4" hex from={1.6} to={0.95} dur={0.45} /><Label text="SHIELD" color="#3B42C4" /></>; break;
    case 'st-silence':
      body = <><Ring color="#6A6470" w={6} from={1.8} to={0.8} dur={0.45} /><Label text="SILENCED" color="#3A3A44" /></>; break;
    case 'destroy':
      body = <><Ring color={acc} w={2} to={2.2} /><Particles n={26} colors={['#0E0E12', '#4A4650', '#9A96A0', acc]} spread={110} up={-30} size={[3, 9]} dur={[0.6, 1.1]} shape="square" /></>; break;
    case 'summon':
      body = <>
        {[0, 1, 2].map(i => <motion.span key={i} className="fx-ghost" style={{ borderColor: '#0B7F8E' }}
          initial={{ x: -40 - i * 22, opacity: 0.7 - i * 0.18 }} animate={{ x: 0, opacity: 0 }} transition={{ duration: 0.45, delay: i * 0.05 }} />)}
        <Ring color="#0B7F8E" w={2} />
      </>; break;
    case 'steal':
      body = <><Ring color="#0B7F8E" w={4} to={2.2} /><Particles n={16} colors={['#0B7F8E', '#7FD3DC', '#FFFFFF']} spread={80} shape="square" /><Label text="SEIZED" color="#0B7F8E" /></>; break;
    case 'move':
      body = <><Ring color="#0B7F8E" w={2} /><Label text="SHOVED" color="#0B7F8E" /></>; break;
    case 'land':
      body = <><Ring color={acc} w={2} from={0.6} to={1.5} dur={0.45} /><Particles n={8} colors={[acc, '#FFFFFF']} spread={60} size={[3, 6]} dur={[0.3, 0.5]} /></>; break;
  }
  return <div className="fx" style={{ left: f.x, top: f.y }}>{body}</div>;
}

export function FxLayer({ fx }: { fx: Fx[] }) {
  return <div className="fx-layer">{fx.map(f => <FxItem key={f.id} f={f} />)}</div>;
}

export function Banners({ b, meHouse, oppHouse, me }: { b: Banner | null; meHouse: House; oppHouse: House; me: number }) {
  return (
    <AnimatePresence>
      {b && (
        <motion.div key={b.id} className={`banner banner-${b.kind}${b.tone ? ' tone-' + b.tone : ''}`}
          initial={{ opacity: 0, scale: b.kind === 'resolve' ? 1.8 : 0.9, y: b.kind === 'pass' ? (b.p === me ? 30 : -30) : 0 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: b.kind === 'resolve' ? 0.9 : 1.05 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          style={b.kind === 'resolve' ? { color: HOUSES[b.p === me ? meHouse : oppHouse].accent } : undefined}>
          <span className="banner-title">{b.title}</span>
          {b.sub && <span className="banner-sub">{b.sub}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
