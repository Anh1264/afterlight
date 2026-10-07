import { describe, expect, it } from 'vitest';
import { classifyDevice, type DeviceSignals } from './device';

/** PR 5 c1/c3: the pure device classifier. Rules, first match wins (spec "client/src/device.ts"). */

const UA = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iPod: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  iPad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const sig = (o: Partial<DeviceSignals>): DeviceSignals => ({ ua: UA.windows, maxTouchPoints: 0, coarsePrimary: false, screenShort: 900, ...o });

describe('classifyDevice', () => {
  const table: [string, Partial<DeviceSignals>, 'phone' | 'tablet' | 'desktop'][] = [
    ['iPhone UA', { ua: UA.iPhone, maxTouchPoints: 5, coarsePrimary: true, screenShort: 390 }, 'phone'],
    ['iPod UA', { ua: UA.iPod, maxTouchPoints: 5, coarsePrimary: true, screenShort: 320 }, 'phone'],
    ['Android phone (Mobile in UA)', { ua: UA.androidPhone, maxTouchPoints: 5, coarsePrimary: true, screenShort: 412 }, 'phone'],
    ['Android tablet (no Mobile in UA)', { ua: UA.androidTablet, maxTouchPoints: 5, coarsePrimary: true, screenShort: 800 }, 'tablet'],
    ['Android phone is a phone even if the pointer media query is fine', { ua: UA.androidPhone, coarsePrimary: false, screenShort: 412 }, 'phone'],
    ['iPad UA', { ua: UA.iPad, maxTouchPoints: 5, coarsePrimary: true, screenShort: 820 }, 'tablet'],
    ['iPad UA with a small short side is still a tablet (rule 1 wins)', { ua: UA.iPad, maxTouchPoints: 5, screenShort: 500 }, 'tablet'],
    // A5 (red-team): iPadOS and an iPhone's "Request Desktop Website" both send a Mac UA with touch points.
    ['Mac UA, 5 touch points, short side 820 (iPadOS)', { ua: UA.mac, maxTouchPoints: 5, coarsePrimary: true, screenShort: 820 }, 'tablet'],
    ['Mac UA, 5 touch points, short side 390 (iPhone, Request Desktop Website)', { ua: UA.mac, maxTouchPoints: 5, coarsePrimary: true, screenShort: 390 }, 'phone'],
    ['Mac UA, 5 touch points, short side 599 -> phone', { ua: UA.mac, maxTouchPoints: 5, screenShort: 599 }, 'phone'],
    ['Mac UA, 5 touch points, short side 600 -> tablet', { ua: UA.mac, maxTouchPoints: 5, screenShort: 600 }, 'tablet'],
    ['Mac UA, 2 touch points counts as touch (> 1)', { ua: UA.mac, maxTouchPoints: 2, screenShort: 820 }, 'tablet'],
    ['real Mac: 0 touch points', { ua: UA.mac, maxTouchPoints: 0, screenShort: 900 }, 'desktop'],
    ['Mac with 1 touch point is not iPadOS', { ua: UA.mac, maxTouchPoints: 1, screenShort: 900 }, 'desktop'],
    ['Windows desktop', { ua: UA.windows, screenShort: 1080 }, 'desktop'],
    ['Linux desktop', { ua: UA.linux, screenShort: 1080 }, 'desktop'],
    ['Windows touch laptop: touch points, fine primary pointer', { ua: UA.windows, maxTouchPoints: 10, coarsePrimary: false, screenShort: 1080 }, 'desktop'],
    ['unknown UA, coarse primary, short side 599 -> phone', { ua: UA.linux, coarsePrimary: true, screenShort: 599 }, 'phone'],
    ['unknown UA, coarse primary, short side 600 -> tablet', { ua: UA.linux, coarsePrimary: true, screenShort: 600 }, 'tablet'],
    ['empty UA, nothing else -> desktop', { ua: '' }, 'desktop'],
  ];
  for (const [name, signals, want] of table) {
    it(`${name} -> ${want}`, () => {
      expect(classifyDevice(sig(signals))).toBe(want);
    });
  }
});
