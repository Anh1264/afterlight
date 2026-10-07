// Card and house definitions for AFTERLIGHT.
// Change numbers here and the engine, bot, server and client all pick them up.

/** A playable house. */
export type House = 'COVEN' | 'ORDER' | 'EMBER' | 'ECHO';
/** Where a card belongs: a house, or Neutral (playable in any deck). */
export type CardHouse = House | 'NEUTRAL';
export type Tier = 'LEGEND' | 'RARE' | 'COMMON';
export type RowRule = 'F' | 'B' | 'E'; // Front, Back, Either

/**
 * Effect id. Either a named effect ('vespera') or a parameterised one ('burn:3', 'burnlow:3:4').
 * See applyEffect in engine.ts for the full list.
 */
export type EffId = string;

export interface Ability { kw: string; t: string }

export interface CardDef {
  id: string;
  name: string;
  epithet: string;
  house: CardHouse;
  tier: Tier;
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
  /** triggers when this unit is destroyed or Sacrificed (not when the round clears the board) */
  lastWords?: EffId;
  text: Ability[];
}

export interface HouseDef {
  id: CardHouse;
  name: string;
  tagline: string;
  plan: string;
  paper: string;
  accent: string;
  frame: string;
  board: string;
}

export const HOUSES: Record<CardHouse, HouseDef> = {
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
  NEUTRAL: {
    id: 'NEUTRAL', name: 'Neutral', tagline: 'Any deck',
    plan: 'Sellswords, wanderers and relics. Neutral cards can go in any house\u2019s deck.',
    paper: '#F6F5F3', accent: '#5E5A64', frame: '#C4C0C8', board: '#EDECEA',
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
  u({ id: 'squire', name: 'Squire', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'F', power: 4, rally: 2,
    text: [{ kw: 'Rally 2.', t: 'Other units in this row gain 2.' }] }),
  u({ id: 'lancer', name: 'Lancer', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'F', power: 6,
    text: [] }),
  u({ id: 'chaplain', name: 'Chaplain', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', rows: 'B', power: 4, eff: 'chaplain',
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
  u({ id: 'cinder-imp', name: 'Cinder Imp', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', rows: 'B', power: 3, eff: 'burn2',
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
    text: [{ kw: 'Echo 3.', t: 'Summon a 3-power Echo in your other row.' }, { kw: 'Deploy:', t: 'Summon a 3-power Echo in your Front row.' }] }),
  u({ id: 'aiden', name: 'Aiden', epithet: 'IRON-HAND', house: 'ECHO', tier: 'LEGEND', rows: 'F', power: 6, eff: 'duel', resolve: 'duel3',
    text: [{ kw: 'Deploy:', t: 'Duel an enemy unit.' }, { kw: 'Resolve:', t: 'Aiden gains +3 first.' }] }),
  u({ id: 'glitch-rat', name: 'Glitch Rat', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'B', power: 2, echo: 3,
    text: [{ kw: 'Echo 3.', t: 'Summon a 3-power token in your other row.' }] }),
  u({ id: 'static-runner', name: 'Static Runner', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'F', power: 5, echo: 2,
    text: [{ kw: 'Echo 2.', t: 'Summon a 2-power token in your other row.' }] }),
  u({ id: 'relay-drone', name: 'Relay Drone', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'B', power: 3, eff: 'shift',
    text: [{ kw: 'Deploy:', t: 'Move an enemy unit to its other row; it loses 2.' }] }),
  u({ id: 'patchwork', name: 'Patchwork', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'F', power: 6,
    text: [] }),
  s({ id: 'afterimage', name: 'Afterimage', epithet: 'SPECIAL', house: 'ECHO', tier: 'COMMON', eff: 'afterimage',
    text: [{ kw: '', t: 'Summon an Echo with the power of your strongest unit in its other row.' }] }),
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
    text: [{ kw: 'Deploy:', t: 'Your tokens gain 2.' }] }),
  u({ id: 'signal-ghost', name: 'Signal Ghost', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', rows: 'B', power: 2, resolve: 'echo4',
    text: [{ kw: 'Resolve:', t: 'Summon a 4-power Echo in your other row.' }] }),

  // ================================================================ SET 2 (art pending)
  // ---- COVEN
  u({ id: 'sporeling', name: 'Sporeling', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', power: 2, grow: true, lastWords: 'token:2', token: 'Spore',
    text: [{ kw: 'Grow.', t: '' }, { kw: 'Last Words:', t: 'Summon a 2-power Spore in this row.' }] }),
  u({ id: 'leech-vine', name: 'Leech Vine', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', power: 3, eff: 'drain:2',
    text: [{ kw: 'Deploy:', t: 'A Poisoned enemy unit loses 2 and this gains 2.' }] }),
  u({ id: 'moss-golem', name: 'Moss Golem', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', power: 5, shield: true,
    text: [{ kw: 'Shield.', t: '' }] }),
  u({ id: 'hex-doll', name: 'Hex Doll', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', power: 2, eff: 'poison1', lastWords: 'poisonrandom',
    text: [{ kw: 'Deploy:', t: 'Poison an enemy unit.' }, { kw: 'Last Words:', t: 'Poison a random enemy unit.' }] }),
  u({ id: 'gravecap', name: 'Gravecap', epithet: 'COMMON', house: 'COVEN', tier: 'COMMON', power: 3, lastWords: 'rowboost:2',
    text: [{ kw: 'Last Words:', t: 'Your other units in this row gain 2.' }] }),
  s({ id: 'overgrowth', name: 'Overgrowth', epithet: 'SPECIAL', house: 'COVEN', tier: 'COMMON', eff: 'growboost:2',
    text: [{ kw: '', t: 'Your Grow units gain 2.' }] }),
  u({ id: 'mother-of-thorns', name: 'Mother of Thorns', epithet: 'RARE', house: 'COVEN', tier: 'RARE', power: 4, grow: true, eff: 'givegrow:2',
    text: [{ kw: 'Grow.', t: '' }, { kw: 'Deploy:', t: 'Give up to 2 other allied units Grow.' }] }),
  u({ id: 'plague-doctor', name: 'Plague Doctor', epithet: 'RARE', house: 'COVEN', tier: 'RARE', power: 2, eff: 'poison2',
    text: [{ kw: 'Deploy:', t: 'Poison 2 enemy units.' }] }),
  u({ id: 'swamp-colossus', name: 'Swamp Colossus', epithet: 'RARE', house: 'COVEN', tier: 'RARE', power: 10, eff: 'selfpoison',
    text: [{ kw: 'Deploy:', t: 'Poison this unit.' }] }),
  u({ id: 'bog-oracle', name: 'Bog Oracle', epithet: 'RARE', house: 'COVEN', tier: 'RARE', power: 2, eff: 'draw:1',
    text: [{ kw: 'Deploy:', t: 'Draw a card.' }] }),
  u({ id: 'venom-spitter', name: 'Venom Spitter', epithet: 'RARE', house: 'COVEN', tier: 'RARE', power: 4, eff: 'venom',
    text: [{ kw: 'Deploy:', t: 'An enemy unit loses 1 for each Poisoned enemy unit.' }] }),
  u({ id: 'seed-keeper', name: 'Seed Keeper', epithet: 'RARE', house: 'COVEN', tier: 'RARE', power: 2, grow: true, lastWords: 'token:4', token: 'Sapling',
    text: [{ kw: 'Grow.', t: '' }, { kw: 'Last Words:', t: 'Summon a 4-power Sapling in this row.' }] }),
  u({ id: 'elder-tree', name: 'The Elder Tree', epithet: 'THE FIRST ROOT', house: 'COVEN', tier: 'LEGEND', power: 6, grow: true, eff: 'eldertree',
    text: [{ kw: 'Grow.', t: '' }, { kw: 'Deploy:', t: 'Every Poisoned enemy unit loses 1. Your other Grow units gain 1.' }] }),
  // ---- ORDER
  u({ id: 'pikeman', name: 'Pikeman', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', power: 4, guard: true,
    text: [{ kw: 'Guard.', t: '' }] }),
  u({ id: 'herald', name: 'Herald', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', power: 3, eff: 'boost:3',
    text: [{ kw: 'Deploy:', t: 'Boost another allied unit by 3.' }] }),
  u({ id: 'shield-maiden', name: 'Shield Maiden', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', power: 4, eff: 'shield:1',
    text: [{ kw: 'Deploy:', t: 'Give another allied unit Shield.' }] }),
  u({ id: 'militia', name: 'Militia', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', power: 3, lastWords: 'token:2', token: 'Recruit',
    text: [{ kw: 'Last Words:', t: 'Summon a 2-power Recruit in this row.' }] }),
  u({ id: 'archer', name: 'Archer', epithet: 'COMMON', house: 'ORDER', tier: 'COMMON', power: 3, eff: 'burnmulti:1:2',
    text: [{ kw: 'Deploy:', t: 'Burn 1 to up to 2 enemy units.' }] }),
  s({ id: 'fortify', name: 'Fortify', epithet: 'SPECIAL', house: 'ORDER', tier: 'COMMON', eff: 'backboost:2',
    text: [{ kw: '', t: 'Boost all your Back-row units by 2.' }] }),
  u({ id: 'inquisitor', name: 'Inquisitor', epithet: 'RARE', house: 'ORDER', tier: 'RARE', power: 4, eff: 'silence0',
    text: [{ kw: 'Deploy:', t: 'Silence an enemy unit.' }] }),
  u({ id: 'field-medic', name: 'Field Medic', epithet: 'RARE', house: 'ORDER', tier: 'RARE', power: 4, eff: 'shieldboost:2',
    text: [{ kw: 'Deploy:', t: 'Give another allied unit Shield and +2.' }] }),
  u({ id: 'standard-bearer', name: 'Standard Bearer', epithet: 'RARE', house: 'ORDER', tier: 'RARE', power: 5, rally: 3,
    text: [{ kw: 'Rally 3.', t: 'Other units in this row gain 3.' }] }),
  u({ id: 'siege-ballista', name: 'Siege Ballista', epithet: 'RARE', house: 'ORDER', tier: 'RARE', power: 5, eff: 'burn:3',
    text: [{ kw: 'Deploy:', t: 'Burn 3.' }] }),
  u({ id: 'paladin', name: 'Paladin', epithet: 'RARE', house: 'ORDER', tier: 'RARE', power: 6, shield: true, lastWords: 'boostrandom:3',
    text: [{ kw: 'Shield.', t: '' }, { kw: 'Last Words:', t: 'A random allied unit gains 3.' }] }),
  u({ id: 'quartermaster', name: 'Quartermaster', epithet: 'RARE', house: 'ORDER', tier: 'RARE', power: 2, eff: 'draw:1',
    text: [{ kw: 'Deploy:', t: 'Draw a card.' }] }),
  u({ id: 'odric', name: 'High Marshal Odric', epithet: 'THE IRON WALL', house: 'ORDER', tier: 'LEGEND', power: 6, guard: true, eff: 'allboost:1', resolve: 'marshal',
    text: [{ kw: 'Guard.', t: '' }, { kw: 'Deploy:', t: 'Your other units gain 1.' }, { kw: 'Resolve:', t: 'They also gain Shield.' }] }),
  // ---- EMBER
  u({ id: 'ember-sprite', name: 'Ember Sprite', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', power: 1, lastWords: 'burnrandom:2',
    text: [{ kw: 'Last Words:', t: 'Burn 2 to a random enemy unit.' }] }),
  u({ id: 'flame-juggler', name: 'Flame Juggler', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', power: 3, eff: 'burnmulti:1:2',
    text: [{ kw: 'Deploy:', t: 'Burn 1 to up to 2 enemy units.' }] }),
  u({ id: 'lava-golem', name: 'Lava Golem', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', power: 7, eff: 'hurtstrongest:2',
    text: [{ kw: 'Deploy:', t: 'Your strongest other unit loses 2.' }] }),
  u({ id: 'acolyte', name: 'Acolyte', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', power: 2, lastWords: 'boostrandom:3',
    text: [{ kw: 'Last Words:', t: 'A random allied unit gains 3.' }] }),
  u({ id: 'pyromancer', name: 'Pyromancer', epithet: 'COMMON', house: 'EMBER', tier: 'COMMON', power: 3, eff: 'burnlow:3:4',
    text: [{ kw: 'Deploy:', t: 'Burn 3 to an enemy unit with 4 or less power.' }] }),
  s({ id: 'fireball', name: 'Fireball', epithet: 'SPECIAL', house: 'EMBER', tier: 'COMMON', eff: 'burn:4',
    text: [{ kw: '', t: 'Burn 4.' }] }),
  u({ id: 'demon-butcher', name: 'Demon Butcher', epithet: 'RARE', house: 'EMBER', tier: 'RARE', power: 5, eff: 'sacburn',
    text: [{ kw: 'Deploy:', t: 'You may Sacrifice another allied unit. Burn the strongest enemy unit by its power.' }] }),
  u({ id: 'flame-warden', name: 'Flame Warden', epithet: 'RARE', house: 'EMBER', tier: 'RARE', power: 5, eff: 'rowburn:1',
    text: [{ kw: 'Deploy:', t: 'Burn 1 to every enemy unit in a row.' }] }),
  u({ id: 'infernal-hound', name: 'Infernal Hound', epithet: 'RARE', house: 'EMBER', tier: 'RARE', power: 7, resolve: 'burn:4',
    text: [{ kw: 'Resolve:', t: 'Burn 4.' }] }),
  u({ id: 'brand-priest', name: 'Brand Priest', epithet: 'RARE', house: 'EMBER', tier: 'RARE', power: 2, eff: 'sacdraw',
    text: [{ kw: 'Deploy:', t: 'You may Sacrifice a unit with 3 or less power. If you do, draw 2 cards.' }] }),
  u({ id: 'magma-titan', name: 'Magma Titan', epithet: 'RARE', house: 'EMBER', tier: 'RARE', power: 11, eff: 'allylose:1',
    text: [{ kw: 'Deploy:', t: 'Your other units lose 1.' }] }),
  u({ id: 'phoenix-whelp', name: 'Phoenix Whelp', epithet: 'RARE', house: 'EMBER', tier: 'RARE', power: 4, lastWords: 'token:5', token: 'Phoenix',
    text: [{ kw: 'Last Words:', t: 'Summon a 5-power Phoenix in this row.' }] }),
  u({ id: 'azhar', name: 'Azhar', epithet: 'THE BURNING CROWN', house: 'EMBER', tier: 'LEGEND', power: 5, eff: 'execute:6',
    text: [{ kw: 'Deploy:', t: 'Destroy an enemy unit with 6 or less power.' }] }),
  // ---- ECHO
  u({ id: 'shard-bot', name: 'Shard Bot', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', power: 2, echo: 2,
    text: [{ kw: 'Echo 2.', t: 'Summon a 2-power token in your other row.' }] }),
  u({ id: 'ping-drone', name: 'Ping Drone', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', power: 3, eff: 'weaken:2',
    text: [{ kw: 'Deploy:', t: 'An enemy unit loses 2.' }] }),
  u({ id: 'splitter', name: 'Splitter', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', power: 3, lastWords: 'token2:2',
    text: [{ kw: 'Last Words:', t: 'Summon two 2-power Echoes in this row.' }] }),
  u({ id: 'hacker', name: 'Hacker', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', power: 3, eff: 'strip',
    text: [{ kw: 'Deploy:', t: 'Remove Guard and Shield from an enemy unit.' }] }),
  u({ id: 'wire-hound', name: 'Wire Hound', epithet: 'COMMON', house: 'ECHO', tier: 'COMMON', power: 5, eff: 'tokenboost:1',
    text: [{ kw: 'Deploy:', t: 'Your tokens gain 1.' }] }),
  s({ id: 'static-burst', name: 'Static Burst', epithet: 'SPECIAL', house: 'ECHO', tier: 'COMMON', eff: 'sweep:2:2',
    text: [{ kw: '', t: 'Every enemy unit with 2 or less power loses 2.' }] }),
  u({ id: 'phase-stalker', name: 'Phase Stalker', epithet: 'RARE', house: 'ECHO', tier: 'RARE', power: 5, eff: 'shift:3',
    text: [{ kw: 'Deploy:', t: 'Move an enemy unit to its other row; it loses 3.' }] }),
  u({ id: 'signal-jammer', name: 'Signal Jammer', epithet: 'RARE', house: 'ECHO', tier: 'RARE', power: 3, eff: 'silence0',
    text: [{ kw: 'Deploy:', t: 'Silence an enemy unit.' }] }),
  u({ id: 'replicator', name: 'Replicator', epithet: 'RARE', house: 'ECHO', tier: 'RARE', power: 4, eff: 'copyally:5',
    text: [{ kw: 'Deploy:', t: 'Choose another allied unit with 5 or less power. Summon an Echo with its power in its other row.' }] }),
  u({ id: 'data-wraith', name: 'Data Wraith', epithet: 'RARE', house: 'ECHO', tier: 'RARE', power: 3, eff: 'draw:1',
    text: [{ kw: 'Deploy:', t: 'Draw a card.' }] }),
  u({ id: 'gridlock-golem', name: 'Gridlock Golem', epithet: 'RARE', house: 'ECHO', tier: 'RARE', power: 6, echo: 3,
    text: [{ kw: 'Echo 3.', t: 'Summon a 3-power token in your other row.' }] }),
  u({ id: 'puppeteer', name: 'Puppeteer', epithet: 'RARE', house: 'ECHO', tier: 'RARE', power: 4, eff: 'seize:2',
    text: [{ kw: 'Deploy:', t: 'Take control of an enemy unit with 2 or less power.' }] }),
  u({ id: 'oracle-prime', name: 'Oracle Prime', epithet: 'THE ALL-SEEING', house: 'ECHO', tier: 'LEGEND', power: 4, eff: 'draw:1', resolve: 'draw:2',
    text: [{ kw: 'Deploy:', t: 'Draw a card.' }, { kw: 'Resolve:', t: 'Draw 2 instead.' }] }),
  // ---- NEUTRAL
  u({ id: 'sellsword', name: 'Sellsword', epithet: 'COMMON', house: 'NEUTRAL', tier: 'COMMON', power: 6,
    text: [] }),
  u({ id: 'scout', name: 'Scout', epithet: 'COMMON', house: 'NEUTRAL', tier: 'COMMON', power: 4, eff: 'weaken:1',
    text: [{ kw: 'Deploy:', t: 'An enemy unit loses 1.' }] }),
  u({ id: 'veteran', name: 'Veteran', epithet: 'COMMON', house: 'NEUTRAL', tier: 'COMMON', power: 4, shield: true,
    text: [{ kw: 'Shield.', t: '' }] }),
  u({ id: 'apothecary', name: 'Apothecary', epithet: 'COMMON', house: 'NEUTRAL', tier: 'COMMON', power: 2, eff: 'boost:3',
    text: [{ kw: 'Deploy:', t: 'Boost another allied unit by 3.' }] }),
  u({ id: 'brawler', name: 'Brawler', epithet: 'COMMON', house: 'NEUTRAL', tier: 'COMMON', power: 4, eff: 'duellow:4',
    text: [{ kw: 'Deploy:', t: 'Duel an enemy unit with 4 or less power.' }] }),
  s({ id: 'second-wind', name: 'Second Wind', epithet: 'SPECIAL', house: 'NEUTRAL', tier: 'COMMON', eff: 'boost:4',
    text: [{ kw: '', t: 'Boost an allied unit by 4.' }] }),
  u({ id: 'bounty-hunter', name: 'Bounty Hunter', epithet: 'RARE', house: 'NEUTRAL', tier: 'RARE', power: 5, eff: 'burnstrongest:3',
    text: [{ kw: 'Deploy:', t: 'Burn 3 to the strongest enemy unit.' }] }),
  u({ id: 'merc-captain', name: 'Mercenary Captain', epithet: 'RARE', house: 'NEUTRAL', tier: 'RARE', power: 5, rally: 2,
    text: [{ kw: 'Rally 2.', t: 'Other units in this row gain 2.' }] }),
  u({ id: 'wayfarer-sage', name: 'Wayfarer Sage', epithet: 'RARE', house: 'NEUTRAL', tier: 'RARE', power: 2, eff: 'draw:1',
    text: [{ kw: 'Deploy:', t: 'Draw a card.' }] }),
  u({ id: 'iron-golem', name: 'Iron Golem', epithet: 'RARE', house: 'NEUTRAL', tier: 'RARE', power: 8, shield: true,
    text: [{ kw: 'Shield.', t: '' }] }),
  u({ id: 'lantern-keeper', name: 'The Lantern Keeper', epithet: 'KEEPER OF THE LAST LIGHT', house: 'NEUTRAL', tier: 'LEGEND', power: 4, eff: 'draw:2',
    text: [{ kw: 'Deploy:', t: 'Draw 2 cards.' }] }),
  u({ id: 'fallen-colossus', name: 'The Fallen Colossus', epithet: 'WALKING RUIN', house: 'NEUTRAL', tier: 'LEGEND', power: 12, eff: 'boardlose:2',
    text: [{ kw: 'Deploy:', t: 'Every other unit on the board loses 2.' }] }),
].map(c => [c.id, c]));

