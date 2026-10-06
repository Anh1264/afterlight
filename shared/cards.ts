// Card and house definitions for AFTERLIGHT v0.1.
// Stats mirror the balanced simulator (mvp/sim.py). Change numbers here and the
// engine, bot, server and client all pick them up.

export type House = 'COVEN' | 'ORDER' | 'EMBER' | 'ECHO';
export type RowRule = 'F' | 'B' | 'E'; // Front, Back, Either

export type EffId =
  | 'poison1' | 'poison2' | 'poison3' | 'poisonrow' | 'vespera' | 'givegrow'
  | 'chaplain' | 'holdline' | 'boostall1' | 'silence'
  | 'burn2' | 'burn4' | 'burn8' | 'burnall1' | 'hellfire' | 'cultist' | 'ogre' | 'skarr'
  | 'shift' | 'afterimage' | 'seize4' | 'echo3front' | 'duel' | 'duel3'
  | 'rotrow' | 'bloom' | 'toad' | 'aurel' | 'shieldfront' | 'burn2x2' | 'gorehorn' | 'mirror' | 'lattice' | 'echo4';

export interface Ability { kw: string; t: string }

export interface CardDef {
  id: string;
  name: string;
  epithet: string;
  house: House;
  tier: 'LEGEND' | 'COMMON';
  kind: 'unit' | 'special';
  power?: number;
  grow?: boolean;
  guard?: boolean;
  shield?: boolean;
  rally?: number;
  echo?: number;
  /** name of the token Echo X summons (default "Echo") */
  token?: string;
  /** printed on the card as where it works best; every unit can go in either row */
  rows?: RowRule;
  eff?: EffId;
  resolve?: EffId;
  text: Ability[];
}

export interface HouseDef {
  id: House;
  name: string;
  tagline: string;
  plan: string;
  paper: string;
  accent: string;
  frame: string;
  board: string;
}

export const HOUSES: Record<House, HouseDef> = {
  COVEN: {
    id: 'COVEN', name: 'The Coven', tagline: 'Poison & Grow',
    plan: 'Poison drains enemy units every turn they stay in; Grow builds yours. Wins long rounds.',
    paper: '#F5F7F2', accent: '#2F7A4B', frame: '#8FC79A', board: '#ECEFE8',
  },
  ORDER: {
    id: 'ORDER', name: 'The Order', tagline: 'Shield, Guard & Rally',
    plan: 'A tall Front row that removal can’t crack. Shield soaks hits, Guard hides your Back row.',
    paper: '#F4F5F9', accent: '#3B42C4', frame: '#9196EA', board: '#E9EAF2',
  },
  EMBER: {
    id: 'EMBER', name: 'The Ember', tagline: 'Burn & Sacrifice',
    plan: 'Burn removes their best unit; Sacrifice turns small units into big ones. Wins short rounds.',
    paper: '#F9F4F2', accent: '#C21F33', frame: '#EE8A80', board: '#F2EAE7',
  },
  ECHO: {
    id: 'ECHO', name: 'The Echo', tagline: 'Echo & Disrupt',
    plan: 'Floods both rows with tokens, then steals and shoves enemy units. Too wide to Burn down.',
    paper: '#F3F5F7', accent: '#0B7F8E', frame: '#7FD3DC', board: '#E7ECEF',
  },
};

const u = (d: Omit<CardDef, 'kind'>): CardDef => ({ kind: 'unit', ...d });
const s = (d: Omit<CardDef, 'kind'>): CardDef => ({ kind: 'special', ...d });

