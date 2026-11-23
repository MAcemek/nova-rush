import { EvType, Kind, KillCause, PowerType, TIMED_POWER_COUNT } from './types';
import type { Sim, Entity } from './types';
import { DROPS, KIND_ALIEN, KIND_BOSS, KIND_HAZARD, KIND_INVULN, KIND_POINTS, MINE, NUKE, SCORE, isPickup } from './tuning';
import { sweptMinDist } from './collide';
import { emit, spawnEntity } from './spawn';
import { bossDamageMul } from './bosses';
import { HIT_FLASH_TICKS } from './tuning';

export function addScore(sim: Sim, base: number): number {
  const pts = Math.round(base * sim.multiplier * (sim.powerTicks[PowerType.X2]! > 0 ? 2 : 1));
  sim.score += pts;
  return pts;
}

export function bumpCombo(sim: Sim): void {
  sim.combo = sim.comboTimer > 0 ? sim.combo + 1 : 1;
  sim.comboTimer = SCORE.comboWindow;
  const m = 1 + Math.floor(sim.combo / SCORE.comboPerStep);
  sim.multiplier = m < SCORE.multMax ? m : SCORE.multMax;
  if (sim.combo > sim.stats.maxCombo) sim.stats.maxCombo = sim.combo;
  if (sim.multiplier > sim.stats.maxMultiplier) sim.stats.maxMultiplier = sim.multiplier;
  emit(sim, EvType.ComboUp, Kind.AsteroidS, sim.ship.x, 0, sim.combo, sim.multiplier);
}

export function registerKill(sim: Sim): void {
  bumpCombo(sim);
  if (sim.nukes < NUKE.max) {
    sim.nukeMeter += NUKE.meterPerKill;
    if (sim.nukeMeter >= NUKE.meterMax) {
      sim.nukes++; sim.nukeMeter -= NUKE.meterMax;
      emit(sim, EvType.NukeGained, Kind.AsteroidS, sim.ship.x, 0, sim.nukes, 0);
    }
  } else {
    const m = sim.nukeMeter + NUKE.meterPerKill;
    sim.nukeMeter = m < NUKE.meterMax ? m : NUKE.meterMax;
  }
}

export function damageEntity(sim: Sim, e: Entity, dmg: number, cause: KillCause, raw: boolean): boolean {
  if (!e.alive) return false;
  if (!raw) {
    if (e.invulnerable) return false;
    dmg *= bossDamageMul(sim, e);
  }
  if (dmg <= 0) return false;
  e.hp -= dmg;
  if (e.hp <= 0) { e.hp = 0; killEntity(sim, e, cause, 0); return true; }
  e.flashTicks = HIT_FLASH_TICKS;
  emit(sim, EvType.Damage, e.kind, e.x, e.z, e.id, 0);
  return false;
}

export function killEntity(sim: Sim, e: Entity, cause: KillCause, depth: number): void {
  if (!e.alive) return;
  sim.entities.kill(e);
  const k = e.kind;
  let pts = 0;
  if (cause !== KillCause.Ram) {
    registerKill(sim);
    sim.stats.kills[k] = sim.stats.kills[k]! + 1;
    if (k !== Kind.Mine) pts = addScore(sim, KIND_POINTS[k]!);
    if (KIND_ALIEN[k]!) {
      if (sim.dropRng.chance(DROPS.alienCrystal)) dropCrystal(sim, e);
    } else if (k === Kind.AsteroidM || k === Kind.AsteroidL) {
      if (sim.dropRng.chance(DROPS.asteroidCrystal)) dropCrystal(sim, e);
    }
  }
  if (k === Kind.Swarmer && e.formationId >= 0) {
    const fid = e.formationId;
    sim.formAlive[fid] = sim.formAlive[fid]! - 1;
    if (cause === KillCause.Ram) sim.formBroken[fid] = 1;
    else sim.formKilled[fid] = sim.formKilled[fid]! + 1;
    if (sim.formAlive[fid] === 0 && sim.formBroken[fid] === 0 && sim.formKilled[fid] === sim.formTotal[fid]) {
      const p = addScore(sim, SCORE.formationBonus);
      emit(sim, EvType.Formation, Kind.Swarmer, e.x, e.z, p, fid);
    }
  }
  if (k === Kind.Mine) {
    sim.chainSlot[sim.chainTail] = e.slot;
    sim.chainDepth[sim.chainTail] = cause === KillCause.Ram ? -1 : depth;
    sim.chainTail++;
  }
  if (cause === KillCause.Bolt || cause === KillCause.Beam) {
    if (k === Kind.AsteroidM) {
      split(sim, e, Kind.AsteroidS, -1.4, 0, -5);
      split(sim, e, Kind.AsteroidS, 1.4, 0, 5);
    } else if (k === Kind.AsteroidL) {
      split(sim, e, Kind.AsteroidM, -2.2, 0, -4);
      split(sim, e, Kind.AsteroidM, 2.2, 0, 4);
      split(sim, e, Kind.AsteroidS, 0, -2.5, 0);
    }
  }
  emit(sim, EvType.Kill, k, e.x, e.z, pts, cause);
  if (k === Kind.BossHive || k === Kind.BossPrime) onBossDefeated(sim, e);
  else if (k === Kind.BossSerpent) {
    const items = sim.entities.items;
    let other = false;
    for (let i = 0; i < items.length; i++) { const it = items[i]!; if (it.alive && it.kind === Kind.BossSerpent) { other = true; break; } }
    if (!other) onBossDefeated(sim, e);
  }
}

