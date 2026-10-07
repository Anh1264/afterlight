// Reads the process environment into server options. Pure, so it can be tested.
import type { ServerLimits, TrustProxy } from './limits';

export interface EnvOptions { buildSha: string; trustProxy: TrustProxy; limits: Partial<ServerLimits> }

export function optionsFromEnv(env: Record<string, string | undefined>): EnvOptions {
  // Railway's proxy sets X-Real-IP (ADR 0002); anywhere else the header is client-supplied, so it is not trusted by default.
  const trustProxy: TrustProxy = env.TRUST_PROXY === 'none' || env.TRUST_PROXY === 'x-real-ip'
    ? env.TRUST_PROXY
    : env.RAILWAY_ENVIRONMENT_NAME ? 'x-real-ip' : 'none';
  return {
    buildSha: env.RAILWAY_GIT_COMMIT_SHA || env.BUILD_SHA || 'dev',
    trustProxy,
    // both per-IP limits off; the per-socket window, maxSockets and maxRooms stay
    limits: env.LIMIT_PER_IP === 'off' ? { maxSocketsPerIp: Infinity, createsPerIpPerMin: Infinity } : {},
  };
}
