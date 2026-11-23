import { SIM_VERSION } from '../src/core/tuning';
import { createSim, step, stateHash } from '../src/core/sim';
import { decodeReplay } from '../src/core/replay';
import type { InputStream } from '../src/core/replay';
import { dailySeed } from '../src/core/daily';
import { base64ToBytes } from '../src/api/base64';
import { utcDay } from '../src/api/schema';
import type { RunPayload } from '../src/api/schema';
import type { InputFrame } from '../src/core/types';

export interface VerifyResult { score: number; distance: number; ticks: number; stateHash: number; maxCombo: number }
export type VerifyOutcome = { ok: true; result: VerifyResult } | { ok: false; reason: string };

export function verifyRun(p: RunPayload, nowMs: number = Date.now()): VerifyOutcome {
  const fail = (reason: string): VerifyOutcome => ({ ok: false, reason });
  if (p.version !== SIM_VERSION) return fail('bad_version');
  const ticks = p.claimed.ticks;
  if (ticks < 1) return fail('bad_ticks');
  if (ticks > 108000) return fail('too_long');
  if (p.mode === 'daily') {
    if (!p.day || (p.day !== utcDay(nowMs) && p.day !== utcDay(nowMs - 86400000)) || p.seed !== dailySeed(p.day)) return fail('bad_daily_seed');
  }
  let stream: InputStream;
  try {
    stream = decodeReplay(base64ToBytes(p.replay));
  } catch { return fail('bad_replay'); }
  if (stream.count > 0 && stream.ticks[stream.count - 1]! >= ticks) return fail('bad_replay');
  const sim = createSim({ seed: p.seed, mode: p.mode });
  const start = Date.now();
  const frame: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
  for (let t = 0; t < ticks; t++) {
    if (sim.over) return fail('early_end');
    stream.frameAt(t, frame);
    step(sim, frame);
    if (t % 5000 === 4999 && Date.now() - start > 10000) return fail('timeout');
  }
  if (!sim.over) return fail('not_over');
  if (sim.score !== p.claimed.score) return fail('score_mismatch');
  if (Math.floor(sim.distance) !== p.claimed.distance) return fail('distance_mismatch');
  if (stateHash(sim) !== p.claimed.stateHash) return fail('hash_mismatch');
  return { ok: true, result: { score: sim.score, distance: Math.floor(sim.distance), ticks, stateHash: p.claimed.stateHash, maxCombo: sim.stats.maxCombo } };
}
