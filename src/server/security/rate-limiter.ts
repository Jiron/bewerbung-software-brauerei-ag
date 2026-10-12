export interface RateLimitWindow {
  max: number;
  windowMs: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counters, several windows per key (e.g. per minute and per day).
 * In memory on purpose: one container, no Redis needed. A restart forgives
 * everybody, which is acceptable because the daily spend cap still holds.
 */
export class RateLimiter {
  readonly #windows: RateLimitWindow[];
  readonly #now: () => number;
  readonly #counters = new Map<string, Counter[]>();
  readonly #maxKeys: number;

  constructor(windows: RateLimitWindow[], options: { now?: () => number; maxKeys?: number } = {}) {
    this.#windows = windows;
    this.#now = options.now ?? Date.now;
    this.#maxKeys = options.maxKeys ?? 50_000;
  }

  /** Whether `key` may act now, without counting an action. */
  check(key: string): RateLimitResult {
    const now = this.#now();
    const counters = this.#countersFor(key, now);
    let retryAfterMs = 0;
    this.#windows.forEach((window, i) => {
      const counter = counters[i];
      if (counter && counter.count >= window.max) {
        retryAfterMs = Math.max(retryAfterMs, counter.resetAt - now);
      }
    });
    return retryAfterMs > 0
      ? { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
      : { allowed: true };
  }

  /** Counts one action for `key`. */
  hit(key: string): void {
    for (const counter of this.#countersFor(key, this.#now())) counter.count++;
  }

  /** check() and, if allowed, hit(). */
  take(key: string): RateLimitResult {
    const result = this.check(key);
    if (result.allowed) this.hit(key);
    return result;
  }

  /** Remaining actions in the tightest window. */
  remaining(key: string): number {
    const counters = this.#countersFor(key, this.#now());
    return Math.min(...this.#windows.map((window, i) => window.max - (counters[i]?.count ?? 0)));
  }

  reset(key: string): void {
    this.#counters.delete(key);
  }

  #countersFor(key: string, now: number): Counter[] {
    let counters = this.#counters.get(key);
    if (!counters) {
      if (this.#counters.size >= this.#maxKeys) this.#prune(now);
      counters = this.#windows.map((window) => ({ count: 0, resetAt: now + window.windowMs }));
      this.#counters.set(key, counters);
    }
    counters.forEach((counter, i) => {
      if (now >= counter.resetAt) {
        counter.count = 0;
        counter.resetAt = now + (this.#windows[i]?.windowMs ?? 0);
      }
    });
    return counters;
  }

  #prune(now: number): void {
    for (const [key, counters] of this.#counters) {
      if (counters.every((counter) => now >= counter.resetAt)) this.#counters.delete(key);
    }
    // Still full (an attack with many addresses): drop the oldest entries.
    for (const key of this.#counters.keys()) {
      if (this.#counters.size < this.#maxKeys) break;
      this.#counters.delete(key);
    }
  }
}
