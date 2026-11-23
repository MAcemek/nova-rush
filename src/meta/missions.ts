import { BossId, Kind } from '../core/types';
import type { Sim } from '../core/types';
import type { Profile } from './profile';

export interface RunSummary { mode: 'endless' | 'daily' | 'tutorial'; score: number; distance: number; ticks: number; kills: number[]; asteroids: number; aliens: number; nearMisses: number; perfectDodges: number; maxCombo: number; maxMultiplier: number; nukesUsed: number; bossesKilled: number; bossKills: number[]; bossesNoHit: number[]; sectorReached: number; crystals: number; maxChain: number; powerUps: number; formations: number }
export interface MissionDef { id: string; text: string; target: number; reward: number; total: boolean; metric(s: RunSummary): number }

function m(id: string, text: string, target: number, reward: number, metric: (s: RunSummary) => number, total = false): MissionDef {
  return { id, text, target, reward, total, metric };
}

export const MISSIONS: MissionDef[] = [
  m('ast40', 'Destroy 40 asteroids in one run', 40, 100, (s) => s.asteroids),
  m('mult6', 'Reach \u00d76', 6, 150, (s) => s.maxMultiplier),
  m('chain5', 'Trigger a 5-mine chain', 5, 150, (s) => s.maxChain),
  m('warden_nohit', 'Beat the Warden without being hit', 1, 200, (s) => s.bossesNoHit[BossId.Prime]!),
  m('dist3k', 'Fly 3,000 m in one run', 3000, 50, (s) => s.distance),
  m('dist8k', 'Fly 8,000 m in one run', 8000, 150, (s) => s.distance),
  m('score25k', 'Score 25,000 in one run', 25000, 100, (s) => s.score),
  m('score100k', 'Score 100,000 in one run', 100000, 200, (s) => s.score),
  m('near10', 'Get 10 close calls in one run', 10, 75, (s) => s.nearMisses),
  m('near30', 'Get 30 close calls in one run', 30, 150, (s) => s.nearMisses),
  m('dodge3', 'Perfect-dodge 3 bullets in one run', 3, 100, (s) => s.perfectDodges),
  m('combo25', 'Reach a 25 combo', 25, 100, (s) => s.maxCombo),
  m('combo50', 'Reach a 50 combo', 50, 200, (s) => s.maxCombo),
  m('aliens20', 'Destroy 20 aliens in one run', 20, 100, (s) => s.aliens),
  m('swarm30', 'Destroy 30 swarmers in one run', 30, 100, (s) => s.kills[Kind.Swarmer]!),
  m('gunship3', 'Destroy 3 gunships in one run', 3, 150, (s) => s.kills[Kind.Gunship]!),
  m('warden5', 'Destroy 5 wardens in one run', 5, 150, (s) => s.kills[Kind.Warden]!),
  m('drone10', 'Destroy 10 drones in one run', 10, 100, (s) => s.kills[Kind.Drone]!),
  m('mines15', 'Destroy 15 mines in one run', 15, 75, (s) => s.kills[Kind.Mine]!),
  m('nuke2', 'Use 2 nukes in one run', 2, 50, (s) => s.nukesUsed),
  m('boss1', 'Defeat a boss', 1, 150, (s) => s.bossesKilled),
  m('hive_nohit', 'Beat the Hive Mother without being hit', 1, 200, (s) => s.bossesNoHit[BossId.Hive]!),
  m('serpent', 'Defeat the Void Serpent', 1, 200, (s) => s.bossKills[BossId.Serpent]!),
  m('sector3', 'Reach sector 3', 3, 150, (s) => s.sectorReached),
  m('crystals30', 'Collect 30 crystals in one run', 30, 75, (s) => s.crystals),
  m('power4', 'Grab 4 power-ups in one run', 4, 75, (s) => s.powerUps),
  m('time180', 'Survive 3 minutes', 180, 100, (s) => Math.floor(s.ticks / 60)),
  m('daily', 'Play the daily challenge', 1, 50, (s) => (s.mode === 'daily' ? 1 : 0)),
  m('ast200', 'Destroy 200 asteroids (total)', 200, 150, (s) => s.asteroids, true),
  m('runs10', 'Play 10 runs (total)', 10, 100, () => 1, true),
];

export function missionById(id: string): MissionDef | undefined { return MISSIONS.find((x) => x.id === id); }

export function summarize(sim: Sim, mode: RunSummary['mode'], formations: number): RunSummary {
  const st = sim.stats, k = st.kills;
  return {
    mode, score: sim.score, distance: Math.floor(sim.distance), ticks: sim.tick, kills: k.slice(),
    asteroids: k[Kind.AsteroidS]! + k[Kind.AsteroidM]! + k[Kind.AsteroidL]!,
    aliens: k[Kind.Drone]! + k[Kind.Swarmer]! + k[Kind.Gunship]! + k[Kind.Warden]!,
    nearMisses: st.nearMisses, perfectDodges: st.perfectDodges, maxCombo: st.maxCombo, maxMultiplier: st.maxMultiplier,
    nukesUsed: st.nukesUsed, bossesKilled: st.bossesKilled, bossKills: st.bossKills.slice(), bossesNoHit: st.bossesNoHit.slice(),
    sectorReached: st.sectorReached, crystals: st.crystals, maxChain: st.maxChain, powerUps: st.powerUps, formations,
  };
}

/** Crystals for the first daily challenge run of a UTC day: base plus a streak bonus (streak capped at 10). */
export function dailyBonus(streak: number): number { return 100 + 25 * Math.min(streak, 10); }

export function ensureMissions(p: Profile, today: string): void {
  // completed missions are retired immediately so a fresh one takes the slot
  void today;
  p.missions = p.missions.filter((x) => !x.done && missionById(x.id) !== undefined);
  while (p.missions.length < 3) {
    const free = MISSIONS.filter((d) => !p.missions.some((x) => x.id === d.id));
    if (free.length === 0) break;
    const d = free[Math.floor(Math.random() * free.length)]!;
    p.missions.push({ id: d.id, progress: 0, done: false, doneDay: null });
  }
}

export function applyRun(p: Profile, s: RunSummary, today: string): MissionDef[] {
  const completed: MissionDef[] = [];
  for (const ms of p.missions) {
    if (ms.done) continue;
    const d = missionById(ms.id);
    if (!d) continue;
    const v = d.metric(s);
    ms.progress = d.total ? Math.min(d.target, ms.progress + v) : Math.max(ms.progress, Math.min(d.target, v));
    if (ms.progress >= d.target) { ms.done = true; ms.doneDay = today; p.crystals += d.reward; completed.push(d); }
  }
  return completed;
}
