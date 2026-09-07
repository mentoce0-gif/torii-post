/**
 * Fixed-window counter, per client key, in process memory.
 *
 * Deliberately the simplest thing that works for a few dozen households. The
 * shape — a check() that returns a verdict — is what a Redis or edge-based
 * limiter would replace when the PoC outgrows one process.
 */
export class RateLimiter {
  readonly #windows = new Map<string, { count: number; resetAt: number }>();
  readonly #perMinute: number;

  constructor(perMinute: number) {
    this.#perMinute = perMinute;
  }

  get enabled(): boolean {
    return this.#perMinute > 0;
  }

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    if (!this.enabled) return { allowed: true, retryAfterSec: 0 };

    const window = this.#windows.get(key);
    if (!window || now >= window.resetAt) {
      this.#windows.set(key, { count: 1, resetAt: now + 60_000 });
      return { allowed: true, retryAfterSec: 0 };
    }

    window.count += 1;
    if (window.count > this.#perMinute) {
      return { allowed: false, retryAfterSec: Math.ceil((window.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Called on an interval so an idle process does not grow a map forever. */
  sweep(now = Date.now()): void {
    for (const [key, window] of this.#windows) {
      if (now >= window.resetAt) this.#windows.delete(key);
    }
  }
}