export const ALL_HOUSES: House[] = ['COVEN', 'ORDER', 'EMBER', 'ECHO'];
export const CARD_HOUSES: CardHouse[] = [...ALL_HOUSES, 'NEUTRAL'];
const TIER_ORDER: Record<Tier, number> = { LEGEND: 0, RARE: 1, COMMON: 2 };

/** Every card belonging to a house (or Neutral), Legends first, then Rares, then Commons. */
export function poolOf(h: CardHouse): string[] {
  return Object.values(CARDS).filter(c => c.house === h)
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]).map(c => c.id);
}

// ---------------------------------------------------------------- deckbuilding
export const DECK_RULES = {
  SIZE: 25,
  MAX_LEGENDS: 4,
  MAX_RARES: 6,
  COPIES: { LEGEND: 1, RARE: 2, COMMON: 3 } as Record<Tier, number>,
} as const;

/** Cards a deck of this house may contain: the house's own cards plus Neutral. */
export function deckPool(h: House): string[] {
  return [...poolOf(h), ...poolOf('NEUTRAL')];
}

/** Returns a reason the deck is illegal, or null if it is fine. */
export function validateDeck(h: House, ids: string[]): string | null {
  if (ids.length !== DECK_RULES.SIZE) return `A deck needs exactly ${DECK_RULES.SIZE} cards (this one has ${ids.length}).`;
  const allowed = new Set(deckPool(h));
  const count = new Map<string, number>();
  let legends = 0, rares = 0;
  for (const id of ids) {
    const d = CARDS[id];
    if (!d || !allowed.has(id)) return `${d?.name ?? id} can't go in a ${HOUSES[h].name} deck.`;
    count.set(id, (count.get(id) ?? 0) + 1);
    if (count.get(id)! > DECK_RULES.COPIES[d.tier]) return `Too many copies of ${d.name} (max ${DECK_RULES.COPIES[d.tier]}).`;
    if (d.tier === 'LEGEND') legends++;
    if (d.tier === 'RARE') rares++;
  }
  if (legends > DECK_RULES.MAX_LEGENDS) return `Max ${DECK_RULES.MAX_LEGENDS} Legends per deck.`;
  if (rares > DECK_RULES.MAX_RARES) return `Max ${DECK_RULES.MAX_RARES} Rares per deck.`;
  return null;
}

