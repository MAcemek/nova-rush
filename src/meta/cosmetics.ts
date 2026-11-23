import type { Profile } from './profile';

export type HullId = 'arrow' | 'manta' | 'dart' | 'hammer' | 'wasp' | 'halo';
export type CosmeticKind = 'hull' | 'paint' | 'laser' | 'trail';
export interface Cosmetic { id: string; kind: CosmeticKind; name: string; price: number; color: number; hull?: HullId }

function hull(id: HullId, name: string, price: number): Cosmetic { return { id: 'hull.' + id, kind: 'hull', name, price, color: 0, hull: id }; }
function c(kind: CosmeticKind, key: string, name: string, color: number, price: number): Cosmetic { return { id: kind + '.' + key, kind, name, price, color }; }

export const COSMETICS: Cosmetic[] = [
  hull('arrow', 'Arrow', 0), hull('manta', 'Manta', 300), hull('dart', 'Dart', 500), hull('hammer', 'Hammer', 800), hull('wasp', 'Wasp', 1200), hull('halo', 'Halo', 2000),
  c('paint', 'white', 'White', 0xe8eef7, 0), c('paint', 'crimson', 'Crimson', 0xd02a3a, 150), c('paint', 'cobalt', 'Cobalt', 0x2a5ad0, 150),
  c('paint', 'emerald', 'Emerald', 0x2ad07a, 200), c('paint', 'gold', 'Gold', 0xd0a52a, 300), c('paint', 'violet', 'Violet', 0x8a3dd0, 300),
  c('paint', 'carbon', 'Carbon', 0x2a2d33, 400), c('paint', 'coral', 'Coral', 0xff7a6a, 400), c('paint', 'ice', 'Ice', 0xbff6ff, 500), c('paint', 'sunset', 'Sunset', 0xff9a2e, 600),
  c('laser', 'cyan', 'Cyan', 0x5ff4ff, 0), c('laser', 'lime', 'Lime', 0x9aff5a, 250), c('laser', 'gold', 'Gold', 0xffd54a, 400),
  c('laser', 'white', 'White', 0xffffff, 400), c('laser', 'orange', 'Orange', 0xff9a2e, 600), c('laser', 'blue', 'Blue', 0x5a8aff, 800),
  c('trail', 'cyan', 'Cyan', 0x5ff4ff, 0), c('trail', 'gold', 'Gold', 0xffd54a, 200), c('trail', 'lime', 'Lime', 0x9aff5a, 300),
  c('trail', 'violet', 'Violet', 0xb38aff, 400), c('trail', 'red', 'Red', 0xff4a4a, 500),
];

export function byId(id: string): Cosmetic | undefined { return COSMETICS.find((x) => x.id === id); }

export function equip(p: Profile, id: string): boolean {
  const cos = byId(id);
  if (!cos || !p.cosmetics.owned.includes(id)) return false;
  p.cosmetics[cos.kind] = id;
  return true;
}

export function buy(p: Profile, id: string): boolean {
  const cos = byId(id);
  if (!cos || p.cosmetics.owned.includes(id) || p.crystals < cos.price) return false;
  p.crystals -= cos.price;
  p.cosmetics.owned.push(id);
  p.cosmetics[cos.kind] = id;
  return true;
}
