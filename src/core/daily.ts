import { Hasher } from './hash';
export function dailySeed(day: string): number {
  const h = new Hasher();
  for (let i = 0; i < day.length; i++) h.u32(day.charCodeAt(i));
  let x = h.h;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return x >>> 0;
}
