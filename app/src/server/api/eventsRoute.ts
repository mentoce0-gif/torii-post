import { isKnownEvent } from '../analytics/provider.ts';
import { badRequest } from '../http/respond.ts';
import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';
import { asObject } from './validate.ts';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Retention markers are derived, not reported: the client cannot know it is a
 * two-week return, and asking it to would make the number a client-side claim.
 */
async function markReturns(deps: Deps, householdId: string): Promise<void> {
  const household = await deps.repo.getHousehold(householdId);
  if (!household) return;
  const age = Date.now() - Date.parse(household.createdAt);

  if (age >= TWO_WEEKS_MS && !await deps.repo.hasEvent(householdId, 'return_2w')) {
    await deps.analytics.track({
      name: 'return_2w',
      householdId,
      sessionId: null,
      placeId: null,
      recommendationRank: null,
      props: null,
    });
  }
  if (age >= FOUR_WEEKS_MS && !await deps.repo.hasEvent(householdId, 'return_4w')) {
    await deps.analytics.track({
      name: 'return_4w',
      householdId,
      sessionId: null,
      placeId: null,
      recommendationRank: null,
      props: null,
    });
  }
}

export function handlePostEvents(deps: Deps) {
  return async (ctx: RequestContext)  => {
    const body = asObject(ctx.body);
    const raw = body['events'];
    if (!Array.isArray(raw)) throw badRequest('invalid_field', 'events must be an array');

    let accepted = 0;
    for (const item of raw.slice(0, 50)) {
      if (!item || typeof item !== 'object') continue;
      const event = item as Record<string, unknown>;
      // Only names the PoC actually reports on. An unknown name is dropped
      // rather than stored, so the event table stays a fixed vocabulary.
      if (!isKnownEvent(event['name'])) continue;

      const rank = event['recommendationRank'];
      await deps.analytics.track({
        name: event['name'],
        householdId: ctx.householdId,
        sessionId: typeof event['sessionId'] === 'string' ? event['sessionId'] : null,
        placeId: typeof event['placeId'] === 'string' ? event['placeId'] : null,
        recommendationRank: typeof rank === 'number' && Number.isFinite(rank) ? rank : null,
        props:
          event['props'] && typeof event['props'] === 'object' && !Array.isArray(event['props'])
            ? (event['props'] as Record<string, unknown>)
            : null,
      });
      accepted += 1;

      if (event['name'] === 'app_open' && ctx.householdId) markReturns(deps, ctx.householdId);
    }

    return { accepted };
  };
}
