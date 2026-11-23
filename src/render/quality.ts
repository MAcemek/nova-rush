import type { Quality } from '../gameApi';

const RING = 120;
const NEXT: Record<Quality, Quality | null> = { high: 'medium', medium: 'low', low: null };

export class QualityMonitor {
  private readonly ring = new Float32Array(RING);
  private readonly scratch = new Float32Array(RING);
  private n = 0;
  private sinceCheck = 0;
  private badFor = 0;
  private readonly onDrop: (q: Quality) => void;

  constructor(onDrop: (q: Quality) => void) { this.onDrop = onDrop; }

  reset(): void { this.n = 0; this.sinceCheck = 0; this.badFor = 0; }

  push(workMs: number, dtSec: number, current: Quality): void {
    this.ring[this.n % RING] = workMs; this.n++;
    this.sinceCheck += dtSec;
    if (this.sinceCheck < 0.5) return;
    this.sinceCheck -= 0.5;
    const len = this.n < RING ? this.n : RING;
    if (len < 30) return;
    const s = this.scratch;
    for (let i = 0; i < len; i++) s[i] = this.ring[i]!;
    const view = s.subarray(0, len);
    view.sort();
    const p95 = view[Math.min(len - 1, Math.floor(len * 0.95))]!;
    if (p95 > 20) this.badFor += 0.5; else this.badFor = 0;
    if (this.badFor >= 3) {
      this.badFor = 0;
      const next = NEXT[current];
      if (next !== null) { this.n = 0; this.onDrop(next); }
    }
  }
}
