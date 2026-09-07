import { CONFIDENCE_RULE_VERSION } from '../domain/confidence.ts';
import { EQUIPMENT_KEYS, EQUIPMENT_LABELS, type EquipmentMap, type PlaceWithEquipment } from '../domain/types.ts';
import type { RankedCandidate } from '../domain/recommend.ts';

/**
 * The client's view of a candidate.
 *
 * Everything the recommender used to get here — signals, weights, thresholds,
 * the other places it considered — stops at this boundary. What crosses it is
 * what the parent reads on the card.
 */
export interface CandidateDto {
  recommendationId: string;
  placeId: string;
  rank: number;
  role: 'explore' | 'usual' | 'home';
  name: string;
  areaLabel: string;
  travelMinutes: number | null;
  travelPrecision: 'measured' | 'estimate' | 'unknown';
  /**
   * Minutes actually left on site once the round trip is paid for. This is the
   * number the question "can I kill an hour there?" turns on, so it is a field
   * rather than a sentence buried in `reasons`. Negative means the trip eats
   * the whole window; null means no coordinate, so no claim about the clock.
   */
  onSiteMinutes: number | null;
  priceLabel: string;
  fitGrade: string;
  confidence: {
    pct: number;
    knownCount: number;
    totalCount: number;
    unknownLabels: string[];
    ruleVersion: string;
  };
  equipment: { key: string; label: string; value: string }[];
  headline: string;
  escapeRoute: string | null;
  hoursLabel: string;
  hoursVerified: boolean;
  reasons: { tone: string; text: string }[];
  coords: { lat: number; lng: number; precise: boolean } | null;
  hasPlaceholderData: boolean;
}

export function equipmentList(equipment: EquipmentMap): { key: string; label: string; value: string }[] {
  return EQUIPMENT_KEYS.map((key) => ({
    key,
    label: EQUIPMENT_LABELS[key],
    value: equipment[key],
  }));
}

export function hasPlaceholderData(place: PlaceWithEquipment): boolean {
  const placeholderSourceIds = new Set(
    place.sources.filter((s) => s.kind === 'demo_placeholder').map((s) => s.id),
  );
  if (placeholderSourceIds.size === 0) return false;
  return place.equipmentRows.some((row) => row.sourceId && placeholderSourceIds.has(row.sourceId));
}

export function toCandidateDto(
  candidate: RankedCandidate,
  recommendationId: string,
  placeholder: boolean,
): CandidateDto {
  const { place } = candidate;
  return {
    recommendationId,
    placeId: place.id,
    rank: candidate.rank,
    role: candidate.role,
    name: place.name,
    areaLabel: place.areaLabel,
    travelMinutes: candidate.travel.minutes,
    travelPrecision: candidate.travel.precision,
    onSiteMinutes: candidate.travel.minutes === null ? null : candidate.playMinutes,
    priceLabel: place.priceLabel,
    fitGrade: candidate.fitGrade,
    confidence: {
      pct: candidate.confidence.pct,
      knownCount: candidate.confidence.knownCount,
      totalCount: candidate.confidence.totalCount,
      unknownLabels: candidate.confidence.unknownKeys.map((key) => EQUIPMENT_LABELS[key]),
      ruleVersion: CONFIDENCE_RULE_VERSION,
    },
    equipment: equipmentList(candidate.equipment),
    headline: candidate.headline,
    escapeRoute: place.escapeRoute,
    hoursLabel: place.hoursLabel,
    hoursVerified: place.hoursStatus !== 'unverified',
    reasons: candidate.reasons.map((reason) => ({ tone: reason.tone, text: reason.text })),
    coords:
      place.lat !== null && place.lng !== null
        ? { lat: place.lat, lng: place.lng, precise: place.coordPrecision === 'exact' }
        : null,
    hasPlaceholderData: placeholder,
  };
}
