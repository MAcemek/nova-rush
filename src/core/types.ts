import type { Rng } from './rng';
import type { Pool } from './pool';

export enum Kind {
  AsteroidS = 0, AsteroidM = 1, AsteroidL = 2, Mine = 3, Barrier = 4,
  Drone = 5, Swarmer = 6, Gunship = 7, Warden = 8,
  Crystal = 9, PowerUp = 10, NukePickup = 11,
  BossHive = 12, BossPrime = 13, BossSerpent = 14, ShieldDrone = 15, LaserWall = 16,
}
export const KIND_COUNT = 17;

export enum PowerType { Spread = 0, Rapid = 1, Pierce = 2, Magnet = 3, X2 = 4, Shield = 5, Jump = 6, Ram = 7, Repair = 8, Overhaul = 9 }
export const TIMED_POWER_COUNT = 8;            // indices 0..7 use sim.powerTicks[type] (Shield/Repair/Overhaul are instant, their slots stay 0)
export enum SectorState { Play = 0, Boss = 1, Warp = 2 }
export enum BossId { Hive = 0, Prime = 1, Serpent = 2 }
export enum KillCause { Bolt = 0, Beam = 1, Nuke = 2, Chain = 3, Ram = 4 }

export enum EvType {
  Kill = 0, Damage = 1, ShipHit = 2, ShipDeath = 3, Fire = 4, Beam = 5, Overheat = 6, Cooled = 7,
  NukeLaunch = 8, NukeDetonate = 9, NearMiss = 10, PerfectDodge = 11, MineBlast = 12, Chain = 13,
  Formation = 14, Pickup = 15, ComboUp = 16, ComboLost = 17, EnemyFire = 18, BossSpawn = 19,
  BossPhase = 20, BossDefeated = 21, BossTelegraph = 22, WarpStart = 23, SectorStart = 24,
  GameOver = 25, NukeGained = 26, PowerExpired = 27, Roll = 28, Jump = 29, Heal = 30,
}

export type SimMode = 'endless' | 'daily' | 'tutorial';
export type BossParam = 'hive' | 'warden' | 'serpent';

export interface SimOptions {
  seed: number;          // uint32
  mode: SimMode;
  god?: boolean;         // ship ignores all damage (debug, selftest, fuzz); never submitted
  boss?: BossParam;      // start directly in that boss fight (debug/selftest); never submitted
}

export interface InputFrame { steer: number; fire: boolean; nuke: boolean; roll: -1 | 0 | 1; jump?: boolean }

export class Entity {
  id = 0; kind: Kind = Kind.AsteroidS; alive = false; slot: number;
  x = 0; z = 0; px = 0; pz = 0; vx = 0; vz = 0; r = 1;
  hp = 1; maxHp = 1; invulnerable = false;
  age = 0; flashTicks = 0;
  a = 0; b = 0; c = 0; d = 0;
  formationId = -1; parentId = -1;
  nearMissDone = false; minEdge = 1e9; hitShip = false;
  constructor(slot: number) { this.slot = slot; }
}

export class Bolt {
  x = 0; z = 0; px = 0; pz = 0; vx = 0; vz = 0; r = 0.35; dmg = 1; alive = false; slot: number;
  constructor(slot: number) { this.slot = slot; }
}

export class Bullet {
  x = 0; z = 0; px = 0; pz = 0; vx = 0; vz = 0; r = 0.5; alive = false; slot: number; dodged = false;
  constructor(slot: number) { this.slot = slot; }
}

export class Ship {
  x = 0; z = 0; px = 0; pz = 0; vx = 0; r = 1.1;
  hull = 3; shield = 0;
  invulnTicks = 0; rollTicks = 0; rollDir = 0; rollCooldown = 0; jumpTicks = 0; jumpCooldown = 0;
  dead = false; steer = 0;
}

/** Pooled tagged struct. The meaning of a and b depends on the event type. */
export class SimEvent {
  type: EvType = EvType.Kill; kind: Kind = Kind.AsteroidS; x = 0; z = 0; a = 0; b = 0;
}

export class SpawnSpec {
  kind: Kind = Kind.AsteroidS; x = 0; dz = 0; vx = 0; vz = 0; a = 0; b = 0; c = 0; d = 0; formation = false;
}

export class SpawnBuffer {
  readonly items: SpawnSpec[] = [];
  n = 0;
  constructor(capacity: number) { for (let i = 0; i < capacity; i++) this.items.push(new SpawnSpec()); }
  clear(): void { this.n = 0; }
  /** Returns null (writes nothing) when full. Resets every field of the reused spec. */
  add(kind: Kind, x: number, dz: number, vx = 0, vz = 0, a = 0, b = 0): SpawnSpec | null {
    if (this.n >= this.items.length) return null;
    const s = this.items[this.n++]!;
    s.kind = kind; s.x = x; s.dz = dz; s.vx = vx; s.vz = vz; s.a = a; s.b = b; s.c = 0; s.d = 0; s.formation = false;
    return s;
  }
}

export class RunStats {
  kills: number[] = new Array<number>(KIND_COUNT).fill(0);
  nearMisses = 0; perfectDodges = 0; maxCombo = 0; nukesUsed = 0; bossesKilled = 0;
  sectorReached = 1; ticks = 0; crystals = 0; maxChain = 0; hitsTaken = 0;
  bossesNoHit: number[] = [0, 0, 0];   // by BossId: bosses beaten without a hit during that fight
  powerUps = 0; maxMultiplier = 1;
  bossKills: number[] = [0, 0, 0];     // by BossId: bosses defeated this run
}

export interface DirectorState {
  budget: number; pending: number; cooldown: number; giftTimer: number;
  committed: number; rejectedBuilds: number; failedAll: number;
  tutorialCursor: number;
}

export interface BossState {
  active: boolean; id: BossId; phase: number; settled: boolean; scale: number;
  timer: number; wallTimer: number; telegraph: number; gapCount: number; gap0: number; gap1: number;
  histX: Float64Array; histZ: Float64Array; histIdx: number; headIndex: number;
  hpTotal: number; maxHpTotal: number; hitDuringFight: boolean; mainSlot: number;
}

export interface Sim {
  readonly opts: SimOptions;
  readonly seed: number;
  readonly mode: SimMode;
  readonly god: boolean;
  tick: number; over: boolean;
  score: number; distance: number; distancePoints: number; worldSpeed: number;
  ship: Ship;
  entities: Pool<Entity>; bolts: Pool<Bolt>; bullets: Pool<Bullet>;
  spawnRng: Rng; aiRng: Rng; dropRng: Rng;
  nextId: number; dropped: number;
  events: SimEvent[]; eventPool: SimEvent[]; eventPoolIdx: number; eventsDropped: number;
  heat: number; overheatTicks: number; fireCooldown: number; wing: number; beamTimer: number;
  powerTicks: number[];              // length TIMED_POWER_COUNT
  nukes: number; nukeMeter: number; nukeFlight: number; nukeLaunchX: number; nukeDue: boolean;
  combo: number; comboTimer: number; multiplier: number;
  formAlive: Int32Array; formKilled: Int32Array; formTotal: Int32Array; formBroken: Uint8Array; nextFormation: number;
  chainSlot: Int32Array; chainDepth: Int32Array; chainHead: number; chainTail: number;
  chainLen: number; chainPoints: number; chainX: number; chainZ: number;
  sectorIndex: number; ticksInSector: number; sectorState: SectorState; warpTicks: number;
  director: DirectorState; spawnBuf: SpawnBuffer;
  boss: BossState;
  stats: RunStats;
}
