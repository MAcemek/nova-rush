import { Kind, EvType } from './types';
import type { Sim, Entity, Bolt, Bullet } from './types';
import { BULLET, CAP, KIND_HP, KIND_INVULN, KIND_RADIUS, LASER } from './tuning';
import { GS_COS, GS_SIN, RADIAL_DX, RADIAL_DZ, clamp } from './fmath';

export function emit(sim: Sim, type: EvType, kind: Kind, x: number, z: number, a: number, b: number): void {
  if (sim.eventPoolIdx >= sim.eventPool.length) { sim.eventsDropped++; return; }
  const it = sim.eventPool[sim.eventPoolIdx++]!;
  it.type = type; it.kind = kind; it.x = x; it.z = z; it.a = a; it.b = b;
  sim.events.push(it);
}

export function spawnEntity(sim: Sim, kind: Kind, x: number, z: number, vx: number, vz: number): Entity | null {
  const e = sim.entities.spawn();
  if (e === null) { sim.dropped++; return null; }
  e.id = sim.nextId++;
  e.kind = kind;
  e.x = x; e.z = z; e.px = x; e.pz = z; e.vx = vx; e.vz = vz;
  e.r = KIND_RADIUS[kind]!;
  e.hp = KIND_HP[kind]!; e.maxHp = e.hp;
  e.invulnerable = KIND_INVULN[kind]!;
  e.age = 0; e.flashTicks = 0;
  e.a = 0; e.b = 0; e.c = 0; e.d = 0;
  e.formationId = -1; e.parentId = -1;
  e.nearMissDone = false; e.minEdge = 1e9; e.hitShip = false;
  return e;
}

export function spawnBolt(sim: Sim, x: number, z: number, vx: number, vz: number): Bolt | null {
  const b = sim.bolts.spawn();
  if (b === null) { sim.dropped++; return null; }
  b.x = x; b.z = z; b.px = x; b.pz = z; b.vx = vx; b.vz = vz;
  b.r = LASER.radius; b.dmg = LASER.damage;
  return b;
}

export function spawnBullet(sim: Sim, x: number, z: number, vx: number, vz: number): Bullet | null {
  const b = sim.bullets.spawn();
  if (b === null) { sim.dropped++; return null; }
  b.x = x; b.z = z; b.px = x; b.pz = z; b.vx = vx; b.vz = vz;
  b.r = BULLET.radius; b.dodged = false;
  return b;
}

export function allocFormation(sim: Sim, count: number): number {
  const fid = sim.nextFormation;
  sim.nextFormation = (fid + 1) % CAP.formations;
  sim.formAlive[fid] = count; sim.formTotal[fid] = count;
  sim.formKilled[fid] = 0; sim.formBroken[fid] = 0;
  return fid;
}

export function fireAimed(sim: Sim, e: Entity, speedMul: number): void {
  const s = sim.ship;
  const tx = clamp(s.x + s.vx * BULLET.leadMax, -14, 14);
  const dx = tx - e.x, dz = 0 - e.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-6) return;
  const sp = BULLET.speed * speedMul;
  spawnBullet(sim, e.x, e.z + e.r, dx / len * sp, dz / len * sp);
  emit(sim, EvType.EnemyFire, e.kind, e.x, e.z, 1, 0);
}

export function fireSpread3(sim: Sim, e: Entity, speedMul: number): void {
  const s = sim.ship;
  const tx = clamp(s.x + s.vx * BULLET.leadMax, -14, 14);
  const dx = tx - e.x, dz = 0 - e.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-6) return;
  const ux = dx / len, uz = dz / len;
  const sp = BULLET.speed * speedMul;
  const px = e.z + e.r;
  spawnBullet(sim, e.x, px, ux * sp, uz * sp);
  spawnBullet(sim, e.x, px, (ux * GS_COS - uz * GS_SIN) * sp, (ux * GS_SIN + uz * GS_COS) * sp);
  spawnBullet(sim, e.x, px, (ux * GS_COS + uz * GS_SIN) * sp, (-ux * GS_SIN + uz * GS_COS) * sp);
  emit(sim, EvType.EnemyFire, e.kind, e.x, e.z, 3, 0);
}

export function fireRadial12(sim: Sim, e: Entity, speedMul: number): void {
  const sp = BULLET.speed * speedMul;
  for (let k = 0; k < 12; k++) spawnBullet(sim, e.x, e.z, RADIAL_DX[k]! * sp, RADIAL_DZ[k]! * sp);
  emit(sim, EvType.EnemyFire, e.kind, e.x, e.z, 12, 0);
}

export function inFireWindow(e: Entity): boolean { return e.z > BULLET.fireZMin && e.z < BULLET.fireZMax; }
export function shipInvulnerable(sim: Sim): boolean { return sim.ship.invulnTicks > 0 || sim.ship.rollTicks > 0; }
