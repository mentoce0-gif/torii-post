import type { Repository } from '../data/repository.ts';

export interface TrackedEvent {
  name: string;
  householdId: string | null;
  sessionId: string | null;
  placeId: string | null;
  recommendationRank: number | null;
  props: Record<string, unknown> | null;
  createdAt?: string;
}

/**
 * Swapping in Amplitude, PostHog or a warehouse pipeline means writing one more
 * of these. Nothing outside this directory knows where events end up.
 */
export interface AnalyticsProvider {
  /**
   * Awaited by callers. Fire-and-forget was fine when the write landed in this
   * process; against a database over a binding an un-awaited promise can be
   * cancelled when the request ends, and the dropped row is a
   * `recommendations_shown` — the start of the Time to Decision clock.
   */
  track(event: TrackedEvent): Promise<void>;
}

export class SqliteAnalyticsProvider implements AnalyticsProvider {
  readonly #repo: Repository;

  constructor(repo: Repository) {
    this.#repo = repo;
  }

  async track(event: TrackedEvent): Promise<void> {
    await this.#repo.recordEvent(event);
  }
}

export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  async track(event: TrackedEvent): Promise<void> {
    console.log(`[analytics] ${event.name}`, {
      household: event.householdId,
      session: event.sessionId,
      place: event.placeId,
      rank: event.recommendationRank,
    });
  }
}

export class NullAnalyticsProvider implements AnalyticsProvider {
  async track(): Promise<void> {}
}

/** The full event list the PoC reports on. Anything else is rejected at the door. */
export const KNOWN_EVENTS = [
  'app_open',
  'recommendations_shown',
  'place_detail_open',
  'map_open',
  'decision_go',
  'decision_skip',
  'decision_usual',
  'external_app_open',
  'visit_feedback_started',
  'visit_feedback_completed',
  'return_2w',
  'return_4w',
] as const;

export type KnownEvent = (typeof KNOWN_EVENTS)[number];

export function isKnownEvent(name: unknown): name is KnownEvent {
  return typeof name === 'string' && (KNOWN_EVENTS as readonly string[]).includes(name);
}
