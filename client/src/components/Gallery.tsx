import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ALL_HOUSES, CARDS, COMMONS, HOUSES, House, KEYWORDS, LEGENDS, RULES } from '../../../shared/cards';
import { ART } from '../art';
import { CardFace, Sigil } from './Card';
import { KeywordHelp } from './Help';

export function Gallery({ onBack }: { onBack: () => void }) {
  const [house, setHouse] = useState<House | 'ALL'>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const houses = house === 'ALL' ? ALL_HOUSES : [house];
  const total = ALL_HOUSES.reduce((n, h) => n + LEGENDS[h].length + COMMONS[h].length, 0);
  return (
    <div className="gallery">
      <aside className="gal-side">
        <button className="link" onClick={onBack}>← Back</button>
        <h1 className="gal-title">All cards</h1>
        <p className="dim gal-sub">{total} cards across 4 houses. Each house plays a fixed 23-card deck: every Legend once, every common three times.</p>
        <div className="gal-tabs">
          <button className={`gal-tab${house === 'ALL' ? ' on' : ''}`} onClick={() => setHouse('ALL')}>All</button>
          {ALL_HOUSES.map(h => (
            <button key={h} className={`gal-tab${house === h ? ' on' : ''}`} style={{ ['--acc' as string]: HOUSES[h].accent }} onClick={() => setHouse(h)}>
              <Sigil house={h} size={16} /> {HOUSES[h].name.replace('The ', '')}
            </button>
          ))}
        </div>
        <div className="gal-kw">
          <span className="mono dim">KEYWORDS</span>
          {KEYWORDS.map(k => <p key={k.kw}><b>{k.kw}.</b> {k.t}</p>)}
          <p className="dim"><b>Rows.</b> Any unit can go in your Front or Back row. Placement matters for Guard, Rally, Echo and effects that hit a whole row. Max {RULES.ROW_MAX} per row.</p>
        </div>
      </aside>
      <div className="gal-main">
        {houses.map(h => {
          const H = HOUSES[h];
          return (
            <section key={h} className="gal-house">
              <div className="gal-head" style={{ borderColor: H.frame }}>
                <Sigil house={h} size={34} />
                <div>
                  <span className="mono" style={{ color: H.accent }}>{H.tagline.toUpperCase()}</span>
                  <h2>{H.name}</h2>
                </div>
                <p>{H.plan}</p>
              </div>
              <div className="gal-grid">
                {[...LEGENDS[h], ...COMMONS[h]].map(id => {
                  const d = CARDS[id];
                  return (
                    <motion.button key={id} className="gal-card" whileHover={{ y: -6 }} onClick={() => setOpen(id)}>
                      <CardFace cardId={id} scale={0.36} />
                      <span className="mono gal-cap" style={{ color: d.tier === 'LEGEND' ? H.accent : undefined }}>
                        {d.tier === 'LEGEND' ? 'LEGEND ×1' : 'COMMON ×3'}{d.tier === 'LEGEND' && !ART[id] ? ' · NEW' : ''}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div className="gal-zoom" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <CardFace cardId={open} scale={1} />
              <div className="gal-zoom-text">
                <span className="mono" style={{ color: HOUSES[CARDS[open].house].accent }}>{HOUSES[CARDS[open].house].name.toUpperCase()} · {CARDS[open].tier}</span>
                <h2>{CARDS[open].name}</h2>
                <KeywordHelp cardId={open} />
                <button className="btn dark" onClick={() => setOpen(null)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
