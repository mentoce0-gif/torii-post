import { randomUUID } from 'node:crypto';

import type { SqlDriver } from '../driver.ts';

import { isEquipmentKey, isEquipmentValue } from '../../domain/equipment.ts';
import { EQUIPMENT_KEYS, UNKNOWN } from '../../domain/types.ts';
import { DEMO_OBSERVATIONS } from './demoObservations.ts';
import { SEED_PLACES, type SeedPlace } from './places.ts';

export type SeedProfile = 'poc' | 'demo';

const INSERT_SOURCE =
  'INSERT INTO place_sources (id, place_id, kind, label, url, checked_at) VALUES (?, ?, ?, ?, ?, ?)';

export interface SeedViolation {
  placeId: string;
  key: string;
  reason: string;
}

/**
 * The invariant the whole product rests on: a stated value must be traceable.
 *
 * Anything other than `？` needs a source and a date. Enforced here, at boot,
 * and again in the test suite — a curator who pastes a value without saying
 * where it came from gets a failed boot, not a plausible-looking card.
 */
export function validateSeed(places: SeedPlace[]): SeedViolation[] {
  const violations: SeedViolation[] = [];
  for (const place of places) {
    const sourceKeys = new Set(place.sources.map((s) => s.key));

    // Two sources sharing a key make `sourceKey` ambiguous: the value would
    // name one page while pointing at whichever row happened to win. Since a
    // stated value is only as good as the page it cites, an ambiguous citation
    // is not a stated value at all.
    if (sourceKeys.size !== place.sources.length) {
      const seen = new Set<string>();
      for (const source of place.sources) {
        if (seen.has(source.key)) {
          violations.push({ placeId: place.id, key: source.key, reason: 'duplicate source key' });
        }
        seen.add(source.key);
      }
    }

    for (const [key, entry] of Object.entries(place.equipment)) {
      if (!isEquipmentKey(key)) {
        violations.push({ placeId: place.id, key, reason: 'unknown equipment key' });
        continue;
      }
      if (!isEquipmentValue(entry.value)) {
        violations.push({ placeId: place.id, key, reason: `illegal value ${String(entry.value)}` });
        continue;
      }
      if (entry.value === UNKNOWN) continue;
      if (!sourceKeys.has(entry.sourceKey)) {
        violations.push({ placeId: place.id, key, reason: 'stated value without a declared source' });
      }
      if (!entry.verifiedAt) {
        violations.push({ placeId: place.id, key, reason: 'stated value without a verification date' });
      }
    }
  }
  return violations;
}

export interface SeedResult {
  profile: SeedProfile;
  places: number;
  placeholderValues: number;
}

/**
 * Idempotent. Curated rows are rewritten on every boot so the seed file is the
 * source of truth; households, decisions and visits are never touched.
 */
export async function seedDatabase(db: SqlDriver, profile: SeedProfile): Promise<SeedResult> {
  const violations = validateSeed(SEED_PLACES);
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.placeId}.${v.key}: ${v.reason}`).join('\n  ');
    throw new Error(`Seed data violates the provenance rule:\n  ${detail}`);
  }

  const upsertPlace =
    `INSERT INTO places (id, name, area_code, area_label, kind, lat, lng, coord_precision, price_label,
        indoor_shelter, escape_route, hours_status, hours_label, min_age_months, max_age_months,
        category, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, area_code = excluded.area_code, area_label = excluded.area_label,
       kind = excluded.kind, lat = excluded.lat, lng = excluded.lng,
       coord_precision = excluded.coord_precision, price_label = excluded.price_label,
       indoor_shelter = excluded.indoor_shelter, escape_route = excluded.escape_route,
       hours_status = excluded.hours_status, hours_label = excluded.hours_label,
       min_age_months = excluded.min_age_months, max_age_months = excluded.max_age_months,
       category = excluded.category, notes = excluded.notes, updated_at = excluded.updated_at`;

  const upsertEquipment =
    `INSERT INTO place_equipment (id, place_id, key, value, source_id, verified_at, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(place_id, key) DO UPDATE SET
       value = excluded.value, source_id = excluded.source_id,
       verified_at = excluded.verified_at, confidence = excluded.confidence`;

  const demoById = new Map(DEMO_OBSERVATIONS.map((o) => [o.placeId, o]));
  const updatedAt = new Date().toISOString();
  let placeholderValues = 0;

  for (const place of SEED_PLACES) {
    const demo = profile === 'demo' ? demoById.get(place.id) : undefined;

    await db.run(upsertPlace, [
      place.id,
      place.name,
      place.areaCode,
      place.areaLabel,
      place.kind,
      place.lat,
      place.lng,
      place.coordPrecision,
      demo?.priceLabel ?? place.priceLabel,
      demo?.indoorShelter ?? place.indoorShelter,
      demo?.escapeRoute ?? place.escapeRoute,
      place.hoursStatus,
      place.hoursLabel,
      place.minAgeMonths,
      place.maxAgeMonths,
      place.category,
      place.notes,
      updatedAt,
    ]);

    await db.run('DELETE FROM place_sources WHERE place_id = ?', [place.id]);
    const sourceIds = new Map<string, string>();
    for (const source of place.sources) {
      const id = randomUUID();
      sourceIds.set(source.key, id);
      await db.run(INSERT_SOURCE, [
        id,
        place.id,
        source.kind,
        source.label,
        source.url,
        source.checkedAt,
      ]);
    }

    let demoSourceId: string | null = null;
    if (demo) {
      demoSourceId = randomUUID();
      await db.run(INSERT_SOURCE, [
        demoSourceId,
        place.id,
        'demo_placeholder',
        'デモ用の仮データ（未検証）',
        null,
        null,
      ]);
    }

    for (const key of EQUIPMENT_KEYS) {
      const curated = place.equipment[key];
      const demoValue = demo?.equipment?.[key];

      if (curated && curated.value !== UNKNOWN) {
        await db.run(upsertEquipment, [
          randomUUID(),
          place.id,
          key,
          curated.value,
          sourceIds.get(curated.sourceKey) ?? null,
          curated.verifiedAt,
          curated.confidence,
        ]);
      } else if (demoValue && isEquipmentValue(demoValue) && demoValue !== UNKNOWN) {
        placeholderValues += 1;
        await db.run(upsertEquipment, [randomUUID(), place.id, key, demoValue, demoSourceId, null, 0]);
      } else {
        // No source, no claim.
        await db.run(upsertEquipment, [randomUUID(), place.id, key, UNKNOWN, null, null, 0]);
      }
    }
  }

  return { profile, places: SEED_PLACES.length, placeholderValues };
}
