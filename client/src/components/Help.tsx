import { CARDS, HOUSES, keywordsOf } from '../../../shared/cards';
import type { Unit } from '../../../shared/engine';
import { Sigil } from './Card';

const STATUS: { key: keyof Unit; label: string; t: string }[] = [
  { key: 'guard', label: 'Guard', t: 'While this sits in the Front row, the enemy can’t target its Back row.' },
  { key: 'shield', label: 'Shield', t: 'Blocks the next power loss, then breaks.' },
  { key: 'poison', label: 'Poisoned', t: 'Loses 1 at the end of each of its owner’s turns.' },
  { key: 'grow', label: 'Grow', t: 'Gains 1 at the end of each of its owner’s turns.' },
  { key: 'silenced', label: 'Silenced', t: 'Its keywords were removed.' },
];

/** Plain-English explanations for every keyword on a card, plus the unit's current statuses. */
export function KeywordHelp({ cardId, unit }: { cardId: string | null; unit?: Unit }) {
  const kws = cardId ? keywordsOf(CARDS[cardId]) : [];
  const statuses = unit ? STATUS.filter(s => unit[s.key]) : [];
  const shown = kws.filter(k => !statuses.some(s => s.label.startsWith(k.kw)));
  if (!shown.length && !statuses.length && !unit?.token) {
    return <div className="kw-help"><p className="kw-none">No keywords. This card is just its power.</p></div>;
  }
  return (
    <div className="kw-help">
      {unit?.token && <p><b>Token.</b> Counts toward your score, disappears at the end of the round.</p>}
      {statuses.map(s => <p key={s.label} className="kw-status"><b>{s.label} (now).</b> {s.t}</p>)}
      {shown.map(k => <p key={k.kw}><b>{k.kw}.</b> {k.t}</p>)}
    </div>
  );
}

export function TokenCard({ u }: { u: Unit }) {
  const H = HOUSES[u.house];
  return (
    <div className="token-card" style={{ background: H.paper, borderColor: H.accent }}>
      <Sigil house={u.house} size={70} stroke={3} />
      <strong>{u.name}</strong>
      <span className="mono" style={{ color: H.accent }}>TOKEN · {u.power} POWER</span>
    </div>
  );
}
