import { Kind } from './types';
import type { SpawnBuffer } from './types';
import type { Rng } from './rng';
import { ASTEROID, BARRIER, DRONE, GUNSHIP, KIND_RADIUS, WARDEN } from './tuning';
import { RADIAL_DX, RADIAL_DZ, clamp, fsin } from './fmath';

export interface Pattern { id: string; cost: number; minD: number; weight: number; durationTicks: number; build(rng: Rng, d: number, out: SpawnBuffer): void }
export const GIFT_PATTERN_ID = 'powerup_gift';

const W = 14;
function drift(rng: Rng): number { return rng.range(-ASTEROID.driftMax, ASTEROID.driftMax); }

/** Full-width wall of `kind` with gaps. */
function wall(out: SpawnBuffer, kind: Kind, gaps: number[], gapW: number, dz: number, vx: number): void {
  const spacing = kind === Kind.Barrier ? BARRIER.spacing : 3.6;
  const rad = KIND_RADIUS[kind]!;
  for (let x = -W; x <= W + 1e-9; x += spacing) {
    let skip = false;
    for (let i = 0; i < gaps.length; i++) if (Math.abs(x - gaps[i]!) < gapW / 2 + rad) { skip = true; break; }
    if (!skip) out.add(kind, x, dz, vx);
  }
}
function drone(out: SpawnBuffer, x: number, dz: number): void { out.add(Kind.Drone, x, dz, 0, DRONE.vz, x); }
function formationAdd(out: SpawnBuffer, kind: Kind, x: number, dz: number): void {
  const s = out.add(kind, x, dz);
  if (s) s.formation = true;
}
function swarmerV(out: SpawnBuffer, n: number, x0: number, dz0: number): void {
  formationAdd(out, Kind.Swarmer, x0, dz0);
  for (let k = 1; k <= (n - 1) / 2; k++) {
    formationAdd(out, Kind.Swarmer, x0 - k * 2.4, dz0 - k * 3);
    formationAdd(out, Kind.Swarmer, x0 + k * 2.4, dz0 - k * 3);
  }
}
function denseRain(rng: Rng, D: number, n: number, out: SpawnBuffer): void {
  for (let i = 0; i < n; i++) {
    const u = rng.next();
    const kind = u < Math.min(0.3, 0.1 + 0.03 * D) ? Kind.AsteroidL : u < 0.45 ? Kind.AsteroidM : Kind.AsteroidS;
    const x = rng.range(-13, 13);
    const dz = -rng.range(0, 130);
    const vx = drift(rng);
    out.add(kind, x, dz, vx);
  }
}

