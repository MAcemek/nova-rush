export class RateLimiter {
  private readonly capacity: number;
  private readonly refill: number;
  private readonly now: () => number;
  private readonly map = new Map<string, { tokens: number; last: number }>();
  constructor(capacity = 10, refillPerSec = 10 / 60, now: () => number = Date.now) { this.capacity = capacity; this.refill = refillPerSec; this.now = now; }
  take(key: string): boolean {
    const t = this.now();
    let b = this.map.get(key);
    if (!b) { b = { tokens: this.capacity, last: t }; this.map.set(key, b); }
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.last) / 1000 * this.refill);
    b.last = t;
    let ok = false;
    if (b.tokens >= 1) { b.tokens -= 1; ok = true; }
    if (this.map.size > 10000) { for (const [k, v] of this.map) if (v.tokens >= this.capacity) this.map.delete(k); }
    return ok;
  }
}