export const CARDS: Record<string, CardDef> = Object.fromEntries([
  // COVEN
  u({ id: 'mawroot', name: 'Mawroot', epithet: 'THE POTTED MAW', house: 'COVEN', tier: 'LEGEND', rows: 'F', power: 6, grow: true, eff: 'poison1',
    text: [{ kw: 'Grow.', t: '' }, { kw: 'Deploy:', t: 'Poison an enemy unit.' }] }),
  u({ id: 'simmer', name: 'Simmer', epithet: 'THE BREW WRAITH', house: 'COVEN', tier: 'LEGEND', rows: 'B', power: 4, eff: 'poison2', resolve: 'poison3',
    text: [{ kw: 'Deploy:', t: 'Poison 2 enemy units.' }, { kw: 'Resolve:', t: 'Poison 3 instead.' }] }),
  u({ id: 'vespera', name: 'Vespera', epithet: 'BONE-MASK', house: 'COVEN', tier: 'LEGEND', rows: 'B', power: 5, eff: 'vespera',
    text: [{ kw: 'Deploy:', t: 'Every Poisoned enemy unit loses 2.' }] }),
  u({ id: 'thornling', name: 'Thornling', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', rows: 'B', power: 2, grow: true,
    text: [{ kw: 'Grow.', t: '' }] }),
  u({ id: 'blight-moth', name: 'Blight Moth', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', rows: 'B', power: 2, eff: 'poison1',
    text: [{ kw: 'Deploy:', t: 'Poison an enemy unit.' }] }),
  u({ id: 'bog-brute', name: 'Bog Brute', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', rows: 'F', power: 4,
    text: [] }),
  u({ id: 'rootkeeper', name: 'Rootkeeper', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', rows: 'F', power: 4, eff: 'givegrow',
    text: [{ kw: 'Deploy:', t: 'Give another allied unit Grow.' }] }),
  s({ id: 'witch-brew', name: 'Witch Brew', epithet: 'SPECIAL', house: 'COVEN', tier: 'COMMON', eff: 'poisonrow',
    text: [{ kw: '', t: 'Poison the 2 strongest enemy units in a row.' }] }),
  // ORDER
  u({ id: 'halden', name: 'Ser Halden', epithet: 'THE WHITE CROSS', house: 'ORDER', tier: 'LEGEND', rows: 'F', power: 6, guard: true, shield: true,
    text: [{ kw: 'Guard.', t: '' }, { kw: 'Shield.', t: '' }] }),
  u({ id: 'kestra', name: 'Kestra', epithet: 'TARGET-STAFF', house: 'ORDER', tier: 'LEGEND', rows: 'E', power: 5, resolve: 'boostall1',
    text: [{ kw: 'Resolve:', t: 'Boost all your units by 1.' }] }),
  u({ id: 'warden', name: 'The Warden', epithet: 'SHADE-BINDER', house: 'ORDER', tier: 'LEGEND', rows: 'B', power: 4, eff: 'silence',
    text: [{ kw: 'Deploy:', t: 'Silence an enemy unit, then it loses 2.' }] }),
  u({ id: 'shieldbearer', name: 'Shieldbearer', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'F', power: 5, guard: true, shield: true,
    text: [{ kw: 'Guard.', t: '' }, { kw: 'Shield.', t: '' }] }),
  u({ id: 'squire', name: 'Squire', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'F', power: 3, rally: 2,
    text: [{ kw: 'Rally 2.', t: 'Other units in this row gain 2.' }] }),
  u({ id: 'lancer', name: 'Lancer', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'F', power: 6,
    text: [] }),
  u({ id: 'chaplain', name: 'Chaplain', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'B', power: 3, eff: 'chaplain',
    text: [{ kw: 'Deploy:', t: 'Give another allied unit Shield and +1.' }] }),
  s({ id: 'hold-the-line', name: 'Hold the Line', epithet: 'SPECIAL', house: 'ORDER', tier: 'COMMON', eff: 'holdline',
    text: [{ kw: '', t: 'Boost all your Front-row units by 2.' }] }),
  // EMBER
  u({ id: 'vorok', name: 'Vorok', epithet: 'HELLHAND', house: 'EMBER', tier: 'LEGEND', rows: 'F', power: 6, eff: 'burn4', resolve: 'burn8',
    text: [{ kw: 'Deploy:', t: 'Burn 4.' }, { kw: 'Resolve:', t: 'Burn 8 instead.' }] }),
  u({ id: 'skarr', name: 'Skarr', epithet: 'MARROW KING', house: 'EMBER', tier: 'LEGEND', rows: 'F', power: 6, eff: 'skarr',
    text: [{ kw: 'Deploy:', t: 'Sacrifice up to 2 of your units with 3 or less power. +3 for each.' }] }),
  u({ id: 'hue', name: 'Hue', epithet: 'THE MOTLEY DEVIL', house: 'EMBER', tier: 'LEGEND', rows: 'B', power: 5, eff: 'burnall1',
    text: [{ kw: 'Deploy:', t: 'Burn 1 to every enemy unit.' }] }),
  u({ id: 'cinder-imp', name: 'Cinder Imp', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', rows: 'B', power: 2, eff: 'burn2',
    text: [{ kw: 'Deploy:', t: 'Burn 2.' }] }),
  u({ id: 'pyre-hound', name: 'Pyre Hound', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', rows: 'F', power: 6,
    text: [] }),
  u({ id: 'ash-cultist', name: 'Ash Cultist', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', rows: 'F', power: 3, eff: 'cultist',
    text: [{ kw: 'Deploy:', t: 'You may Sacrifice a unit with 3 or less power; gain its power +2.' }] }),
  u({ id: 'brimstone-ogre', name: 'Brimstone Ogre', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', rows: 'F', power: 8, eff: 'ogre',
    text: [{ kw: 'Deploy:', t: 'Burn 3 to your strongest other unit.' }] }),
  s({ id: 'hellfire', name: 'Hellfire', epithet: 'SPECIAL', house: 'EMBER', tier: 'COMMON', eff: 'hellfire',
    text: [{ kw: 'Choose:', t: 'Burn 5, or Burn 2 to every enemy unit in a row.' }] }),
  // ECHO
  u({ id: 'null9', name: 'Null-9', epithet: 'MASKED RELAY', house: 'ECHO', tier: 'LEGEND', rows: 'F', power: 5, eff: 'seize4',
    text: [{ kw: 'Deploy:', t: 'Take control of an enemy unit with 4 or less power.' }] }),
  u({ id: 'drake', name: 'Drake-07', epithet: 'DRILL DRAKE', house: 'ECHO', tier: 'LEGEND', rows: 'B', power: 3, echo: 3, eff: 'echo3front',
    text: [{ kw: 'Deploy:', t: 'Summon two Echo 3 in your Front row.' }] }),
  u({ id: 'aiden', name: 'Aiden', epithet: 'IRON-HAND', house: 'ECHO', tier: 'LEGEND', rows: 'F', power: 6, eff: 'duel', resolve: 'duel3',
    text: [{ kw: 'Deploy:', t: 'Duel an enemy unit.' }, { kw: 'Resolve:', t: 'Aiden gains +3 first.' }] }),
  u({ id: 'glitch-rat', name: 'Glitch Rat', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'B', power: 2, echo: 3,
    text: [{ kw: 'Echo 3.', t: 'Summon a 3-power token in your other row.' }] }),
  u({ id: 'static-runner', name: 'Static Runner', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'F', power: 4, echo: 2,
    text: [{ kw: 'Echo 2.', t: 'Summon a 2-power token in your other row.' }] }),
  u({ id: 'relay-drone', name: 'Relay Drone', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'B', power: 3, eff: 'shift',
    text: [{ kw: 'Deploy:', t: 'Move an enemy unit to its other row; it loses 2.' }] }),
  u({ id: 'patchwork', name: 'Patchwork', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'F', power: 6,
    text: [] }),
  s({ id: 'afterimage', name: 'Afterimage', epithet: 'SPECIAL', house: 'ECHO', tier: 'COMMON', eff: 'afterimage',
    text: [{ kw: '', t: 'Copy your strongest unit as an Echo in its other row.' }] }),
  // ---------------------------------------------------------------- expansion (art pending)
  // COVEN
  u({ id: 'grandmother-rot', name: 'Grandmother Rot', epithet: 'THE MIRE HAG', house: 'COVEN', tier: 'LEGEND', rows: 'B', power: 4, eff: 'rotrow',
    text: [{ kw: 'Deploy:', t: 'Poison every enemy unit with 4 or less power in a row.' }] }),
  u({ id: 'hollow-bloom', name: 'Hollow Bloom', epithet: 'THE GREEDY FLOWER', house: 'COVEN', tier: 'LEGEND', rows: 'F', power: 5, grow: true, eff: 'bloom',
    text: [{ kw: 'Grow.', t: '' }, { kw: 'Deploy:', t: 'Your other Grow units gain 2.' }] }),
  u({ id: 'mire-toad', name: 'Mire Toad', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', rows: 'F', power: 4, eff: 'toad',
    text: [{ kw: 'Deploy:', t: 'A Poisoned enemy unit loses 3.' }] }),
  // ORDER
  u({ id: 'ilse', name: 'Captain Ilse', epithet: 'THE BANNER', house: 'ORDER', tier: 'LEGEND', rows: 'F', power: 5, rally: 2, resolve: 'shieldfront',
    text: [{ kw: 'Rally 2.', t: '' }, { kw: 'Resolve:', t: 'Give every unit in your Front row Shield.' }] }),
  u({ id: 'aurel', name: 'Brother Aurel', epithet: 'THE LANTERN', house: 'ORDER', tier: 'LEGEND', rows: 'B', power: 5, eff: 'aurel',
    text: [{ kw: 'Deploy:', t: 'Give Shield to up to 2 allied units.' }] }),
  u({ id: 'crossbowman', name: 'Crossbowman', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'B', power: 3, eff: 'burn2',
    text: [{ kw: 'Deploy:', t: 'Burn 2.' }] }),
  // EMBER
  u({ id: 'matron-cinder', name: 'Matron Cinder', epithet: 'THE ASH WIDOW', house: 'EMBER', tier: 'LEGEND', rows: 'B', power: 4, eff: 'burn2x2',
    text: [{ kw: 'Deploy:', t: 'Burn 2 to up to 2 enemy units.' }] }),
  u({ id: 'gorehorn', name: 'Gorehorn', epithet: 'THE STAMPEDE', house: 'EMBER', tier: 'LEGEND', rows: 'F', power: 10, eff: 'gorehorn',
    text: [{ kw: 'Deploy:', t: 'Every other unit in this row loses 2.' }] }),
  u({ id: 'ember-whelp', name: 'Ember Whelp', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', rows: 'F', power: 2, echo: 2, token: 'Spark',
    text: [{ kw: 'Echo 2.', t: 'Summon a 2-power Spark in your other row.' }] }),
  // ECHO
  u({ id: 'mirrorjack', name: 'Mirrorjack', epithet: 'THE COPYCAT', house: 'ECHO', tier: 'LEGEND', rows: 'F', power: 3, eff: 'mirror',
    text: [{ kw: 'Deploy:', t: 'Choose an enemy unit. If it has more power, this becomes its power.' }] }),
  u({ id: 'lattice', name: 'Lattice', epithet: 'THE SWARM MOTHER', house: 'ECHO', tier: 'LEGEND', rows: 'B', power: 4, eff: 'lattice',
    text: [{ kw: 'Deploy:', t: 'Your Echo tokens gain 2.' }] }),
  u({ id: 'signal-ghost', name: 'Signal Ghost', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'B', power: 2, resolve: 'echo4',
    text: [{ kw: 'Resolve:', t: 'Summon a 4-power Echo in your other row.' }] }),
].map(c => [c.id, c]));

