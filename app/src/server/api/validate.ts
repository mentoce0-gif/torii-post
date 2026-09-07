import { badRequest } from '../http/respond.ts';
import type { Mobility, ParentRole, Reaction, Revisit, StayBucket, SubjectiveAnswer, Weather } from '../domain/types.ts';

const MOBILITIES: Mobility[] = ['car', 'walk', 'bicycle', 'transit'];
const WEATHERS: Weather[] = ['sunny', 'cloudy', 'rain', 'snow', 'hot', 'cold'];
const REACTIONS: Reaction[] = ['bored_fast', 'ok', 'lasted'];
const REVISITS: Revisit[] = ['yes', 'conditional', 'no'];
const STAY_BUCKETS: StayBucket[] = ['under15', 'about30', 'over60', 'custom'];
const ROLES: ParentRole[] = ['father', 'mother', 'grandparent', 'other'];
const SUBJECTIVE: SubjectiveAnswer[] = ['faster', 'same', 'slower'];

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('invalid_body', 'JSON object required');
  }
  return value as Record<string, unknown>;
}

export function requireString(body: Record<string, unknown>, key: string, max = 200): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw badRequest('invalid_field', `${key} must be a string of 1..${max} characters`);
  }
  return value;
}

export function optionalString(body: Record<string, unknown>, key: string, max = 200): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) {
    throw badRequest('invalid_field', `${key} must be a string of at most ${max} characters`);
  }
  return value;
}

export function requireInt(
  body: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number {
  const value = body[key];
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw badRequest('invalid_field', `${key} must be a number between ${min} and ${max}`);
  }
  return Math.round(parsed);
}

function oneOf<T extends string>(list: T[], value: unknown, key: string): T {
  if (typeof value === 'string' && (list as string[]).includes(value)) return value as T;
  throw badRequest('invalid_field', `${key} must be one of ${list.join(', ')}`);
}

export const requireMobility = (v: unknown) => oneOf(MOBILITIES, v, 'mobility');
export const requireWeather = (v: unknown) => oneOf(WEATHERS, v, 'weather');
export const requireReaction = (v: unknown) => oneOf(REACTIONS, v, 'reaction');
export const requireRevisit = (v: unknown) => oneOf(REVISITS, v, 'revisit');
export const requireStayBucket = (v: unknown) => oneOf(STAY_BUCKETS, v, 'stayBucket');
export const requireRole = (v: unknown) => oneOf(ROLES, v, 'parentRole');
export const requireSubjective = (v: unknown) => oneOf(SUBJECTIVE, v, 'answer');

/**
 * A GPS fix is only ever used at this resolution — about a kilometre. The full
 * precision reading is discarded before anything is computed or written down.
 */
export function coarsen(value: number): number {
  return Math.round(value * 100) / 100;
}