const x = (id: string, n: number) => Array<string>(n).fill(id);
/** Starter decks: what new players and the bot use. Each is legal and has been balance-tested. */
export const STARTERS: Record<House, string[]> = {
  COVEN: ['mawroot', 'simmer', 'vespera', 'grandmother-rot', 'plague-doctor', 'venom-spitter', 'bog-oracle', 'seed-keeper',
    ...x('blight-moth', 3), ...x('thornling', 3), ...x('rootkeeper', 3), ...x('mire-toad', 3), ...x('bog-brute', 3), ...x('witch-brew', 2)],
  ORDER: ['halden', 'kestra', 'warden', 'ilse', 'standard-bearer', 'field-medic', 'quartermaster', 'inquisitor',
    ...x('shieldbearer', 3), ...x('squire', 3), ...x('lancer', 3), ...x('chaplain', 3), ...x('crossbowman', 3), ...x('hold-the-line', 2)],
  EMBER: ['vorok', 'skarr', 'hue', 'matron-cinder', 'infernal-hound', 'flame-warden', 'brand-priest', 'phoenix-whelp',
    ...x('cinder-imp', 3), ...x('pyre-hound', 3), ...x('ash-cultist', 3), ...x('brimstone-ogre', 3), ...x('ember-whelp', 3), ...x('hellfire', 2)],
  ECHO: ['null9', 'drake', 'aiden', 'lattice', 'replicator', 'data-wraith', 'phase-stalker', 'gridlock-golem',
    ...x('glitch-rat', 3), ...x('static-runner', 3), ...x('relay-drone', 3), ...x('patchwork', 3), ...x('signal-ghost', 3), ...x('afterimage', 2)],
};

