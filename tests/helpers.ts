import { Rng } from '../src/core/rng';
import { createSim, step } from '../src/core/sim';
import { createBot, botDecide } from '../src/core/bot';
import type { InputFrame, Sim, SimOptions } from '../src/core/types';

export function scriptedInput(rng: Rng, tick: number, out: InputFrame): InputFrame {
  if (tick % 20 === 0) out.steer = rng.int(-127, 127);
  out.fire = rng.chance(0.85);
  out.nuke = rng.chance(0.004);
  out.roll = rng.chance(0.01) ? (rng.chance(0.5) ? -1 : 1) : 0;
  return out;
}

export function runSim(seed: number, ticks: number, policy: 'scripted' | 'bot', opts?: Partial<SimOptions>, onTick?: (sim: Sim, t: number) => void): Sim {
  const sim = createSim({ seed, mode: 'endless', ...opts });
  const rng = new Rng((seed ^ 0x1234567) >>> 0);
  const bot = createBot();
  const frame: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
  for (let t = 0; t < ticks && !sim.over; t++) {
    if (policy === 'bot') botDecide(sim, bot, frame); else scriptedInput(rng, t, frame);
    step(sim, frame);
    if (onTick) onTick(sim, t);
  }
  return sim;
}

import { ReplayRecorder } from '../src/core/replay';
import { buildPayload } from '../src/api/schema';
import type { RunPayload } from '../src/api/schema';
import { dailySeed } from '../src/core/daily';

export function makeRun(seed: number, opts?: { mode?: 'endless' | 'daily'; quitAt?: number; maxTicks?: number; day?: string }): { sim: Sim; payload: RunPayload; bytes: Uint8Array } {
  const mode = opts?.mode ?? 'endless', quitAt = opts?.quitAt ?? 1800, maxTicks = opts?.maxTicks ?? 40000;
  const sim = createSim({ seed, mode });
  const rec = new ReplayRecorder();
  const bot = createBot();
  const frame: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
  let t = 0;
  for (; t < maxTicks && !sim.over; t++) {
    if (t < quitAt) botDecide(sim, bot, frame); else { frame.steer = 0; frame.fire = true; frame.nuke = false; frame.roll = 0; }
    rec.push(frame);
    step(sim, frame);
  }
  if (!sim.over) throw new Error('makeRun: not over by maxTicks');
  const payload = buildPayload(sim, rec, mode, mode === 'daily' ? (opts?.day ?? null) : null, 'TESTER');
  return { sim, payload, bytes: rec.encode() };
}

export function makeUnfinished(seed: number, ticks: number): RunPayload {
  const sim = createSim({ seed, mode: 'endless', god: true });
  const rec = new ReplayRecorder();
  const bot = createBot();
  const frame: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
  for (let t = 0; t < ticks && !sim.over; t++) { botDecide(sim, bot, frame); rec.push(frame); step(sim, frame); }
  return buildPayload(sim, rec, 'endless', null, 'TESTER');
}

export { dailySeed };
