import { computeInformationConfidence } from '../domain/confidence.ts';
import { fitScore, gradeFor } from '../domain/fit.ts';
import { evaluate } from '../domain/rules.ts';
import { defaultPrepMinutes, estimateTravel } from '../domain/travel.ts';
import { EQUIPMENT_LABELS, type Mobility, type RecommendContext, type Weather } from '../domain/types.ts';
import { AREA_BY_CODE } from '../data/seed/areas.ts';
import { notFound } from '../http/respond.ts';
import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';
import { equipmentList, hasPlaceholderData } from './serialize.ts';

export function handleGetPlace(deps: Deps) {
  return (ctx: RequestContext) => {
    const id = ctx.params['id'];
    if (!id) throw notFound('place id required');

    const entry = deps.repo.getPlace(id);
    if (!entry) throw notFound('その場所は見つかりませんでした');

    const { place, equipment } = entry;
    const confidence = computeInformationConfidence(equipment);

    // Reasons are context-dependent, so the detail view re-derives them from the
    // stored session rather than trusting anything the client sends back.
    const sessionId = ctx.query.get('sessionId');
    const session = sessionId ? deps.repo.getSession(sessionId) : null;

    let reasons: { tone: string; text: string }[] = [];
    let travelMinutes: number | null = null;
    let travelPrecision: 'measured' | 'estimate' | 'unknown' = 'unknown';
    let fitGrade: string | null = null;

    if (session) {
      const stored = JSON.parse(session.contextJson) as {
        childAgeMonths: number;
        remainingMinutes: number;
        mobility: Mobility;
        weather: Weather;
        areaCode: string;
      };
      const area = AREA_BY_CODE.get(stored.areaCode);
      const context: RecommendContext = {
        childAgeMonths: stored.childAgeMonths,
        remainingMinutes: stored.remainingMinutes,
        mobility: stored.mobility,
        weather: stored.weather,
        origin: area ? { lat: area.lat, lng: area.lng, areaCode: area.code } : {},
      };
      const profile = deps.repo.getMobilityProfile(session.householdId);
      const travel = estimateTravel(
        context.origin,
        place,
        context.mobility,
        profile?.prepMinutes ?? defaultPrepMinutes(context.mobility),
      );
      const outcome = evaluate({
        place,
        equipment,
        context,
        travel,
        confidence,
        history:
          deps.repo
            .getPreferenceHistory(session.householdId)
            .find((row) => row.category === place.category) ?? null,
        visitCount: deps.repo.countVisits(session.householdId, place.id),
        lastRevisitAnswer: deps.repo.lastRevisitAnswer(session.householdId, place.id),
      });
      reasons = outcome.reasons.map((reason) => ({ tone: reason.tone, text: reason.text }));
      travelMinutes = travel.minutes;
      travelPrecision = travel.precision;
      fitGrade = gradeFor(fitScore(outcome.signals), confidence.pct);
    }

    const householdId = session?.householdId ?? ctx.householdId;
    const pastVisits = householdId ? deps.repo.countVisits(householdId, place.id) : 0;
    const lastRevisit = householdId ? deps.repo.lastRevisitAnswer(householdId, place.id) : null;

    return {
      placeId: place.id,
      name: place.name,
      areaLabel: place.areaLabel,
      kind: place.kind,
      priceLabel: place.priceLabel,
      hoursLabel: place.hoursLabel,
      hoursVerified: place.hoursStatus !== 'unverified',
      escapeRoute: place.escapeRoute,
      notes: place.notes,
      equipment: equipmentList(equipment),
      confidence: {
        pct: confidence.pct,
        knownCount: confidence.knownCount,
        totalCount: confidence.totalCount,
        unknownLabels: confidence.unknownKeys.map((key) => EQUIPMENT_LABELS[key]),
      },
      // Said plainly, because the alternative is a plausible guess.
      unknownNote:
        confidence.unknownKeys.length > 0
          ? `${confidence.unknownKeys
              .map((key) => EQUIPMENT_LABELS[key])
              .join('・')}について確認できる公開情報がありません。`
          : null,
      fitGrade,
      travelMinutes,
      travelPrecision,
      reasons,
      sources: entry.sources.map((source) => ({
        kind: source.kind,
        label: source.label,
        url: source.url,
        checkedAt: source.checkedAt,
      })),
      pastVisits,
      lastRevisit,
      coords:
        place.lat !== null && place.lng !== null
          ? { lat: place.lat, lng: place.lng, precise: place.coordPrecision === 'exact' }
          : null,
      hasPlaceholderData: hasPlaceholderData(entry),
      updatedAt: place.updatedAt,
    };
  };
}
