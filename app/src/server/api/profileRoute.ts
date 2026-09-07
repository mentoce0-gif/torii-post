import { AREA_BY_CODE, AREAS } from '../data/seed/areas.ts';
import { defaultPrepMinutes } from '../domain/travel.ts';
import { badRequest, notFound } from '../http/respond.ts';
import type { RequestContext } from '../http/router.ts';
import type { Deps } from './deps.ts';
import { asObject, optionalString, requireInt, requireMobility, requireRole } from './validate.ts';

function monthsSince(year: number, month: number, now = new Date()): number {
  return Math.max(0, (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month));
}

function serialize(deps: Deps, householdId: string) {
  const household = deps.repo.getHousehold(householdId);
  if (!household) return null;
  const children = deps.repo.getChildren(householdId);
  const parents = deps.repo.getParents(householdId);
  const mobility = deps.repo.getMobilityProfile(householdId);

  return {
    householdId: household.id,
    createdAt: household.createdAt,
    homeAreaCode: household.homeAreaCode,
    homeAreaLabel: household.homeAreaLabel,
    usualPlaceId: household.usualPlaceId,
    notificationOptIn: household.notificationOptIn,
    parents: parents.map((parent) => ({ id: parent.id, role: parent.role })),
    children: children.map((child) => ({
      id: child.id,
      birthYear: child.birthYear,
      birthMonth: child.birthMonth,
      ageMonths: monthsSince(child.birthYear, child.birthMonth),
      handle: child.handle,
    })),
    mobility: mobility?.mode ?? 'car',
    prepMinutes: mobility?.prepMinutes ?? defaultPrepMinutes('car'),
    areas: AREAS.map((area) => ({ code: area.code, label: area.label })),
    usualPlaceOptions: deps.repo
      .listPlaces()
      .filter((entry) => entry.place.kind !== 'home')
      .map((entry) => ({ id: entry.place.id, name: entry.place.name, areaLabel: entry.place.areaLabel })),
  };
}

export function handleGetProfile(deps: Deps) {
  return (ctx: RequestContext) => {
    if (!ctx.householdId) throw notFound('household not found');
    const profile = serialize(deps, ctx.householdId);
    if (!profile) throw notFound('household not found');
    return profile;
  };
}

export function handlePutProfile(deps: Deps) {
  return (ctx: RequestContext) => {
    const body = asObject(ctx.body);

    const household =
      (ctx.householdId ? deps.repo.getHousehold(ctx.householdId) : null) ??
      deps.repo.createHousehold({});

    const areaCode = optionalString(body, 'homeAreaCode', 64);
    if (areaCode !== null && !AREA_BY_CODE.has(areaCode)) {
      throw badRequest('invalid_field', 'homeAreaCode is not a known area');
    }

    const usualPlaceId = optionalString(body, 'usualPlaceId', 64);
    if (usualPlaceId !== null && !deps.repo.getPlace(usualPlaceId)) {
      throw badRequest('invalid_field', 'usualPlaceId is not a known place');
    }

    if ('mobility' in body) {
      const mode = requireMobility(body['mobility']);
      const prepRaw = body['prepMinutes'];
      const prepMinutes =
        typeof prepRaw === 'number' && Number.isFinite(prepRaw)
          ? Math.min(60, Math.max(0, Math.round(prepRaw)))
          : defaultPrepMinutes(mode);
      deps.repo.upsertMobilityProfile(household.id, mode, prepMinutes);
    }

    if (Array.isArray(body['children'])) {
      const children = (body['children'] as unknown[]).slice(0, 6).map((raw) => {
        const child = asObject(raw);
        return {
          // Year and month only. There is no field here for a name or a
          // birth date, by design.
          birthYear: requireInt(child, 'birthYear', 2000, new Date().getFullYear()),
          birthMonth: requireInt(child, 'birthMonth', 1, 12),
          handle: optionalString(child, 'handle', 12),
        };
      });
      deps.repo.replaceChildren(household.id, children);
    }

    if (Array.isArray(body['parentRoles'])) {
      for (const role of body['parentRoles'] as unknown[]) requireRole(role);
    }

    const area = areaCode ? AREA_BY_CODE.get(areaCode) : undefined;
    deps.repo.updateHousehold(household.id, {
      homeAreaCode: areaCode,
      homeAreaLabel: area?.label ?? null,
      usualPlaceId,
      notificationOptIn: body['notificationOptIn'] === true,
    });

    return serialize(deps, household.id);
  };
}

export function handleDeleteProfile(deps: Deps) {
  return (ctx: RequestContext) => {
    if (!ctx.householdId) throw notFound('household not found');
    // Everything: children, decisions, visits, feedback, events. No tombstone.
    const removed = deps.repo.deleteHousehold(ctx.householdId);
    if (!removed) throw notFound('household not found');
    return { deleted: true };
  };
}
