import type { DeviceClass } from '../../shared/protocol';

export interface DeviceSignals {
  ua: string;
  maxTouchPoints: number;
  coarsePrimary: boolean;
  screenShort: number;
}

/** Rules, first match wins. Touch laptops have a fine primary pointer, so they stay desktop. */
export function classifyDevice(s: DeviceSignals): DeviceClass {
  if (/iPad/.test(s.ua)) return 'tablet';
  // iPadOS and an iPhone's "Request Desktop Website" send a Mac UA; real Macs report 0 touch points.
  if (/Macintosh/.test(s.ua) && s.maxTouchPoints > 1) return s.screenShort < 600 ? 'phone' : 'tablet';
  if (/iPhone|iPod/.test(s.ua)) return 'phone';
  if (/Android/.test(s.ua)) return /Mobile/.test(s.ua) ? 'phone' : 'tablet';
  if (s.coarsePrimary) return s.screenShort >= 600 ? 'tablet' : 'phone';
  return 'desktop';
}

export function readDeviceSignals(): DeviceSignals {
  return {
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePrimary: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    screenShort: Math.min(screen.width, screen.height),
  };
}

let cached: DeviceClass | null = null;
export function deviceClass(): DeviceClass {
  cached ??= classifyDevice(readDeviceSignals());
  return cached;
}
