import { Bolt, Bullet, Entity, Ship, SimEvent, SpawnBuffer, RunStats, SectorState, BossId, EvType, Kind } from './types';
import type { Sim, SimOptions, InputFrame, DirectorState, BossState } from './types';
import { Rng } from './rng';
import { Pool } from './pool';
import { Hasher } from './hash';
import { CAP, DIRECTOR, NUKE, SCORE, SECTOR, SERPENT, TUTORIAL, WORLD } from './tuning';
import { updateShip, shipCollisions } from './ship';
import { updateWeapons, moveProjectiles, resolveBolts, detonateNuke } from './weapons';
import { updateDirector } from './director';
import { moveEntities } from './aliens';
import { nearMisses, updateTimers } from './score';
import { emit } from './spawn';
import { spawnBoss } from './bosses';

const H = new Hasher();

export function createSim(opts: SimOptions): Sim {
  const seed = opts.seed >>> 0;
  const director: DirectorState = {
    budget: 0, pending: -1, cooldown: DIRECTOR.startDelay, giftTimer: 0,
    committed: 0, rejectedBuilds: 0, failedAll: 0, tutorialCursor: 0,
  };
  const boss: BossState = {
    active: false, id: BossId.Hive, phase: 1, settled: false, scale: 1,
    timer: 0, wallTimer: 0, telegraph: 0, gapCount: 0, gap0: 0, gap1: 0,
    histX: new Float64Array(SERPENT.histSize), histZ: new Float64Array(SERPENT.histSize), histIdx: 0, headIndex: 0,
    hpTotal: 0, maxHpTotal: 0, hitDuringFight: false, mainSlot: -1,
  };
  const eventPool: SimEvent[] = [];
  for (let i = 0; i < CAP.events; i++) eventPool.push(new SimEvent());
  const dropRng = new Rng((seed ^ 0xC2B2AE35) >>> 0);
  director.giftTimer = dropRng.int(DIRECTOR.giftMin, DIRECTOR.giftMax);
  const sim: Sim = {
    opts, seed, mode: opts.mode, god: !!opts.god,
    tick: 0, over: false,
    score: 0, distance: 0, distancePoints: 0, worldSpeed: WORLD.speedStart,
    ship: new Ship(),
    entities: new Pool<Entity>(CAP.entities, (s) => new Entity(s)),
    bolts: new Pool<Bolt>(CAP.bolts, (s) => new Bolt(s)),
    bullets: new Pool<Bullet>(CAP.bullets, (s) => new Bullet(s)),
    spawnRng: new Rng((seed ^ 0x9E3779B9) >>> 0),
    aiRng: new Rng((seed ^ 0x85EBCA6B) >>> 0),
    dropRng,
    nextId: 1, dropped: 0,
    events: [], eventPool, eventPoolIdx: 0, eventsDropped: 0,
    heat: 0, overheatTicks: 0, fireCooldown: 0, wing: 1, beamTimer: 0,
    powerTicks: [0, 0, 0, 0, 0, 0, 0, 0],
    nukes: NUKE.start, nukeMeter: 0, nukeFlight: 0, nukeLaunchX: 0, nukeDue: false,
    combo: 0, comboTimer: 0, multiplier: 1,
    formAlive: new Int32Array(CAP.formations), formKilled: new Int32Array(CAP.formations), formTotal: new Int32Array(CAP.formations),
    formBroken: new Uint8Array(CAP.formations), nextFormation: 0,
    chainSlot: new Int32Array(CAP.entities), chainDepth: new Int32Array(CAP.entities), chainHead: 0, chainTail: 0,
    chainLen: 0, chainPoints: 0, chainX: 0, chainZ: 0,
    sectorIndex: 0, ticksInSector: 0, sectorState: SectorState.Play, warpTicks: 0,
    director, spawnBuf: new SpawnBuffer(CAP.spawnBuf),
    boss,
    stats: new RunStats(),
  };
  if (opts.boss) {
    sim.sectorIndex = opts.boss === 'hive' ? 0 : opts.boss === 'warden' ? 1 : 2;
    sim.ticksInSector = SECTOR.playTicks;
    sim.sectorState = SectorState.Boss;
    spawnBoss(sim);
  }
  return sim;
}

