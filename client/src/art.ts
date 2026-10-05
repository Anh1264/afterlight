import type { House } from '../../shared/cards';

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

/** Particle sheet used behind each card (commons borrow their house's Legend sheet). */
const HOUSE_P: Record<House, string> = { COVEN: 'simmer', ORDER: 'halden', EMBER: 'vorok', ECHO: 'null9' };

export const artSrc = (id: string) => `/art/${id}.webp`;
export const echoSrc = (id: string, n: 0 | 1) => `/art/${id}-e${n}.webp`;
export const shadowSrc = (h: House) => `/art/sh-${h.toLowerCase()}.webp`;
export const particleSrc = (id: string | null, h: House) => `/art/p-${id && ART[id] ? id : HOUSE_P[h]}.webp`;
export const housePSrc = (h: House) => `/art/p-${HOUSE_P[h]}.webp`;
export const GRAIN = '/art/grain.webp';

export function preloadArt() {
  const ids = Object.keys(ART);
  const srcs = [GRAIN, ...ids.flatMap(i => [artSrc(i), echoSrc(i, 0), echoSrc(i, 1), particleSrc(i, 'ECHO')]),
    ...(['COVEN', 'ORDER', 'EMBER', 'ECHO'] as House[]).map(shadowSrc)];
  for (const s of srcs) { const im = new Image(); im.src = s; }
}
