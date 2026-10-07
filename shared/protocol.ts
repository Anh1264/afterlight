// Messages between browser and server.
import { ALL_HOUSES, type House } from './cards';
import type { Action, GEvent, PIdx, PlayerView } from './engine';

export interface SeatInfo {
  name: string;
  house: House | null;
  ready: boolean;
  connected: boolean;
  /** using a custom deck (otherwise the house's starter deck) */
  customDeck: boolean;
  isBot: boolean;
}

export interface RoomSnapshot {
  code: string;
  phase: 'lobby' | 'playing' | 'over';
  vsBot: boolean;
  seats: [SeatInfo | null, SeatInfo | null];
  you: PIdx;
  rematch: [boolean, boolean];
}

export interface GameMsg {
  seq: number;
  view: PlayerView;
  events: GEvent[];
  /** epoch ms when the current turn auto-passes, or null */
  deadline: number | null;
  /** Set only on the last message of a match the server ended itself (and why). The room is deleted right after. */
  ended?: ServerEndReason;
}

export type ServerEndReason = 'error' | 'idle';
export type DeviceClass = 'phone' | 'tablet' | 'desktop';
/** Client handshake: io({ auth: { device } }). Used for logging only. */
export interface HandshakeAuth { device?: DeviceClass }

export interface ClientToServer {
  'room:create': (a: { name: string; vsBot: boolean }, ack: (r: { code: string; token: string } | { error: string }) => void) => void;
  'room:join': (a: { code: string; name: string; token?: string }, ack: (r: { token: string } | { error: string }) => void) => void;
  'lobby:house': (h: House) => void;
  'lobby:ready': (ready: boolean) => void;
  /** set a custom deck for the chosen house; null = go back to the starter deck */
  'lobby:deck': (ids: string[] | null, ack: (r: { ok: true } | { error: string }) => void) => void;
  'game:action': (a: Action, ack: (r: { ok: true } | { error: string }) => void) => void;
  'game:forfeit': () => void;
  'game:rematch': () => void;
  'room:leave': () => void;
}

export interface ServerToClient {
  room: (r: RoomSnapshot) => void;
  game: (g: GameMsg) => void;
  toast: (msg: string) => void;
}

export const TURN_SECONDS = 60;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
/** The only error texts a client sees for a malformed request or a server fault. */
export const BAD_REQUEST = 'Bad request.';
export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// ------------------------------------------------------------- inbound validation
// The server types every inbound payload as unknown and parses it here. `field` names the first bad field, never its value.
export type Parsed<T> = { ok: true; v: T } | { ok: false; field: string };

const fail = (field: string): { ok: false; field: string } => ({ ok: false, field });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max: number, min = 0): x is string => typeof x === 'string' && x.length >= min && x.length <= max;
const isRow = (x: unknown): x is 'F' | 'B' => x === 'F' || x === 'B';
const TOKEN_RE = /^[0-9a-f]{32}$/;

export function parseCreate(p: unknown): Parsed<{ name: string; vsBot: boolean }> {
  if (!isRecord(p)) return fail('payload');
  if (!isStr(p.name, 64)) return fail('name');
  if (typeof p.vsBot !== 'boolean') return fail('vsBot');
  return { ok: true, v: { name: p.name, vsBot: p.vsBot } };
}

export function parseJoin(p: unknown): Parsed<{ code: string; name: string; token?: string }> {
  if (!isRecord(p)) return fail('payload');
  if (!isStr(p.code, 16)) return fail('code');
  const code = p.code.toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH || ![...code].every(c => ROOM_CODE_ALPHABET.includes(c))) return fail('code');
  if (!isStr(p.name, 64)) return fail('name');
  if (p.token === undefined) return { ok: true, v: { code, name: p.name } };
  if (typeof p.token !== 'string' || !TOKEN_RE.test(p.token)) return fail('token');
  return { ok: true, v: { code, name: p.name, token: p.token } };
}

export function parseHouse(p: unknown): Parsed<House> {
  const h = ALL_HOUSES.find(x => x === p);
  return h ? { ok: true, v: h } : fail('payload');
}

export function parseDeck(p: unknown): Parsed<string[] | null> {
  if (p === null) return { ok: true, v: null };
  if (!Array.isArray(p) || p.length > 64) return fail('payload');
  const ids: string[] = [];
  for (const id of p) {
    if (!isStr(id, 40)) return fail('payload');
    ids.push(id);
  }
  return { ok: true, v: ids };
}

export function parseReady(p: unknown): Parsed<boolean> {
  return typeof p === 'boolean' ? { ok: true, v: p } : fail('payload');
}

export function parseAction(p: unknown): Parsed<Action> {
  if (!isRecord(p)) return fail('payload');
  if (p.type === 'pass') return { ok: true, v: { type: 'pass' } };
  if (p.type !== 'play') return fail('type');
  if (!isStr(p.uid, 16, 1)) return fail('uid');
  const a: Extract<Action, { type: 'play' }> = { type: 'play', uid: p.uid };
  if (p.row !== undefined) { if (!isRow(p.row)) return fail('row'); a.row = p.row; }
  if (p.targets !== undefined) {
    if (!Array.isArray(p.targets) || p.targets.length > 8) return fail('targets');
    const t: string[] = [];
    for (const x of p.targets) { if (!isStr(x, 16, 1)) return fail('targets'); t.push(x); }
    a.targets = t;
  }
  if (p.mode !== undefined) {
    if (typeof p.mode !== 'number' || !Number.isInteger(p.mode) || p.mode < 0 || p.mode > 7) return fail('mode');
    a.mode = p.mode;
  }
  if (p.targetRow !== undefined) { if (!isRow(p.targetRow)) return fail('targetRow'); a.targetRow = p.targetRow; }
  return { ok: true, v: a };
}

/** Handshake auth to a device class for logging; anything unexpected is 'unknown'. */
export function parseDevice(auth: unknown): DeviceClass | 'unknown' {
  if (!isRecord(auth)) return 'unknown';
  const d = auth.device;
  return d === 'phone' || d === 'tablet' || d === 'desktop' ? d : 'unknown';
}
