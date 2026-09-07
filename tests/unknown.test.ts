import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeInformationConfidence } from '../src/server/domain/confidence.ts';
import {
  emptyEquipment,
  isAbsent,
  isAvailable,
  isKnown,
} from '../src/server/domain/equipment.ts';
import { evaluate } from '../src/server/domain/rules.ts';
import {
  EQUIPMENT_KEYS,
  type EquipmentMap,
  type Place,
  type RecommendContext,
} from '../src/server/domain/types.ts';

function park(overrides: Partial<Place> = {}): Place {
  return {
    id: 'test-park',
    name: 'テスト公園',
    areaCode: 'shiga-kusatsu',
    areaLabel: '草津市',
    kind: 'outdoor',
    lat: 35.01,
    lng: 135.96,
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
  origin: { lat: 35.01, lng: 135.96 },
};

function run(equipment: EquipmentMap, overrides: Partial<Place> = {}, context = CONTEXT) {
  const place = park(overrides);
  const confidence = computeInformationConfidence(equipment);
  return evaluate({
    place,
    equipment,
    context,
    travel: { minutes: 15, distanceKm: 8, precision: 'estimate' },
    confidence,
    history: null,
    visitCount: 0,
    lastRevisitAnswer: null,
  });
}

/**
 * The single rule the product cannot get wrong. `？` says "nobody checked".
 * Reading it as ○ invents a facility; reading it as × invents its absence.
 */
describe('？ is never silently converted', () => {
  it('is not treated as available', () => {
    assert.equal(isAvailable('？'), false);
    assert.equal(isAvailable('○'), true);
    assert.equal(isAvailable('△'), false);
  });

  it('is not treated as absent', () => {
    assert.equal(isAbsent('？'), false);
    assert.equal(isAbsent('×'), true);
  });

  it('is the only value that counts as unknown', () => {
    assert.equal(isKnown('？'), false);
    for (const value of ['○', '△', '×'] as const) assert.equal(isKnown(value), true);
  });

  it('never appears as a blank cell', () => {
    const equipment = emptyEquipment();
    for (const key of EQUIPMENT_KEYS) {
      assert.equal(equipment[key], '？', `${key} must default to ？, not an empty string`);
    }
  });

  it('does not trigger the "no shade in a heatwave" warning', () => {
    const equipment = { ...emptyEquipment(), shade: '？' as const };
    const outcome = run(equipment, {}, { ...CONTEXT, weather: 'hot' });
    const ids = outcome.reasons.map((r) => r.id);
    assert.ok(!ids.includes('weather.hot.noshade'), '？ must not be read as ×');
    assert.ok(ids.includes('weather.hot.unknown'), 'the gap should be reported as a gap');
  });

  it('does not trigger the "sand without water" warning', () => {
    const equipment = { ...emptyEquipment(), sandbox: '○' as const, water: '？' as const };
    const ids = run(equipment).reasons.map((r) => r.id);
    assert.ok(!ids.includes('equip.sand.nowater'));
    assert.ok(ids.includes('equip.sand.water.unknown'));
  });

  it('does not earn credit in the equipment score', () => {
    const allUnknown = run(emptyEquipment()).signals.equipmentFit;
    const allYes = run({
      sandbox: '○',
      shade: '○',
      water: '○',
      toilet: '○',
      diaper: '○',
      stroller: '○',
    }).signals.equipmentFit;
    const allNo = run({
      sandbox: '×',
      shade: '×',
      water: '×',
      toilet: '×',
      diaper: '×',
      stroller: '×',
    }).signals.equipmentFit;

    assert.equal(allYes, 1);
    assert.equal(allNo, 0);
    // Unknown scores neither: it lands on the neutral prior, not on either end.
    assert.ok(allUnknown > allNo && allUnknown < allYes);
  });

  it('does not lower the fit score relative to a confirmed absence', () => {
    const unknownWater = run({ ...emptyEquipment(), sandbox: '○', water: '？' });
    const absentWater = run({ ...emptyEquipment(), sandbox: '○', water: '×' });
    assert.ok(
      unknownWater.signals.equipmentFit > absentWater.signals.equipmentFit,
      '？ must not be scored as harshly as ×',
    );
  });
});

describe('information confidence', () => {
  it('counts confirmed fields, whatever they say', () => {
    const result = computeInformationConfidence({
      sandbox: '○',
      shade: '○',
      water: '？',
      toilet: '○',
      diaper: '○',
      stroller: '？',
    });
    // Four of six confirmed — the worked example from the brief.
    assert.equal(result.knownCount, 4);
    assert.equal(result.totalCount, 6);
    assert.equal(result.pct, 67);
    assert.deepEqual(result.unknownKeys, ['water', 'stroller']);
  });

  it('treats × as confirmed information, not as missing information', () => {
    const result = computeInformationConfidence({
      sandbox: '×',
      shade: '×',
      water: '×',
      toilet: '×',
      diaper: '×',
      stroller: '×',
    });
    assert.equal(result.pct, 100);
    assert.deepEqual(result.unknownKeys, []);
  });

  it('is 0 when nothing has been checked', () => {
    assert.equal(computeInformationConfidence(emptyEquipment()).pct, 0);
  });

  it('is 100 when everything has been checked', () => {
    const result = computeInformationConfidence({
      sandbox: '○',
      shade: '△',
      water: '×',
      toilet: '○',
      diaper: '○',
      stroller: '△',
    });
    assert.equal(result.pct, 100);
  });

  it('carries a rule version so stored results stay interpretable', () => {
    assert.equal(computeInformationConfidence(emptyEquipment()).ruleVersion, 'v1');
  });
});
