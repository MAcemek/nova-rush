import { describe, it, expect } from 'vitest';
import { createSim, step } from '../src/core/sim';
import { spawnEntity } from '../src/core/spawn';
import { Kind, PowerType } from '../src/core/types';
import type { InputFrame, Sim } from '../src/core/types';
import { SHIP } from '../src/core/tuning';
import { ReplayRecorder, decodeReplay, FLAG_JUMP, packFlags } from '../src/core/replay';
import { dailyBonus, ensureMissions } from '../src/meta/missions';
import { ProfileSchema, defaultProfile } from '../src/meta/profile';

const neutral: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0, jump: false };
const jumping: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0, jump: true };

function quietSim(seed: number): Sim {
  const sim = createSim({ seed, mode: 'endless' });
  sim.director.cooldown = 1e9;
  sim.director.giftTimer = 1e9;
  return sim;
}

function pickup(sim: Sim, type: PowerType): void {
  const e = spawnEntity(sim, Kind.PowerUp, 0, -1, 0, 0);
  if (!e) throw new Error('spawn failed');
  e.a = type;
}

describe('repair pickups', () => {
  it('Repair heals one hull and never exceeds the max', () => {
    const sim = quietSim(1);
    sim.ship.hull = 1;
    pickup(sim, PowerType.Repair);
    for (let i = 0; i < 6; i++) step(sim, neutral);
    expect(sim.ship.hull).toBe(2);
    pickup(sim, PowerType.Repair); pickup(sim, PowerType.Repair);
    for (let i = 0; i < 6; i++) step(sim, neutral);
    expect(sim.ship.hull).toBe(SHIP.hull);
  });

  it('Overhaul restores full hull and a shield', () => {
    const sim = quietSim(2);
    sim.ship.hull = 1;
    pickup(sim, PowerType.Overhaul);
    for (let i = 0; i < 6; i++) step(sim, neutral);
    expect(sim.ship.hull).toBe(SHIP.hull);
    expect(sim.ship.shield).toBe(1);
  });
});

describe('jump', () => {
  function asteroidRun(withPower: boolean, input: InputFrame): Sim {
    const sim = quietSim(3);
    if (withPower) sim.powerTicks[PowerType.Jump] = 600;
    const a = spawnEntity(sim, Kind.AsteroidM, 0, -6, 0, 0);
    if (!a) throw new Error('spawn failed');
    step(sim, input);
    for (let i = 0; i < 25; i++) step(sim, neutral);
    return sim;
  }

  it('lets the ship pass over an asteroid without damage', () => {
    const sim = asteroidRun(true, jumping);
    expect(sim.ship.hull).toBe(SHIP.hull);
  });

  it('does nothing without the power-up (asteroid hits)', () => {
    const sim = asteroidRun(false, jumping);
    expect(sim.ship.jumpTicks).toBe(0);
    expect(sim.ship.hull).toBe(SHIP.hull - 1);
  });

  it('has a cooldown between jumps', () => {
    const sim = quietSim(4);
    sim.powerTicks[PowerType.Jump] = 600;
    step(sim, jumping);
    expect(sim.ship.jumpTicks).toBeGreaterThan(0);
    for (let i = 0; i < SHIP.jumpTicks + 2; i++) step(sim, neutral);
    expect(sim.ship.jumpTicks).toBe(0);
    step(sim, jumping);
    expect(sim.ship.jumpTicks).toBe(0);   // still cooling down
  });

  it('does not collect near-miss points while airborne', () => {
    const sim = asteroidRun(true, jumping);
    expect(sim.stats.nearMisses).toBe(0);
  });
});

describe('battering ram', () => {
  it('smashes an asteroid instead of taking damage', () => {
    const sim = quietSim(5);
    sim.powerTicks[PowerType.Ram] = 600;
    spawnEntity(sim, Kind.AsteroidM, 0, -6, 0, 0);
    for (let i = 0; i < 25; i++) step(sim, neutral);
    expect(sim.ship.hull).toBe(SHIP.hull);
    expect(sim.stats.kills[Kind.AsteroidM]).toBe(1);
  });

  it('does not protect against barriers', () => {
    const sim = quietSim(6);
    sim.powerTicks[PowerType.Ram] = 600;
    spawnEntity(sim, Kind.Barrier, 0, -6, 0, 0);
    for (let i = 0; i < 25; i++) step(sim, neutral);
    expect(sim.ship.hull).toBe(SHIP.hull - 1);
  });
});

describe('replay jump flag', () => {
  it('round-trips through encode and decode', () => {
    const rec = new ReplayRecorder(64);
    for (let t = 0; t < 10; t++) rec.push({ steer: 0, fire: true, nuke: false, roll: 0, jump: t === 4 });
    expect(packFlags({ steer: 0, fire: false, nuke: false, roll: 0, jump: true })).toBe(FLAG_JUMP);
    const stream = decodeReplay(rec.encode());
    const out: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
    expect(stream.frameAt(3, out).jump).toBe(false);
    expect(stream.frameAt(4, out).jump).toBe(true);
    expect(stream.frameAt(5, out).jump).toBe(false);
  });
});

describe('daily rewards and missions', () => {
  it('daily bonus scales with streak and caps at 10', () => {
    expect(dailyBonus(1)).toBe(125);
    expect(dailyBonus(10)).toBe(350);
    expect(dailyBonus(40)).toBe(350);
  });

  it('completed missions are replaced immediately, not the next day', () => {
    const p = defaultProfile();
    ensureMissions(p, '2026-03-10');
    p.missions[0]!.done = true; p.missions[0]!.doneDay = '2026-03-10';
    const doneId = p.missions[0]!.id;
    ensureMissions(p, '2026-03-10');
    expect(p.missions.length).toBe(3);
    expect(p.missions.some((m) => m.done)).toBe(false);
    expect(p.missions.some((m) => m.id === doneId)).toBe(false);
  });
});

describe('nuke key setting', () => {
  it('defaults to KeyN and rejects junk values', () => {
    expect(defaultProfile().settings.nukeKey).toBe('KeyN');
    const bad = ProfileSchema.safeParse({ v: 1, settings: { nukeKey: 'not a key!' } });
    expect(bad.success).toBe(false);
    const ok = ProfileSchema.safeParse({ v: 1, settings: { nukeKey: 'KeyX' } });
    expect(ok.success).toBe(true);
  });
});
