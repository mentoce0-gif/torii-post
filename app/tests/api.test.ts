import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { startServer, type TestServer } from './helpers.ts';

interface Candidate {
  recommendationId: string;
  placeId: string;
  rank: number;
  role: string;
  name: string;
  travelMinutes: number | null;
  travelPrecision: string;
  fitGrade: string;
  confidence: { pct: number; knownCount: number; totalCount: number; unknownLabels: string[] };
  equipment: { key: string; label: string; value: string }[];
  reasons: { tone: string; text: string }[];
  coords: { lat: number; lng: number } | null;
}

interface RecommendBody {
  householdId: string;
  sessionId: string;
  shownAt: string;
  candidates: Candidate[];
  shortlistNote: string | null;
  dataNotice: string | null;
}

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

async function recommend(householdId?: string): Promise<RecommendBody> {
  const response = await server.fetch('/api/recommend', {
    method: 'POST',
    body: JSON.stringify(CONTEXT),
    ...(householdId ? { householdId } : {}),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as RecommendBody;
}

describe('POST /api/recommend', () => {
  it('returns at most three candidates', async () => {
    const body = await recommend();
    assert.ok(body.candidates.length > 0 && body.candidates.length <= 3);
    assert.deepEqual(
      body.candidates.map((c) => c.rank),
      body.candidates.map((_, i) => i + 1),
    );
  });

  it('gives every candidate all six fields, with no blanks', async () => {
    const body = await recommend();
    for (const candidate of body.candidates) {
      assert.equal(candidate.equipment.length, 6);
      for (const cell of candidate.equipment) {
        assert.ok(['○', '△', '×', '？'].includes(cell.value), `illegal value ${cell.value}`);
        assert.notEqual(cell.value, '');
      }
    }
  });

  it('reports fit and confidence as separate numbers', async () => {
    const body = await recommend();
    for (const candidate of body.candidates) {
      assert.ok(['◎', '○', '△'].includes(candidate.fitGrade));
      assert.ok(candidate.confidence.pct >= 0 && candidate.confidence.pct <= 100);
      assert.equal(
        candidate.confidence.unknownLabels.length,
        candidate.confidence.totalCount - candidate.confidence.knownCount,
      );
    }
  });

  it('never shows ◎ on a card where nothing has been confirmed', async () => {
    // The PoC profile is the honest one: every unsurveyed field is ？.
    const strict = await startServer('poc');
    try {
      const body = (await strict.json('/api/recommend', {
        method: 'POST',
        body: JSON.stringify(CONTEXT),
      })) as RecommendBody;

      const blank = body.candidates.filter((c) => c.confidence.pct === 0);
      assert.ok(blank.length > 0, 'the poc seed should still have unsurveyed places');
      for (const candidate of blank) {
        assert.notEqual(candidate.fitGrade, '◎', `${candidate.name} claims ◎ on no evidence`);
      }

      // Still on the list, and still not the bottom grade.
      for (const candidate of blank) assert.equal(candidate.fitGrade, '○');
    } finally {
      await strict.stop();
    }
  });

  it('applies the same cap on the detail screen', async () => {
    const strict = await startServer('poc');
    try {
      const body = (await strict.json('/api/recommend', {
        method: 'POST',
        body: JSON.stringify(CONTEXT),
      })) as RecommendBody;
      const blank = body.candidates.find((c) => c.confidence.pct === 0) as Candidate;

      const detail = (await strict.json(
        `/api/places/${blank.placeId}?sessionId=${body.sessionId}`,
      )) as { fitGrade: string | null; confidence: { pct: number } };

      assert.equal(detail.confidence.pct, 0);
      assert.notEqual(detail.fitGrade, '◎');
    } finally {
      await strict.stop();
    }
  });

  it('falls back to the configured town without claiming it is where you are', async () => {
    // This used to be a 400. Blocking stranded every visitor who declined the
    // location prompt, which is most of them, so the PoC now starts from its
    // configured town instead. The rule it must not break is the original one:
    // never present a fallback as the household's actual location. The answer
    // is labelled `default`, and the screen renders it as changeable.
    const response = await server.fetch('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ ...CONTEXT, origin: {} }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      context: { originSource: string; areaCode: string; areaLabel: string };
    };
    assert.equal(body.context.originSource, 'default');
    assert.equal(body.context.areaCode, 'shiga-otsu');
    assert.equal(body.context.areaLabel, '大津市');
  });

  it('reports a chosen area as chosen, so the default cannot mask a real answer', async () => {
    const response = await server.fetch('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ ...CONTEXT, origin: { areaCode: 'shiga-kusatsu' } }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { context: { originSource: string; areaCode: string } };
    assert.equal(body.context.originSource, 'chosen');
    assert.equal(body.context.areaCode, 'shiga-kusatsu');
  });

  it('still refuses to invent an area when the configured default is not real', async () => {
    // A typo in DEFAULT_AREA_CODE must fail loudly rather than quietly picking
    // whichever town happens to sort first.
    const broken = await startServer('demo', { defaultAreaCode: 'atlantis' });
    try {
      const response = await broken.fetch('/api/recommend', {
        method: 'POST',
        body: JSON.stringify({ ...CONTEXT, origin: {} }),
      });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, 'origin_required');
    } finally {
      await broken.stop();
    }
  });

  it('says how long the household could actually stay', async () => {
    // The card leads with this number, so it has to be the real remainder and
    // not a restatement of the time budget: remaining minus the round trip.
    const body = await server.json<{
      context: { remainingMinutes: number };
      candidates: {
        role: string;
        travelMinutes: number | null;
        onSiteMinutes: number | null;
      }[];
    }>('/api/recommend', { method: 'POST', body: JSON.stringify(CONTEXT) });

    for (const candidate of body.candidates) {
      if (candidate.travelMinutes === null) {
        assert.equal(candidate.onSiteMinutes, null, 'no travel time means no claim about the clock');
        continue;
      }
      assert.equal(
        candidate.onSiteMinutes,
        body.context.remainingMinutes - candidate.travelMinutes * 2,
        'on-site minutes must be the remainder after the round trip',
      );
    }

    const home = body.candidates.find((candidate) => candidate.role === 'home');
    assert.ok(home, 'the home fallback should always be offered');
    // Nothing to travel, so the whole window is on-site.
    assert.equal(home?.onSiteMinutes, body.context.remainingMinutes);
  });

  it('rejects nonsense input', async () => {
    for (const bad of [
      { ...CONTEXT, remainingMinutes: 5 },
      { ...CONTEXT, childAgeMonths: -1 },
      { ...CONTEXT, mobility: 'teleport' },
      { ...CONTEXT, weather: 'apocalypse' },
    ]) {
      const response = await server.fetch('/api/recommend', {
        method: 'POST',
        body: JSON.stringify(bad),
      });
      assert.equal(response.status, 400, JSON.stringify(bad));
    }
  });
});

/**
 * AC11. The browser is handed three cards, not the machinery that chose them.
 */
describe('the client never receives the recommender', () => {
  it('ships no scores, weights or thresholds', async () => {
    const body = await recommend();
    const text = JSON.stringify(body);
    for (const leak of ['signals', 'timeFit', 'weatherFit', 'equipmentFit', 'novelty', 'weight', 'ranking', 'fitScore']) {
      assert.ok(!text.includes(leak), `response leaks ${leak}`);
    }
  });

  it('ships only the three places, not the catalogue', async () => {
    const body = await recommend();
    const placeCount = (await server.repo.listPlaces()).length;
    assert.ok(placeCount > body.candidates.length, 'the seed should hold more than three places');
    const returned = new Set(body.candidates.map((c) => c.placeId));
    assert.equal(returned.size, body.candidates.length);
  });

  it('exposes no place endpoint that lists everything', async () => {
    const response = await server.fetch('/api/places');
    assert.equal(response.status, 404);
  });
});

describe('POST /api/decisions', () => {
  it('records a go and opens a visit to write up', async () => {
    const body = await recommend();
    const first = body.candidates[0] as Candidate;
    const response = await server.fetch('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        sessionId: body.sessionId,
        recommendationId: first.recommendationId,
        kind: 'go',
        clientElapsedMs: 21_000,
      }),
    });
    assert.equal(response.status, 201);
    const decision = (await response.json()) as {
      decisionId: string;
      visitId: string | null;
      timeToDecisionMs: number | null;
    };
    assert.ok(decision.visitId, 'a go must produce something to write up later');
    assert.ok(decision.timeToDecisionMs !== null);

    const stored = await server.repo.getDecision(decision.decisionId);
    assert.equal(stored?.kind, 'go');
    assert.equal(stored?.placeId, first.placeId);
    assert.equal(stored?.clientElapsedMs, 21_000);
  });

  it('records a skip and a usual without opening a visit', async () => {
    for (const kind of ['skip', 'usual'] as const) {
      const body = await recommend();
      const decision = (await server.json('/api/decisions', {
        method: 'POST',
        householdId: body.householdId,
        body: JSON.stringify({ sessionId: body.sessionId, recommendationId: null, kind, clientElapsedMs: 4000 }),
      })) as { visitId: string | null; kind: string };
      assert.equal(decision.kind, kind);
      assert.equal(decision.visitId, null);
    }
  });

  it('accepts a choice that differs from the top suggestion', async () => {
    const body = await recommend();
    const last = body.candidates[body.candidates.length - 1] as Candidate;
    const decision = (await server.json('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        sessionId: body.sessionId,
        recommendationId: last.recommendationId,
        kind: 'go',
        clientElapsedMs: 9000,
      }),
    })) as { decisionId: string };
    assert.equal((await server.repo.getDecision(decision.decisionId))?.placeId, last.placeId);
  });

  it('refuses a recommendation from another session', async () => {
    const a = await recommend();
    const b = await recommend();
    const response = await server.fetch('/api/decisions', {
      method: 'POST',
      householdId: a.householdId,
      body: JSON.stringify({
        sessionId: a.sessionId,
        recommendationId: (b.candidates[0] as Candidate).recommendationId,
        kind: 'go',
        clientElapsedMs: 1000,
      }),
    });
    assert.equal(response.status, 400);
  });
});

