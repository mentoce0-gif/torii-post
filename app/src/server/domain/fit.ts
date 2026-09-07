import type { FitGrade } from './types.ts';
import type { Signals } from './rules.ts';

export const FIT_RULE_VERSION = 'v1';

/**
 * Weights for today's-conditions fit. Information confidence is deliberately
 * absent: a place nobody has documented is not a worse place, and mixing the
 * two axes would quietly turn `？` into a penalty.
 */
const WEIGHTS: Record<keyof Signals, number> = {
  timeFit: 2.6,
  weatherFit: 2.0,
  ageFit: 1.8,
  equipmentFit: 1.5,
  endurance: 1.2,
  escapeRoute: 0.7,
  novelty: 0.6,
};

export function fitScore(signals: Signals): number {
  let total = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(WEIGHTS) as [keyof Signals, number][]) {
    total += signals[key] * w;
    weight += w;
  }
  return total / weight;
}

export function toGrade(score: number): FitGrade {
  if (score >= 0.78) return '◎';
  if (score >= 0.55) return '○';
  return '△';
}

/**
 * Ordering score. Confidence enters here, and only here, as a light tiebreak so
 * that two equally suitable places surface the better-documented one first. It
 * cannot drop a candidate: selection happens before this is applied.
 */
export function rankingScore(score: number, confidencePct: number): number {
  return score * 0.9 + (confidencePct / 100) * 0.1;
}
