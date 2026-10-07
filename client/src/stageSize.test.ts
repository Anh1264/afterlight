import { describe, expect, it } from 'vitest';
import { STAGE_H, STAGE_MAX_W, STAGE_MIN_W, stageScale, stageWidth } from './stageSize';

describe('stage size', () => {
  it('keeps 1600 for 16:9 and for windows narrower than 16:9', () => {
    expect(stageWidth(1920, 1080)).toBe(STAGE_MIN_W);
    expect(stageWidth(1440, 900)).toBe(STAGE_MIN_W);
    expect(stageWidth(1200, 900)).toBe(STAGE_MIN_W);
    expect(stageScale(1200, 900)).toBeCloseTo(0.75);
  });

  it('widens the stage to follow a window wider than 16:9', () => {
    expect(stageWidth(1366, 650)).toBe(1891);
    expect(stageWidth(1280, 600)).toBe(1920);
    expect(stageWidth(1280, 600) * stageScale(1280, 600)).toBeCloseTo(1280, 0);
    expect(STAGE_H * stageScale(1280, 600)).toBeCloseTo(600, 0);
  });

  it('caps the width at 2100 and then scales to fit the width', () => {
    expect(stageWidth(3440, 1440)).toBe(STAGE_MAX_W);
    expect(stageScale(3440, 1440)).toBeCloseTo(3440 / STAGE_MAX_W < 1440 / STAGE_H ? 3440 / STAGE_MAX_W : 1440 / STAGE_H);
    expect(stageWidth(5000, 1000)).toBe(STAGE_MAX_W);
  });

  it('falls back to 1600 for a zero-sized window', () => {
    expect(stageWidth(0, 0)).toBe(STAGE_MIN_W);
  });
});
