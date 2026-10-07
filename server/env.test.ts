import { describe, expect, it } from 'vitest';
import { optionsFromEnv } from './env';

// PR 2b review cycle 1: server/index.ts's environment reading becomes a pure function (server/env.ts),
// `optionsFromEnv(env: Record<string, string | undefined>): { buildSha: string; trustProxy: 'x-real-ip' | 'none'; limits: Partial<ServerLimits> }`.
// ADR 0002: Railway's proxy sets X-Real-IP, so it is trusted only there (or when TRUST_PROXY says so).

describe('optionsFromEnv', () => {
  it('no environment: header not trusted, per-IP limits left at their defaults, sha "dev"', () => {
    const o = optionsFromEnv({});
    expect(o.trustProxy).toBe('none');
    expect(o.buildSha).toBe('dev');
    expect(o.limits.maxSocketsPerIp).not.toBe(Infinity);
    expect(o.limits.createsPerIpPerMin).not.toBe(Infinity);
  });

  it('RAILWAY_ENVIRONMENT_NAME set: X-Real-IP is trusted', () => {
    expect(optionsFromEnv({ RAILWAY_ENVIRONMENT_NAME: 'production' }).trustProxy).toBe('x-real-ip');
  });

  it('TRUST_PROXY=none wins over Railway', () => {
    expect(optionsFromEnv({ RAILWAY_ENVIRONMENT_NAME: 'production', TRUST_PROXY: 'none' }).trustProxy).toBe('none');
  });

  it('TRUST_PROXY=x-real-ip trusts the header off Railway', () => {
    expect(optionsFromEnv({ TRUST_PROXY: 'x-real-ip' }).trustProxy).toBe('x-real-ip');
  });

  it('an invalid TRUST_PROXY falls back to the default (by Railway or not)', () => {
    expect(optionsFromEnv({ TRUST_PROXY: 'yes' }).trustProxy).toBe('none');
    expect(optionsFromEnv({ TRUST_PROXY: '', RAILWAY_ENVIRONMENT_NAME: 'production' }).trustProxy).toBe('x-real-ip');
    expect(optionsFromEnv({ TRUST_PROXY: 'X-REAL-IP' }).trustProxy).toBe('none');
  });

  it('LIMIT_PER_IP=off turns both per-IP limits off (Infinity)', () => {
    const o = optionsFromEnv({ LIMIT_PER_IP: 'off' });
    expect(o.limits.maxSocketsPerIp).toBe(Infinity);
    expect(o.limits.createsPerIpPerMin).toBe(Infinity);
  });

  it('any other LIMIT_PER_IP value leaves the limits on', () => {
    for (const v of ['on', 'OFF', '0', '']) {
      const o = optionsFromEnv({ LIMIT_PER_IP: v });
      expect(o.limits.maxSocketsPerIp, v).not.toBe(Infinity);
      expect(o.limits.createsPerIpPerMin, v).not.toBe(Infinity);
    }
  });

  it('LIMIT_PER_IP=off does not touch the per-socket window, maxSockets or maxRooms', () => {
    const o = optionsFromEnv({ LIMIT_PER_IP: 'off' });
    expect(o.limits.createsPerSocketPerMin).toBeUndefined();
    expect(o.limits.maxSockets).toBeUndefined();
    expect(o.limits.maxRooms).toBeUndefined();
  });

  it('sha: RAILWAY_GIT_COMMIT_SHA, then BUILD_SHA, then "dev"; an empty value falls through', () => {
    expect(optionsFromEnv({ RAILWAY_GIT_COMMIT_SHA: 'aaa111', BUILD_SHA: 'bbb222' }).buildSha).toBe('aaa111');
    expect(optionsFromEnv({ BUILD_SHA: 'bbb222' }).buildSha).toBe('bbb222');
    expect(optionsFromEnv({ RAILWAY_GIT_COMMIT_SHA: '', BUILD_SHA: 'bbb222' }).buildSha).toBe('bbb222');
    expect(optionsFromEnv({ RAILWAY_GIT_COMMIT_SHA: '', BUILD_SHA: '' }).buildSha).toBe('dev');
  });
});
