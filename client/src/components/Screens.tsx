import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ALL_HOUSES, CARDS, HOUSES, House, deckList } from '../../../shared/cards';
import type { RoomSnapshot } from '../../../shared/protocol';
import { socket } from '../net';
import { CardBack, CardFace, Sigil } from './Card';

export function Home({ name, setName, onBot, onCreate, busy, error }: {
  name: string; setName: (n: string) => void; onBot: () => void; onCreate: () => void; busy: boolean; error: string | null;
}) {
  const [rules, setRules] = useState(false);
  const fan = ['mawroot', 'halden', 'aiden', 'vorok'];
  return (
    <div className="home">
      <div className="home-left">
        <span className="mono dim">A TWO-PLAYER CARD DUEL · v0.1</span>
        <motion.h1 className="logo" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>AFTERLIGHT</motion.h1>
        <p className="lead">Three rounds. One card a turn. Pass at the right moment, because once you pass you’re out, and every card you spend now is one you won’t have in Round 3.</p>
        <label className="field">
          <span className="mono dim">YOUR NAME</span>
          <input value={name} maxLength={18} placeholder="Aiden" onChange={e => setName(e.target.value)} />
        </label>
        <div className="home-buttons">
          <button className="btn dark big" disabled={busy} onClick={onBot}>Play vs Bot</button>
          <button className="btn big" disabled={busy} onClick={onCreate}>Invite a friend</button>
        </div>
        {error && <span className="error">{error}</span>}
        <button className="link" onClick={() => setRules(true)}>How to play →</button>
      </div>
      <div className="home-fan">
        {fan.map((id, i) => (
          <motion.div key={id} className="fan-card"
            initial={{ opacity: 0, y: 80, rotate: 0 }}
            animate={{ opacity: 1, y: [0, -10, 0], rotate: (i - 1.5) * 7 }}
            transition={{ opacity: { delay: i * 0.08 }, rotate: { delay: i * 0.08, type: 'spring' }, y: { duration: 5 + i, repeat: Infinity, ease: 'easeInOut' } }}
            style={{ left: 40 + i * 150, top: 120 + Math.abs(i - 1.5) * 26, zIndex: i === 2 ? 5 : i }}>
            <CardFace cardId={id} scale={0.6} />
          </motion.div>
        ))}
      </div>
      <AnimatePresence>{rules && <Rules onClose={() => setRules(false)} />}</AnimatePresence>
    </div>
  );
}

export function Rules({ onClose }: { onClose: () => void }) {
  const kw: [string, string][] = [
    ['Resolve', 'Fires only if your opponent has already passed. Each house’s finisher.'],
    ['Deploy', 'Fires when the card is played.'],
    ['Burn X', 'Deal X damage to a unit.'],
    ['Poison', 'Loses 1 at the end of each of its controller’s turns.'],
    ['Grow', 'Gains 1 at the end of each of your turns.'],
    ['Shield', 'Blocks the next power loss, then breaks.'],
    ['Guard', 'In your Front row: enemies can’t target your Back row.'],
    ['Rally X', 'Other units in this row gain X.'],
    ['Echo X', 'Summon an X-power token in your other row.'],
    ['Sacrifice', 'Destroy one of your own units for an effect.'],
    ['Duel', 'Two units trade hits, this one first, until one dies.'],
    ['Silence', 'Removes Grow, Guard, Shield and Poison.'],
  ];
  return (
    <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal" initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className="modal-cols">
          <div>
            <span className="mono dim">HOW TO PLAY</span>
            <h2>Win two of three rounds.</h2>
            <ol>
              <li>Each player draws <b>8</b> cards. You draw <b>2</b> more after each round (hand limit 10).</li>
              <li>On your turn, <b>play one card</b> or <b>pass</b>. Once you pass, you’re out until the round ends.</li>
              <li>When both players have passed, the higher total wins the round. A tie counts for both.</li>
              <li>The board clears between rounds. Cards you spent are gone, so don’t overspend to win Round 1.</li>
              <li>The first player gets <b>First Light</b>: +1 to their Round 1 total.</li>
            </ol>
            <p className="dim">Each side has a <b>Front</b> and a <b>Back</b> row, 6 units each. Cards say which row they go in.</p>
          </div>
          <div>
            <span className="mono dim">KEYWORDS</span>
            <div className="kw-grid">{kw.map(([k, t]) => <div key={k}><b>{k}</b><span>{t}</span></div>)}</div>
          </div>
        </div>
        <button className="btn dark" onClick={onClose}>Got it</button>
      </motion.div>
    </motion.div>
  );
}