function dropCrystal(sim: Sim, e: Entity): void {
  const c = spawnEntity(sim, Kind.Crystal, e.x, e.z, 0, 0);
  if (c) c.a = 1;
}

function split(sim: Sim, p: Entity, kind: Kind, dx: number, dz: number, dvx: number): void {
  const c = spawnEntity(sim, kind, p.x + dx, p.z + dz, p.vx + dvx, p.vz);
  if (c) { c.px = c.x; c.pz = c.z; }
}

export function processChains(sim: Sim): void {
  if (sim.chainHead === sim.chainTail) return;
  sim.chainLen = 0; sim.chainPoints = 0;
  const items = sim.entities.items;
  while (sim.chainHead < sim.chainTail) {
    const slot = sim.chainSlot[sim.chainHead]!;
    const depth = sim.chainDepth[sim.chainHead]!;
    sim.chainHead++;
    const m = items[slot]!;
    const pts = depth < 0 ? 0 : addScore(sim, SCORE.chainBase + SCORE.chainPerLink * depth);
    emit(sim, EvType.MineBlast, Kind.Mine, m.x, m.z, depth > 0 ? depth : 0, pts);
    sim.chainLen++; sim.chainPoints += pts; sim.chainX = m.x; sim.chainZ = m.z;
    const next = (depth > 0 ? depth : 0) + 1;
    for (let i = 0; i < items.length; i++) {
      const e = items[i]!;
      if (!e.alive) continue;
      if (isPickup(e.kind) || KIND_BOSS[e.kind]! || KIND_INVULN[e.kind]!) continue;
      const dx = e.x - m.x, dz = e.z - m.z, rr = MINE.blastRadius + e.r;
      if (dx * dx + dz * dz <= rr * rr) killEntity(sim, e, KillCause.Chain, next);
    }
  }
  sim.chainHead = 0; sim.chainTail = 0;
  if (sim.chainLen >= 2) {
    emit(sim, EvType.Chain, Kind.Mine, sim.chainX, sim.chainZ, sim.chainLen, sim.chainPoints);
    if (sim.chainLen > sim.stats.maxChain) sim.stats.maxChain = sim.chainLen;
  }
}

export function nearMisses(sim: Sim): void {
  const s = sim.ship;
  if (s.dead) return;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive || !KIND_HAZARD[e.kind]! || e.nearMissDone) continue;
    if (e.pz - e.r <= s.r && e.z + e.r >= -s.r && s.jumpTicks === 0) {
      const edge = sweptMinDist(e.px - s.px, e.pz - s.pz, e.x - s.x, e.z - s.z) - (e.r + s.r);
      if (edge < e.minEdge) e.minEdge = edge;
    }
    if (e.z - e.r > s.r) {
      e.nearMissDone = true;
      if (!e.hitShip && e.minEdge <= SCORE.nearMissDist && s.jumpTicks === 0) {
        const pts = addScore(sim, SCORE.nearMissPoints);
        sim.stats.nearMisses++;
        bumpCombo(sim);
        emit(sim, EvType.NearMiss, e.kind, e.x, e.z, pts, e.x < s.x ? -1 : 1);
      }
    }
  }
}

export function updateTimers(sim: Sim): void {
  if (sim.comboTimer > 0) {
    sim.comboTimer--;
    if (sim.comboTimer === 0) {
      if (sim.combo >= 2) emit(sim, EvType.ComboLost, Kind.AsteroidS, sim.ship.x, 0, sim.combo, 0);
      sim.combo = 0; sim.multiplier = 1;
    }
  }
  for (let t = 0; t < TIMED_POWER_COUNT; t++) {
    if (sim.powerTicks[t]! > 0) {
      sim.powerTicks[t] = sim.powerTicks[t]! - 1;
      if (sim.powerTicks[t] === 0) emit(sim, EvType.PowerExpired, Kind.AsteroidS, sim.ship.x, 0, t, 0);
    }
  }
  if (sim.boss.active) {
    let tot = 0;
    const items = sim.entities.items;
    for (let i = 0; i < items.length; i++) {
      const e = items[i]!;
      if (e.alive && (e.kind === Kind.BossHive || e.kind === Kind.BossPrime || e.kind === Kind.BossSerpent)) tot += e.hp;
    }
    sim.boss.hpTotal = tot;
  }
}

export function onBossDefeated(sim: Sim, e: Entity): void {
  const boss = sim.boss;
  boss.active = false;
  const pts = addScore(sim, SCORE.bossBase * (sim.sectorIndex + 1));
  sim.stats.bossesKilled++;
  sim.stats.bossKills[boss.id] = sim.stats.bossKills[boss.id]! + 1;
  if (!boss.hitDuringFight) sim.stats.bossesNoHit[boss.id] = sim.stats.bossesNoHit[boss.id]! + 1;
  for (let i = -1; i <= 1; i++) {
    const c = spawnEntity(sim, Kind.Crystal, e.x + i * 3, e.z, 0, 0);
    if (c) c.a = 10;
  }
  spawnEntity(sim, Kind.NukePickup, e.x, e.z - 4, 0, 0);
  const rep = spawnEntity(sim, Kind.PowerUp, e.x + 5, e.z - 2, 0, 0);
  if (rep) rep.a = PowerType.Repair;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.alive && KIND_BOSS[it.kind]!) {
      sim.entities.kill(it);
      emit(sim, EvType.Kill, it.kind, it.x, it.z, 0, KillCause.Ram);
    }
  }
  emit(sim, EvType.BossDefeated, e.kind, e.x, e.z, pts, boss.id);
}
