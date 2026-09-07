import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';

const REACTION_LABELS: Record<string, string> = {
  bored_fast: 'すぐ飽きた',
  ok: 'まあまあ',
  lasted: '持った',
};

const REVISIT_LABELS: Record<string, string> = {
  yes: 'また行く',
  conditional: '条件付き',
  no: 'もういい',
};

const KIND_LABELS: Record<string, string> = {
  go: '行く',
  skip: '見送る',
  usual: 'いつもの場',
};

export function handleGetHistory(deps: Deps) {
  return (ctx: RequestContext) => {
    if (!ctx.householdId) return { entries: [], openVisits: [] };
    const household = deps.repo.getHousehold(ctx.householdId);
    if (!household) return { entries: [], openVisits: [] };

    const limitParam = Number.parseInt(ctx.query.get('limit') ?? '30', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 30;

    return {
      entries: deps.repo.listHistory(household.id, limit).map((row) => ({
        decisionId: row.decisionId,
        decidedAt: row.decidedAt,
        kind: row.kind,
        kindLabel: KIND_LABELS[row.kind] ?? row.kind,
        placeId: row.placeId,
        placeName: row.placeName,
        areaLabel: row.areaLabel,
        went: row.visitId !== null,
        visitId: row.visitId,
        recorded: row.reaction !== null,
        stayMinutes: row.stayMinutes,
        reaction: row.reaction,
        reactionLabel: row.reaction ? REACTION_LABELS[row.reaction] ?? null : null,
        revisit: row.revisit,
        revisitLabel: row.revisit ? REVISIT_LABELS[row.revisit] ?? null : null,
        timeToDecisionMs: row.timeToDecisionMs,
      })),
      // Anything the household said "go" to but has not written up yet.
      openVisits: deps.repo.getOpenVisits(household.id).map((visit) => ({
        visitId: visit.id,
        placeId: visit.placeId,
        placeName: visit.placeName,
        createdAt: visit.createdAt,
      })),
    };
  };
}
