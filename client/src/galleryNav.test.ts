import { describe, expect, it } from 'vitest';
import { backLabel, canStepBack, galleryAt, galleryMark, readGalleryMark } from './galleryNav';

/**
 * B1: where the All Cards page was opened from. The mark lives in history.state, which the browser hands back as
 * `unknown` (null for a typed link or a new tab, anything at all if another script wrote it), so every reader must
 * be total: a state that is not ours reads as "no mark", and a mark with a missing or unknown `from` reads as Home.
 */

const notOurs: [string, unknown][] = [
  ['null (typed link, bookmark, new tab)', null],
  ['undefined', undefined],
  ['a string', 'cards'],
  ['a number', 42],
  ['a boolean', true],
  ['an array', ['afterlight', 'cards']],
  ['an empty foreign object', {}],
  ['a foreign object with other keys', { key: 'abc123', usr: null }],
  ['a different afterlight marker', { afterlight: 'lobby', from: 'lobby' }],
  ['the right value on the wrong key', { cards: 'afterlight', from: 'lobby' }],
  ['a from without the afterlight marker', { from: 'lobby' }],
  ['afterlight set to a non-string', { afterlight: true, from: 'lobby' }],
];

const unknownFrom: [string, unknown][] = [
  ['a missing from', { afterlight: 'cards' }],
  ['an unknown from', { afterlight: 'cards', from: 'settings' }],
  ['a wrongly cased from', { afterlight: 'cards', from: 'Lobby' }],
  ['a null from', { afterlight: 'cards', from: null }],
  ['a numeric from', { afterlight: 'cards', from: 1 }],
  ['an undefined from', { afterlight: 'cards', from: undefined }],
];

describe('readGalleryMark', () => {
  it.each(notOurs)('reads %s as no mark', (_name, state) => {
    expect(readGalleryMark(state)).toBeNull();
  });

  it.each(unknownFrom)('reads %s as a Home mark', (_name, state) => {
    expect(readGalleryMark(state)).toEqual({ afterlight: 'cards', from: 'home' });
  });

  it('reads { afterlight: "cards", from: "lobby" } as a lobby mark', () => {
    expect(readGalleryMark({ afterlight: 'cards', from: 'lobby' })).toEqual({ afterlight: 'cards', from: 'lobby' });
  });

  it('reads { afterlight: "cards", from: "home" } as a Home mark', () => {
    expect(readGalleryMark({ afterlight: 'cards', from: 'home' })).toEqual({ afterlight: 'cards', from: 'home' });
  });

  it('ignores extra keys and returns only our own two fields', () => {
    expect(readGalleryMark({ afterlight: 'cards', from: 'lobby', key: 'abc123', usr: 1 })).toEqual({ afterlight: 'cards', from: 'lobby' });
  });

  it.each(['home', 'lobby'] as const)('reads back what galleryMark(%s) wrote', from => {
    expect(readGalleryMark(galleryMark(from))).toEqual({ afterlight: 'cards', from });
  });

  it('reads the same value after the structured clone the browser applies to history state', () => {
    expect(readGalleryMark(structuredClone(galleryMark('lobby')))).toEqual({ afterlight: 'cards', from: 'lobby' });
  });
});

describe('galleryAt', () => {
  it.each(notOurs)('on /cards with %s: a direct visit counts as Home', (_name, state) => {
    expect(galleryAt('/cards', state)).toBe('home');
  });

  it.each(unknownFrom)('on /cards with %s: Home', (_name, state) => {
    expect(galleryAt('/cards', state)).toBe('home');
  });

  it('on /cards opened from a lobby: lobby', () => {
    expect(galleryAt('/cards', { afterlight: 'cards', from: 'lobby' })).toBe('lobby');
  });

  it('on /cards opened from Home: Home', () => {
    expect(galleryAt('/cards', { afterlight: 'cards', from: 'home' })).toBe('home');
  });

  it.each(['/', '/r/ABCD', '/cards/extra', '/cardsx', '/join', ''])('on %j the gallery is not showing, whatever the mark says', path => {
    expect(galleryAt(path, { afterlight: 'cards', from: 'lobby' })).toBeNull();
    expect(galleryAt(path, { afterlight: 'cards', from: 'home' })).toBeNull();
    expect(galleryAt(path, null)).toBeNull();
    expect(galleryAt(path, undefined)).toBeNull();
    expect(galleryAt(path, {})).toBeNull();
  });
});

describe('canStepBack', () => {
  it.each(notOurs)('is false for %s: the previous entry could be another site', (_name, state) => {
    expect(canStepBack(state)).toBe(false);
  });

  it.each(unknownFrom)('is true for %s: the entry is still ours', (_name, state) => {
    expect(canStepBack(state)).toBe(true);
  });

  it.each(['home', 'lobby'] as const)('is true for a mark pushed from %s', from => {
    expect(canStepBack({ afterlight: 'cards', from })).toBe(true);
    expect(canStepBack(galleryMark(from))).toBe(true);
  });
});

describe('backLabel', () => {
  it('names the lobby when the gallery was opened from a lobby', () => {
    expect(backLabel('lobby')).toBe('← Back to lobby');
  });

  it('names Home when the gallery was opened from Home', () => {
    expect(backLabel('home')).toBe('← Home');
  });

  it('labels a lobby-opened /cards "Back to lobby" and everything else "Home", end to end through the reader', () => {
    const label = (state: unknown) => {
      const from = galleryAt('/cards', state);
      return from === null ? null : backLabel(from);
    };
    expect(label({ afterlight: 'cards', from: 'lobby' })).toBe('← Back to lobby');
    expect(label({ afterlight: 'cards', from: 'home' })).toBe('← Home');
    expect(label({ afterlight: 'cards' })).toBe('← Home');
    expect(label(null)).toBe('← Home');
    expect(label({})).toBe('← Home');
  });
});
