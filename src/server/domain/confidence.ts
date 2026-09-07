import { EQUIPMENT_KEYS, type EquipmentKey, type EquipmentMap } from './types.ts';
import { isKnown } from './equipment.ts';

/**
 * Bump this whenever the formula changes so stored recommendations stay
 * interpretable after the fact. The rule lives here and only here — no UI
 * component recomputes it.
 */
export const CONFIDENCE_RULE_VERSION = 'v1';

export interface ConfidenceResult {
  /** 0..100, rounded. */
  pct: number;
  knownCount: number;
  totalCount: number;
  unknownKeys: EquipmentKey[];
  ruleVersion: string;
}

/**
 * How much of what this card claims has actually been confirmed.
 *
 * This is not a quality score for the place. A well-equipped park nobody has
 * documented scores low; a bare lot with a complete survey scores high. Keeping
 * the two axes apart is the point — see fit.ts for the other one.
 */
export function computeInformationConfidence(equipment: EquipmentMap): ConfidenceResult {
  const totalCount = EQUIPMENT_KEYS.length;
  const unknown: EquipmentKey[] = [];
  let knownCount = 0;

  for (const key of EQUIPMENT_KEYS) {
    if (isKnown(equipment[key])) knownCount += 1;
    else unknown.push(key);
  }

  return {
    pct: Math.round((knownCount / totalCount) * 100),
    knownCount,
    totalCount,
    unknownKeys: unknown,
    ruleVersion: CONFIDENCE_RULE_VERSION,
  };
}