export function Join({ code, name, setName, onJoin, error, busy }: { code: string; name: string; setName: (n: string) => void; onJoin: () => void; error: string | null; busy: boolean }) {
  return (
    <div className="center-screen">
      <div className="join-card">
        <span className="mono dim">YOU’VE BEEN INVITED · MATCH {code}</span>
        <h1 className="logo small">AFTERLIGHT</h1>
        <label className="field">
          <span className="mono dim">YOUR NAME</span>
          <input value={name} maxLength={18} placeholder="Your name" autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onJoin()} />
        </label>
        <button className="btn dark big" disabled={busy} onClick={onJoin}>Join match</button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

export function Lobby({ room, onLeave }: { room: RoomSnapshot; onLeave: () => void }) {
  const me = room.seats[room.you]!;
  const op = room.seats[room.you === 0 ? 1 : 0];
  const [copied, setCopied] = useState(false);
  const [peek, setPeek] = useState<House | null>(null);
  const link = `${location.origin}/r/${room.code}`;
  const choose = (h: House) => socket.emit('lobby:house', h);
  const shownHouse = peek ?? me.house;
  return (
    <div className="lobby">
      <div className="lobby-top">
        <div>
          <span className="mono dim">{room.vsBot ? 'PRACTICE MATCH VS BOT' : `MATCH ROOM · ${room.code}`}</span>
          <h1 className="lobby-title">Choose your house</h1>
        </div>
        {!room.vsBot && (
          <div className="invite">
            <span className="mono dim">SEND THIS LINK TO YOUR OPPONENT</span>
            <div className="invite-row">
              <code>{link}</code>
              <button className="btn small dark" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        )}
      </div>
      <div className="houses">
        {ALL_HOUSES.map(h => {
          const H = HOUSES[h];
          const on = me.house === h;
          return (
            <motion.button key={h} className={`house${on ? ' on' : ''}`} style={{ background: H.paper, borderColor: on ? H.accent : H.frame, ['--acc' as string]: H.accent }}
              whileHover={{ y: -6 }} onMouseEnter={() => setPeek(h)} onMouseLeave={() => setPeek(null)} onClick={() => choose(h)}>
              <div className="house-back"><CardBack house={h} scale={0.26} /></div>
              <div className="house-info">
                <span className="mono" style={{ color: H.accent }}>{H.tagline.toUpperCase()}</span>
                <strong>{H.name}</strong>
                <p>{H.plan}</p>
              </div>
              {on && <span className="house-check" style={{ background: H.accent }}>SELECTED</span>}
            </motion.button>
          );
        })}
      </div>
      <div className="lobby-bottom">
        <div className="legends">
          {shownHouse ? deckList(shownHouse).slice(0, 3).map(id => (
            <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><CardFace cardId={id} scale={0.3} /></motion.div>
          )) : <span className="mono dim legends-hint">HOVER A HOUSE TO SEE ITS LEGENDS</span>}
          {shownHouse && <div className="deck-list">
            <span className="mono dim">DECK · 18 CARDS</span>
            {[...new Set(deckList(shownHouse))].map(id => (
              <div key={id}><span>{CARDS[id].name}</span><span className="mono dim">{CARDS[id].tier === 'LEGEND' ? '×1' : '×3'} · {CARDS[id].kind === 'unit' ? CARDS[id].power : 'SP'}</span></div>
            ))}
          </div>}
        </div>
        <div className="seats">
          <Seat label="YOU" s={me} />
          <span className="vs">VS</span>
          {op ? <Seat label={op.isBot ? 'BOT' : 'OPPONENT'} s={op} /> : <div className="seat empty"><span className="mono dim">WAITING FOR OPPONENT…</span><span className="dots"><i /><i /><i /></span></div>}
          <div className="seat-actions">
            <button className={`btn big ${me.ready ? '' : 'dark'}`} disabled={!me.house} onClick={() => socket.emit('lobby:ready', !me.ready)}>
              {!me.house ? 'Pick a house' : me.ready ? (room.vsBot ? 'Starting…' : 'Not ready') : room.vsBot ? 'Start match' : 'Ready'}
            </button>
            <button className="btn ghost" onClick={onLeave}>Leave</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Seat({ label, s }: { label: string; s: NonNullable<RoomSnapshot['seats'][0]> }) {
  const H = s.house ? HOUSES[s.house] : null;
  return (
    <div className="seat" style={{ borderColor: H?.frame ?? '#D9D7DE', background: H?.paper ?? '#fff' }}>
      {s.house && !s.isBot ? <Sigil house={s.house} size={30} /> : <div style={{ width: 30 }} />}
      <div className="seat-name">
        <span className="mono dim">{label}{!s.connected ? ' · OFFLINE' : ''}</span>
        <strong>{s.name}</strong>
        <span className="mono" style={{ color: H?.accent ?? '#8A8692' }}>{s.isBot ? 'HOUSE REVEALED AT START' : s.house ? HOUSES[s.house].name.toUpperCase() : 'CHOOSING…'}</span>
      </div>
      {s.ready && <span className="chip solid" style={{ background: H?.accent ?? '#0E0E12' }}>READY</span>}
    </div>
  );
}
