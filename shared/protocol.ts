// Messages between browser and server.
import type { House } from './cards';
import type { Action, GEvent, PIdx, PlayerView } from './engine';

export interface SeatInfo {
  name: string;
  house: House | null;
  ready: boolean;
  connected: boolean;
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
}

export interface ClientToServer {
  'room:create': (a: { name: string; vsBot: boolean }, ack: (r: { code: string; token: string } | { error: string }) => void) => void;
  'room:join': (a: { code: string; name: string; token?: string }, ack: (r: { token: string } | { error: string }) => void) => void;
  'lobby:house': (h: House) => void;
  'lobby:ready': (ready: boolean) => void;
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
