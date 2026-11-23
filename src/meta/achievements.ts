import { BossId } from '../core/types';
import type { Profile } from './profile';
import type { RunSummary } from './missions';

export interface Achievement { id: string; name: string; desc: string; check(s: RunSummary, p: Profile): boolean }

function a(id: string, name: string, desc: string, check: (s: RunSummary, p: Profile) => boolean): Achievement { return { id, name, desc, check }; }

export const ACHIEVEMENTS: Achievement[] = [
  a('first_run', 'First Flight', 'Finish a run', () => true),
  a('score10k', 'Getting Warm', 'Score 10,000 in a run', (s) => s.score >= 10000),
  a('score50k', 'Hot Streak', 'Score 50,000 in a run', (s) => s.score >= 50000),
  a('score250k', 'Legend', 'Score 250,000 in a run', (s) => s.score >= 250000),
  a('dist5k', 'Long Haul', 'Fly 5,000 m in a run', (s) => s.distance >= 5000),
  a('dist15k', 'Deep Space', 'Fly 15,000 m in a run', (s) => s.distance >= 15000),
  a('combo20', 'Combo Starter', 'Reach a 20 combo', (s) => s.maxCombo >= 20),
  a('combo60', 'Combo Master', 'Reach a 60 combo', (s) => s.maxCombo >= 60),
  a('mult8', 'Max Multiplier', 'Reach x8', (s) => s.maxMultiplier >= 8),
  a('chain4', 'Chain Reaction', 'Trigger a 4-mine chain', (s) => s.maxChain >= 4),
  a('chain8', 'Chain Lightning', 'Trigger an 8-mine chain', (s) => s.maxChain >= 8),
  a('near20', 'Close Shaves', 'Get 20 close calls in a run', (s) => s.nearMisses >= 20),
  a('dodge5', 'Untouchable', 'Perfect-dodge 5 bullets in a run', (s) => s.perfectDodges >= 5),
  a('boss_hive', 'Hive Breaker', 'Defeat the Hive Mother', (s) => s.bossKills[BossId.Hive]! >= 1),
  a('boss_prime', 'Warden Slayer', 'Defeat Warden Prime', (s) => s.bossKills[BossId.Prime]! >= 1),
  a('boss_serpent', 'Serpent Slayer', 'Defeat the Void Serpent', (s) => s.bossKills[BossId.Serpent]! >= 1),
  a('nukes3', 'Nuclear Option', 'Use 3 nukes in a run', (s) => s.nukesUsed >= 3),
  a('sector5', 'Edge of Everything', 'Reach sector 5', (s) => s.sectorReached >= 5),
  a('crystals500', 'Hoarder', 'Hold 500 crystals', (_s, p) => p.crystals >= 500),
  a('streak3', 'Regular', 'Reach a 3-day daily streak', (_s, p) => p.daily.streak >= 3),
  a('runs50', 'Veteran', 'Play 50 runs', (_s, p) => p.lifetime.runs >= 50),
  a('buy_cosmetic', 'Fashionista', 'Buy a cosmetic', () => false),
  a('formation', 'Formation Breaker', 'Destroy a whole formation', (s) => s.formations >= 1),
  a('cadet', 'Cadet', 'Complete the tutorial', () => false),
];

export function grantAchievement(p: Profile, id: string): boolean {
  if (p.achievements.includes(id) || !ACHIEVEMENTS.some((x) => x.id === id)) return false;
  p.achievements.push(id);
  return true;
}

export function checkAchievements(p: Profile, s: RunSummary | null): string[] {
  const out: string[] = [];
  if (!s) return out;
  for (const ac of ACHIEVEMENTS) {
    if (p.achievements.includes(ac.id)) continue;
    if (ac.check(s, p)) { p.achievements.push(ac.id); out.push(ac.id); }
  }
  return out;
}

export function achievementName(id: string): string { return ACHIEVEMENTS.find((x) => x.id === id)?.name ?? id; }
