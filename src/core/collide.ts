// swept circle test in the TARGET's frame (prevents tunnelling at any speed)
export function sweptHit(ax: number, az: number, bx: number, bz: number, r: number): boolean {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? -(ax * dx + az * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t, pz = az + dz * t;
  return px * px + pz * pz <= r * r;
}
export function sweptMinDist(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? -(ax * dx + az * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t, pz = az + dz * t;
  return Math.sqrt(px * px + pz * pz);
}