describe('POST /api/feedback', () => {
  it('stores the three answers and updates the household history', async () => {
    const body = await recommend();
    const first = body.candidates[0] as Candidate;
    const decision = (await server.json('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        sessionId: body.sessionId,
        recommendationId: first.recommendationId,
        kind: 'go',
        clientElapsedMs: 12_000,
      }),
    })) as { visitId: string };

    const response = await server.fetch('/api/feedback', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        visitId: decision.visitId,
        reaction: 'bored_fast',
        stayBucket: 'under15',
        revisit: 'no',
        note: '風が強かった',
        equipmentReports: [{ key: 'water', value: '○' }],
      }),
    });
    assert.equal(response.status, 201);
    const saved = (await response.json()) as { stayMinutes: number; corrections: number };
    assert.equal(saved.stayMinutes, 15);
    assert.equal(saved.corrections, 1);

    const history = await server.repo.getPreferenceHistory(body.householdId);
    assert.ok(history.length > 0, 'feedback must feed the next set of three');
    assert.equal(await server.repo.lastRevisitAnswer(body.householdId, first.placeId), 'no');
  });

  it('rejects a note longer than the sticky-note limit', async () => {
    const body = await recommend();
    const decision = (await server.json('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        sessionId: body.sessionId,
        recommendationId: (body.candidates[0] as Candidate).recommendationId,
        kind: 'go',
        clientElapsedMs: 1000,
      }),
    })) as { visitId: string };

    const response = await server.fetch('/api/feedback', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        visitId: decision.visitId,
        reaction: 'ok',
        stayBucket: 'about30',
        revisit: 'yes',
        note: 'あ'.repeat(21),
      }),
    });
    assert.equal(response.status, 400);
  });

  it('does not let one household write up another household visit', async () => {
    const a = await recommend();
    const b = await recommend();
    const decision = (await server.json('/api/decisions', {
      method: 'POST',
      householdId: a.householdId,
      body: JSON.stringify({
        sessionId: a.sessionId,
        recommendationId: (a.candidates[0] as Candidate).recommendationId,
        kind: 'go',
        clientElapsedMs: 1000,
      }),
    })) as { visitId: string };

    const response = await server.fetch('/api/feedback', {
      method: 'POST',
      householdId: b.householdId,
      body: JSON.stringify({
        visitId: decision.visitId,
        reaction: 'ok',
        stayBucket: 'about30',
        revisit: 'yes',
      }),
    });
    assert.equal(response.status, 404);
  });
});

