import { isEquipmentKey, isEquipmentValue } from '../domain/equipment.ts';
import type { EquipmentKey, EquipmentValue, StayBucket } from '../domain/types.ts';
import { badRequest, notFound } from '../http/respond.ts';
import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';
import {
  asObject,
  optionalString,
  requireReaction,
  requireRevisit,
  requireStayBucket,
  requireString,
} from './validate.ts';

/** The three taps, in minutes. `custom` carries its own number. */
const BUCKET_MINUTES: Record<Exclude<StayBucket, 'custom'>, number> = {
  under15: 15,
  about30: 30,
  over60: 60,
};

export function handleCreateFeedback(deps: Deps) {
  return async (ctx: RequestContext)  => {
    const body = asObject(ctx.body);
    const visitId = requireString(body, 'visitId', 64);

    const visit = await deps.repo.getVisit(visitId);
    if (!visit) throw notFound('その記録対象が見つかりませんでした');
    if (ctx.householdId && visit.householdId !== ctx.householdId) {
      throw notFound('その記録対象が見つかりませんでした');
    }

    const stayBucket = requireStayBucket(body['stayBucket']);
    let stayMinutes: number;
    if (stayBucket === 'custom') {
      const raw = body['stayMinutes'];
      const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 600) {
        throw badRequest('invalid_field', 'stayMinutes must be 1..600 when stayBucket is custom');
      }
      stayMinutes = Math.round(parsed);
    } else {
      stayMinutes = BUCKET_MINUTES[stayBucket];
    }

    // Optional 20-character sticky note. Anything longer is a review, and this
    // is not a review product.
    const note = optionalString(body, 'note', 20);

    const reports: { key: EquipmentKey; value: EquipmentValue }[] = [];
    const rawReports = body['equipmentReports'];
    if (Array.isArray(rawReports)) {
      for (const item of rawReports.slice(0, 6)) {
        if (!item || typeof item !== 'object') continue;
        const { key, value } = item as Record<string, unknown>;
        if (isEquipmentKey(key) && isEquipmentValue(value)) reports.push({ key, value });
      }
    }

    const feedback = await deps.repo.saveFeedback({
      visitId,
      reaction: requireReaction(body['reaction']),
      stayMinutes,
      stayBucket,
      revisit: requireRevisit(body['revisit']),
      note,
      equipmentReports: reports,
    });

    await deps.analytics.track({
      name: 'visit_feedback_completed',
      householdId: visit.householdId,
      sessionId: null,
      placeId: visit.placeId,
      recommendationRank: null,
      props: {
        reaction: feedback.reaction,
        stayMinutes: feedback.stayMinutes,
        revisit: feedback.revisit,
        corrections: reports.length,
      },
      createdAt: feedback.createdAt,
    });

    return { ok: true, visitId, stayMinutes, corrections: reports.length };
  };
}
