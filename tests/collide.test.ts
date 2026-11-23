import { describe, it, expect } from 'vitest';
import { sweptHit, sweptMinDist } from '../src/core/collide';
describe('collide', () => {
  it('fast bolt hits', () => { expect(sweptHit(0, -5, 0, 5, 0.5)).toBe(true); });
  it('miss', () => { expect(sweptHit(2, -5, 2, 5, 0.5)).toBe(false); });
  it('min dist', () => { expect(Math.abs(sweptMinDist(1, -3, 1, 3) - 1)).toBeLessThan(1e-12); });
  it('stationary', () => {
    expect(sweptHit(0.2, 0.2, 0.2, 0.2, 0.5)).toBe(true);
    expect(sweptHit(2, 2, 2, 2, 0.5)).toBe(false);
    expect(Math.abs(sweptMinDist(3, 4, 3, 4) - 5)).toBeLessThan(1e-12);
  });
});
