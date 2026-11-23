import { EvType, Kind, KillCause, PowerType } from './types';
import type { Sim, InputFrame, Entity } from './types';
import { KIND_BOSS, KIND_INVULN, NUKE, POWER, SCORE, SHIP, isPickup } from './tuning';

/** Ground hazards a jumping ship passes over. */
function jumpable(k: Kind): boolean { return k === Kind.AsteroidS || k === Kind.AsteroidM || k === Kind.AsteroidL || k === Kind.Mine || k === Kind.Barrier; }
/** Targets the Battering Ram smashes instead of taking damage from. */
function rammable(k: Kind): boolean { return k === Kind.AsteroidS || k === Kind.AsteroidM || k === Kind.AsteroidL || k === Kind.Mine || k === Kind.Swarmer || k === Kind.Drone; }
import { DT } from './tuning';
import { sweptMinDist } from './collide';
import { emit, shipInvulnerable } from './spawn';
import { addScore, killEntity, processChains } from './score';

export function updateShip(sim: Sim, input: InputFrame): void {
  const s = sim.ship;
  if (s.dead) return;
  if (s.rollTicks > 0) s.rollTicks--;
  if (s.rollCooldown > 0) s.rollCooldown--;
  if (s.invulnTicks > 0) s.invulnTicks--;
  if (s.jumpTicks > 0) s.jumpTicks--;
  if (s.jumpCooldown > 0) s.jumpCooldown--;
  s.steer = input.steer;
  if (input.steer !== 0) {
    const target = input.steer / 127 * SHIP.maxSpeed;
    const step = SHIP.accel * DT;
    const d = target - s.vx;
    if (d > step) s.vx += step; else if (d < -step) s.vx -= step; else s.vx = target;
  } else {
    const step = SHIP.friction * DT;
    if (s.vx > step) s.vx -= step; else if (s.vx < -step) s.vx += step; else s.vx = 0;
  }
  if (input.roll !== 0 && s.rollTicks === 0 && s.rollCooldown === 0) {
    s.rollTicks = SHIP.rollTicks; s.rollDir = input.roll; s.rollCooldown = SHIP.rollCooldown;
    emit(sim, EvType.Roll, Kind.AsteroidS, s.x, 0, s.rollDir, 0);
  }
  if (input.jump === true && sim.powerTicks[PowerType.Jump]! > 0 && s.jumpTicks === 0 && s.jumpCooldown === 0) {
    s.jumpTicks = SHIP.jumpTicks; s.jumpCooldown = SHIP.jumpCooldown;
    emit(sim, EvType.Jump, Kind.AsteroidS, s.x, 0, 0, 0);
  }
  s.x += (s.vx + (s.rollTicks > 0 ? s.rollDir * SHIP.rollSpeed : 0)) * DT;
  if (s.x > 14) { s.x = 14; s.vx = 0; } else if (s.x < -14) { s.x = -14; s.vx = 0; }
}

export function hitShip(sim: Sim): void {
  const s = sim.ship;
  s.invulnTicks = SHIP.hitInvulnTicks;
  sim.stats.hitsTaken++;
  if (sim.boss.active) sim.boss.hitDuringFight = true;
  if (s.shield > 0) {
    s.shield = 0;
    emit(sim, EvType.ShipHit, Kind.AsteroidS, s.x, 0, s.hull, 1);
  } else {
    s.hull--;
    if (sim.mode === 'tutorial' && s.hull < SHIP.tutorialMinHull) s.hull = SHIP.tutorialMinHull;
    emit(sim, EvType.ShipHit, Kind.AsteroidS, s.x, 0, s.hull, 0);
  }
  if (sim.combo >= 2) emit(sim, EvType.ComboLost, Kind.AsteroidS, s.x, 0, sim.combo, 0);
  sim.combo = 0; sim.comboTimer = 0; sim.multiplier = 1;
  if (s.hull <= 0) {
    s.hull = 0; s.dead = true;
    emit(sim, EvType.ShipDeath, Kind.AsteroidS, s.x, 0, 0, 0);
  }
}

/** Restore hull up to the max (optionally refilling the shield); emits a Heal event when anything changed. */
export function healShip(sim: Sim, amount: number, shield: boolean): void {
  const s = sim.ship;
  if (s.dead) return;
  const before = s.hull;
  s.hull = Math.min(SHIP.hull, s.hull + amount);
  if (shield) s.shield = 1;
  emit(sim, EvType.Heal, Kind.AsteroidS, s.x, 0, s.hull, s.hull - before);
}

export function collectPickup(sim: Sim, e: Entity): void {
  sim.entities.kill(e);
  const s = sim.ship;
  if (e.kind === Kind.Crystal) {
    const pts = addScore(sim, SCORE.crystalPoints);
    sim.stats.crystals += e.a;
    emit(sim, EvType.Pickup, Kind.Crystal, e.x, e.z, e.a, pts);
  } else if (e.kind === Kind.PowerUp) {
    const t = e.a;
    if (t === PowerType.Shield) s.shield = 1;
    else if (t === PowerType.Repair) healShip(sim, 1, false);
    else if (t === PowerType.Overhaul) healShip(sim, SHIP.hull, true);
    else sim.powerTicks[t] = POWER.duration;
    const pts = addScore(sim, SCORE.pickupPoints);
    sim.stats.powerUps++;
    emit(sim, EvType.Pickup, Kind.PowerUp, e.x, e.z, t, pts);
  } else if (e.kind === Kind.NukePickup) {
    if (sim.nukes < NUKE.max) sim.nukes++; else sim.nukeMeter = NUKE.meterMax;
    const pts = addScore(sim, SCORE.pickupPoints);
    emit(sim, EvType.Pickup, Kind.NukePickup, e.x, e.z, sim.nukes, pts);
  }
}

export function shipCollisions(sim: Sim): void {
  const s = sim.ship;
  if (s.dead) return;
  let inv = shipInvulnerable(sim) || sim.god;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    const d = sweptMinDist(e.px - s.px, e.pz - s.pz, e.x - s.x, e.z - s.z);
    if (d > e.r + s.r) continue;
    if (isPickup(e.kind)) { collectPickup(sim, e); continue; }
    if (s.jumpTicks > 0 && jumpable(e.kind)) continue;
    if (sim.powerTicks[PowerType.Ram]! > 0 && rammable(e.kind)) { killEntity(sim, e, KillCause.Chain, 0); continue; }
    e.hitShip = true;
    if (inv) continue;
    hitShip(sim); inv = true;
    if (!KIND_BOSS[e.kind]! && !KIND_INVULN[e.kind]!) killEntity(sim, e, KillCause.Ram, -1);
  }
  const bullets = sim.bullets.items;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i]!;
    if (!b.alive) continue;
    const d = sweptMinDist(b.px - s.px, b.pz - s.pz, b.x - s.x, b.z - s.z);
    if (s.rollTicks > 0 && !b.dodged && d <= SHIP.perfectDodgeDist) {
      b.dodged = true;
      const pts = addScore(sim, SHIP.perfectDodgePoints);
      sim.stats.perfectDodges++;
      emit(sim, EvType.PerfectDodge, Kind.AsteroidS, b.x, b.z, pts, 0);
      continue;
    }
    if (d > b.r + s.r || inv) continue;
    sim.bullets.kill(b); hitShip(sim); inv = true;
  }
  processChains(sim);
}
