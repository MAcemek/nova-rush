import { createSim, step } from '../src/core/sim';
import { createBot, botDecide } from '../src/core/bot';
import { checkInvariants } from '../src/core/invariants';
import { SectorState } from '../src/core/types';
import type { InputFrame } from '../src/core/types';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : def;
}

const runs = arg('runs', 500), ticks = arg('ticks', 21600), seed0 = arg('seed', 1);
const t0 = Date.now();
const failures: string[] = [];
let totalTicks = 0, bossRuns = 0, maxSector = 0, droppedRuns = 0;
const f: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
for (let i = 0; i < runs; i++) {
  const seed = seed0 + i;
  const god = i % 4 === 0;
  const bot = createBot((seed ^ 0xabcdef) >>> 0, 0.1);
  const sim = createSim({ seed, mode: 'endless', god });
  const msgs: string[] = [];
  let enteredBoss = false;
  try {
    for (let t = 0; t < ticks && !sim.over; t++) {
      botDecide(sim, bot, f);
      step(sim, f);
      if (sim.sectorState === SectorState.Boss) enteredBoss = true;
      const v = checkInvariants(sim);
      for (let j = 0; j < v.length && msgs.length < 5; j++) msgs.push('tick ' + sim.tick + ' ' + v[j]!);
      if (msgs.length >= 5) break;
    }
  } catch (e) {
    msgs.push('exception at tick ' + sim.tick + ': ' + (e instanceof Error ? e.stack ?? e.message : String(e)));
  }
  totalTicks += sim.tick;
  if (enteredBoss) bossRuns++;
  if (sim.sectorIndex + 1 > maxSector) maxSector = sim.sectorIndex + 1;
  if (sim.dropped > 0) { droppedRuns++; msgs.push('dropped spawns: ' + sim.dropped); }
  if (msgs.length > 0) failures.push('seed ' + seed + ': ' + msgs[0]!);
}
console.log('runs', runs, 'failing runs', failures.length, 'total ticks', totalTicks, 'runs that reached a boss', bossRuns, 'max sector', maxSector,
  'runs with dropped spawns', droppedRuns, 'elapsed s', ((Date.now() - t0) / 1000).toFixed(1));
for (const m of failures.slice(0, 20)) console.log('  FAIL', m);
if (failures.length > 0) process.exitCode = 1;