function copyPrev(sim: Sim): void {
  const s = sim.ship;
  s.px = s.x; s.pz = s.z;
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) { const e = items[i]!; if (e.alive) { e.px = e.x; e.pz = e.z; } }
  const bolts = sim.bolts.items;
  for (let i = 0; i < bolts.length; i++) { const b = bolts[i]!; if (b.alive) { b.px = b.x; b.pz = b.z; } }
  const bullets = sim.bullets.items;
  for (let i = 0; i < bullets.length; i++) { const b = bullets[i]!; if (b.alive) { b.px = b.x; b.pz = b.z; } }
}

function cull(sim: Sim): void {
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    if (e.z > WORLD.cullZ || Math.abs(e.x) > WORLD.cullX) {
      if (e.kind === Kind.Swarmer && e.formationId >= 0) {
        sim.formBroken[e.formationId] = 1;
        sim.formAlive[e.formationId] = sim.formAlive[e.formationId]! - 1;
      }
      sim.entities.kill(e);
    }
  }
  const bolts = sim.bolts.items;
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i]!;
    if (b.alive && (b.z < WORLD.boltCullZ || Math.abs(b.x) > WORLD.cullX)) sim.bolts.kill(b);
  }
  const bullets = sim.bullets.items;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i]!;
    if (b.alive && (b.z > WORLD.cullZ || b.z < WORLD.bulletCullBackZ || Math.abs(b.x) > WORLD.cullX)) sim.bullets.kill(b);
  }
  sim.entities.flush(); sim.bolts.flush(); sim.bullets.flush();
}

function advanceTick(sim: Sim): void {
  sim.tick++;
  sim.stats.ticks = sim.tick;
  sim.distance += sim.worldSpeed / 60;
  const dp = Math.floor(sim.distance / SCORE.distancePerPoint);
  if (dp > sim.distancePoints) { sim.score += dp - sim.distancePoints; sim.distancePoints = dp; }
  const ws = WORLD.speedStart + WORLD.speedStep * Math.floor(sim.tick / WORLD.speedStepTicks);
  sim.worldSpeed = ws < WORLD.speedMax ? ws : WORLD.speedMax;
  sim.stats.sectorReached = sim.sectorIndex + 1;
  if (sim.ship.dead || (sim.mode === 'tutorial' && sim.tick >= TUTORIAL.endTick)) {
    sim.over = true;
    emit(sim, EvType.GameOver, Kind.AsteroidS, 0, 0, sim.score, sim.tick);
  }
}

export function step(sim: Sim, input: InputFrame): readonly SimEvent[] {
  sim.events.length = 0; sim.eventPoolIdx = 0;
  if (sim.over) return sim.events;
  copyPrev(sim);
  updateShip(sim, input);
  updateWeapons(sim, input);
  updateDirector(sim);
  moveEntities(sim);
  moveProjectiles(sim);
  resolveBolts(sim);
  detonateNuke(sim);
  shipCollisions(sim);
  nearMisses(sim);
  updateTimers(sim);
  cull(sim);
  advanceTick(sim);
  return sim.events;
}

export function stateHash(sim: Sim): number {
  H.h = 0x811c9dc5;
  H.u32(sim.tick); H.f64(sim.score); H.f64(sim.distance);
  H.f64(sim.ship.x); H.f64(sim.ship.vx); H.u32(sim.ship.hull); H.u32(sim.ship.shield);
  H.u32(sim.spawnRng.s); H.u32(sim.aiRng.s); H.u32(sim.dropRng.s);
  H.f64(sim.worldSpeed);
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    H.u32(e.kind); H.f64(e.x); H.f64(e.z); H.f64(e.hp);
  }
  return H.h >>> 0;
}
