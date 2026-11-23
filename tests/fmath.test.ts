import { describe, it, expect } from 'vitest';
import { fsin, fcos } from '../src/core/fmath';
describe('fmath', () => {
  it('matches Math.sin/cos within 1e-6', () => {
    for (let i = 0; i < 10000; i++) {
      const x = -50 + 100 * i / 9999;
      expect(Math.abs(fsin(x) - Math.sin(x))).toBeLessThan(1e-6);
      expect(Math.abs(fcos(x) - Math.cos(x))).toBeLessThan(1e-6);
    }
  });
});
