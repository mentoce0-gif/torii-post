import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeInformationConfidence } from '../src/server/domain/confidence.ts';
import { fitScore, toGrade } from '../src/server/domain/fit.ts';
import { emptyEquipment } from '../src/server/domain/equipment.ts';
import { buildRecommendations, type CandidateInput } from '../src/server/domain/recommend.ts';
import { evaluate } from '../src/server/domain/rules.ts';
import { estimateTravel } from '../src/server/domain/travel.ts';
import type {
  EquipmentMap,
  Place,
  PreferenceHistory,
  RecommendContext,
} from '../src/server/domain/types.ts';

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'p',
    name: '公園',
    areaCode: 'shiga-kusatsu',
    areaLabel: '草津市',
    kind: 'outdoor',
    lat: 35.05,
    lng: 136.02,
    coordPrecision: 'locality',
    priceLabel: '未確認',
    indoorShelter: '？',
    escapeRoute: null,
    hoursStatus: 'unverified',
    hoursLabel: '利用可能時間 未確認',
    minAgeMonths: 12,
    maxAgeMonths: null,
    category: 'park',
    notes: null,
    updatedAt: '2026-09-07T00:00:00.000Z',
    ...overrides,
  };
}

const CONTEXT: RecommendContext = {
  childAgeMonths: 18,
  remainingMinutes: 90,
  mobility: 'car',
  weather: 'cloudy',
  origin: { lat: 35.0128, lng: 135.9605 },
};

function evaluateWith(
  equipment: EquipmentMap,
  overrides: Partial<Place> = {},
  context = CONTEXT,
  travelMinutes = 15,
  history: PreferenceHistory | null = null,
) {
  const p = place(overrides);
  return evaluate({
    place: p,
    equipment,
    context,
    travel: { minutes: travelMinutes, distanceKm: 8, precision: 'estimate' },
    confidence: computeInformationConfidence(equipment),
    history,
    visitCount: 0,
    lastRevisitAnswer: null,
  });
}

const ids = (outcome: ReturnType<typeof evaluate>) => outcome.reasons.map((r) => r.id);

