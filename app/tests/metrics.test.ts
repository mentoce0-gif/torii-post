import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { startServer, type TestServer } from './helpers.ts';

const CONTEXT = {
  childAgeMonths: 18,
  remainingMinutes: 90,
  mobility: 'car',
  weather: 'cloudy',
  origin: { areaCode: 'shiga-kusatsu' },
};

let server: TestServer;

before(async () => {
  server = await startServer('demo');
});

after(async () => {
  await server.stop();
});

/** Fakes a decision that took a known number of milliseconds. */
async function seedDecision(
  elapsedMs: number,
  kind: 'go' | 'skip' | 'usual' = 'skip',
): Promise<void> {
  const household = await server.repo.createHousehold({});
  const shownAt = new Date(Date.now() - elapsedMs).toISOString();
  const session = await server.repo.createSession(household.id, JSON.stringify(CONTEXT), shownAt);
  await server.repo.createDecision({
    sessionId: session.id,
    recommendationId: null,
    placeId: null,
    kind,
    clientElapsedMs: elapsedMs,
  });
}

describe('Time to Decision', () => {
  it('is measured from the moment the cards were handed over', async () => {
    const response = await server.fetch('/api/recommend', {
      method: 'POST',
      body: JSON.stringify(CONTEXT),
    });
    const body = (await response.json()) as { householdId: string; sessionId: string };

    await new Promise((resolve) => setTimeout(resolve, 60));

    const decision = (await server.json('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({ sessionId: body.sessionId, recommendationId: null, kind: 'skip', clientElapsedMs: 55 }),
    })) as { timeToDecisionMs: number };

    assert.ok(decision.timeToDecisionMs >= 50, 'server-side elapsed time should be real');
    assert.ok(decision.timeToDecisionMs < 30_000);
  });

  it('keeps the client stopwatch alongside the server one, not instead of it', async () => {
    const response = await server.fetch('/api/recommend', {
      method: 'POST',
      body: JSON.stringify(CONTEXT),
    });
    const body = (await response.json()) as { householdId: string; sessionId: string };
    const decision = (await server.json('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        sessionId: body.sessionId,
        recommendationId: null,
        kind: 'skip',
        clientElapsedMs: 999_999,
      }),
    })) as { decisionId: string; timeToDecisionMs: number };

    const stored = await server.repo.getDecision(decision.decisionId);
    assert.equal(stored?.clientElapsedMs, 999_999);
    assert.ok((stored?.timeToDecisionMs ?? 0) < 30_000, 'the client cannot rewrite the metric');
  });

  it('summarises count, median, mean and p90', async () => {
    const fresh = await server.repo.metrics();
    const before = fresh.timeToDecision.count;

    for (const ms of [10_000, 20_000, 30_000, 40_000, 120_000]) await seedDecision(ms);

    const metrics = await server.repo.metrics();
    assert.equal(metrics.timeToDecision.count, before + 5);
    assert.ok(metrics.timeToDecision.medianMs !== null);
    assert.ok(metrics.timeToDecision.meanMs !== null);
    assert.ok(metrics.timeToDecision.p90Ms !== null);
    assert.equal(metrics.timeToDecision.targetMs, 60_000);
    assert.ok(
      (metrics.timeToDecision.underTargetRate ?? 0) > 0,
      'the share under 60 seconds is the number the PoC lives on',
    );
  });

  it('computes a median that is actually the middle value', async () => {
    const isolated = await startServer('poc');
    try {
      const values = [5_000, 15_000, 25_000, 35_000, 95_000];
      for (const ms of values) {
        const household = await isolated.repo.createHousehold({});
        const session = await isolated.repo.createSession(
          household.id,
          '{}',
          new Date(Date.now() - ms).toISOString(),
        );
        await isolated.repo.createDecision({
          sessionId: session.id,
          recommendationId: null,
          placeId: null,
          kind: 'skip',
          clientElapsedMs: null,
        });
      }
      const metrics = await isolated.repo.metrics();
      assert.equal(metrics.timeToDecision.count, 5);
      // Timing jitter of a few ms is fine; the median must be the third value.
      assert.ok(Math.abs((metrics.timeToDecision.medianMs ?? 0) - 25_000) < 2_000);
      assert.equal(metrics.decisions.skip, 5);
    } finally {
      await isolated.stop();
    }
  });
});

describe('GET /api/metrics', () => {
  it('is readable from loopback while no token is set', async () => {
    const response = await server.fetch('/api/metrics');
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      timeToDecision: { medianSeconds: number | null; targetSeconds: number };
      eventCounts: Record<string, number>;
    };
    assert.equal(body.timeToDecision.targetSeconds, 60);
    assert.ok('recommendations_shown' in body.eventCounts);
  });

  it('requires the token once one is configured', async () => {
    const guarded = await startServer('poc', { metricsToken: 's3cret-token' });
    try {
      assert.equal((await guarded.fetch('/api/metrics')).status, 401, 'no token, no metrics');
      assert.equal(
        (await guarded.fetch('/api/metrics', { headers: { Authorization: 'Bearer wrong' } })).status,
        401,
      );
      assert.equal(
        (await guarded.fetch('/api/metrics', { headers: { Authorization: 'Bearer s3cret-token' } }))
          .status,
        200,
      );
    } finally {
      await guarded.stop();
    }
  });
});

describe('POST /api/events', () => {
  it('accepts the PoC vocabulary and drops anything else', async () => {
    const response = await server.fetch('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        events: [
          { name: 'app_open' },
          { name: 'map_open' },
          { name: 'external_app_open' },
          { name: 'definitely_not_an_event' },
        ],
      }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { accepted: number };
    assert.equal(body.accepted, 3);
  });
});