export const LEGENDS: Record<House, string[]> = {
  COVEN: ['mawroot', 'simmer', 'vespera', 'grandmother-rot', 'hollow-bloom'],
  ORDER: ['halden', 'kestra', 'warden', 'ilse', 'aurel'],
  EMBER: ['vorok', 'skarr', 'hue', 'matron-cinder', 'gorehorn'],
  ECHO: ['null9', 'drake', 'aiden', 'mirrorjack', 'lattice'],
};
export const COMMONS: Record<House, string[]> = {
  COVEN: ['thornling', 'blight-moth', 'bog-brute', 'rootkeeper', 'mire-toad', 'witch-brew'],
  ORDER: ['shieldbearer', 'squire', 'lancer', 'chaplain', 'crossbowman', 'hold-the-line'],
  EMBER: ['cinder-imp', 'pyre-hound', 'ash-cultist', 'brimstone-ogre', 'ember-whelp', 'hellfire'],
  ECHO: ['glitch-rat', 'static-runner', 'relay-drone', 'patchwork', 'signal-ghost', 'afterimage'],
};

/** 23-card preconstructed deck: 5 Legends x1 + 6 commons x3. */
export function deckList(h: House): string[] {
  return [...LEGENDS[h], ...COMMONS[h], ...COMMONS[h], ...COMMONS[h]];
}