export const PATTERNS: Pattern[] = [
  { id: 'rain_sparse', cost: 4, minD: 0, weight: 10, durationTicks: 60, build(rng, d, out) {
    const D = Math.min(d, 6);
    const n = Math.min(8, 4 + Math.floor(D));
    for (let i = 0; i < n; i++) {
      const kind = rng.chance(0.25 + 0.05 * D) ? Kind.AsteroidM : Kind.AsteroidS;
      const x = rng.range(-13, 13);
      const dz = -rng.range(0, 60);
      const vx = drift(rng);
      out.add(kind, x, dz, vx);
    }
  } },
  { id: 'rain_dense', cost: 10, minD: 0.8, weight: 6, durationTicks: 90, build(rng, d, out) {
    const D = Math.min(d, 6);
    denseRain(rng, D, Math.min(16, 8 + Math.floor(2 * D)), out);
  } },
  { id: 'asteroid_wall', cost: 12, minD: 0.5, weight: 5, durationTicks: 80, build(rng, d, out) {
    const D = Math.min(d, 6);
    const gapW = Math.max(6, 7.5 - 0.3 * D);
    const g = rng.range(-W + gapW / 2 + 1, W - gapW / 2 - 1);
    wall(out, Kind.AsteroidM, [g], gapW, 0, 0);
    if (D >= 2) {
      const g2 = clamp(g + rng.range(-8, 8), -W + gapW / 2 + 1, W - gapW / 2 - 1);
      wall(out, Kind.AsteroidM, [g2], gapW, -40, 0);
    }
  } },
  { id: 'asteroid_big_drift', cost: 8, minD: 0.3, weight: 5, durationTicks: 70, build(rng, d, out) {
    const D = Math.min(d, 6);
    const n = Math.min(4, 2 + Math.floor(D / 2));
    for (let i = 0; i < n; i++) {
      const x = -10 + i * 20 / Math.max(1, n - 1) + rng.range(-2, 2);
      out.add(Kind.AsteroidL, x, -i * 25, rng.range(-2, 2));
    }
  } },
  { id: 'slalom_barriers', cost: 9, minD: 0.6, weight: 6, durationTicks: 150, build(rng, d, out) {
    const D = Math.min(d, 6);
    const k = Math.min(5, 3 + Math.floor(D));
    const spacing = 45 + 8 * D;
    const gapW = Math.max(5.5, 7 - 0.3 * D);
    for (let i = 0; i < k; i++) {
      const g = (i % 2 === 0 ? -1 : 1) * rng.range(2, 6);
      wall(out, Kind.Barrier, [g], gapW, -i * spacing, 0);
    }
  } },
  { id: 'barrier_double_gap', cost: 7, minD: 0.4, weight: 5, durationTicks: 60, build(rng, _d, out) {
    const g1 = rng.range(-10, -3);
    const g2 = rng.range(3, 10);
    wall(out, Kind.Barrier, [g1, g2], 6, 0, 0);
  } },
  { id: 'mine_field', cost: 8, minD: 0.7, weight: 5, durationTicks: 90, build(rng, d, out) {
    const D = Math.min(d, 6);
    const n = Math.min(14, 6 + Math.floor(1.5 * D));
    for (let i = 0; i < n; i++) out.add(Kind.Mine, rng.range(-13, 13), -rng.range(0, 80));
  } },
  { id: 'mine_ring', cost: 10, minD: 1.0, weight: 4, durationTicks: 80, build(rng, _d, out) {
    const cx = rng.range(-8, 8);
    for (let k = 0; k <= 10; k += 2) out.add(Kind.Mine, cx + 4.5 * RADIAL_DX[k]!, -20 + 4.5 * RADIAL_DZ[k]!);
    out.add(Kind.Crystal, cx - 0.8, -20, 0, 0, 1);
    out.add(Kind.Crystal, cx + 0.8, -20, 0, 0, 1);
    out.add(Kind.Crystal, cx, -21.2, 0, 0, 1);
  } },
  { id: 'mine_line_chain', cost: 9, minD: 1.5, weight: 3, durationTicks: 80, build(rng, _d, out) {
    const x0 = rng.range(-10, 10);
    const s = x0 < 0 ? 1 : -1;
    for (let i = 0; i < 7; i++) out.add(Kind.Mine, x0 + s * i * 2.5, -i * 5);
  } },
  { id: 'drone_pair', cost: 8, minD: 0.5, weight: 6, durationTicks: 120, build(rng, d, out) {
    const D = Math.min(d, 6);
    const o = rng.range(4, 9);
    drone(out, -o, 0); drone(out, o, 0);
    if (D >= 2.5) drone(out, 0, -20);
  } },
  { id: 'drone_wave', cost: 14, minD: 2.0, weight: 3, durationTicks: 160, build(_rng, _d, out) {
    const xs = [-9, -3, 3, 9];
    for (let i = 0; i < 4; i++) drone(out, xs[i]!, -i * 15);
  } },
  { id: 'swarmer_v', cost: 10, minD: 0.8, weight: 6, durationTicks: 120, build(rng, d, out) {
    const D = Math.min(d, 6);
    const n = D >= 2 ? 7 : 5;
    const x0 = rng.range(-8, 8);
    swarmerV(out, n, x0, 0);
  } },
  { id: 'swarmer_line', cost: 9, minD: 0.6, weight: 5, durationTicks: 120, build(rng, d, out) {
    const D = Math.min(d, 6);
    const n = D >= 2 ? 6 : 5;
    const x0 = rng.range(-6, 6);
    for (let i = 0; i < n; i++) formationAdd(out, Kind.Swarmer, x0 + (i - (n - 1) / 2) * 2.4, 0);
  } },
  { id: 'swarmer_column', cost: 9, minD: 1.2, weight: 4, durationTicks: 120, build(rng, _d, out) {
    const x0 = rng.range(-10, 10);
    for (let i = 0; i < 5; i++) formationAdd(out, Kind.Swarmer, x0, -i * 4);
  } },
  { id: 'gunship_strafe', cost: 16, minD: 1.5, weight: 4, durationTicks: 300, build(rng, d, out) {
    const D = Math.min(d, 6);
    const s = rng.chance(0.5) ? -1 : 1;
    out.add(Kind.Gunship, s * GUNSHIP.spawnX, 0, 0, GUNSHIP.vz, s * rng.range(2, 8));
    if (D >= 3.5) for (let i = 0; i < 3; i++) out.add(Kind.AsteroidS, rng.range(-12, 12), -rng.range(10, 40), drift(rng));
  } },
  { id: 'gunship_pair', cost: 24, minD: 3.0, weight: 2, durationTicks: 360, build(rng, _d, out) {
    out.add(Kind.Gunship, -22, 0, 0, GUNSHIP.vz, -rng.range(3, 8));
    out.add(Kind.Gunship, 22, -30, 0, GUNSHIP.vz, rng.range(3, 8));
  } },
  { id: 'warden_escort', cost: 15, minD: 1.8, weight: 4, durationTicks: 200, build(rng, _d, out) {
    const x0 = rng.range(-6, 6);
    out.add(Kind.Warden, x0, 0, 0, WARDEN.vz, x0);
    drone(out, x0 - 6, -10); drone(out, x0 + 6, -10);
  } },
  { id: 'warden_solo', cost: 9, minD: 1.2, weight: 4, durationTicks: 150, build(rng, _d, out) {
    const x0 = rng.range(-8, 8);
    out.add(Kind.Warden, x0, 0, 0, WARDEN.vz, x0);
  } },
  { id: 'mixed_ambush', cost: 18, minD: 2.2, weight: 3, durationTicks: 200, build(rng, _d, out) {
    const o = rng.range(5, 9);
    drone(out, -o, 0); drone(out, o, 0);
    const x0 = rng.range(-5, 5);
    for (let i = 0; i < 5; i++) formationAdd(out, Kind.Swarmer, x0 + (i - 2) * 2.4, -40);
    for (let i = 0; i < 4; i++) out.add(Kind.AsteroidS, rng.range(-13, 13), -rng.range(0, 60), drift(rng));
  } },
  { id: 'crystal_river', cost: 3, minD: 0, weight: 5, durationTicks: 90, build(rng, _d, out) {
    const x0 = rng.range(-8, 8);
    for (let i = 0; i < 12; i++) out.add(Kind.Crystal, x0 + 5 * fsin(i * 0.5), -i * 6, 0, 0, 1);
  } },
  { id: 'crystal_bait', cost: 5, minD: 0.5, weight: 4, durationTicks: 90, build(rng, _d, out) {
    const x0 = rng.range(-6, 6);
    out.add(Kind.AsteroidL, x0 - 6.5, 0); out.add(Kind.AsteroidL, x0 + 6.5, 0);
    for (let i = 0; i < 6; i++) out.add(Kind.Crystal, x0, -i * 4, 0, 0, 1);
  } },
  { id: 'barrier_funnel', cost: 11, minD: 1.0, weight: 4, durationTicks: 120, build(rng, _d, out) {
    const c = rng.range(-6, 6);
    wall(out, Kind.Barrier, [c], 10, 0, 0);
    const c2 = clamp(c + (rng.chance(0.5) ? -3 : 3), -10, 10);
    wall(out, Kind.Barrier, [c2], 6, -50, 0);
  } },
  { id: 'asteroid_zigzag', cost: 8, minD: 1.0, weight: 4, durationTicks: 120, build(rng, _d, out) {
    const s = rng.chance(0.5) ? -1 : 1;
    for (let i = 0; i < 6; i++) out.add(Kind.AsteroidM, s * (i % 2 === 0 ? -6 : 6), -i * 25);
  } },
  { id: 'mines_and_rocks', cost: 10, minD: 1.3, weight: 4, durationTicks: 90, build(rng, _d, out) {
    for (let i = 0; i < 5; i++) out.add(Kind.Mine, rng.range(-13, 13), -rng.range(0, 60));
    for (let i = 0; i < 5; i++) out.add(Kind.AsteroidS, rng.range(-13, 13), -rng.range(0, 60), drift(rng));
  } },
  { id: 'barrier_moving_gap', cost: 12, minD: 2.0, weight: 3, durationTicks: 120, build(rng, _d, out) {
    const s = rng.chance(0.5) ? -1 : 1;
    const g = rng.range(-6, 6);
    for (let x = -20; x <= 20; x += 1.6) {
      if (Math.abs(x - g) < 6.5 / 2 + 1) continue;
      out.add(Kind.Barrier, x, 0, s * 3);
    }
  } },
  { id: 'swarmer_double_v', cost: 16, minD: 2.5, weight: 3, durationTicks: 160, build(rng, _d, out) {
    const x0 = rng.range(-9, -3);
    swarmerV(out, 5, x0, 0);
    const x1 = rng.range(3, 9);
    swarmerV(out, 5, x1, -20);
  } },
  { id: 'drone_gauntlet', cost: 13, minD: 2.8, weight: 3, durationTicks: 160, build(rng, _d, out) {
    drone(out, -8, 0); drone(out, 8, 0);
    wall(out, Kind.Barrier, [rng.range(-4, 4)], 6.5, -30, 0);
  } },
  { id: 'heavy_rain', cost: 15, minD: 3.0, weight: 3, durationTicks: 120, build(rng, d, out) {
    const D = Math.min(d, 6);
    denseRain(rng, D, Math.min(18, 12 + Math.floor(2 * (D - 3))), out);
  } },
  { id: 'mine_curtain', cost: 12, minD: 2.0, weight: 3, durationTicks: 90, build(rng, _d, out) {
    const g = rng.range(-8, 8);
    for (let x = -13; x <= 13; x += 3.2) {
      if (Math.abs(x - g) < 3.5 + 1) continue;
      out.add(Kind.Mine, x, 0);
    }
  } },
];

const BY_ID = new Map<string, Pattern>();
for (const p of PATTERNS) BY_ID.set(p.id, p);
export function patternById(id: string): Pattern | undefined { return BY_ID.get(id); }
