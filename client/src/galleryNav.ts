/** Where the gallery was opened from. It decides the label on the gallery's leave control. */
export type GalleryFrom = 'home' | 'lobby';

/** The history state AFTERLIGHT stores when it pushes /cards. Its presence proves the previous entry is ours. */
export type GalleryMark = { afterlight: 'cards'; from: GalleryFrom };

export const galleryMark = (from: GalleryFrom): GalleryMark => ({ afterlight: 'cards', from });

/** Reads our mark from a history state, or null when this entry was not pushed by the gallery opener (typed link, bookmark, new tab). */
export function readGalleryMark(state: unknown): GalleryMark | null {
  if (typeof state !== 'object' || state === null) return null;
  if (!('afterlight' in state) || state.afterlight !== 'cards') return null;
  return galleryMark('from' in state && state.from === 'lobby' ? 'lobby' : 'home');
}

/** The gallery view for this location: where it was opened from, or null when the page is not the gallery. A direct visit counts as Home. */
export function galleryAt(pathname: string, state: unknown): GalleryFrom | null {
  return pathname === '/cards' ? readGalleryMark(state)?.from ?? 'home' : null;
}

/** Back may step through history only when AFTERLIGHT pushed this entry; otherwise the previous entry could be another site. */
export const canStepBack = (state: unknown): boolean => readGalleryMark(state) !== null;

/** The control names where it leads. */
export const backLabel = (from: GalleryFrom): string => (from === 'lobby' ? '← Back to lobby' : '← Home');
