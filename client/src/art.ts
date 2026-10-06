import { useEffect, useState } from 'react';
import type { CardHouse } from '../../shared/cards';

/** Where each Legend's art sits on the 500x700 card face (same values as the design canvas). */
export interface ArtLayout { ax: number; ay: number; aw: number; ah: number; textW: number; mini?: { x: number; y: number; w: number } }

export const ART: Record<string, ArtLayout> = {
  mawroot: { ax: 84, ay: 30, aw: 380, ah: 570, textW: 270 },
  simmer: { ax: 62, ay: 0, aw: 410, ah: 615, textW: 290 },
  vespera: { ax: 92, ay: 30, aw: 400, ah: 600, textW: 290 },
  halden: { ax: 78, ay: 18, aw: 410, ah: 615, textW: 270 },
  kestra: { ax: 92, ay: 24, aw: 400, ah: 600, textW: 290 },
  warden: { ax: 96, ay: 24, aw: 400, ah: 600, textW: 290 },
  vorok: { ax: 92, ay: 24, aw: 400, ah: 600, textW: 270 },
  skarr: { ax: 84, ay: 24, aw: 400, ah: 600, textW: 300 },
  hue: { ax: 92, ay: 24, aw: 400, ah: 600, textW: 290 },
  null9: { ax: 96, ay: 24, aw: 400, ah: 600, textW: 300 },
  drake: { ax: -50, ay: -120, aw: 600, ah: 900, textW: 300, mini: { x: -70, y: -40, w: 230 } },
  aiden: { ax: 98, ay: 30, aw: 400, ah: 600, textW: 290 },
};

/** Layout used for any card whose art was added later (drop <card-id>.webp into public/art). */
export const DEFAULT_LAYOUT: ArtLayout = { ax: 90, ay: 30, aw: 400, ah: 600, textW: 290 };

/** Particle sheet used behind each card (cards without their own sheet borrow their house's). */
const HOUSE_P: Record<CardHouse, string> = { COVEN: 'simmer', ORDER: 'halden', EMBER: 'vorok', ECHO: 'null9', NEUTRAL: 'warden' };

/** File extension per card, filled from the art manifest (webp, png or jpg all work). */
const ext = new Map<string, string>();
export const artSrc = (id: string) => `/art/${id}.${ext.get(id) ?? 'webp'}`;
export const echoSrc = (id: string, n: 0 | 1) => `/art/${id}-e${n}.webp`;
export const shadowSrc = (h: CardHouse) => `/art/sh-${(h === 'NEUTRAL' ? 'order' : h).toLowerCase()}.webp`;
export const particleSrc = (id: string | null, h: CardHouse) => `/art/p-${id && ART[id] ? id : HOUSE_P[h]}.webp`;
export const housePSrc = (h: CardHouse) => `/art/p-${HOUSE_P[h]}.webp`;
export const GRAIN = '/art/grain.webp';

export function preloadArt() {
  const ids = Object.keys(ART);
  const srcs = [GRAIN, ...ids.flatMap(i => [artSrc(i), echoSrc(i, 0), echoSrc(i, 1), particleSrc(i, 'ECHO')]),
    ...(['COVEN', 'ORDER', 'EMBER', 'ECHO'] as CardHouse[]).map(shadowSrc)];
  for (const s of srcs) { const im = new Image(); im.src = s; }
}

// ---------------------------------------------------------------- art discovery
// Art for new cards is picked up automatically: if public/art/<card-id>.webp exists it is used,
// otherwise the card shows its house placeholder. Results are cached so each file is probed once.
const known = new Map<string, boolean>(Object.keys(ART).map(k => [k, true]));
/** art/manifest.json is generated at build time by scripts/art-manifest.mjs. */
const manifest: Promise<Set<string> | null> = fetch('/art/manifest.json')
  .then(r => (r.ok ? r.json() : null))
  .then((j: { art?: string[] } | null) => {
    if (!j?.art) return null;
    const ids = new Set<string>();
    for (const f of j.art) { const m = f.match(/^(.*)\.(\w+)$/); if (m) { ids.add(m[1]); ext.set(m[1], m[2]); } }
    return ids;
  }).catch(() => null);
const probe = new Map<string, Promise<boolean>>();
function check(id: string): Promise<boolean> {
  if (!probe.has(id)) probe.set(id, manifest.then(m => {
    if (m) { known.set(id, m.has(id)); return m.has(id); }
    return new Promise<boolean>(res => { // no manifest (e.g. dev without the script): probe the file
      const im = new Image();
      im.onload = () => { known.set(id, true); res(true); };
      im.onerror = () => { known.set(id, false); res(false); };
      im.src = artSrc(id);
    });
  }));
  return probe.get(id)!;
}

/** Whether a card has art: true / false, or null while the first check is in flight. */
export function useHasArt(id: string | null): boolean | null {
  const [v, setV] = useState<boolean | null>(id ? known.get(id) ?? null : false);
  useEffect(() => {
    if (!id) { setV(false); return; }
    if (known.has(id)) { setV(known.get(id)!); return; }
    let live = true;
    void check(id).then(ok => { if (live) setV(ok); });
    return () => { live = false; };
  }, [id]);
  return v;
}

export const layoutOf = (id: string) => ART[id] ?? DEFAULT_LAYOUT;
/** Originals ship pre-rendered afterimage files; newer art gets CSS-tinted copies instead. */
export const hasEchoFiles = (id: string) => !!ART[id];
