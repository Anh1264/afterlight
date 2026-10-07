import { io, Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';
import { deviceClass } from './device';

export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 3000, timeout: 5000, auth: { device: deviceClass() } });

const safe = <T,>(fn: () => T, fb: T): T => { try { return fn(); } catch { return fb; } };

export const store = {
  name: () => safe(() => localStorage.getItem('al:name') ?? '', ''),
  setName: (n: string) => safe(() => localStorage.setItem('al:name', n), undefined),
  token: (code: string) => safe(() => localStorage.getItem('al:t:' + code) ?? undefined, undefined),
  setToken: (code: string, t: string) => safe(() => localStorage.setItem('al:t:' + code, t), undefined),
  clearToken: (code: string) => safe(() => localStorage.removeItem('al:t:' + code), undefined),
  deck: (house: string): string[] | null => safe(() => { const v = localStorage.getItem('al:deck:' + house); return v ? JSON.parse(v) as string[] : null; }, null),
  setDeck: (house: string, ids: string[] | null) => safe(() => ids ? localStorage.setItem('al:deck:' + house, JSON.stringify(ids)) : localStorage.removeItem('al:deck:' + house), undefined),
};

/** Tell the server which deck to use for the current house (null = starter). */
export function sendDeck(ids: string[] | null): Promise<string | null> {
  return new Promise(res => socket.emit('lobby:deck', ids, r => res('error' in r ? r.error : null)));
}

/** The server did not answer in time: it is down, or the socket is not up yet. */
export class OfflineError extends Error {
  constructor() { super("Can't reach the server."); this.name = 'OfflineError'; }
}

export function createRoom(name: string, vsBot: boolean): Promise<string> {
  // No `connected` fast path: Socket.IO buffers an emit while connecting, and a timed-out emit leaves the buffer.
  return new Promise((res, rej) => socket.timeout(4000).emit('room:create', { name, vsBot }, (err, r) => {
    if (err) return rej(new OfflineError());
    if ('error' in r) return rej(new Error(r.error));
    store.setToken(r.code, r.token);
    res(r.code);
  }));
}

export function joinRoom(code: string, name: string): Promise<void> {
  return new Promise((res, rej) => socket.emit('room:join', { code, name, token: store.token(code) }, r => {
    if ('error' in r) return rej(new Error(r.error));
    store.setToken(code, r.token);
    res();
  }));
}
