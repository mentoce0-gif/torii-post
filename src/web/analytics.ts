import { api } from './api.ts';

export interface EventInput {
  name: string;
  sessionId?: string | null;
  placeId?: string | null;
  recommendationRank?: number | null;
  props?: Record<string, unknown>;
}

const queue: EventInput[] = [];
let flushTimer: number | null = null;

/**
 * Events are batched and posted to our own origin. There is no third-party
 * beacon, and the CSP would block one anyway.
 */
export function track(event: EventInput): void {
  queue.push(event);
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 1200);
}

export async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await api.events(batch);
  } catch {
    // Losing a metric must never break the screen the parent is looking at.
  }
}

export function installFlushOnHide(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
}
