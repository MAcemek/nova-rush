import { KIND_BOSS } from './tuning';
import { SectorState } from './types';
import type { Sim } from './types';

const EMPTY: string[] = Object.freeze([]) as unknown as string[];
const prev = new WeakMap<Sim, { score: number; tick: number }>();

function fin(v: number): boolean { return v === v && v - v === 0; }

export function checkInvariants(sim: Sim): string[] {
  let out: string[] | null = null;
  const bad = (m: string): void => { if (out === null) out = []; out.push(m); };
  const items = sim.entities.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    if (!fin(e.x) || !fin(e.z) || !fin(e.vx) || !fin(e.vz) || Math.abs(e.x) > 40) bad('[finite] entity slot ' + i + ' kind ' + e.kind + ' x=' + e.x + ' z=' + e.z);
    if (e.hp <= 0 && !e.invulnerable) bad('[hp] entity slot ' + i + ' kind ' + e.kind + ' hp=' + e.hp);
    if (KIND_BOSS[e.kind]! && sim.sectorState !== SectorState.Boss) bad('[boss] boss entity alive outside boss state, kind ' + e.kind);
  }
  const bolts = sim.bolts.items;
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i]!;
    if (!b.alive) continue;
    if (!fin(b.x) || !fin(b.z) || !fin(b.vx) || !fin(b.vz) || Math.abs(b.x) > 40) bad('[finite] bolt slot ' + i);
  }
  const bullets = sim.bullets.items;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i]!;
    if (!b.alive) continue;
    if (!fin(b.x) || !fin(b.z) || !fin(b.vx) || !fin(b.vz) || Math.abs(b.x) > 40) bad('[finite] bullet slot ' + i);
  }
  const s = sim.ship;
  if (!fin(s.x) || Math.abs(s.x) > 14) bad('[shipx] ship.x=' + s.x);
  const pools: [string, { countAlive(): number; capacity: number; freeCount: number; aliveCount: number }][] =
    [['entities', sim.entities], ['bolts', sim.bolts], ['bullets', sim.bullets]];
  for (let i = 0; i < pools.length; i++) {
    const p = pools[i]![1];
    const c = p.countAlive();
    if (c !== p.capacity - p.freeCount) bad('[pool] ' + pools[i]![0] + ' alive ' + c + ' != capacity-free ' + (p.capacity - p.freeCount));
    if (p.aliveCount !== c) bad('[pool] ' + pools[i]![0] + ' aliveCount ' + p.aliveCount + ' != ' + c);
  }
  let pv = prev.get(sim);
  if (!pv) { pv = { score: 0, tick: -1 }; prev.set(sim, pv); }
  if (!Number.isInteger(sim.score) || sim.score < pv.score) bad('[score] score ' + sim.score + ' prev ' + pv.score);
  if (!(sim.tick > pv.tick || (sim.over && sim.tick === pv.tick))) bad('[tick] tick ' + sim.tick + ' prev ' + pv.tick);
  pv.score = sim.score; pv.tick = sim.tick;
  if (!Number.isInteger(sim.combo) || sim.combo < 0) bad('[combo] combo ' + sim.combo);
  if (!Number.isInteger(sim.multiplier) || sim.multiplier < 1 || sim.multiplier > 8) bad('[combo] multiplier ' + sim.multiplier);
  if (!Number.isInteger(s.hull) || s.hull < 0 || s.hull > 3) bad('[hull] hull ' + s.hull);
  if (!(sim.heat >= 0 && sim.heat <= 100)) bad('[heat] heat ' + sim.heat);
  if (!Number.isInteger(sim.nukes) || sim.nukes < 0 || sim.nukes > 3) bad('[nukes] nukes ' + sim.nukes);
  return out === null ? EMPTY : out;
}
