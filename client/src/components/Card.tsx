import { CARDS, CardHouse, HOUSES } from '../../../shared/cards';
import { GRAIN, artSrc, echoSrc, hasEchoFiles, housePSrc, layoutOf, particleSrc, shadowSrc, useHasArt } from '../art';

export function Sigil({ house, size = 22, stroke = 5, color }: { house: CardHouse; size?: number; stroke?: number; color?: string }) {
  const c = color ?? HOUSES[house].accent;
  const k = stroke / 5;
  switch (house) {
    case 'COVEN':
      return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden><path d="M32 6 C26 16 14 28 14 40 A18 18 0 0 0 50 40 C50 28 38 16 32 6 Z" fill="none" stroke={c} strokeWidth={stroke} /><path d="M32 50 V34 M32 40 C26 38 24 32 26 28 C30 30 32 34 32 40 Z" fill={c} stroke={c} strokeWidth={3 * k} /></svg>;
    case 'ORDER':
      return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden><path d="M32 6 L54 14 V32 C54 46 44 54 32 58 C20 54 10 46 10 32 V14 Z" fill="none" stroke={c} strokeWidth={stroke} /><path d="M32 18 V46 M20 30 H44" stroke={c} strokeWidth={6 * k} /></svg>;
    case 'EMBER':
      return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden><path d="M32 4 C40 18 50 24 48 40 A16 16 0 0 1 16 40 C14 30 22 26 24 16 C28 24 32 22 32 4 Z" fill="none" stroke={c} strokeWidth={stroke} /><path d="M32 30 C36 36 38 40 36 46 A6 6 0 0 1 26 44 C26 40 30 38 32 30 Z" fill={c} /></svg>;
    case 'ECHO':
      return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ overflow: 'visible' }}><path d="M20 8 L44 32 L20 56 L-4 32 Z" fill="none" stroke={c} strokeWidth={stroke * 0.7} opacity={0.5} /><path d="M36 8 L60 32 L36 56 L12 32 Z" fill="none" stroke={c} strokeWidth={stroke} /></svg>;
    case 'NEUTRAL':
      return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden><circle cx="32" cy="32" r="24" fill="none" stroke={c} strokeWidth={stroke} /><circle cx="32" cy="32" r="8" fill={c} /></svg>;
  }
}


function rgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

/** Full card face, designed at 500x700 and scaled. */
export function CardFace({ cardId, scale = 1, power, dim }: { cardId: string; scale?: number; power?: number; dim?: boolean }) {
  const d = CARDS[cardId];
  const H = HOUSES[d.house];
  const has = useHasArt(d.id);
  const art = has ? layoutOf(d.id) : undefined;
  const shown = power ?? d.power;
  const tint = (n: 0 | 1, dx: number, op: number) => hasEchoFiles(d.id)
    ? <img className="abs" src={echoSrc(d.id, n)} alt="" style={{ left: art!.ax - dx, top: art!.ay, width: art!.aw, height: art!.ah, opacity: op }} />
    : <div className="abs art-echo" style={{ left: art!.ax - dx, top: art!.ay, width: art!.aw, height: art!.ah, opacity: op * 0.8,
        background: n === 0 ? H.frame : H.accent, WebkitMaskImage: `url(${artSrc(d.id)})`, maskImage: `url(${artSrc(d.id)})` }} />;
  return (
    <div className="card-wrap" style={{ width: 500 * scale, height: 700 * scale, opacity: dim ? 0.55 : 1 }}>
      <div className="card" style={{ transform: `scale(${scale})`, background: H.paper }}>
        <img className="abs full" src={GRAIN} alt="" style={{ mixBlendMode: 'multiply', opacity: 0.4 }} />
        <img className="abs full" src={particleSrc(d.id, d.house)} alt="" />
        {art ? (
          <>
            {tint(0, 54, 0.42)}
            {tint(1, 27, 0.58)}
            <img className="abs" src={shadowSrc(d.house)} alt="" style={{ left: art.ax + art.aw / 2 - 150, top: art.ay + art.ah * 0.93 - 41, width: 300, height: 82 }} />
            <img className="abs" src={artSrc(d.id)} alt={d.name} style={{ left: art.ax, top: art.ay, width: art.aw, height: art.ah }} />
          </>
        ) : (
          <div className="abs" style={{ left: 100, top: 130, opacity: 0.2 }}><Sigil house={d.house} size={300} stroke={2.4} /></div>
        )}
        <div className="abs" style={{ inset: 12, border: `1.5px solid ${H.frame}`, borderRadius: 10 }} />
        {d.kind === 'unit' ? (
          <div className="abs card-power">
            <span className={'n' + (shown !== d.power ? (shown! > d.power! ? ' up' : ' down') : '')}>{shown}</span>
            <span className="mono" style={{ color: H.accent }}>POWER</span>
          </div>
        ) : (
          <div className="abs mono" style={{ left: 30, top: 30, fontSize: 14, letterSpacing: '0.24em', color: H.accent }}>SPECIAL</div>
        )}
        <div className="abs card-pill" style={{ borderColor: H.frame }}>
          <Sigil house={d.house} />
          <span className="mono" style={{ color: H.accent }}>{d.kind === 'unit' ? d.house : 'CAST'}</span>
        </div>
        <div className={`abs tier-gem tier-${d.tier.toLowerCase()}`} title={d.tier}>
          <svg viewBox="0 0 20 20"><path d="M10 1 L19 10 L10 19 L1 10 Z" /></svg>
        </div>
        <div className="abs card-text" style={{ width: art?.textW ?? 320, background: rgba(H.paper, 0.78) }}>
          <span className="mono" style={{ color: H.accent, fontSize: 11 }}>{d.epithet}</span>
          <h2>{d.name}</h2>
          <div className="abilities">
            {d.text.length ? d.text.map((ab, i) => (
              <div key={i}>{ab.kw && <strong style={{ color: H.accent }}>{ab.kw}</strong>} {ab.t}</div>
            )) : <div style={{ color: '#6A6470' }}>No ability. Raw power.</div>}
          </div>
        </div>
        <div className="abs card-foot">
          <div style={{ background: H.frame }} />
          <span className="mono" style={{ background: H.paper }}>{d.tier} · {d.house}</span>
          <div style={{ background: H.frame }} />
        </div>
      </div>
    </div>
  );
}

export function CardBack({ house, scale = 1 }: { house: CardHouse; scale?: number }) {
  const H = HOUSES[house];
  return (
    <div className="card-wrap" style={{ width: 500 * scale, height: 700 * scale }}>
      <div className="card" style={{ transform: `scale(${scale})`, background: H.paper }}>
        <img className="abs full" src={GRAIN} alt="" style={{ mixBlendMode: 'multiply', opacity: 0.4 }} />
        <img className="abs full" src={housePSrc(house)} alt="" style={{ opacity: 0.85 }} />
        <img className="abs full" src={housePSrc(house)} alt="" style={{ opacity: 0.85, transform: 'rotate(180deg)' }} />
        <div className="abs" style={{ inset: 12, border: `1.5px solid ${H.frame}`, borderRadius: 10 }} />
        <div className="abs" style={{ inset: 22, border: `1px solid ${H.frame}`, borderRadius: 6, opacity: 0.7 }} />
        <div className="abs back-disc" style={{ background: H.paper, borderColor: H.frame }}><Sigil house={house} size={104} stroke={3} /></div>
        <div className="abs back-title">
          <span style={{ color: H.accent }}>{house}</span>
          <span className="mono">AFTERLIGHT</span>
        </div>
      </div>
    </div>
  );
}
