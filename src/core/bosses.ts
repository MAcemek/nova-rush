import { EvType, Kind, BossId } from './types';
import type { Sim, Entity } from './types';
import { BARRIER, BOSS, BULLET, HIVE, KIND_HP, PRIME, SERPENT, WORLD, DT } from './tuning';
import { HALF_PI, clamp, fcos, fsin } from './fmath';
import { allocFormation, emit, fireAimed, fireRadial12, fireSpread3, spawnBullet, spawnEntity } from './spawn';

const BOSS_KIND = [Kind.BossHive, Kind.BossPrime, Kind.BossSerpent];

export function bossForSector(sectorIndex: number): BossId { return (sectorIndex % 3) as BossId; }

function spawnShieldDrones(sim: Sim, e: Entity): void {
  for (let k = 0; k < PRIME.droneCount; k++) {
    const d = spawnEntity(sim, Kind.ShieldDrone, e.x, e.z, 0, 0);
    if (d) { d.a = k; d.parentId = e.id; }
  }
}

function countAlive(sim: Sim, kind: Kind): number {
  let n = 0;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) { const e = items[i]!; if (e.alive && e.kind === kind) n++; }
  return n;
}

export function spawnBoss(sim: Sim): void {
  const b = sim.boss;
  const o = sim.opts.boss;
  const id = o ? (o === 'hive' ? BossId.Hive : o === 'warden' ? BossId.Prime : BossId.Serpent) : bossForSector(sim.sectorIndex);
  b.id = id;
  b.scale = 1 + BOSS.cycleScale * Math.floor(sim.sectorIndex / 5);
  b.active = true; b.phase = 1; b.settled = false; b.timer = 0; b.wallTimer = PRIME.wallInterval[0]!; b.telegraph = 0;
  b.gapCount = 0; b.hitDuringFight = false; b.headIndex = 0; b.mainSlot = -1; b.histIdx = 0;
  let total = 0;
  if (id === BossId.Hive) {
    const e = spawnEntity(sim, Kind.BossHive, 0, WORLD.spawnZ, 0, 0);
    if (e) { e.hp = HIVE.hp * b.scale; e.maxHp = e.hp; b.mainSlot = e.slot; total += e.maxHp; }
  } else if (id === BossId.Prime) {
    const e = spawnEntity(sim, Kind.BossPrime, 0, WORLD.spawnZ, 0, 0);
    if (e) { e.hp = PRIME.hp * b.scale; e.maxHp = e.hp; b.mainSlot = e.slot; total += e.maxHp; spawnShieldDrones(sim, e); }
  } else {
    b.histX.fill(0); b.histZ.fill(WORLD.spawnZ);
    for (let k = 0; k < SERPENT.segments; k++) {
      const e = spawnEntity(sim, Kind.BossSerpent, 0, WORLD.spawnZ, 0, 0);
      if (!e) continue;
      e.a = k; e.hp = KIND_HP[Kind.BossSerpent]! * b.scale; e.maxHp = e.hp; total += e.maxHp;
      if (k === 0) b.mainSlot = e.slot;
    }
  }
  b.maxHpTotal = total; b.hpTotal = total;
  emit(sim, EvType.BossSpawn, BOSS_KIND[id]!, 0, WORLD.spawnZ, id, 0);
}

function chooseGaps(sim: Sim): void {
  const b = sim.boss;
  b.gapCount = b.phase === 3 ? 1 : 2;
  b.gap0 = sim.aiRng.range(-10, 10);
  if (b.gapCount === 2) b.gap1 = clamp(b.gap0 + (b.gap0 < 0 ? 1 : -1) * sim.aiRng.range(8, 12), -11, 11);
}

function spawnLaserWall(sim: Sim): void {
  const b = sim.boss;
  const half = PRIME.gapWidth / 2 + 1;
  for (let x = -14; x <= 14 + 1e-9; x += BARRIER.spacing) {
    if (Math.abs(x - b.gap0) < half) continue;
    if (b.gapCount === 2 && Math.abs(x - b.gap1) < half) continue;
    spawnEntity(sim, Kind.LaserWall, x, PRIME.wallZ, 0, 0);
  }
}

