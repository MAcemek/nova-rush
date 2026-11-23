import { Kind } from './types';

export const SIM_VERSION = 1;
export const DT = 1 / 60;

export const WORLD = {
  spawnZ: -260, cullZ: 25, cullX: 40, boltCullZ: -280, bulletCullBackZ: -280,
  halfWidth: 14, speedStart: 42, speedStep: 1.3, speedStepTicks: 600, speedMax: 115,
};
export const CAP = { entities: 1024, bolts: 256, bullets: 512, events: 2048, spawnBuf: 160, formations: 64 };

export const SHIP = {
  radius: 1.1, maxSpeed: 30, accel: 220, friction: 260, hull: 3, hitInvulnTicks: 90,
  rollTicks: 24, rollSpeed: 18, rollCooldown: 90, perfectDodgeDist: 1.5, perfectDodgePoints: 250,
  tutorialMinHull: 1, jumpTicks: 40, jumpCooldown: 75, bossHeal: 1,
};
export const LASER = {
  shotTicks: 6, rapidShotTicks: 3, wingX: 0.9, spawnZ: -1, speed: 220, radius: 0.35, damage: 1,
  heatPerShot: 5, coolPerTick: 35 / 60, overheatTicks: 60, heatMax: 100,
};
export const POWER = {
  duration: 600, spreadAnglesDeg: [-12, -6, 0, 6, 12],
  pierceHalfWidth: 0.6, pierceInterval: 10, pierceDamage: 1,
  magnetRadius: 18, magnetAccel: 150, magnetMaxSpeed: 60,
  // indexed by PowerType 0..9, then NukePickup last. Repair/Overhaul weights are the base; the director boosts them when hull is low and zeroes them at full hull.
  giftWeights: [3, 3, 2, 2, 3, 2, 2, 2, 4, 1, 1],
  repairBoostLow: 3,
};
export const NUKE = { start: 1, max: 3, meterPerKill: 4, meterMax: 100, flightTicks: 30, offsetZ: -70, radius: 55, bossFrac: 0.2 };
export const SCORE = {
  comboWindow: 120, comboPerStep: 5, multMax: 8, nearMissDist: 0.9, nearMissPoints: 75,
  distancePerPoint: 10, formationBonus: 1000, chainBase: 80, chainPerLink: 40,
  crystalPoints: 25, pickupPoints: 100, bossBase: 5000,
};

// Per-kind tables, indexed by Kind (length KIND_COUNT = 17)
export const KIND_HP     = [1, 3, 8, 1, 1, 2, 1, 12, 6, 1, 1, 1, 300, 360, 30, 6, 1];
export const KIND_RADIUS = [1.2, 2.2, 3.6, 1.0, 1.0, 1.3, 1.0, 2.6, 2.0, 0.8, 1.0, 1.0, 6.0, 5.0, 1.8, 1.3, 1.0];
export const KIND_POINTS = [50, 120, 300, 80, 0, 200, 100, 800, 600, 25, 100, 100, 0, 0, 0, 200, 0];
export const KIND_HAZARD = [true, true, true, true, true, true, true, true, true, false, false, false, true, true, true, true, true];
export const KIND_BOSS   = [false, false, false, false, false, false, false, false, false, false, false, false, true, true, true, true, false];
export const KIND_INVULN = [false, false, false, false, true, false, false, false, false, false, false, false, false, false, false, false, true];
export const KIND_ALIEN  = [false, false, false, false, false, true, true, true, true, false, false, false, false, false, false, false, false];
export function isPickup(k: Kind): boolean { return k === Kind.Crystal || k === Kind.PowerUp || k === Kind.NukePickup; }

export const ASTEROID = { driftMax: 3 };
export const MINE = { blastRadius: 7 };
export const BARRIER = { spacing: 1.6, minGap: 5.5 };
export const DROPS = { alienCrystal: 0.3, asteroidCrystal: 0.15 };
export const HIT_FLASH_TICKS = 2;

export const BULLET = { speed: 30, radius: 0.5, leadMax: 0.3, fireZMin: -150, fireZMax: -15 };
export const DRONE = { amp: 4, freq: 0.05, vz: -12, fireInterval: 90 };
export const SWARMER = { diveZ: -60, diveVz: 10, spacing: 2.4 };
export const GUNSHIP = { spawnX: 22, entrySpeed: 12, strafeSpeed: 8, strafeLimit: 10, vz: -30, lingerTicks: 420, fireInterval: 70, spreadDeg: 10 };
export const WARDEN = { vz: -14, swayAmp: 3, swayFreq: 0.02, swingAmp: 1.9, swingRate: 0.035, fireInterval: 120 };

export const DIRECTOR = {
  budgetBase: 6,        // TUNE
  budgetPerD: 4.5,      // TUNE
  budgetCap: 40, bigCost: 15, bigGap: 72, giftMin: 1200, giftMax: 1800, rebuilds: 8, cycleBoost: 0.15,
  startDelay: 90,       // ticks before the first pattern of a sector
};
export const SECTOR = { playTicks: 4500, warpTicks: 120 };
export const BIOME_NAMES = ['Azure Nebula', 'Red Giant', 'Ice Field', 'Alien Hive', 'The Void'];
export const BOSS_NAMES = ['HIVE MOTHER', 'WARDEN PRIME', 'VOID SERPENT'];

export const BOSS = {
  holdZ: -90, entrySpeed: 60, phase2: 0.6, phase3: 0.3, cycleScale: 0.25, warningTicks: 150,
  dropCrystals: 3, dropCrystalValue: 10, fireZ: -90,
};
export const HIVE = {
  hp: 300, radius: 6, coreOpenTicks: 120, corePeriod: 300, closedMul: 0.25, swayAmp: 6, swayFreq: 0.01,
  swarmInterval: [240, 180, 150], swarmCount: 5, spreadInterval: 90, burstInterval: 150,
};
export const PRIME = {
  hp: 360, radius: 5, droneCount: 4, droneOrbit: 8, droneOrbitRate: 0.03, shieldedMul: 0.25,
  wallInterval: [300, 240, 180], telegraphTicks: 60, gapWidth: 6.5, wallZ: -84, aimedInterval: 100,
  swayAmp: 5, swayFreq: 0.012,
};
export const SERPENT = {
  segments: 12, historyDelay: 8, histSize: 128, ampX: 9, freqX: 0.008, ampZ: 12, freqZ: 0.013,
  headFireInterval: 60, segFireInterval: 120, burstInterval: 120,
};
export const PASS = { sliceTicks: 3, reachFrac: 0.8, margin: 0.3, minWidth: 0.01, exitZ: 5 };
export const TUTORIAL = { endTick: 1500 };

export const BOT = {
  lookaheadTicks: 60,   // TUNE (bot only)
  laneCount: 57,        // candidate x positions from -14 to 14 step 0.5
  dangerMargin: 0.6,    // extra clearance the bot wants beyond r + ship radius
  nukeThreat: 4,        // nuke when >= this many hazards inside z∈[-40, 0] and |dx|<6
  rollBulletTicks: 8,   // roll when a bullet will reach the ship within this many ticks and is within 1.6
  heatStopFire: 92,     // stop firing at this heat (resume at 60)
  heatResume: 60,
};
