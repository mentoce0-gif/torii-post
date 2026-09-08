import { timingSafeEqual } from 'node:crypto';

import { unauthorized } from '../http/respond.ts';
import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function tokenMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The developer's read on the north-star metric. Not a dashboard, not public:
 * loopback only unless METRICS_TOKEN is set and presented.
 */
export function handleGetMetrics(deps: Deps) {
  return async (ctx: RequestContext)  => {
    const token = deps.config.metricsToken;
    const header = ctx.header('authorization');
    const presented = header ? header.replace(/^Bearer\s+/i, '') : '';
    // Deliberately the peer address and never a forwarded header: trusting
    // X-Forwarded-For here would publish this endpoint to anyone willing to
    // claim 127.0.0.1. tests/security.test.ts fails if that changes.
    const remote = ctx.peerAddress;

    if (token) {
      if (!presented || !tokenMatches(token, presented)) throw unauthorized('metrics token required');
    } else if (!LOOPBACK.has(remote)) {
      throw unauthorized('metrics are loopback-only until METRICS_TOKEN is set');
    }

    const summary = await deps.repo.metrics();
    const ttd = summary.timeToDecision;

    return {
      ...summary,
      timeToDecision: {
        ...ttd,
        medianSeconds: ttd.medianMs === null ? null : Math.round(ttd.medianMs / 100) / 10,
        meanSeconds: ttd.meanMs === null ? null : Math.round(ttd.meanMs / 100) / 10,
        p90Seconds: ttd.p90Ms === null ? null : Math.round(ttd.p90Ms / 100) / 10,
        targetSeconds: ttd.targetMs / 1000,
      },
      generatedAt: new Date().toISOString(),
    };
  };
}
