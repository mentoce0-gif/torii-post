import { AREA_BY_CODE, nearestArea } from '../data/seed/areas.ts';
import { buildRecommendations, type CandidateInput } from '../domain/recommend.ts';
import type { Origin, RecommendContext } from '../domain/types.ts';
import { badRequest } from '../http/respond.ts';
import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';
import { hasPlaceholderData, toCandidateDto, type CandidateDto } from './serialize.ts';
import {
  asObject,
  coarsen,
  requireInt,
  requireMobility,
  requireWeather,
} from './validate.ts';

/** How we came to believe the household is where we think they are. */
export type OriginSource = 'gps' | 'chosen' | 'default';

export interface RecommendResponse {
  householdId: string;
  sessionId: string;
  shownAt: string;
  context: {
    childAgeMonths: number;
    remainingMinutes: number;
    mobility: string;
    weather: string;
    areaCode: string;
    areaLabel: string;
    /** 'default' means nobody said — the screen must show it as changeable. */
    originSource: OriginSource;
  };
  candidates: CandidateDto[];
  shortlistNote: string | null;
  dataNotice: 'demo_placeholder' | null;
}

/**
 * Resolves where the parent is standing, at town resolution and no finer.
 *
 * A precise fix from the browser is rounded on arrival and the rounded value is
 * what gets used and stored; the original never reaches the recommender, the
 * session record or the log.
 */
function resolveOrigin(
  raw: unknown,
  fallbackAreaCode: string | null,
  defaultAreaCode: string,
): { origin: Origin; areaCode: string; areaLabel: string; source: OriginSource } {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const lat = typeof value['lat'] === 'number' ? coarsen(value['lat'] as number) : null;
  const lng = typeof value['lng'] === 'number' ? coarsen(value['lng'] as number) : null;

  if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const area = nearestArea(lat, lng);
    return {
      origin: { lat, lng, areaCode: area.code },
      areaCode: area.code,
      areaLabel: area.label,
      source: 'gps',
    };
  }

  const chosen =
    (typeof value['areaCode'] === 'string' ? (value['areaCode'] as string) : null) ??
    fallbackAreaCode;
  const chosenArea = chosen ? AREA_BY_CODE.get(chosen) : undefined;

  if (chosenArea) {
    return {
      origin: { lat: chosenArea.lat, lng: chosenArea.lng, areaCode: chosenArea.code },
      areaCode: chosenArea.code,
      areaLabel: chosenArea.label,
      source: 'chosen',
    };
  }

  // Location refused and no area chosen yet. Falling back to the configured
  // town is not a guess about where the household is standing — the response
  // says `source: 'default'` and the screen labels it as a changeable default.
  // Blocking here instead used to strand every first-time visitor who declined
  // the location prompt, which is most of them.
  const fallback = AREA_BY_CODE.get(defaultAreaCode);
  if (!fallback) {
    throw badRequest('origin_required', '現在地または滞在エリアを選んでください');
  }

  return {
    origin: { lat: fallback.lat, lng: fallback.lng, areaCode: fallback.code },
    areaCode: fallback.code,
    areaLabel: fallback.label,
    source: 'default',
  };
}

export function handleRecommend(deps: Deps) {
  return (ctx: RequestContext): RecommendResponse => {
    const body = asObject(ctx.body);

    const household =
      (ctx.householdId ? deps.repo.getHousehold(ctx.householdId) : null) ??
      deps.repo.createHousehold({});

    const context: RecommendContext = {
      childAgeMonths: requireInt(body, 'childAgeMonths', 0, 216),
      remainingMinutes: requireInt(body, 'remainingMinutes', 15, 600),
      mobility: requireMobility(body['mobility']),
      weather: requireWeather(body['weather']),
      origin: {},
    };

    const resolved = resolveOrigin(
      body['origin'],
      household.homeAreaCode,
      deps.config.defaultAreaCode,
    );
    context.origin = resolved.origin;

    const profile = deps.repo.getMobilityProfile(household.id);
    const places = deps.repo.listPlaces();
    const historyByCategory = new Map(
      deps.repo.getPreferenceHistory(household.id).map((row) => [row.category, row]),
    );

    const candidates: CandidateInput[] = places.map((entry) => ({
      place: entry.place,
      equipment: entry.equipment,
      visitCount: deps.repo.countVisits(household.id, entry.place.id),
      history: historyByCategory.get(entry.place.category) ?? null,
      lastRevisitAnswer: deps.repo.lastRevisitAnswer(household.id, entry.place.id),
    }));

    const ranked = buildRecommendations(candidates, context, {
      usualPlaceId: household.usualPlaceId,
      ...(profile ? { prepMinutes: profile.prepMinutes } : {}),
    });

    const shownAt = new Date().toISOString();
    // The clock for Time to Decision starts the moment these leave the server.
    const session = deps.repo.createSession(
      household.id,
      JSON.stringify({
        childAgeMonths: context.childAgeMonths,
        remainingMinutes: context.remainingMinutes,
        mobility: context.mobility,
        weather: context.weather,
        areaCode: resolved.areaCode,
      }),
      shownAt,
    );

    const saved = deps.repo.saveRecommendations(
      ranked.map((candidate) => ({
        sessionId: session.id,
        placeId: candidate.place.id,
        rank: candidate.rank,
        fitGrade: candidate.fitGrade,
        confidencePct: candidate.confidence.pct,
        travelMinutes: candidate.travel.minutes,
        reasonsJson: JSON.stringify(candidate.reasons),
      })),
    );

    const placeById = new Map(places.map((entry) => [entry.place.id, entry]));
    const dtos = ranked.map((candidate, index) => {
      const entry = placeById.get(candidate.place.id);
      return toCandidateDto(
        candidate,
        saved[index]?.id ?? '',
        entry ? hasPlaceholderData(entry) : false,
      );
    });

    deps.analytics.track({
      name: 'recommendations_shown',
      householdId: household.id,
      sessionId: session.id,
      placeId: null,
      recommendationRank: null,
      props: { count: dtos.length, weather: context.weather, remainingMinutes: context.remainingMinutes },
      createdAt: shownAt,
    });

    return {
      householdId: household.id,
      sessionId: session.id,
      shownAt,
      context: {
        childAgeMonths: context.childAgeMonths,
        remainingMinutes: context.remainingMinutes,
        mobility: context.mobility,
        weather: context.weather,
        areaCode: resolved.areaCode,
        areaLabel: resolved.areaLabel,
        originSource: resolved.source,
      },
      candidates: dtos,
      // Three is the target, not a quota. Saying so is better than padding.
      shortlistNote:
        dtos.length < 3
          ? '今日の条件で成立する候補が少ないため、無理に3件にしていません'
          : null,
      dataNotice: dtos.some((dto) => dto.hasPlaceholderData) ? 'demo_placeholder' : null,
    };
  };
}
