import { describe, it, expect } from 'vitest';
import { Rng } from '../src/core/rng';
import { createSim, step } from '../src/core/sim';
import { checkInvariants } from '../src/core/invariants';
import { scriptedInput } from './helpers';
import type { InputFrame } from '../src/core/types';
describe('invariants', () => {
  it('40 scripted runs have no violations', () => {
    for (let i = 0; i < 40; i++) {
      const sim = createSim({ seed: 1000 + i, mode: 'endless' });
      const rng = new Rng(i);
      const f: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
      for (let t = 0; t < 10800 && !sim.over; t++) {
        scriptedInput(rng, t, f);
        step(sim, f);
        const v = checkInvariants(sim);
        if (v.length) throw new Error('seed ' + (1000 + i) + ' tick ' + t + ': ' + v.join('; '));
      }
      expect(sim.dropped).toBe(0);
    }
  });
});