/** Starter deck for a house. */
export function deckList(h: House): string[] {
  return STARTERS[h].slice();
}


export const RULES = {
  OPEN_HAND: 8,
  ROUND_DRAW: 2,
  HAND_MAX: 10,
  ROW_MAX: 6,
  FIRST_LIGHT: 2,
  ROUNDS: 3,
  WINS_NEEDED: 2,
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
  { kw: 'Echo', match: /Echo|Spark|token/, t: 'Summons a token with that power in your other row. Tokens count toward your score but vanish at the end of the round.' },
  { kw: 'Sacrifice', match: /Sacrifice/, t: 'Destroy one of your own units to pay for the effect.' },
  { kw: 'Duel', match: /Duel/, t: 'This unit and the target take turns hitting each other for their current power, this unit first, until one is destroyed.' },
  { kw: 'Silence', match: /Silence/, t: 'Removes Grow, Guard, Shield and Poison from a unit.' },
  { kw: 'Boost', match: /Boost/, t: 'A unit gains that much power.' },
  { kw: 'Take control', match: /Take control/, t: 'The enemy unit switches to your side of the board.' },
  { kw: 'Last Words', match: /Last Words/, t: 'Triggers when this unit is destroyed or Sacrificed. Does not trigger when the board clears at the end of a round.' },
  { kw: 'Draw', match: /[Dd]raw/, t: 'Take cards from your deck into your hand. Extra cards are the most valuable thing in the game: each one is another play later.' },
  { kw: 'Destroy', match: /Destroy/, t: 'The unit is removed outright, whatever its power. Shield does not stop it.' },
];

export function keywordsOf(def: CardDef): { kw: string; t: string }[] {
  const text = def.text.map(a => `${a.kw} ${a.t}`).join(' ');
  return KEYWORDS.filter(k => k.match.test(text));
}
