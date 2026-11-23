import { POWER, GUNSHIP } from './tuning';

export const PI = 3.141592653589793, TWO_PI = 6.283185307179586, HALF_PI = 1.5707963267948966;
export const DEG = PI / 180;
export const COS35 = 0.8191520442889918;

export function fsin(x: number): number {
  x = x - TWO_PI * Math.round(x / TWO_PI);           // [-PI, PI]
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x; // [-PI/2, PI/2]
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800))))));
}
export function fcos(x: number): number { return fsin(x + HALF_PI); }
export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

// Direction tables (unit vectors; angle measured from the -z axis, positive = toward +x)
export const SPREAD_DX: number[] = []; export const SPREAD_DZ: number[] = [];
for (const deg of POWER.spreadAnglesDeg) { SPREAD_DX.push(fsin(deg * DEG)); SPREAD_DZ.push(-fcos(deg * DEG)); }
// Gunship 3-spread rotation (cos, sin) of +-GUNSHIP.spreadDeg
export const GS_COS = fcos(GUNSHIP.spreadDeg * DEG), GS_SIN = fsin(GUNSHIP.spreadDeg * DEG);
// 12 radial unit vectors, k*30 deg
export const RADIAL_DX: number[] = []; export const RADIAL_DZ: number[] = [];
for (let k = 0; k < 12; k++) { RADIAL_DX.push(fsin(k * 30 * DEG)); RADIAL_DZ.push(fcos(k * 30 * DEG)); }
