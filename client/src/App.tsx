import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';
import { Director } from './director';
import { createRoom, joinRoom, socket, store } from './net';
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

  useEffect(() => { preloadArt(); }, []);

  useEffect(() => {
    const onRoom = (r: RoomSnapshot) => {
      setRoom(prev => {
        if (prev && prev.phase !== 'lobby' && r.phase === 'lobby') director.reset();
        return r;
      });
    };
    socket.on('room', onRoom);
    socket.on('game', m => director.push(m));
    return () => { socket.off('room', onRoom); socket.off('game'); };
  }, [director]);

  // auto-(re)join when the URL has a room we hold a seat in
  useEffect(() => {
    const rejoin = () => {
      const c = codeFromPath();
      if (c && store.token(c)) joinRoom(c, store.name()).catch(e => { setError(e.message); setRoom(null); });
    };
    rejoin();
    socket.on('connect', rejoin);
    const onPop = () => { setGallery(location.pathname === '/cards'); setCode(codeFromPath()); setRoom(null); director.reset(); rejoin(); };
    window.addEventListener('popstate', onPop);
    return () => { socket.off('connect', rejoin); window.removeEventListener('popstate', onPop); };
  }, [director]);

  const go = (c: string) => { history.pushState(null, '', c ? `/r/${c}` : '/'); setCode(c); };
  const start = async (vsBot: boolean) => {
    setBusy(true); setError(null);
    try { const c = await createRoom(name || 'Player', vsBot); go(c); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const join = async () => {
    setBusy(true); setError(null);
    try { await joinRoom(code, name || 'Player'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const home = () => { socket.emit('room:leave'); director.reset(); setRoom(null); go(''); };

  const openGallery = () => { history.pushState(null, '', '/cards'); setGallery(true); };
  const closeGallery = () => { history.back(); };
  let screen: React.ReactNode;
  if (gallery) screen = <Gallery onBack={() => { if (history.length > 1) closeGallery(); else { history.replaceState(null, '', '/'); setGallery(false); } }} />;
  else if (!code) screen = <Home name={name} setName={setName} onBot={() => start(true)} onCreate={() => start(false)} onCards={openGallery} busy={busy} error={error} />;
  else if (!room && store.token(code) && !error) screen = <div className="center-screen mono dim">RECONNECTING…</div>;
  else if (!room) screen = <Join code={code} name={name} setName={setName} onJoin={join} error={error} busy={busy} />;
  else if (room.phase === 'lobby') screen = <Lobby room={room} onLeave={home} onCards={openGallery} />;
  else if (ds.shown) screen = <Game room={room} director={director} onHome={home} />;
  else screen = <div className="center-screen mono dim">LOADING MATCH…</div>;

  return <Stage>{screen}</Stage>;
}
