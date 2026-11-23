import { describe, it, expect } from 'vitest';
import { Rng } from '../src/core/rng';
import { createSim } from '../src/core/sim';
describe('rng', () => {
  it('same seed same sequence', () => {
    const a = new Rng(123), b = new Rng(123);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });
  it('streams diverge', () => {
    const s = createSim({ seed: 7, mode: 'endless' });
    const v = [s.spawnRng.next(), s.aiRng.next(), s.dropRng.next()];
    expect(new Set(v).size).toBe(3);
  });
  it('int inclusive and values in [0,1)', () => {
    const r = new Rng(5); const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) { seen.add(r.int(1, 3)); }
    expect([...seen].sort()).toEqual([1, 2, 3]);
    const q = new Rng(9);
    for (let i = 0; i < 3000; i++) { const v = q.next(); expect(v >= 0 && v < 1).toBe(true); }
  });
});
