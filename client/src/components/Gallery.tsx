import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { CARDS, CARD_HOUSES, CardHouse, DECK_RULES, HOUSES, KEYWORDS, RULES, Tier, poolOf } from '../../../shared/cards';
import { CardFace, Sigil } from './Card';
import { KeywordHelp } from './Help';

const TIER_LABEL: Record<Tier, string> = { LEGEND: 'LEGEND · MAX 1', RARE: 'RARE · MAX 2', COMMON: 'COMMON · MAX 3' };

export function Gallery({ onBack }: { onBack: () => void }) {
  const [house, setHouse] = useState<CardHouse | 'ALL'>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const houses = house === 'ALL' ? CARD_HOUSES : [house];
  const total = Object.keys(CARDS).length;
  return (
    <div className="gallery">
      <aside className="gal-side">
        <button className="link" onClick={onBack}>← Back</button>
        <h1 className="gal-title">All cards</h1>
        <p className="dim gal-sub">{total} cards: 4 houses plus Neutral. A deck is exactly {DECK_RULES.SIZE} cards from one house plus any Neutrals, with at most {DECK_RULES.MAX_LEGENDS} Legends and {DECK_RULES.MAX_RARES} Rares. Copies: Legend ×1, Rare ×2, Common ×3.</p>
        <div className="gal-tabs">
          <button className={`gal-tab${house === 'ALL' ? ' on' : ''}`} onClick={() => setHouse('ALL')}>All</button>
          {CARD_HOUSES.map(h => (
            <button key={h} className={`gal-tab${house === h ? ' on' : ''}`} style={{ ['--acc' as string]: HOUSES[h].accent }} onClick={() => setHouse(h)}>
              <Sigil house={h} size={16} /> {HOUSES[h].name.replace('The ', '')} <span className="dim">{poolOf(h).length}</span>
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
                {poolOf(h).map(id => {
                  const d = CARDS[id];
                  return (
                    <motion.button key={id} className="gal-card" whileHover={{ y: -6 }} onClick={() => setOpen(id)}>
                      <CardFace cardId={id} scale={0.36} />
                      <span className={`mono gal-cap cap-${d.tier.toLowerCase()}`}>{TIER_LABEL[d.tier]}</span>
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
