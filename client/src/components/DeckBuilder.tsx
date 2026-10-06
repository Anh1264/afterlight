import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { CARDS, DECK_RULES, HOUSES, House, STARTERS, Tier, deckPool, validateDeck } from '../../../shared/cards';
import { CardFace, Sigil } from './Card';
import { KeywordHelp } from './Help';

type Filter = 'ALL' | Tier | 'NEUTRAL';
const TIER_ORDER: Record<Tier, number> = { LEGEND: 0, RARE: 1, COMMON: 2 };

export function DeckBuilder({ house, initial, onSave, onClose }: {
  house: House; initial: string[]; onSave: (ids: string[] | null) => void; onClose: () => void;
}) {
  const H = HOUSES[house];
  const [deck, setDeck] = useState<string[]>(initial);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [peek, setPeek] = useState<string | null>(null);
  const pool = useMemo(() => deckPool(house), [house]);
  const count = (id: string) => deck.filter(x => x === id).length;
  const legends = deck.filter(id => CARDS[id].tier === 'LEGEND').length;
  const rares = deck.filter(id => CARDS[id].tier === 'RARE').length;
  const err = validateDeck(house, deck);
  const isStarter = [...deck].sort().join() === [...STARTERS[house]].sort().join();

  const canAdd = (id: string) => {
    const t = CARDS[id].tier;
    if (deck.length >= DECK_RULES.SIZE) return 'Deck is full';
    if (count(id) >= DECK_RULES.COPIES[t]) return `Max ${DECK_RULES.COPIES[t]}`;
    if (t === 'LEGEND' && legends >= DECK_RULES.MAX_LEGENDS) return `Max ${DECK_RULES.MAX_LEGENDS} Legends`;
    if (t === 'RARE' && rares >= DECK_RULES.MAX_RARES) return `Max ${DECK_RULES.MAX_RARES} Rares`;
    return null;
  };
  const add = (id: string) => { if (!canAdd(id)) setDeck(d => [...d, id]); };
  const remove = (id: string) => setDeck(d => { const i = d.lastIndexOf(id); return i < 0 ? d : [...d.slice(0, i), ...d.slice(i + 1)]; });

  const shown = pool.filter(id => filter === 'ALL' ? true : filter === 'NEUTRAL' ? CARDS[id].house === 'NEUTRAL' : CARDS[id].tier === filter && CARDS[id].house !== 'NEUTRAL');
  const unique = [...new Set(deck)].sort((a, b) => TIER_ORDER[CARDS[a].tier] - TIER_ORDER[CARDS[b].tier] || (CARDS[b].power ?? 0) - (CARDS[a].power ?? 0) || CARDS[a].name.localeCompare(CARDS[b].name));
  const units = deck.filter(id => CARDS[id].kind === 'unit');
  const avg = units.length ? units.reduce((s, id) => s + (CARDS[id].power ?? 0), 0) / units.length : 0;

  return (
    <motion.div className="builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ ['--acc' as string]: H.accent }}>
      <div className="b-pool">
        <div className="b-head">
          <Sigil house={house} size={34} />
          <div>
            <span className="mono" style={{ color: H.accent }}>DECK BUILDER · {H.tagline.toUpperCase()}</span>
            <h1>{H.name}</h1>
          </div>
          <div className="b-filters">
            {(['ALL', 'LEGEND', 'RARE', 'COMMON', 'NEUTRAL'] as Filter[]).map(f => (
              <button key={f} className={`gal-tab${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()}</button>
            ))}
          </div>
        </div>
        <div className="b-grid">
          {shown.map(id => {
            const why = canAdd(id);
            const n = count(id);
            return (
              <motion.button key={id} className={`b-card${why ? ' blocked' : ''}`} whileHover={{ y: -4 }}
                onClick={() => add(id)} onContextMenu={e => { e.preventDefault(); remove(id); }}
                onMouseEnter={() => setPeek(id)} onMouseLeave={() => setPeek(null)} title={why ?? 'Click to add · right-click to remove'}>
                <CardFace cardId={id} scale={0.27} dim={!!why && n === 0} />
                <span className={`b-count${n ? ' on' : ''}`}>{n}/{DECK_RULES.COPIES[CARDS[id].tier]}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
      <aside className="b-side">
        <div className="b-stats">
          <div><span className="mono dim">CARDS</span><strong className={deck.length === DECK_RULES.SIZE ? 'ok' : ''}>{deck.length}/{DECK_RULES.SIZE}</strong></div>
          <div><span className="mono dim">LEGENDS</span><strong>{legends}/{DECK_RULES.MAX_LEGENDS}</strong></div>
          <div><span className="mono dim">RARES</span><strong>{rares}/{DECK_RULES.MAX_RARES}</strong></div>
          <div><span className="mono dim">AVG POWER</span><strong>{avg.toFixed(1)}</strong></div>
        </div>
        <p className={`b-status${err ? '' : ' ok'}`}>{err ?? (isStarter ? 'Legal deck. This is the starter list.' : 'Legal deck. Ready to play.')}</p>
        <div className="b-list">
          <AnimatePresence initial={false}>
            {unique.map(id => {
              const d = CARDS[id];
              return (
                <motion.div key={id} className={`b-row row-${d.tier.toLowerCase()}`} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  onMouseEnter={() => setPeek(id)} onMouseLeave={() => setPeek(null)}>
                  <span className="b-pow">{d.kind === 'unit' ? d.power : 'S'}</span>
                  <span className="b-name">{d.name}{d.house === 'NEUTRAL' && <em> · neutral</em>}</span>
                  <span className="b-x">×{count(id)}</span>
                  <button className="b-minus" onClick={() => remove(id)} aria-label={`Remove ${d.name}`}>−</button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {!deck.length && <p className="dim">Click cards on the left to add them.</p>}
        </div>
        <div className="b-peek">
          {peek ? <><KeywordHelp cardId={peek} /></> : <p className="dim">Hover a card to read its keywords. Right-click a card to remove a copy.</p>}
        </div>
        <div className="b-actions">
          <button className="btn small ghost" onClick={() => setDeck(STARTERS[house].slice())}>Load starter</button>
          <button className="btn small ghost" onClick={() => setDeck([])}>Clear</button>
          <button className="btn small ghost" onClick={onClose}>Cancel</button>
          <button className="btn small dark" style={{ marginLeft: 'auto' }} disabled={!!err} onClick={() => onSave(isStarter ? null : deck)}>Save &amp; use</button>
        </div>
      </aside>
    </motion.div>
  );
}
