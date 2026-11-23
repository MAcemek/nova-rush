import { describe, it, expect } from 'vitest';
import { defaultProfile, ProfileSchema } from '../src/meta/profile';
import { MISSIONS, applyRun, ensureMissions, summarize } from '../src/meta/missions';
import { ACHIEVEMENTS, checkAchievements, grantAchievement } from '../src/meta/achievements';
import { COSMETICS, buy, equip } from '../src/meta/cosmetics';
import { runSim } from './helpers';

describe('meta', () => {
  it('default profile parses and has tables of the right size', () => {
    const p = defaultProfile();
    expect(ProfileSchema.safeParse(p).success).toBe(true);
    expect(MISSIONS.length).toBe(30);
    expect(ACHIEVEMENTS.length).toBe(24);
    expect(COSMETICS.length).toBe(27);
  });
  it('rejects an invalid profile', () => {
    expect(ProfileSchema.safeParse({ v: 2 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ v: 1, crystals: -1 }).success).toBe(false);
  });
  it('missions fill to 3 and complete with rewards', () => {
    const p = defaultProfile();
    ensureMissions(p, '2026-03-10');
    expect(p.missions.length).toBe(3);
    expect(new Set(p.missions.map((m) => m.id)).size).toBe(3);
    const sim = runSim(5, 3000, 'bot');
    const s = summarize(sim, 'endless', 0);
    p.missions = [{ id: 'runs10', progress: 9, done: false, doneDay: null }, { id: 'score25k', progress: 0, done: false, doneDay: null }, { id: 'dist3k', progress: 0, done: false, doneDay: null }];
    const done = applyRun(p, s, '2026-03-10');
    expect(done.some((d) => d.id === 'runs10')).toBe(true);
    expect(p.crystals).toBeGreaterThanOrEqual(100);
    ensureMissions(p, '2026-03-11');
    expect(p.missions.every((m) => !m.done)).toBe(true);
    expect(p.missions.length).toBe(3);
  });
  it('achievements are granted once', () => {
    const p = defaultProfile();
    const s = summarize(runSim(5, 600, 'bot'), 'endless', 0);
    expect(checkAchievements(p, s)).toContain('first_run');
    expect(checkAchievements(p, s)).not.toContain('first_run');
    expect(grantAchievement(p, 'cadet')).toBe(true);
    expect(grantAchievement(p, 'cadet')).toBe(false);
  });
  it('cosmetics buy and equip', () => {
    const p = defaultProfile();
    expect(buy(p, 'paint.crimson')).toBe(false);
    p.crystals = 200;
    expect(buy(p, 'paint.crimson')).toBe(true);
    expect(p.crystals).toBe(50);
    expect(p.cosmetics.paint).toBe('paint.crimson');
    expect(buy(p, 'paint.crimson')).toBe(false);
    expect(equip(p, 'paint.white')).toBe(true);
    expect(equip(p, 'hull.halo')).toBe(false);
  });
});
