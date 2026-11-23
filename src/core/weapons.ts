import { EvType, Kind, KillCause, PowerType } from './types';
import type { Sim, InputFrame, Entity, Bolt } from './types';
import { KIND_BOSS, KIND_INVULN, LASER, NUKE, POWER, isPickup } from './tuning';
import { DT } from './tuning';
import { COS35, SPREAD_DX, SPREAD_DZ } from './fmath';
import { sweptHit } from './collide';
import { emit, spawnBolt } from './spawn';
import { damageEntity, killEntity, processChains } from './score';


export function updateWeapons(sim: Sim, input: InputFrame): void {
  const s = sim.ship;
  if (sim.overheatTicks > 0) {
    sim.overheatTicks--;
    if (sim.overheatTicks === 0) emit(sim, EvType.Cooled, Kind.AsteroidS, s.x, 0, 0, 0);
  }
  const h = sim.heat - LASER.coolPerTick;
  sim.heat = h > 0 ? h : 0;
  if (sim.fireCooldown > 0) sim.fireCooldown--;
  if (!s.dead && input.fire && sim.powerTicks[PowerType.Pierce]! === 0 && sim.overheatTicks === 0 && sim.fireCooldown === 0) {
    sim.wing = -sim.wing;
    const ox = s.x + sim.wing * LASER.wingX, oz = LASER.spawnZ;
    let count = 1;
    if (sim.powerTicks[PowerType.Spread]! > 0) {
      count = SPREAD_DX.length;
      for (let i = 0; i < count; i++) spawnBolt(sim, ox, oz, SPREAD_DX[i]! * LASER.speed, SPREAD_DZ[i]! * LASER.speed);
    } else {
      spawnBolt(sim, ox, oz, 0, -LASER.speed);
    }
    emit(sim, EvType.Fire, Kind.AsteroidS, ox, oz, sim.wing, count);
    const rapid = sim.powerTicks[PowerType.Rapid]! > 0;
    sim.fireCooldown = rapid ? LASER.rapidShotTicks : LASER.shotTicks;
    if (!rapid) {
      sim.heat += LASER.heatPerShot;
      if (sim.heat >= LASER.heatMax) {
        sim.heat = LASER.heatMax; sim.overheatTicks = LASER.overheatTicks;
        emit(sim, EvType.Overheat, Kind.AsteroidS, s.x, 0, 0, 0);
      }
    }
  }
  if (sim.nukeFlight > 0) { sim.nukeFlight--; if (sim.nukeFlight === 0) sim.nukeDue = true; }
  if (!s.dead && input.nuke && sim.nukes > 0 && sim.nukeFlight === 0 && !sim.nukeDue) {
    sim.nukes--; sim.nukeFlight = NUKE.flightTicks; sim.nukeLaunchX = s.x; sim.stats.nukesUsed++;
    emit(sim, EvType.NukeLaunch, Kind.AsteroidS, s.x, 0, sim.nukes, 0);
  }
}

export function moveProjectiles(sim: Sim): void {
  const bolts = sim.bolts.items;
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i]!;
    if (!b.alive) continue;
    b.x += b.vx * DT; b.z += b.vz * DT;
  }
  const bullets = sim.bullets.items;
  const ws = sim.worldSpeed;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i]!;
    if (!b.alive) continue;
    b.x += b.vx * DT; b.z += (b.vz + ws) * DT;
  }
}

export function wardenVulnerable(sim: Sim, e: Entity, b: Bolt): boolean {
  return sim.powerTicks[PowerType.Pierce]! > 0 || (b.vx / LASER.speed) * e.c + (b.vz / LASER.speed) * e.d > COS35;
}

export function resolveBolts(sim: Sim): void {
  const bolts = sim.bolts.items;
  const items = sim.entities.items;
  for (let bi = 0; bi < bolts.length; bi++) {
    const b = bolts[bi]!;
    if (!b.alive) continue;
    for (let i = 0; i < items.length; i++) {
      const e = items[i]!;
      if (!e.alive || isPickup(e.kind)) continue;
      if (!sweptHit(b.px - e.px, b.pz - e.pz, b.x - e.x, b.z - e.z, b.r + e.r)) continue;
      sim.bolts.kill(b);
      if (e.kind === Kind.Warden && !wardenVulnerable(sim, e, b)) { /* shield ping */ }
      else damageEntity(sim, e, b.dmg, KillCause.Bolt, false);
      break;
    }
  }
  if (sim.powerTicks[PowerType.Pierce]! > 0) {
    if (sim.beamTimer > 0) sim.beamTimer--;
    if (sim.beamTimer === 0) {
      sim.beamTimer = POWER.pierceInterval;
      let n = 0;
      const sx = sim.ship.x;
      for (let i = 0; i < items.length; i++) {
        const e = items[i]!;
        if (!e.alive || isPickup(e.kind) || e.invulnerable) continue;
        if (Math.abs(e.x - sx) < POWER.pierceHalfWidth + e.r && e.z < 0) {
          damageEntity(sim, e, POWER.pierceDamage, KillCause.Beam, false);
          n++;
        }
      }
      emit(sim, EvType.Beam, Kind.AsteroidS, sx, 0, n, 0);
    }
  } else sim.beamTimer = 0;
  processChains(sim);
}

export function detonateNuke(sim: Sim): void {
  if (!sim.nukeDue) return;
  sim.nukeDue = false;
  const cx = sim.ship.x, cz = NUKE.offsetZ, R2 = NUKE.radius * NUKE.radius;
  let kills = 0;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive || isPickup(e.kind) || KIND_INVULN[e.kind]!) continue;
    const dx = e.x - cx, dz = e.z - cz;
    if (dx * dx + dz * dz <= R2) {
      if (KIND_BOSS[e.kind]!) {
        if (damageEntity(sim, e, Math.ceil(NUKE.bossFrac * e.maxHp), KillCause.Nuke, true)) kills++;
      } else { killEntity(sim, e, KillCause.Nuke, 0); kills++; }
    }
  }
  processChains(sim);
  const bullets = sim.bullets.items;
  for (let i = 0; i < bullets.length; i++) { const b = bullets[i]!; if (b.alive) sim.bullets.kill(b); }
  emit(sim, EvType.NukeDetonate, Kind.AsteroidS, cx, cz, kills, NUKE.radius);
}
