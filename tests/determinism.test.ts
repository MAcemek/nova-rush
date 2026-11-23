import { describe, it, expect } from 'vitest';
import { runSim } from './helpers';
import { stateHash } from '../src/core/sim';
function hashes(seed: number): number[] {
  const out: number[] = [];
  runSim(seed, 20000, 'bot', { god: true }, (sim, t) => { if (t % 500 === 499) out.push(stateHash(sim)); });
  return out;
}
describe('determinism', () => {
  it('same seed same hashes, different seed differs', () => {
    const a = hashes(42), b = hashes(42), c = hashes(43);
    expect(a.length).toBeGreaterThan(30);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
