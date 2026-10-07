/** Stage geometry: a fixed design height whose width follows the window, so wide windows have no empty side bands. */
export const STAGE_H = 900;
export const STAGE_MIN_W = 1600; // 16:9; narrower windows keep this width and get bands above and below instead
export const STAGE_MAX_W = 2100; // about 21:9; wider windows get side bands again rather than a stretched board

/** Design width of the stage for a window of the given inner size. */
export function stageWidth(iw: number, ih: number): number {
  if (!(iw > 0) || !(ih > 0)) return STAGE_MIN_W;
  return Math.min(STAGE_MAX_W, Math.max(STAGE_MIN_W, Math.round(STAGE_H * iw / ih)));
}

/** Scale that fits the stage inside the window. */
export function stageScale(iw: number, ih: number): number {
  return Math.min(iw / stageWidth(iw, ih), ih / STAGE_H);
}
