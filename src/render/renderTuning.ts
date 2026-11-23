import { Kind } from '../core/types';

export const CAMERA = { offsetY: 5.5, offsetZ: 11, lookZ: -30, lookXFactor: 0.6, omega: 9, fovMin: 68, fovMax: 84, rollFactor: 0.25, traumaDecay: 1.5, shakeMaxOffset: 0.6, shakeMaxRoll: 0.05, shakeFreq: 18, near: 0.1, far: 1500 };
export const STARS = { count: 3000, spreadX: 260, spreadY: 160, nearZ: 30, farZ: -900, baseLen: 0.6, lenPerSpeed: 0.06 };
export const QUALITY_PIXEL_RATIO = { low: 1.5, medium: 1.5, high: 2 };
export const HITSTOP_MS = { asteroidL: 30, gunship: 40, bossPhase: 90, nuke: 120, playerHit: 80 };
export const PARTICLES = { capAdditive: 60000, capNormal: 30000, qualityCap: { low: 15000, medium: 30000, high: 60000 }, gravity: -9, sparkSpeed: [8, 26], sparkLife: [0.35, 0.9], sparkSize: [0.25, 0.6], smokeLife: [0.7, 1.2], smokeSize: [2.0, 3.5], flashLife: 0.12, maxSpawnPerFrame: 3000 };
export const SHARDS = { cap: 512, life: 1.2, speed: [5, 14], spin: [3, 10] };
export const RINGS = { cap: 32, life: 0.45 };
export const DISTORT = { slots: 4, life: 0.5, maxRadius: 0.25, strength: 0.03 };
export const POST = { bloomStrength: 1.0, bloomRadius: 0.4, bloomThreshold: 0.8, caBase: 0.001, caTrauma: 0.004, caSpeed: 0.002, caSpeedAt: 100, vignette: 0.35, lowHullRed: 0.6, flashMax: 1.0, flashMaxSafe: 0.35, flashMinGapMsSafe: 250, nukeFlashMs: 180 };
export const SHIPFX = { bankMaxDeg: 35, bankRate: 12, yawMaxDeg: 8, trailPoints: 24, trailSeconds: 0.35, trailWidth: 0.12, wingTip: [1.3, 0, 0.6] as const, engineOffsets: [[-0.45, 0, 1.4], [0.45, 0, 1.4]] as const };
export interface ExplosionPreset { sparks: number; shards: number; color: number; flash: number; ring: number; smoke: number; distortion: boolean; trauma: number; sfx: number }
export const EXPLOSIONS: Record<'asteroidS'|'asteroidM'|'asteroidL'|'mine'|'drone'|'swarmer'|'gunship'|'warden'|'shieldDrone'|'serpentSeg'|'boss'|'playerHit'|'nuke', ExplosionPreset> = {
  asteroidS:  { sparks: 60,  shards: 6,  color: 0xb8a690, flash: 3,  ring: 4,  smoke: 4,  distortion: false, trauma: 0.05, sfx: 0.2 },
  asteroidM:  { sparks: 120, shards: 10, color: 0xb09a80, flash: 5,  ring: 7,  smoke: 8,  distortion: false, trauma: 0.12, sfx: 0.45 },
  asteroidL:  { sparks: 220, shards: 18, color: 0xa08a70, flash: 8,  ring: 11, smoke: 14, distortion: true,  trauma: 0.3,  sfx: 0.8 },
  mine:       { sparks: 180, shards: 8,  color: 0xff5a3a, flash: 9,  ring: 14, smoke: 10, distortion: true,  trauma: 0.25, sfx: 0.7 },
  drone:      { sparks: 120, shards: 10, color: 0xff3df2, flash: 5,  ring: 7,  smoke: 6,  distortion: false, trauma: 0.12, sfx: 0.45 },
  swarmer:    { sparks: 80,  shards: 6,  color: 0xffe14a, flash: 4,  ring: 5,  smoke: 4,  distortion: false, trauma: 0.08, sfx: 0.3 },
  gunship:    { sparks: 300, shards: 20, color: 0xff9a2e, flash: 10, ring: 14, smoke: 16, distortion: true,  trauma: 0.4,  sfx: 1.0 },
  warden:     { sparks: 200, shards: 14, color: 0x3df6ff, flash: 7,  ring: 10, smoke: 10, distortion: false, trauma: 0.2,  sfx: 0.65 },
  shieldDrone:{ sparks: 100, shards: 8,  color: 0x3df6ff, flash: 5,  ring: 6,  smoke: 5,  distortion: false, trauma: 0.1,  sfx: 0.4 },
  serpentSeg: { sparks: 150, shards: 10, color: 0xb06bff, flash: 6,  ring: 8,  smoke: 8,  distortion: false, trauma: 0.15, sfx: 0.5 },
  boss:       { sparks: 400, shards: 24, color: 0xffffff, flash: 18, ring: 30, smoke: 24, distortion: true,  trauma: 0.8,  sfx: 1.5 },
  playerHit:  { sparks: 120, shards: 6,  color: 0xff4040, flash: 4,  ring: 5,  smoke: 4,  distortion: false, trauma: 0.5,  sfx: 0.4 },
  nuke:       { sparks: 400, shards: 0,  color: 0xfff1c0, flash: 30, ring: 55, smoke: 24, distortion: true, trauma: 0.8,  sfx: 1.5 },
};
export function presetForKind(k: Kind): ExplosionPreset {
  switch (k) {
    case Kind.AsteroidS: return EXPLOSIONS.asteroidS;
    case Kind.AsteroidM: return EXPLOSIONS.asteroidM;
    case Kind.AsteroidL: return EXPLOSIONS.asteroidL;
    case Kind.Mine: return EXPLOSIONS.mine;
    case Kind.Drone: return EXPLOSIONS.drone;
    case Kind.Swarmer: return EXPLOSIONS.swarmer;
    case Kind.Gunship: return EXPLOSIONS.gunship;
    case Kind.Warden: return EXPLOSIONS.warden;
    case Kind.ShieldDrone: return EXPLOSIONS.shieldDrone;
    case Kind.BossSerpent: return EXPLOSIONS.serpentSeg;
    case Kind.BossHive: case Kind.BossPrime: return EXPLOSIONS.boss;
    default: return EXPLOSIONS.asteroidS;
  }
}
export interface BiomeVisual { skyA: number; skyB: number; skyC: number; grid: number; dust: number; planets: [{ color: number; size: number; pos: [number, number, number] }, { color: number; size: number; pos: [number, number, number] }] }
export const BIOMES: BiomeVisual[] = [
  { skyA: 0x020818, skyB: 0x0a3a7a, skyC: 0x29c6ff, grid: 0x2bd9ff, dust: 0x9fe8ff, planets: [{ color: 0x3a7bd5, size: 90, pos: [-320, 90, -950] }, { color: 0x9fe8ff, size: 30, pos: [260, 140, -1000] }] },
  { skyA: 0x140303, skyB: 0x5a1405, skyC: 0xff6a1a, grid: 0xff7a2e, dust: 0xffb38a, planets: [{ color: 0xff5a1a, size: 320, pos: [0, 40, -1150] }, { color: 0x7a2a1a, size: 40, pos: [300, 150, -900] }] },
  { skyA: 0x061418, skyB: 0x2a6a70, skyC: 0xe8ffff, grid: 0x9ff6ff, dust: 0xffffff, planets: [{ color: 0xe8ffff, size: 120, pos: [280, 120, -1000] }, { color: 0x5ac8c8, size: 45, pos: [-300, 80, -950] }] },
  { skyA: 0x050f05, skyB: 0x1a5a1a, skyC: 0xff3df2, grid: 0x7aff5a, dust: 0xc0ff9a, planets: [{ color: 0x5aff7a, size: 100, pos: [-280, 110, -980] }, { color: 0xff3df2, size: 50, pos: [300, 60, -900] }] },
  { skyA: 0x000000, skyB: 0x12061f, skyC: 0x8a3dff, grid: 0x8a3dff, dust: 0xb38aff, planets: [{ color: 0x2a0a4a, size: 150, pos: [0, 160, -1100] }, { color: 0x8a3dff, size: 25, pos: [-260, 40, -900] }] },
];
export const ENV = { skyRadius: 1300, dustCount: 1500, gridY: -3, gridWidth: 40, gridLength: 600, gridAlpha: 0.15, crossfadeSec: 2 };
