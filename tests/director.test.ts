import { describe, it, expect } from 'vitest';
import { createSim, step } from '../src/core/sim';
import { createBot, botDecide } from '../src/core/bot';
import { checkInvariants } from '../src/core/invariants';
import { SectorState } from '../src/core/types';
import type { BossParam, InputFrame } from '../src/core/types';

describe('director', () => {
  it('16 seeds x 5 min god bot: no pool overflow, invariants clean', () => {
    const f: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
    for (let seed = 1; seed <= 16; seed++) {
      const sim = createSim({ seed, mode: 'endless', god: true });
      const bot = createBot();
      for (let t = 0; t < 18000; t++) {
        botDecide(sim, bot, f); step(sim, f);
        if (t % 600 === 599) { const v = checkInvariants(sim); if (v.length) throw new Error('seed ' + seed + ' tick ' + t + ' ' + v.join(';')); }
      }
      expect(sim.dropped).toBe(0);
    }
  });

  it('bosses: 2 seeds each die in <= 12000 ticks and the sector advances', () => {
    const f: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
    for (const boss of ['hive', 'warden', 'serpent'] as BossParam[]) {
      for (let seed = 1; seed <= 2; seed++) {
        const sim = createSim({ seed, mode: 'endless', god: true, boss });
        const bot = createBot();
        let sawWarp = false, sawPlay = false;
        for (let t = 0; t < 12000; t++) {
          botDecide(sim, bot, f); step(sim, f);
          const v = checkInvariants(sim);
          if (v.length) throw new Error(boss + ' seed ' + seed + ' tick ' + t + ' ' + v.join(';'));
          if (sim.sectorState === SectorState.Warp) sawWarp = true;
          if (sawWarp && sim.sectorState === SectorState.Play) { sawPlay = true; break; }
        }
        expect(sim.stats.bossesKilled, boss + ' ' + seed).toBe(1);
        expect(sawWarp && sawPlay, boss + ' ' + seed + ' warp->play').toBe(true);
        expect(sim.dropped).toBe(0);
      }
    }
  });
});
