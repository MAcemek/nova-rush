import type { Sim, InputFrame, Entity } from './types';
import { Kind } from './types';
import { Rng } from './rng';
import { clamp, fsin } from './fmath';
import { BOT, DRONE, KIND_BOSS, KIND_HAZARD, KIND_INVULN, isPickup } from './tuning';

export class BotState { heatLatch = false; lastNukeTick = -100000; noise: Rng | null = null; noiseAmount = 0 }
export function createBot(noiseSeed?: number, noiseAmount = 0): BotState {
  const b = new BotState();
  b.noise = noiseSeed === undefined ? null : new Rng(noiseSeed);
  b.noiseAmount = noiseAmount;
  return b;
}

const cost = new Float64Array(BOT.laneCount);
function lx(i: number): number { return -14 + i * 0.5; }

/** Adds `weight` to every lane with |lx - cx| < clr. */
function addDanger(cx: number, clr: number, weight: number): void {
  let lo = Math.ceil((cx - clr + 14) / 0.5 - 1e-9), hi = Math.floor((cx + clr + 14) / 0.5 + 1e-9);
  if (lo < 0) lo = 0;
  if (hi > BOT.laneCount - 1) hi = BOT.laneCount - 1;
  for (let i = lo; i <= hi; i++) { if (Math.abs(lx(i) - cx) < clr) cost[i] = cost[i]! + weight; }
}

export function botDecide(sim: Sim, bot: BotState, out: InputFrame): InputFrame {
  const ship = sim.ship;
  const ws = sim.worldSpeed;
  const N = BOT.laneCount;
  for (let i = 0; i < N; i++) cost[i] = Math.abs(lx(i) - ship.x) * 2;
  let threats = 0;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive || !KIND_HAZARD[e.kind]!) continue;
    if (e.z - e.r > ship.r) continue;
    const vzAbs = KIND_BOSS[e.kind]! ? 0 : ws + e.vz;
    const t = e.z + e.r >= -ship.r ? 0 : (-(e.z + e.r + ship.r)) / (vzAbs > 1 ? vzAbs : 1);
    if (e.z >= -40 && e.z <= 0 && Math.abs(e.x - ship.x) < 6 && !KIND_BOSS[e.kind]!) threats++;
    if (t * 60 > BOT.lookaheadTicks) continue;
    const px = e.kind === Kind.Drone ? e.a + DRONE.amp * fsin((e.age + t * 60) * DRONE.freq) : e.x + e.vx * t;
    addDanger(px, e.r + ship.r + BOT.dangerMargin, 1000 * (1 - 0.5 * t * 60 / BOT.lookaheadTicks));
  }
  const bullets = sim.bullets.items;
  let rollNeeded = false;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i]!;
    if (!b.alive) continue;
    if (b.z - b.r > ship.r) continue;
    const vzAbs = ws + b.vz;
    const t = b.z + b.r >= -ship.r ? 0 : (-(b.z + b.r + ship.r)) / (vzAbs > 1 ? vzAbs : 1);
    if (t * 60 > BOT.lookaheadTicks) continue;
    const px = b.x + b.vx * t;
    addDanger(px, b.r + ship.r + BOT.dangerMargin, 1000 * (1 - 0.5 * t * 60 / BOT.lookaheadTicks));
    if (t * 60 <= BOT.rollBulletTicks && Math.abs(px - ship.x) < 1.6) rollNeeded = true;
  }
  // rewards
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    if (isPickup(e.kind)) {
      if (e.z < 0) {
        const sp = ws + e.vz;
        const t = -e.z / (sp > 1 ? sp : 1);
        addDanger(e.x + e.vx * t, 1.5, -60);
      }
      continue;
    }
    if (!KIND_HAZARD[e.kind]! || KIND_BOSS[e.kind]! || KIND_INVULN[e.kind]!) continue;
    if (e.z > -120 && e.z < -10) addDanger(e.x, e.r, -30);
  }
  if (sim.boss.active) {
    let tgt: Entity | null = null;
    if (sim.boss.id === 2) {
      for (let i = 0; i < items.length; i++) { const e = items[i]!; if (e.alive && e.kind === Kind.BossSerpent && e.a === sim.boss.headIndex) { tgt = e; break; } }
    } else if (sim.boss.mainSlot >= 0) {
      const e = items[sim.boss.mainSlot]!;
      if (e.alive) tgt = e;
    }
    if (tgt !== null && tgt.z > -120 && tgt.z < -10) addDanger(tgt.x, tgt.r, -30);
  }
  let best = 0;
  for (let i = 1; i < N; i++) if (cost[i]! < cost[best]!) best = i;
  const target = lx(best);
  out.steer = clamp(Math.round((target - (ship.x + ship.vx * 0.12)) * 127 / 3), -127, 127);
  if (sim.heat >= BOT.heatStopFire) bot.heatLatch = true; else if (sim.heat <= BOT.heatResume) bot.heatLatch = false;
  out.fire = !bot.heatLatch;
  out.roll = 0;
  if (ship.rollCooldown === 0 && rollNeeded) out.roll = target >= ship.x ? 1 : -1;
  out.nuke = false;
  if (sim.nukes > 0 && sim.nukeFlight === 0 && sim.tick - bot.lastNukeTick > 120 && (threats >= BOT.nukeThreat || cost[best]! >= 1000)) {
    out.nuke = true; bot.lastNukeTick = sim.tick;
  }
  const nz = bot.noise;
  if (nz !== null && nz.chance(bot.noiseAmount)) {
    out.steer = nz.int(-127, 127);
    if (nz.chance(0.05)) out.nuke = true;
    if (nz.chance(0.05)) out.roll = nz.chance(0.5) ? -1 : 1;
  }
  return out;
}
