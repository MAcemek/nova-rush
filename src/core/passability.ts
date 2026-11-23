import type { Sim, SpawnBuffer, Entity } from './types';
import { DRONE, KIND_BOSS, KIND_HAZARD, KIND_RADIUS, PASS, SHIP, WORLD } from './tuning';
import { Kind } from './types';
import { fsin } from './fmath';

const HCAP = 1200, ICAP = 2400;
const hx = new Float64Array(HCAP), hz = new Float64Array(HCAP), hvx = new Float64Array(HCAP), hvz = new Float64Array(HCAP), hr = new Float64Array(HCAP);
const hdrone = new Uint8Array(HCAP), hbase = new Float64Array(HCAP), hage = new Float64Array(HCAP);
const rLo = new Float64Array(ICAP), rHi = new Float64Array(ICAP);
const bLo = new Float64Array(ICAP), bHi = new Float64Array(ICAP);
const mLo = new Float64Array(ICAP), mHi = new Float64Array(ICAP);
const tLo = new Float64Array(ICAP), tHi = new Float64Array(ICAP);

export function isPassable(sim: Sim, buf: SpawnBuffer): boolean {
  return isPassableRaw(sim.worldSpeed, sim.entities.items, buf);
}

export function isPassableRaw(worldSpeed: number, hazards: ReadonlyArray<Entity> | null, buf: SpawnBuffer): boolean {
  let hn = 0;
  if (hazards !== null) {
    for (let i = 0; i < hazards.length && hn < HCAP; i++) {
      const e = hazards[i]!;
      if (!e.alive || !KIND_HAZARD[e.kind]!) continue;
      const vzAbs = KIND_BOSS[e.kind]! ? 0 : worldSpeed + e.vz;
      if (e.z - e.r > SHIP.radius && vzAbs >= 0) continue;
      hx[hn] = e.x; hz[hn] = e.z; hvx[hn] = e.vx; hvz[hn] = vzAbs; hr[hn] = e.r;
      hdrone[hn] = e.kind === Kind.Drone ? 1 : 0; hbase[hn] = e.a; hage[hn] = e.age;
      hn++;
    }
  }
  let any = false;
  let tEnd = 0;
  for (let i = 0; i < buf.n && hn < HCAP; i++) {
    const s = buf.items[i]!;
    if (!KIND_HAZARD[s.kind]!) continue;
    any = true;
    const z = WORLD.spawnZ + s.dz;
    const vzAbs = worldSpeed + s.vz;
    hx[hn] = s.x; hz[hn] = z; hvx[hn] = s.vx; hvz[hn] = vzAbs; hr[hn] = KIND_RADIUS[s.kind]!;
    hdrone[hn] = s.kind === Kind.Drone ? 1 : 0; hbase[hn] = s.a; hage[hn] = 0;
    const te = (PASS.exitZ - z) / (vzAbs > 1 ? vzAbs : 1);
    if (te > tEnd) tEnd = te;
    hn++;
  }
  if (!any) return true;
  const slices = Math.ceil(tEnd * 60 / PASS.sliceTicks);
  const reach = PASS.reachFrac * SHIP.maxSpeed * PASS.sliceTicks / 60;
  let rn = 1;
  rLo[0] = -14; rHi[0] = 14;
  const dtS = PASS.sliceTicks / 60;
  for (let k = 0; k < slices; k++) {
    const t0 = k * dtS, t1 = t0 + dtS;
    // a. expand + merge
    let mn = 0;
    for (let i = 0; i < rn; i++) {
      let lo = rLo[i]! - reach, hi = rHi[i]! + reach;
      if (lo < -14) lo = -14;
      if (hi > 14) hi = 14;
      if (mn > 0 && lo <= mHi[mn - 1]!) { if (hi > mHi[mn - 1]!) mHi[mn - 1] = hi; }
      else { mLo[mn] = lo; mHi[mn] = hi; mn++; }
    }
    for (let i = 0; i < mn; i++) { rLo[i] = mLo[i]!; rHi[i] = mHi[i]!; }
    rn = mn;
    // b. blocked intervals
    let bn = 0;
    for (let i = 0; i < hn; i++) {
      const z0 = hz[i]! + hvz[i]! * t0, z1 = hz[i]! + hvz[i]! * t1;
      const ext = hr[i]! + SHIP.radius;
      const zmax = z0 > z1 ? z0 : z1, zmin = z0 < z1 ? z0 : z1;
      if (zmax < -ext || zmin > ext) continue;
      let x0: number, x1: number;
      if (hdrone[i] === 1) {
        x0 = hbase[i]! + DRONE.amp * fsin((hage[i]! + t0 * 60) * DRONE.freq);
        x1 = hbase[i]! + DRONE.amp * fsin((hage[i]! + t1 * 60) * DRONE.freq);
      } else { x0 = hx[i]! + hvx[i]! * t0; x1 = hx[i]! + hvx[i]! * t1; }
      const lo = (x0 < x1 ? x0 : x1) - ext - PASS.margin, hi = (x0 > x1 ? x0 : x1) + ext + PASS.margin;
      if (bn < ICAP) { bLo[bn] = lo; bHi[bn] = hi; bn++; }
    }
    // c. sort (insertion) + merge
    for (let i = 1; i < bn; i++) {
      const lo = bLo[i]!, hi = bHi[i]!;
      let j = i - 1;
      while (j >= 0 && bLo[j]! > lo) { bLo[j + 1] = bLo[j]!; bHi[j + 1] = bHi[j]!; j--; }
      bLo[j + 1] = lo; bHi[j + 1] = hi;
    }
    let un = 0;
    for (let i = 0; i < bn; i++) {
      if (un > 0 && bLo[i]! <= tHi[un - 1]!) { if (bHi[i]! > tHi[un - 1]!) tHi[un - 1] = bHi[i]!; }
      else { tLo[un] = bLo[i]!; tHi[un] = bHi[i]!; un++; }
    }
    // R = R \ union(B)
    let on = 0;
    let u = 0;
    for (let i = 0; i < rn; i++) {
      let cur = rLo[i]!;
      const hi = rHi[i]!;
      while (u < un && tHi[u]! < cur) u++;
      let v = u;
      while (v < un && tLo[v]! < hi) {
        if (tLo[v]! > cur) { if (tLo[v]! - cur >= PASS.minWidth && on < ICAP) { mLo[on] = cur; mHi[on] = tLo[v]!; on++; } }
        if (tHi[v]! > cur) cur = tHi[v]!;
        v++;
      }
      if (hi - cur >= PASS.minWidth && on < ICAP) { mLo[on] = cur; mHi[on] = hi; on++; }
    }
    if (on === 0) return false;
    for (let i = 0; i < on; i++) { rLo[i] = mLo[i]!; rHi[i] = mHi[i]!; }
    rn = on;
  }
  return true;
}
