import { describe, it, expect } from 'vitest';
import { createSim, step, stateHash } from '../src/core/sim';
import { Hasher } from '../src/core/hash';
import type { InputFrame } from '../src/core/types';
const f: InputFrame = { steer: 40, fire: true, nuke: false, roll: 0 };
describe('hash', () => {
  it('equal states equal hashes, flipped bit differs', () => {
    const a = createSim({ seed: 3, mode: 'endless' }), b = createSim({ seed: 3, mode: 'endless' });
    for (let i = 0; i < 300; i++) { step(a, f); step(b, f); }
    expect(stateHash(a)).toBe(stateHash(b));
    const buf = new Float64Array([b.ship.x]); const w = new Uint32Array(buf.buffer);
    w[0] = (w[0]! ^ 1) >>> 0; b.ship.x = buf[0]!;
    expect(stateHash(a)).not.toBe(stateHash(b));
  });
  it('Hasher f64 single mantissa bit', () => {
    const buf = new Float64Array([0.1]); const w = new Uint32Array(buf.buffer);
    const h1 = new Hasher(); h1.f64(buf[0]!);
    w[0] = (w[0]! ^ 1) >>> 0;
    const h2 = new Hasher(); h2.f64(buf[0]!);
    expect(h1.h).not.toBe(h2.h);
  });
});