describe('judgement rules produce reasons, not verdicts', () => {
  it('flags a round trip that eats half the remaining time', () => {
    const outcome = evaluateWith(emptyEquipment(), {}, CONTEXT, 25);
    assert.ok(ids(outcome).includes('time.tight'));
    assert.equal(outcome.playMinutes, 40);
  });

  it('says so plainly when the round trip uses all the time', () => {
    const outcome = evaluateWith(emptyEquipment(), {}, { ...CONTEXT, remainingMinutes: 40 }, 25);
    assert.ok(ids(outcome).includes('time.none'));
  });

  it('warns about a heatwave only when shade is confirmed absent', () => {
    const hot: RecommendContext = { ...CONTEXT, weather: 'hot' };
    assert.ok(
      ids(evaluateWith({ ...emptyEquipment(), shade: '×' }, {}, hot)).includes('weather.hot.noshade'),
    );
    assert.ok(
      ids(evaluateWith({ ...emptyEquipment(), shade: '○' }, {}, hot)).includes('weather.hot.shade'),
    );
  });

  it('warns about mess only when water is confirmed absent', () => {
    const outcome = evaluateWith({ ...emptyEquipment(), sandbox: '○', water: '×' });
    assert.ok(ids(outcome).includes('equip.sand.nowater'));
  });

  it('warns about a long stay without a toilet', () => {
    const outcome = evaluateWith({ ...emptyEquipment(), toilet: '×' }, {}, CONTEXT, 10);
    assert.ok(outcome.playMinutes >= 60);
    assert.ok(ids(outcome).includes('equip.notoilet.long'));
  });

  it('remembers that this category did not hold last time', () => {
    const history: PreferenceHistory = {
      id: 'h',
      householdId: 'hh',
      category: 'park',
      samples: 2,
      avgStayMinutes: 12,
      lastReaction: 'bored_fast',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const outcome = evaluateWith(emptyEquipment(), {}, CONTEXT, 15, history);
    assert.ok(ids(outcome).includes('history.short'));
    assert.ok(outcome.signals.endurance < 0.3);
  });

  it('says plainly when nothing at all has been checked', () => {
    const outcome = evaluateWith(emptyEquipment());
    assert.ok(ids(outcome).includes('confidence.none'));
    // Still a live candidate: the rules never return a verdict of their own.
    assert.ok(fitScore(outcome.signals) > 0);
  });

  it('counts the gaps when some fields are known', () => {
    const outcome = evaluateWith({ ...emptyEquipment(), toilet: '○', diaper: '○' });
    assert.ok(ids(outcome).includes('confidence.low'));
  });

  it('says the opening hours are unverified rather than assuming open', () => {
    const outcome = evaluateWith(emptyEquipment());
    const reason = outcome.reasons.find((r) => r.id === 'hours.unverified');
    assert.ok(reason);
    assert.match(reason.text, /未確認/);
    assert.ok(!/営業中/.test(reason.text));
  });
});

describe('fit grades', () => {
  it('maps scores to the three grades', () => {
    assert.equal(toGrade(0.9), '◎');
    assert.equal(toGrade(0.6), '○');
    assert.equal(toGrade(0.2), '△');
  });

  it('ignores information confidence entirely', () => {
    const documented = evaluateWith({
      sandbox: '○',
      shade: '○',
      water: '○',
      toilet: '○',
      diaper: '○',
      stroller: '○',
    });
    const undocumented = evaluateWith({
      ...emptyEquipment(),
      sandbox: '○',
      shade: '○',
      water: '？',
      toilet: '○',
      diaper: '○',
      stroller: '？',
    });
    // Same confirmed answers, fewer of them. The grade may differ because the
    // known set differs, but nothing in the score reads the percentage itself.
    assert.equal(undocumented.signals.equipmentFit, 1);
    assert.equal(documented.signals.equipmentFit, 1);
  });
});

describe('travel estimates', () => {
  it('refuses to invent a time without coordinates', () => {
    const estimate = estimateTravel({}, place({ lat: null, lng: null }), 'car', 6);
    assert.equal(estimate.minutes, null);
    assert.equal(estimate.precision, 'unknown');
  });

  it('marks a town-centroid coordinate as an estimate', () => {
    const estimate = estimateTravel(
      { lat: 35.0128, lng: 135.9605 },
      place({ coordPrecision: 'locality' }),
      'car',
      6,
    );
    assert.equal(estimate.precision, 'estimate');
    assert.ok((estimate.minutes ?? 0) > 6);
  });

  it('is zero from home', () => {
    const estimate = estimateTravel({}, place({ kind: 'home' }), 'car', 6);
    assert.equal(estimate.minutes, 0);
  });
});

describe('candidate composition', () => {
  const candidate = (id: string, overrides: Partial<Place> = {}): CandidateInput => ({
    place: place({ id, name: id, ...overrides }),
    equipment: emptyEquipment(),
    visitCount: 0,
    history: null,
    lastRevisitAnswer: null,
  });

  it('returns at most three', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => candidate(id));
    const result = buildRecommendations(pool, CONTEXT, { usualPlaceId: null });
    assert.equal(result.length, 3);
  });

  it('never pads the list with a place that does not fit the clock', () => {
    const far = candidate('far', { lat: 36.5, lng: 137.5 });
    const home = candidate('home', { kind: 'home', lat: null, lng: null });
    const result = buildRecommendations([far, home], CONTEXT, { usualPlaceId: null });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.place.kind, 'home');
  });

  it('keeps the household default in the third slot', () => {
    const pool = [
      candidate('near-1'),
      candidate('near-2'),
      candidate('usual'),
      candidate('home', { kind: 'home', lat: null, lng: null }),
    ];
    const result = buildRecommendations(pool, CONTEXT, { usualPlaceId: 'usual' });
    assert.deepEqual(
      result.map((r) => r.role),
      ['explore', 'explore', 'usual'],
    );
  });

  it('falls back to one new place, the usual one and home when candidates are scarce', () => {
    const pool = [
      candidate('near-1'),
      candidate('far', { lat: 36.5, lng: 137.5 }),
      candidate('usual'),
      candidate('home', { kind: 'home', lat: null, lng: null }),
    ];
    const result = buildRecommendations(pool, CONTEXT, { usualPlaceId: 'usual' });
    assert.deepEqual(
      result.map((r) => r.role),
      ['explore', 'usual', 'home'],
    );
  });

  it('does not drop a candidate for having no confirmed information', () => {
    const blank = candidate('blank');
    const documented: CandidateInput = {
      ...candidate('documented'),
      equipment: {
        sandbox: '○',
        shade: '○',
        water: '○',
        toilet: '○',
        diaper: '○',
        stroller: '○',
      },
    };
    const result = buildRecommendations([blank, documented], CONTEXT, { usualPlaceId: null });
    assert.equal(result.length, 2);
    assert.ok(result.some((r) => r.place.id === 'blank'));
    assert.equal(result.find((r) => r.place.id === 'blank')?.confidence.pct, 0);
  });
});
