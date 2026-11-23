import { describe, it, expect } from 'vitest';
import { Rng } from '../src/core/rng';
import { SpawnBuffer, Kind } from '../src/core/types';
import { PATTERNS } from '../src/core/patterns';
import { isPassableRaw } from '../src/core/passability';
import { createSim, step } from '../src/core/sim';
import { createBot, botDecide } from '../src/core/bot';
import type { InputFrame } from '../src/core/types';

describe('passability', () => {
  it('gapless wall rejected, walled with a gap accepted', () => {
    const buf = new SpawnBuffer(160);
    for (let x = -14; x <= 14 + 1e-9; x += 1.6) buf.add(Kind.Barrier, x, 0);
    expect(isPassableRaw(42, null, buf)).toBe(false);
    buf.clear();
    for (let x = -14; x <= 14 + 1e-9; x += 1.6) { if (Math.abs(x) < 4) continue; buf.add(Kind.Barrier, x, 0); }
    expect(isPassableRaw(42, null, buf)).toBe(true);
  });

  it('1000 seeds x every pattern: <= 1% failures', () => {
    const fails = new Array<number>(PATTERNS.length).fill(0);
    const buf = new SpawnBuffer(160);
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new Rng(seed);
      const ws = [42, 80, 115][seed % 3]!;
      const d0 = [0, 1, 2.5, 5][(seed >> 2) % 4]!;
      for (let i = 0; i < PATTERNS.length; i++) {
        const p = PATTERNS[i]!;
        buf.clear();
        p.build(rng, Math.max(d0, p.minD), buf);
        if (!isPassableRaw(ws, null, buf)) fails[i]!++;
      }
    }
    const bad = PATTERNS.map((p, i) => p.id + ':' + fails[i]).filter((_, i) => fails[i]! > 10);
    expect(bad).toEqual([]);
  });

  it('12 seeds x 3 min god bot: committed patterns, low failedAll', () => {
    const f: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
    let committedAll = 0, failedAllSum = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = createSim({ seed, mode: 'endless', god: true });
      const bot = createBot();
      for (let t = 0; t < 10800; t++) { botDecide(sim, bot, f); step(sim, f); }
      expect(sim.director.committed).toBeGreaterThan(0);
      // A run can hit a short window where bolt-split asteroid children plug a live barrier gap and every rebuild is rejected;
      // the per-seed bound is therefore loose and the 5% bound applies to the aggregate.
      expect(sim.director.failedAll / (sim.director.committed + sim.director.failedAll)).toBeLessThan(0.35);
      committedAll += sim.director.committed; failedAllSum += sim.director.failedAll;
    }
    expect(failedAllSum / (committedAll + failedAllSum)).toBeLessThan(0.05);
  });

  it('isPassable is pure on the same buffer', () => {
    const rng = new Rng(9);
    const buf = new SpawnBuffer(160);
    PATTERNS[2]!.build(rng, 3, buf);
    const a = isPassableRaw(80, null, buf), b = isPassableRaw(80, null, buf);
    expect(a).toBe(b);
  });
});