export function updateBoss(sim: Sim): void {
  const b = sim.boss;
  if (!b.active) return;
  b.timer++;
  const frac = b.maxHpTotal > 0 ? b.hpTotal / b.maxHpTotal : 1;
  const np = frac > BOSS.phase2 ? 1 : frac > BOSS.phase3 ? 2 : 3;
  if (np > b.phase) {
    b.phase = np;
    emit(sim, EvType.BossPhase, BOSS_KIND[b.id]!, 0, 0, np, b.id);
    if (b.id === BossId.Prime && b.mainSlot >= 0) {
      const e = sim.entities.items[b.mainSlot]!;
      if (e.alive) { let n = countAlive(sim, Kind.ShieldDrone); while (n < PRIME.droneCount) { spawnShieldDrones1(sim, e, n); n++; } }
    }
  }
  const sm = b.scale;
  const items = sim.entities.items;
  if (b.id === BossId.Hive || b.id === BossId.Prime) {
    const e = items[b.mainSlot]!;
    if (!e.alive) return;
    e.age++;
    if (e.flashTicks > 0) e.flashTicks--;
    if (b.id === BossId.Prime) {
      for (let i = 0; i < items.length; i++) { const d = items[i]!; if (d.alive && d.kind === Kind.ShieldDrone) { d.age++; if (d.flashTicks > 0) d.flashTicks--; } }
    }
    if (!b.settled) {
      e.z += BOSS.entrySpeed * DT;
      if (e.z >= BOSS.holdZ) { e.z = BOSS.holdZ; b.settled = true; b.timer = 0; }
      if (b.id === BossId.Prime) placeDrones(sim, e, false);
      return;
    }
    if (b.id === BossId.Hive) {
      e.x = HIVE.swayAmp * fsin(b.timer * HIVE.swayFreq);
      e.c = (b.timer % HIVE.corePeriod) < HIVE.coreOpenTicks ? 1 : 0;
      if (b.timer % HIVE.swarmInterval[b.phase - 1]! === 0) {
        const fid = allocFormation(sim, HIVE.swarmCount);
        for (let i = 0; i < HIVE.swarmCount; i++) {
          const s = spawnEntity(sim, Kind.Swarmer, e.x + (i - 2) * 2.4, e.z + 8, 0, 0);
          if (s) s.formationId = fid;
          else { sim.formAlive[fid] = sim.formAlive[fid]! - 1; sim.formTotal[fid] = sim.formTotal[fid]! - 1; }
        }
      }
      if (b.phase >= 2 && b.timer % HIVE.spreadInterval === 0) fireSpread3(sim, e, sm);
      if (b.phase === 3 && b.timer % HIVE.burstInterval === 0) fireRadial12(sim, e, sm);
    } else {
      e.x = PRIME.swayAmp * fsin(b.timer * PRIME.swayFreq);
      placeDrones(sim, e, true);
      if (b.telegraph > 0) {
        b.telegraph--;
        if (b.telegraph === 0) spawnLaserWall(sim);
      } else if (--b.wallTimer <= 0) {
        chooseGaps(sim);
        b.telegraph = PRIME.telegraphTicks; b.wallTimer = PRIME.wallInterval[b.phase - 1]!;
        emit(sim, EvType.BossTelegraph, Kind.LaserWall, b.gapCount, 0, b.gap0, b.gapCount === 2 ? b.gap1 : 1e9);
      }
      if (b.timer % PRIME.aimedInterval === 0) fireAimed(sim, e, sm);
    }
    return;
  }
  // Serpent
  let head: Entity | null = null;
  for (let i = 0; i < items.length; i++) {
    const s = items[i]!;
    if (!s.alive || s.kind !== Kind.BossSerpent) continue;
    s.age++;
    if (s.flashTicks > 0) s.flashTicks--;
    if (head === null || s.a < head.a) head = s;
  }
  if (head === null) return;
  b.headIndex = head.a;
  let hx: number, hz: number;
  if (!b.settled) {
    hz = b.histZ[b.histIdx]! + BOSS.entrySpeed * DT; hx = 0;
    if (hz >= BOSS.holdZ) { hz = BOSS.holdZ; b.settled = true; b.timer = 0; }
  } else {
    hx = SERPENT.ampX * fsin(b.timer * SERPENT.freqX);
    hz = BOSS.holdZ + SERPENT.ampZ * fsin(b.timer * SERPENT.freqZ);
  }
  b.histIdx = (b.histIdx + 1) & 127;
  b.histX[b.histIdx] = hx; b.histZ[b.histIdx] = hz;
  for (let i = 0; i < items.length; i++) {
    const s = items[i]!;
    if (!s.alive || s.kind !== Kind.BossSerpent) continue;
    const lag = (s.a - b.headIndex) * SERPENT.historyDelay;
    const j = (b.histIdx - lag) & 127;
    s.x = b.histX[j]!; s.z = b.histZ[j]!;
    s.invulnerable = s.a !== b.headIndex;
  }
  if (b.settled) {
    if (b.timer % SERPENT.headFireInterval === 0) fireAimed(sim, head, sm);
    if (b.phase >= 2) {
      for (let i = 0; i < items.length; i++) {
        const s = items[i]!;
        if (!s.alive || s.kind !== Kind.BossSerpent) continue;
        if ((b.timer + 10 * s.a) % SERPENT.segFireInterval === 0) {
          spawnBullet(sim, s.x, s.z, 0, BULLET.speed * sm);
          emit(sim, EvType.EnemyFire, Kind.BossSerpent, s.x, s.z, 1, 0);
        }
      }
    }
    if (b.phase === 3 && b.timer % SERPENT.burstInterval === 0) fireRadial12(sim, head, sm);
  }
}

function spawnShieldDrones1(sim: Sim, e: Entity, k: number): void {
  const d = spawnEntity(sim, Kind.ShieldDrone, e.x, e.z, 0, 0);
  if (d) { d.a = k; d.parentId = e.id; }
}

function placeDrones(sim: Sim, e: Entity, orbit: boolean): void {
  const b = sim.boss;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const d = items[i]!;
    if (!d.alive || d.kind !== Kind.ShieldDrone) continue;
    if (!orbit) { d.x = e.x; d.z = e.z; continue; }
    const ang = b.timer * PRIME.droneOrbitRate + d.a * HALF_PI;
    d.x = e.x + PRIME.droneOrbit * fcos(ang);
    d.z = e.z + PRIME.droneOrbit * fsin(ang);
  }
}

export function bossDamageMul(sim: Sim, e: Entity): number {
  if (e.kind === Kind.BossHive) return e.c === 1 ? 1 : HIVE.closedMul;
  if (e.kind === Kind.BossPrime) {
    const items = sim.entities.items;
    for (let i = 0; i < items.length; i++) { const d = items[i]!; if (d.alive && d.kind === Kind.ShieldDrone) return PRIME.shieldedMul; }
    return 1;
  }
  return 1;
}
