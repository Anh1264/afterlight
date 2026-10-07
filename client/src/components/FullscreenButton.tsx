import { useEffect, useState } from 'react';
import './shell.css';

/** Fullscreen availability and entry, shared by the fixed icon (home, lobby) and the in-match link. */
export function useFullscreen(): { available: boolean; enter: () => void } {
  const [full, setFull] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const f = () => setFull(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  return {
    available: document.fullscreenEnabled && !full,
    enter: () => { document.documentElement.requestFullscreen().catch(e => console.warn('fullscreen refused', e)); },
  };
}

export function FullscreenButton() {
  const { available, enter } = useFullscreen();
  if (!available) return null;
  return <button className="fs-btn" aria-label="Fullscreen" title="Fullscreen" onClick={enter}>⛶</button>;
}