export const ALL_HOUSES: House[] = ['COVEN', 'ORDER', 'EMBER', 'ECHO'];

export const RULES = {
  OPEN_HAND: 8,
  ROUND_DRAW: 2,
  HAND_MAX: 10,
  ROW_MAX: 6,
  FIRST_LIGHT: 1,
} as const;

/** Plain-English keyword definitions, shown in-game and on the All Cards page. */
export const KEYWORDS: { kw: string; match: RegExp; t: string }[] = [
  { kw: 'Resolve', match: /Resolve/, t: 'Only triggers if your opponent has already passed this round. Hold these cards until they pass.' },
  { kw: 'Deploy', match: /Deploy/, t: 'Triggers once, when you play the card.' },
  { kw: 'Guard', match: /Guard/, t: 'Protects your Back row. While a Guard unit sits in your Front row, the enemy cannot target anything in your Back row. Effects that hit "every" unit still get through.' },
  { kw: 'Shield', match: /Shield/, t: 'A one-time block. The next time this unit would lose power (Burn, Poison, a Duel hit), it loses nothing and the Shield breaks.' },
  { kw: 'Poison', match: /Poison/, t: 'Loses 1 power at the end of each of its owner\u2019s turns, until it dies or the round ends. Stops ticking once its owner passes.' },
  { kw: 'Grow', match: /Grow/, t: 'Gains 1 power at the end of each of your turns. Stops once you pass.' },
  { kw: 'Burn', match: /Burn/, t: 'Deal that much damage to a unit. At 0 power it is destroyed.' },
  { kw: 'Rally', match: /Rally/, t: 'When played, every other unit already in the same row gains that much power.' },
  { kw: 'Echo', match: /Echo|Spark/, t: 'Summons a token with that power in your other row. Tokens count toward your score but vanish at the end of the round.' },
  { kw: 'Sacrifice', match: /Sacrifice/, t: 'Destroy one of your own units to pay for the effect.' },
  { kw: 'Duel', match: /Duel/, t: 'This unit and the target take turns hitting each other for their current power, this unit first, until one is destroyed.' },
  { kw: 'Silence', match: /Silence/, t: 'Removes Grow, Guard, Shield and Poison from a unit.' },
  { kw: 'Boost', match: /Boost/, t: 'A unit gains that much power.' },
  { kw: 'Take control', match: /Take control/, t: 'The enemy unit switches to your side of the board.' },
];

export function keywordsOf(def: CardDef): { kw: string; t: string }[] {
  const text = def.text.map(a => `${a.kw} ${a.t}`).join(' ');
  return KEYWORDS.filter(k => k.match.test(text));
}
