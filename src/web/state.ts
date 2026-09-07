import type { Candidate, RecommendResponse } from './api.ts';

export interface Conditions {
  childAgeMonths: number;
  remainingMinutes: number;
  mobility: string;
  weather: string;
  areaCode: string | null;
  useGps: boolean;
}

const CONDITIONS_KEY = 'kns.conditions';

export const DEFAULT_CONDITIONS: Conditions = {
  childAgeMonths: 18,
  remainingMinutes: 90,
  mobility: 'car',
  weather: 'cloudy',
  areaCode: null,
  useGps: true,
};

export function loadConditions(): Conditions {
  try {
    const raw = localStorage.getItem(CONDITIONS_KEY);
    if (!raw) return { ...DEFAULT_CONDITIONS };
    return { ...DEFAULT_CONDITIONS, ...(JSON.parse(raw) as Partial<Conditions>) };
  } catch {
    return { ...DEFAULT_CONDITIONS };
  }
}

export function saveConditions(conditions: Conditions): void {
  try {
    localStorage.setItem(CONDITIONS_KEY, JSON.stringify(conditions));
  } catch {
    /* ignore */
  }
}

export interface Session {
  response: RecommendResponse;
  /** Local stopwatch, started the moment the cards were painted. */
  shownAtLocal: number;
}

export const store: {
  conditions: Conditions;
  session: Session | null;
  lastDecisionId: string | null;
  mapProvider: string;
} = {
  conditions: loadConditions(),
  session: null,
  lastDecisionId: null,
  mapProvider: 'schematic',
};

export function findCandidate(placeId: string): Candidate | null {
  return store.session?.response.candidates.find((c) => c.placeId === placeId) ?? null;
}

/** Milliseconds since the three cards appeared. The north-star metric's client half. */
export function elapsedSinceShown(): number | null {
  if (!store.session) return null;
  return Math.max(0, Math.round(performance.now() - store.session.shownAtLocal));
}
