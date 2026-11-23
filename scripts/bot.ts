import { createSim, step } from '../src/core/sim';
import { createBot, botDecide } from '../src/core/bot';
import type { InputFrame } from '../src/core/types';
import { ReplayRecorder } from '../src/core/replay';
import { buildPayload } from '../src/api/schema';

function strArg(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : null;
}

async function submitOne(baseUrl: string, name: string): Promise<void> {
  const sim = createSim({ seed: 777, mode: 'endless' });
  const rec = new ReplayRecorder();
  const bot = createBot();
  const f: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
  for (let t = 0; t < 108000 && !sim.over; t++) { botDecide(sim, bot, f); rec.push(f); step(sim, f); }
  const payload = buildPayload(sim, rec, 'endless', null, name);
  const res = await fetch(baseUrl.replace(/\/$/, '') + '/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const text = await res.text();
  console.log(text);
  if (res.status !== 200) process.exitCode = 1;
}

function arg(name: string, def: number): number {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : def;
}
function pct(sorted: number[], p: number): number { return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100))]!; }

async function main(): Promise<void> {
  const sub = strArg('submit');
  if (sub !== null) { await submitOne(sub, strArg('name') ?? 'BOTPILOT'); return; }
  const runs = arg('runs', 200), seed0 = arg('seed', 1), maxTicks = arg('max-ticks', 108000);
  const f: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };
  const surv: number[] = [], sect: number[] = [], scores: number[] = [], bosses: number[] = [];
  for (let i = 0; i < runs; i++) {
    const sim = createSim({ seed: seed0 + i, mode: 'endless' });
    const bot = createBot();
    for (let t = 0; t < maxTicks && !sim.over; t++) { botDecide(sim, bot, f); step(sim, f); }
    surv.push(sim.tick / 60); sect.push(sim.stats.sectorReached); scores.push(sim.score); bosses.push(sim.stats.bossesKilled);
  }
  const s = surv.slice().sort((a, b) => a - b), sc = sect.slice().sort((a, b) => a - b);
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
  const median = pct(s, 50), p10 = pct(s, 10), p90 = pct(s, 90), p90sec = pct(sc, 90);
  const r2 = sect.filter((x) => x >= 2).length / runs * 100, r3 = sect.filter((x) => x >= 3).length / runs * 100;
  console.log('runs ' + runs);
  console.log('survival s: median ' + median.toFixed(1) + '  p10 ' + p10.toFixed(1) + '  p90 ' + p90.toFixed(1));
  console.log('p90 sectorReached ' + p90sec + '  reach sector2 ' + r2.toFixed(0) + '%  reach sector3 ' + r3.toFixed(0) + '%');
  console.log('mean score ' + mean(scores).toFixed(0) + '  mean bosses killed ' + mean(bosses).toFixed(2));
  const inTarget = median >= 100 && median <= 160 && p90sec >= 3;
  console.log(inTarget ? 'IN TARGET' : 'OUT OF TARGET');
  if (!inTarget) process.exitCode = 1;
}
void main();
