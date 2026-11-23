import { describe, it, expect } from 'vitest';
import { createSim, step } from '../src/core/sim';
import { addScore, bumpCombo } from '../src/core/score';
import { spawnEntity } from '../src/core/spawn';
import { EvType, Kind, PowerType } from '../src/core/types';
import type { InputFrame, Sim, SimEvent } from '../src/core/types';

const neutral: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
const firing: InputFrame = { steer: 0, fire: true, nuke: false, roll: 0 };

function quietSim(seed: number, god = false): Sim {
  const sim = createSim({ seed, mode: 'endless', god });
  sim.director.cooldown = 1e9;
  sim.director.giftTimer = 1e9;
  return sim;
}

describe('score', () => {
  it('multiplier steps and cap', () => {
    const sim = quietSim(1);
    for (let i = 0; i < 4; i++) bumpCombo(sim);
    expect(sim.multiplier).toBe(1);
    bumpCombo(sim);
    expect(sim.multiplier).toBe(2);
    for (let i = 5; i < 39; i++) bumpCombo(sim);
    expect(sim.combo).toBe(39);
    expect(sim.multiplier).toBe(8);
    for (let i = 0; i < 21; i++) bumpCombo(sim);
    expect(sim.multiplier).toBe(8);
  });

  it('near miss counted once with exact points', () => {
    const sim = quietSim(2);
    spawnEntity(sim, Kind.AsteroidS, sim.ship.x + 1.2 + 1.1 + 0.5, -30, 0, 0);
    for (let i = 0; i < 120; i++) step(sim, neutral);
    expect(sim.stats.nearMisses).toBe(1);
    expect(sim.score - sim.distancePoints).toBe(75);
    expect(sim.combo).toBe(1);
    for (let i = 0; i < 60; i++) step(sim, neutral);
    expect(sim.stats.nearMisses).toBe(1);
  });

  it('no near miss when the gap is wide', () => {
    const sim = quietSim(3);
    spawnEntity(sim, Kind.AsteroidS, sim.ship.x + 1.5 + 1.2 + 1.1, -30, 0, 0);
    for (let i = 0; i < 120; i++) step(sim, neutral);
    expect(sim.stats.nearMisses).toBe(0);
  });

  it('x2 rounding', () => {
    const sim = quietSim(4);
    sim.powerTicks[PowerType.X2] = 10; sim.multiplier = 3;
    expect(addScore(sim, 25)).toBe(150);
    sim.multiplier = 1;
    expect(addScore(sim, 75)).toBe(150);
    sim.powerTicks[PowerType.X2] = 0; sim.multiplier = 3;
    expect(addScore(sim, 25)).toBe(75);
  });

  it('combo timeout emits ComboLost', () => {
    const sim = quietSim(5);
    for (let i = 0; i < 3; i++) bumpCombo(sim);
    let lost = false;
    for (let i = 0; i < 120; i++) {
      const ev = step(sim, neutral);
      for (let j = 0; j < ev.length; j++) if (ev[j]!.type === EvType.ComboLost) lost = true;
    }
    expect(sim.combo).toBe(0);
    expect(sim.multiplier).toBe(1);
    expect(lost).toBe(true);
  });

  it('asteroid M kill scores and splits into two S', () => {
    const sim = quietSim(6, true);
    spawnEntity(sim, Kind.AsteroidM, 0, -40, 0, 0);
    for (let i = 0; i < 60; i++) step(sim, firing);
    let aliveS = 0;
    for (const e of sim.entities.items) if (e.alive && e.kind === Kind.AsteroidS) aliveS++;
    expect(sim.stats.kills[Kind.AsteroidM]).toBe(1);
    expect(sim.stats.kills[Kind.AsteroidS]! + aliveS).toBe(2);
  });

  it('mine chain of 5', () => {
    const sim = quietSim(7, true);
    for (const x of [-8, -4, 0, 4, 8]) spawnEntity(sim, Kind.Mine, x, -40, 0, 0);
    const chain: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const ev = step(sim, firing);
      for (let j = 0; j < ev.length; j++) if (ev[j]!.type === EvType.Chain) chain.push({ ...ev[j]! });
    }
    expect(sim.stats.maxChain).toBe(5);
    expect(chain.length).toBe(1);
    expect(chain[0]!.a).toBe(5);
  });
});
