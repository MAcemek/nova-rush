import { EvType, Kind, PowerType, SectorState } from './types';
import type { Sim, SpawnBuffer } from './types';
import { DIRECTOR, POWER, SECTOR, SHIP, WORLD } from './tuning';
import { PATTERNS, patternById } from './patterns';
import { isPassable } from './passability';
import { emit, spawnEntity, allocFormation } from './spawn';
import { spawnBoss } from './bosses';

const TUTORIAL_SCRIPT: { tick: number; pattern: string }[] = [
  { tick: 60, pattern: 'crystal_river' }, { tick: 300, pattern: 'rain_sparse' }, { tick: 480, pattern: 'rain_sparse' },
  { tick: 640, pattern: 'barrier_double_gap' }, { tick: 820, pattern: 'asteroid_big_drift' }, { tick: 960, pattern: 'drone_pair' },
  { tick: 1180, pattern: 'rain_dense' },
];

export function pickPattern(sim: Sim, d: number): number {
  let total = 0;
  for (let i = 0; i < PATTERNS.length; i++) { const p = PATTERNS[i]!; if (p.minD <= d) total += p.weight; }
  if (total <= 0) return -1;
  const r = sim.spawnRng.next() * total;
  let cum = 0;
  let last = -1;
  for (let i = 0; i < PATTERNS.length; i++) {
    const p = PATTERNS[i]!;
    if (p.minD > d) continue;
    cum += p.weight; last = i;
    if (r < cum) return i;
  }
  return last;
}

export function commitPattern(sim: Sim, buf: SpawnBuffer): void {
  let count = 0;
  for (let i = 0; i < buf.n; i++) if (buf.items[i]!.formation) count++;
  let fid = -1;
  if (count > 0) fid = allocFormation(sim, count);
  for (let i = 0; i < buf.n; i++) {
    const s = buf.items[i]!;
    const e = spawnEntity(sim, s.kind, s.x, WORLD.spawnZ + s.dz, s.vx, s.vz);
    if (e === null) {
      if (s.formation && fid >= 0) { sim.formAlive[fid] = sim.formAlive[fid]! - 1; sim.formTotal[fid] = sim.formTotal[fid]! - 1; }
      continue;
    }
    e.a = s.a; e.b = s.b; e.c = s.c; e.d = s.d;
    e.formationId = s.formation ? fid : -1;
    if (s.kind === Kind.Warden) { e.c = 0; e.d = -1; }
  }
}

export function spawnGift(sim: Sim): void {
  const x = sim.dropRng.range(-10, 10);
  const w = POWER.giftWeights;
  const hull = sim.ship.hull;
  const REPAIR = PowerType.Repair, OVERHAUL = PowerType.Overhaul, NUKE_IDX = w.length - 1;
  const weight = (i: number): number => {
    if (i === REPAIR) return hull >= SHIP.hull ? 0 : w[i]! * (hull <= 1 ? POWER.repairBoostLow : 1);
    if (i === OVERHAUL) return hull >= SHIP.hull ? 0 : hull <= 1 ? w[i]! * POWER.repairBoostLow : 0;
    return w[i]!;
  };
  let total = 0;
  for (let i = 0; i < w.length; i++) total += weight(i);
  const r = sim.dropRng.next() * total;
  let cum = 0, idx = NUKE_IDX;
  for (let i = 0; i < w.length; i++) { cum += weight(i); if (r < cum) { idx = i; break; } }
  if (idx === NUKE_IDX) spawnEntity(sim, Kind.NukePickup, x, WORLD.spawnZ, 0, 0);
  else { const e = spawnEntity(sim, Kind.PowerUp, x, WORLD.spawnZ, 0, 0); if (e) e.a = idx; }
}

function tutorialDirector(sim: Sim): void {
  const dir = sim.director;
  while (dir.tutorialCursor < TUTORIAL_SCRIPT.length && TUTORIAL_SCRIPT[dir.tutorialCursor]!.tick === sim.tick) {
    const p = patternById(TUTORIAL_SCRIPT[dir.tutorialCursor]!.pattern);
    if (p) { sim.spawnBuf.clear(); p.build(sim.spawnRng, 0, sim.spawnBuf); commitPattern(sim, sim.spawnBuf); }
    dir.tutorialCursor++;
  }
}

export function updateDirector(sim: Sim): void {
  if (sim.mode === 'tutorial') { tutorialDirector(sim); return; }
  const dir = sim.director;
  switch (sim.sectorState) {
    case SectorState.Play: {
      sim.ticksInSector++;
      if (sim.ticksInSector >= SECTOR.playTicks) { sim.sectorState = SectorState.Boss; spawnBoss(sim); return; }
      const d = sim.sectorIndex + sim.ticksInSector / SECTOR.playTicks;
      const cycle = Math.floor(sim.sectorIndex / 5);
      const nb = dir.budget + (DIRECTOR.budgetBase + DIRECTOR.budgetPerD * d) / 60 * (1 + DIRECTOR.cycleBoost * cycle);
      dir.budget = nb < DIRECTOR.budgetCap ? nb : DIRECTOR.budgetCap;
      if (--dir.giftTimer <= 0) { spawnGift(sim); dir.giftTimer = sim.dropRng.int(DIRECTOR.giftMin, DIRECTOR.giftMax); }
      if (dir.cooldown > 0) { dir.cooldown--; return; }
      if (dir.pending < 0) dir.pending = pickPattern(sim, d);
      if (dir.pending < 0) return;
      const p = PATTERNS[dir.pending]!;
      if (dir.budget < p.cost) return;
      const buf = sim.spawnBuf;
      for (let attempt = 0; attempt <= DIRECTOR.rebuilds; attempt++) {
        buf.clear();
        p.build(sim.spawnRng, d, buf);
        if (isPassable(sim, buf)) {
          commitPattern(sim, buf);
          dir.budget -= p.cost;
          dir.cooldown = p.durationTicks + (p.cost >= DIRECTOR.bigCost ? DIRECTOR.bigGap : 0);
          dir.committed++; dir.pending = -1;
          return;
        }
        dir.rejectedBuilds++;
      }
      dir.failedAll++; dir.pending = -1;
      return;
    }
    case SectorState.Boss:
      if (!sim.boss.active) { sim.sectorState = SectorState.Warp; sim.warpTicks = SECTOR.warpTicks; emit(sim, EvType.WarpStart, Kind.AsteroidS, 0, 0, sim.sectorIndex, 0); }
      return;
    case SectorState.Warp:
      if (--sim.warpTicks <= 0) {
        sim.sectorIndex++; sim.ticksInSector = 0; sim.sectorState = SectorState.Play;
        dir.cooldown = DIRECTOR.startDelay; dir.pending = -1; dir.budget = 0;
        emit(sim, EvType.SectorStart, Kind.AsteroidS, 0, 0, sim.sectorIndex, 0);
      }
      return;
  }
}
