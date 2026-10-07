import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RoomSnapshot, ServerEndReason } from '../../shared/protocol';
import { Director } from './director';
import { OfflineError, createRoom, joinRoom, socket, store } from './net';
import { ENDED, OFFLINE, RESTARTED, bootAt, fetchUptimeS, lostMatch } from './recovery';
import { ServerEnded } from './components/ServerEnded';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { FullscreenButton } from './components/FullscreenButton';
import { Game } from './components/Game';
import { Home, Join, Lobby } from './components/Screens';
import { Stage } from './components/Stage';
import { Gallery } from './components/Gallery';
import { preloadArt } from './art';

const codeFromPath = () => (location.pathname.match(/^\/r\/([A-Z0-9]{4,8})/i)?.[1] ?? '').toUpperCase();

export default function App() {
  const director = useMemo(() => new Director(), []);
  const ds = useSyncExternalStore(director.subscribe, director.get);
  const [code, setCode] = useState(codeFromPath);
  const [gallery, setGallery] = useState(() => location.pathname === '/cards');
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [name, setNameS] = useState(store.name());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setName = (n: string) => { setNameS(n); store.setName(n); };
  const [notice, setNotice] = useState<string | null>(null); // calm messages: restarted, ended, offline
  const [retrying, setRetrying] = useState(false); // a start is waiting for the server to come back
  const [down, setDown] = useState(() => !socket.connected);
  const overRef = useRef(false); // the last state the server sent says the match is over
  const [ended, setEnded] = useState<ServerEndReason | null>(null);
  const lastSeen = useRef<{ code: string; bootAt: number | null } | null>(null);
  const bootRef = useRef<number | null>(null); // the connected server's boot time, from /health
  const gen = useRef(0); // bumped by every navigation, so a late lose() can't write over a newer screen
  const pendingStart = useRef<boolean | null>(null);
  const setPending = (v: boolean | null) => { pendingStart.current = v; setRetrying(v !== null); };
  const startRef = useRef<(vsBot: boolean) => Promise<void>>(async () => {});

  useEffect(() => { preloadArt(); }, []);

  useEffect(() => {
    const seen = () => { const c = codeFromPath(); if (c) lastSeen.current = { code: c, bootAt: bootRef.current }; };
    const onRoom = (r: RoomSnapshot) => {
      seen();
      setRoom(prev => {
        if (prev && prev.phase !== 'lobby' && r.phase === 'lobby') director.reset();
        return r;
      });
    };
    socket.on('room', onRoom);
    // The server ended the match itself: drop the seat so a reconnect can't rejoin, and show why instead of a board.
    const onEnded = (reason: ServerEndReason) => {
      const c = codeFromPath();
      if (c) store.clearToken(c);
      history.replaceState(null, '', '/');
      lastSeen.current = null; overRef.current = false;
      director.reset(); setRoom(null); setCode(''); setEnded(reason);
    };
    const onGame = (m: Parameters<typeof director.push>[0]) => { if (m.ended) return onEnded(m.ended); overRef.current = !!m.view.over; seen(); director.push(m); };
    socket.on('game', onGame);
    return () => { socket.off('room', onRoom); socket.off('game', onGame); };
  }, [director]);

  // auto-(re)join when the URL has a room we hold a seat in
  useEffect(() => {
    const rejoin = () => {
      const c = codeFromPath();
      if (!c || !store.token(c)) return;
      joinRoom(c, store.name()).catch(() => {
        // A finished match keeps its end screen: just forget the seat.
        if (overRef.current) { store.clearToken(c); return; }
        void lose(c);
      });
    };
    // The rejoin failed while we held a token: the match is gone. Say why, and go home.
    const lose = async (c: string) => {
      store.clearToken(c);
      history.replaceState(null, '', '/');
      setCode(''); setRoom(null); director.reset();
      const g = ++gen.current;
      const seenBoot = lastSeen.current?.code === c ? lastSeen.current.bootAt : null;
      const up = await fetchUptimeS();
      if (g !== gen.current) return;
      const why = lostMatch(seenBoot, up === null ? null : bootAt(up, Date.now()));
      setNotice(why === 'restarted' ? RESTARTED : ENDED);
    };
    rejoin();
    socket.on('connect', rejoin);
    const onPop = () => { setPending(null); gen.current++; setEnded(null); setGallery(location.pathname === '/cards'); setCode(codeFromPath()); setRoom(null); director.reset(); rejoin(); };
    window.addEventListener('popstate', onPop);
    return () => { socket.off('connect', rejoin); window.removeEventListener('popstate', onPop); };
  }, [director]);

  // A refused socket (per-IP or global cap) is never retried by Socket.IO: show why and try again in 10 s.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { if (!socket.active) socket.connect(); }, 10_000); };
    const onErr = (err: Error) => {
      if (socket.active) return;
      setError(err.message);
      arm();
    };
    if (!socket.active) arm(); // refused before we mounted (the phone screen was showing)
    // Remember which server boot we are talking to; a rejoin that fails on a newer boot means a restart.
    const noteBoot = () => {
      void fetchUptimeS().then(u => {
        if (u === null) return;
        bootRef.current = bootAt(u, Date.now());
        if (lastSeen.current && lastSeen.current.bootAt === null) lastSeen.current.bootAt = bootRef.current;
      });
    };
    if (socket.connected) noteBoot();
    socket.on('connect', noteBoot);
    const onUp = () => setDown(false), onDown = () => setDown(true);
    setDown(!socket.connected);
    socket.on('connect', onUp); socket.on('disconnect', onDown);
    // One listener, registered at mount: retry the start that timed out while the server was away.
    const onConnect = () => {
      const pending = pendingStart.current;
      if (pending === null) return;
      setRetrying(false);
      pendingStart.current = null;
      setNotice(n => (n === OFFLINE ? null : n));
      void startRef.current(pending);
    };
    socket.on('connect_error', onErr);
    socket.on('connect', onConnect);
    return () => { clearTimeout(timer); socket.off('connect_error', onErr); socket.off('connect', onConnect); socket.off('connect', noteBoot); socket.off('connect', onUp); socket.off('disconnect', onDown); };
  }, []);

  const go = (c: string) => { history.pushState(null, '', c ? `/r/${c}` : '/'); setCode(c); };
  const start = async (vsBot: boolean) => {
    setPending(null); gen.current++;
    setBusy(true); setError(null); setNotice(null);
    try { const c = await createRoom(name || 'Player', vsBot); go(c); }
    catch (e) {
      if (e instanceof OfflineError) { setPending(vsBot); setNotice(OFFLINE); if (!socket.active) socket.connect(); }
      else setError((e as Error).message);
    }
    finally { setBusy(false); }
  };
  startRef.current = start;
  const join = async () => {
    setBusy(true); setError(null);
    try { await joinRoom(code, name || 'Player'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const home = () => { setPending(null); gen.current++; overRef.current = false; setError(null); setNotice(null); setEnded(null); lastSeen.current = null; socket.emit('room:leave'); director.reset(); setRoom(null); go(''); };

  const openGallery = () => { setPending(null); history.pushState(null, '', '/cards'); setGallery(true); };
  const closeGallery = () => { history.back(); };
  let screen: React.ReactNode;
  if (ended) screen = <ServerEnded reason={ended} onHome={home} />;
  else if (gallery) screen = <Gallery onBack={() => { if (history.length > 1) closeGallery(); else { history.replaceState(null, '', '/'); setGallery(false); } }} />;
  else if (!code) screen = <Home name={name} setName={setName} onBot={() => start(true)} onCreate={() => start(false)} onCards={openGallery} busy={busy || retrying} error={error} notice={notice} />;
  else if (!room && store.token(code) && !error) screen = <div className="center-screen mono dim">RECONNECTING…</div>;
  else if (!room) screen = <Join code={code} name={name} setName={setName} onJoin={join} error={error} busy={busy} />;
  else if (room.phase === 'lobby') screen = <Lobby room={room} onLeave={home} onCards={openGallery} />;
  else if (ds.shown) screen = <Game room={room} director={director} onHome={home} />;
  else screen = <div className="center-screen mono dim">LOADING MATCH…</div>;

  const inMatch = !gallery && !!code && !!room && room.phase !== 'lobby' && ds.shown;
  const lost = down && inMatch && !ds.shown?.over;
  return <><Stage>{screen}</Stage>{!inMatch && <FullscreenButton />}{lost && <ConnectionOverlay />}</>;
}
