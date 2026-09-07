import { computeInformationConfidence, type ConfidenceResult } from './confidence.ts';
import { FIT_RULE_VERSION, fitScore, rankingScore, toGrade } from './fit.ts';
import { RULE_SET_VERSION, evaluate } from './rules.ts';
import { defaultPrepMinutes, estimateTravel, type TravelEstimate } from './travel.ts';
import type {
  EquipmentMap,
  FitGrade,
  Place,
  PreferenceHistory,
  Reason,
  RecommendContext,
  Revisit,
} from './types.ts';

export const RECOMMENDER_VERSION = `rules:${RULE_SET_VERSION}/fit:${FIT_RULE_VERSION}`;

/** How many candidates the home screen shows. Three, never a list. */
export const CANDIDATE_LIMIT = 3;

/** Below this there is nothing to do once you arrive, so it is not a candidate. */
const MIN_PLAYABLE_MINUTES = 15;

export interface CandidateInput {
  place: Place;
  equipment: EquipmentMap;
  visitCount: number;
  history: PreferenceHistory | null;
  lastRevisitAnswer: Revisit | null;
}

export type CandidateRole = 'explore' | 'usual' | 'home';

export interface RankedCandidate {
  place: Place;
  equipment: EquipmentMap;
  role: CandidateRole;
  rank: number;
  fitGrade: FitGrade;
  confidence: ConfidenceResult;
  travel: TravelEstimate;
  playMinutes: number;
  reasons: Reason[];
  headline: string;
}

export interface RecommendOptions {
  usualPlaceId: string | null;
  prepMinutes?: number;
}

interface Scored {
  candidate: CandidateInput;
  role: CandidateRole;
  travel: TravelEstimate;
  confidence: ConfidenceResult;
  reasons: Reason[];
  playMinutes: number;
  fit: number;
  ranking: number;
}

/**
 * Reasons that are true of nearly every seeded place. A headline that reads the
 * same on all three cards tells the reader nothing, so these go last.
 */
const GENERIC_HEADLINE_IDS = new Set(['escape.unknown', 'hours.unverified']);

/**
 * One line for the card. A warning outranks a gap, a gap outranks good news,
 * and a gap about this particular place outranks a gap everything shares.
 */
function pickHeadline(place: Place, reasons: Reason[]): string {
  if ((place.kind === 'home' || place.kind === 'usual') && place.notes) return place.notes;

  const caution = reasons.find((r) => r.tone === 'caution');
  if (caution) return caution.text;

  const unknowns = reasons.filter((r) => r.tone === 'unknown');
  const specific = unknowns.find((r) => !GENERIC_HEADLINE_IDS.has(r.id));
  if (specific) return specific.text;
  if (unknowns[0]) return unknowns[0].text;

  return reasons[0]?.text ?? '';
}

function score(
  candidate: CandidateInput,
  role: CandidateRole,
  context: RecommendContext,
  prepMinutes: number,
): Scored {
  const travel = estimateTravel(context.origin, candidate.place, context.mobility, prepMinutes);
  const confidence = computeInformationConfidence(candidate.equipment);
  const outcome = evaluate({
    place: candidate.place,
    equipment: candidate.equipment,
    context,
    travel,
    confidence,
    history: candidate.history,
    visitCount: candidate.visitCount,
    lastRevisitAnswer: candidate.lastRevisitAnswer,
  });
  const fit = fitScore(outcome.signals);
  return {
    candidate,
    role,
    travel,
    confidence,
    reasons: outcome.reasons,
    playMinutes: outcome.playMinutes,
    fit,
    ranking: rankingScore(fit, confidence.pct),
  };
}

function present(scored: Scored, rank: number): RankedCandidate {
  return {
    place: scored.candidate.place,
    equipment: scored.candidate.equipment,
    role: scored.role,
    rank,
    fitGrade: toGrade(scored.fit),
    confidence: scored.confidence,
    travel: scored.travel,
    playMinutes: scored.playMinutes,
    reasons: scored.reasons,
    headline: pickHeadline(scored.candidate.place, scored.reasons),
  };
}

/**
 * Picks today's three.
 *
 * The shape is fixed on purpose: up to two places the household has not been
 * to, then the fallback they would otherwise default to anyway. If the area and
 * the clock only support one unfamiliar place, the answer is two cards — we do
 * not pad the list to three with somewhere that does not fit.
 */
export function buildRecommendations(
  candidates: CandidateInput[],
  context: RecommendContext,
  options: RecommendOptions,
): RankedCandidate[] {
  const prepMinutes = options.prepMinutes ?? defaultPrepMinutes(context.mobility);

  const homeCandidate = candidates.find((c) => c.place.kind === 'home') ?? null;
  const usualCandidate =
    (options.usualPlaceId
      ? candidates.find((c) => c.place.id === options.usualPlaceId)
      : candidates.find((c) => c.place.kind === 'usual')) ?? null;

  const explorePool = candidates.filter(
    (c) =>
      c.place.kind !== 'home' &&
      c.place.id !== usualCandidate?.place.id &&
      c.place.kind !== 'usual',
  );

  const exploreScored = explorePool
    .map((c) => score(c, 'explore', context, prepMinutes))
    // A place you demonstrably cannot play at today is not a candidate. An
    // unknown travel time is not a demonstration, so those stay in; low
    // information confidence is never a reason to drop one either.
    .filter((s) => s.travel.precision === 'unknown' || s.playMinutes >= MIN_PLAYABLE_MINUTES)
    .sort((a, b) => b.ranking - a.ranking);

  const picked: Scored[] = exploreScored.slice(0, CANDIDATE_LIMIT - 1);

  if (usualCandidate && picked.length < CANDIDATE_LIMIT) {
    picked.push(score(usualCandidate, 'usual', context, prepMinutes));
  }
  if (homeCandidate && picked.length < CANDIDATE_LIMIT) {
    picked.push(score(homeCandidate, 'home', context, prepMinutes));
  }

  // If there was no usual spot and only one place fit, a third explore
  // candidate may still be available and is better than a short list.
  if (picked.length < CANDIDATE_LIMIT) {
    for (const extra of exploreScored) {
      if (picked.length >= CANDIDATE_LIMIT) break;
      if (picked.some((p) => p.candidate.place.id === extra.candidate.place.id)) continue;
      picked.push(extra);
    }
  }

  return picked.slice(0, CANDIDATE_LIMIT).map((s, index) => present(s, index + 1));
}
