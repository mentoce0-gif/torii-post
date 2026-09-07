import type { DecisionKind } from '../domain/types.ts';
import { badRequest, notFound } from '../http/respond.ts';
import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';
import { asObject, optionalString, requireString } from './validate.ts';

const KINDS: DecisionKind[] = ['go', 'skip', 'usual'];

/** Asked at most three times, and never twice in the same week. */
const SUBJECTIVE_PROMPT_LIMIT = 3;
const SUBJECTIVE_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function shouldAskSubjective(
  count: number,
  lastAt: string | null,
  now: number,
): boolean {
  if (count >= SUBJECTIVE_PROMPT_LIMIT) return false;
  if (!lastAt) return true;
  return now - Date.parse(lastAt) >= SUBJECTIVE_PROMPT_COOLDOWN_MS;
}

export function handleCreateDecision(deps: Deps) {
  return (ctx: RequestContext) => {
    const body = asObject(ctx.body);
    const sessionId = requireString(body, 'sessionId', 64);
    const kind = body['kind'];
    if (typeof kind !== 'string' || !KINDS.includes(kind as DecisionKind)) {
      throw badRequest('invalid_field', 'kind must be go, skip or usual');
    }

    const session = deps.repo.getSession(sessionId);
    if (!session) throw notFound('その提案は見つかりませんでした');

    const recommendationId = optionalString(body, 'recommendationId', 64);
    const recommendation = recommendationId ? deps.repo.getRecommendation(recommendationId) : null;
    if (recommendationId && (!recommendation || recommendation.sessionId !== sessionId)) {
      throw badRequest('invalid_field', 'recommendationId does not belong to this session');
    }

    const clientElapsedRaw = body['clientElapsedMs'];
    const clientElapsedMs =
      typeof clientElapsedRaw === 'number' && Number.isFinite(clientElapsedRaw)
        ? Math.max(0, Math.round(clientElapsedRaw))
        : null;

    const { decision, visit } = deps.repo.createDecision({
      sessionId,
      recommendationId: recommendation?.id ?? null,
      placeId: recommendation?.placeId ?? optionalString(body, 'placeId', 64),
      kind: kind as DecisionKind,
      clientElapsedMs,
    });

    deps.analytics.track({
      name: `decision_${decision.kind}`,
      householdId: session.householdId,
      sessionId,
      placeId: decision.placeId,
      recommendationRank: recommendation?.rank ?? null,
      props: {
        timeToDecisionMs: decision.timeToDecisionMs,
        clientElapsedMs: decision.clientElapsedMs,
      },
      createdAt: decision.decidedAt,
    });

    const household = deps.repo.getHousehold(session.householdId);
    const ask =
      household !== null &&
      shouldAskSubjective(
        household.subjectivePromptCount,
        household.subjectivePromptLastAt,
        Date.parse(decision.decidedAt),
      );

    if (ask && household) {
      deps.repo.updateHousehold(household.id, {
        subjectivePromptCount: household.subjectivePromptCount + 1,
        subjectivePromptLastAt: decision.decidedAt,
      });
    }

    return {
      decisionId: decision.id,
      kind: decision.kind,
      visitId: visit?.id ?? null,
      timeToDecisionMs: decision.timeToDecisionMs,
      askSubjective: ask,
    };
  };
}

export function handleSubjective(deps: Deps) {
  return (ctx: RequestContext) => {
    const body = asObject(ctx.body);
    const decisionId = optionalString(body, 'decisionId', 64);
    const answer = body['answer'];
    if (answer !== 'faster' && answer !== 'same' && answer !== 'slower') {
      throw badRequest('invalid_field', 'answer must be faster, same or slower');
    }
    if (!ctx.householdId || !deps.repo.getHousehold(ctx.householdId)) {
      throw notFound('household not found');
    }
    deps.repo.recordSubjective(ctx.householdId, decisionId, answer);
    return { ok: true };
  };
}