describe('GET /api/history', () => {
  it('carries what the next recommendation needs', async () => {
    const body = await recommend();
    const first = body.candidates[0] as Candidate;
    const decision = (await server.json('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        sessionId: body.sessionId,
        recommendationId: first.recommendationId,
        kind: 'go',
        clientElapsedMs: 8000,
      }),
    })) as { visitId: string };

    let history = (await server.json('/api/history', { householdId: body.householdId })) as {
      entries: { went: boolean; recorded: boolean; timeToDecisionMs: number | null }[];
      openVisits: { visitId: string }[];
    };
    assert.equal(history.openVisits.length, 1);
    assert.equal(history.entries[0]?.went, true);
    assert.equal(history.entries[0]?.recorded, false);
    assert.ok(history.entries[0]?.timeToDecisionMs !== null);

    await server.fetch('/api/feedback', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        visitId: decision.visitId,
        reaction: 'lasted',
        stayBucket: 'over60',
        revisit: 'yes',
      }),
    });

    history = (await server.json('/api/history', { householdId: body.householdId })) as typeof history;
    assert.equal(history.openVisits.length, 0);
    assert.equal(history.entries[0]?.recorded, true);
  });

  it('is empty for a household with no id', async () => {
    const history = (await server.json('/api/history')) as { entries: unknown[] };
    assert.deepEqual(history.entries, []);
  });
});
