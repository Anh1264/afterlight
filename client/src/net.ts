import { io, Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';

export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: true, transports: ['websocket', 'polling'] });

const safe = <T,>(fn: () => T, fb: T): T => { try { return fn(); } catch { return fb; } };

export const store = {
  name: () => safe(() => localStorage.getItem('al:name') ?? '', ''),
  setName: (n: string) => safe(() => localStorage.setItem('al:name', n), undefined),
  token: (code: string) => safe(() => localStorage.getItem('al:t:' + code) ?? undefined, undefined),
  setToken: (code: string, t: string) => safe(() => localStorage.setItem('al:t:' + code, t), undefined),
};

export function createRoom(name: string, vsBot: boolean): Promise<string> {
  return new Promise((res, rej) => socket.emit('room:create', { name, vsBot }, r => {
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
