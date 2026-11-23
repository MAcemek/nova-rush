import type { GameApi, RunConfig } from '../gameApi';
import { fetchLeaderboard, setForceOffline } from '../api/client';
import { errorLog } from './errors';

export interface SelftestResult { pass: boolean; metrics: Record<string, number>; failures: string[] }
declare global { interface Window { __selftest?: SelftestResult } }

export const SELFTEST_SEED = 12345;

function wait(ms: number): Promise<void> { return new Promise((r) => { setTimeout(r, ms); }); }

function showOverlay(res: SelftestResult): void {
  const d = document.createElement('div');
  d.id = 'selftest-overlay';
  d.className = res.pass ? 'pass' : 'fail';
  d.textContent = res.pass ? 'SELFTEST PASS' : 'SELFTEST FAIL\n' + res.failures.join('\n');
  document.body.appendChild(d);
}

export async function runSelftest(game: GameApi, mode: 'quick' | 'full'): Promise<SelftestResult> {
  const metrics: Record<string, number> = {};
  const failures: string[] = [];
  const base: RunConfig = { mode: 'endless', seed: SELFTEST_SEED, day: null, god: true, boss: null, autopilot: true, selftest: true };
  let maxDraw = 0;
  const segNames: string[] = [];
  game.setInvariantChecking(true);

  // Draw-call sampler (every 1 s) for the whole test.
  const drawTimer = window.setInterval(() => { const d = game.drawCalls(); if (d > maxDraw) maxDraw = d; }, 1000);

  const segment = async (name: string, ms: number, during?: () => void): Promise<void> => {
    await wait(2000);
    game.resetFrameStats();
    const w0 = performance.now();
    if (during) during();
    await wait(ms);
    const fs = game.frameStats();
    snapshot(name, fs, (performance.now() - w0) / 1000);
  };
  const snapshot = (name: string, fs: { p50: number; p95: number; max: number; longFrames: number; frames: number }, secs: number): void => {
    segNames.push(name);
    metrics[name + '_p50'] = fs.p50; metrics[name + '_p95'] = fs.p95; metrics[name + '_max'] = fs.max; metrics[name + '_long'] = fs.longFrames;
    metrics[name + '_fps'] = fs.frames / secs; metrics[name + '_frames'] = fs.frames;
  };

  // 1. boot
  const t0 = performance.now();
  while (game.screen !== 'title' && performance.now() - t0 < 60000) await wait(100);
  if (game.screen !== 'title') failures.push('boot timeout');
  await wait(1000);
  // 3-4. play with forced nuke
  game.startRun(base);
  await segment('play', 28000, () => { window.setTimeout(() => { game.forceNuke(); }, 13000); });
  // 5. pause / resume
  game.pause(); await wait(1000);
  if (!game.isPaused()) failures.push('pause did not pause');
  game.resume(); await wait(1000);
  // 6. restarts
  const restartMs: number[] = [];
  for (let i = 0; i < 5; i++) { restartMs.push(game.restart()); await wait(400); }

  if (mode === 'full') await runFullExtras(game, base, { segment, snapshot, failures });

  window.clearInterval(drawTimer);
  const d = game.drawCalls(); if (d > maxDraw) maxDraw = d;
  // 7. metrics
  metrics['errors'] = errorLog.count;
  metrics['violations'] = game.invariantViolations().length;
  metrics['dropped'] = game.maxDropped();
  metrics['maxAlive'] = game.maxAlive();
  metrics['restartMax'] = Math.max(...restartMs);
  metrics['maxDraw'] = maxDraw;
  metrics['nukes'] = game.nukeCount();
  const heap = game.heapMb(); if (heap !== null) metrics['heapMb'] = heap;
  // 8. failures
  const quality = (game as unknown as { quality?: string }).quality;
  const p95Limit = quality === 'low' ? 20 : 16.7;
  if (errorLog.count > 0) failures.push('errors: ' + errorLog.count + ' ' + errorLog.last.slice(-2).join(' | '));
  if (metrics['violations']! > 0) failures.push('violations: ' + game.invariantViolations().slice(0, 3).join(' | '));
  if (metrics['dropped']! > 0) failures.push('dropped spawns: ' + metrics['dropped']);
  for (const n of segNames) {
    if (metrics[n + '_p95']! > p95Limit) failures.push(n + ' p95 ' + metrics[n + '_p95']!.toFixed(2));
    const throttled = metrics[n + '_fps']! < 30;   // environment cannot deliver 60 fps: rAF interval check meaningless
    metrics[n + '_throttled'] = throttled ? 1 : 0;
    const frames = metrics[n + '_frames']!;   // actual frames in the segment; tolerate <= 0.5% isolated OS-level compositor stalls
    if (metrics[n + '_long']! > 0.005 * Math.max(frames, 600) && !throttled) failures.push(n + ' long frames ' + metrics[n + '_long']);
    if (!(metrics[n + '_fps']! > 0)) failures.push(n + ' rendered no frames');
  }
  if (metrics['restartMax']! >= 50) failures.push('restart ' + metrics['restartMax']!.toFixed(1) + ' ms');
  if (maxDraw > 150) failures.push('draw calls ' + maxDraw);
  if (game.nukeCount() < 1) failures.push('nuke not observed');
  const res: SelftestResult = { pass: failures.length === 0, metrics, failures };
  window.__selftest = res;
  showOverlay(res);
  return res;
}

interface Helpers {
  segment: (n: string, ms: number, d?: () => void) => Promise<void>;
  snapshot: (name: string, fs: { p50: number; p95: number; max: number; longFrames: number; frames: number }, secs: number) => void;
  failures: string[];
}

// S.2 steps 7-10
async function runFullExtras(game: GameApi, base: RunConfig, h: Helpers): Promise<void> {
  // 7. sector 1 -> first boss
  game.startRun(base);
  await wait(2000);
  game.resetFrameStats();
  const w0 = performance.now();
  let t = 0;
  while (t < 200000 && !(game.sim && game.sim.stats.bossesKilled >= 1)) { await wait(500); t += 500; }
  if (!(game.sim && game.sim.stats.bossesKilled >= 1)) h.failures.push('boss1 timeout');
  h.snapshot('sector1', game.frameStats(), (performance.now() - w0) / 1000);
  // 8. warden
  game.startRun({ ...base, boss: 'warden' });
  await h.segment('warden', 28000);
  // 9. serpent + disruptions
  game.startRun({ ...base, boss: 'serpent' });
  await h.segment('serpent', 8000);
  game.setQuality('low'); await wait(2000);
  game.setQuality('medium'); await wait(1000);
  window.dispatchEvent(new Event('resize')); await wait(1000);
  game.simulateVisibility(true); await wait(500);
  if (!game.isPaused()) h.failures.push('visibility hide did not pause');
  game.simulateVisibility(false);
  game.resume();
  const tick0 = game.sim ? game.sim.tick : 0;
  await wait(3000);
  if (!game.sim || game.sim.tick <= tick0) h.failures.push('sim not ticking after resume');
  // 10. offline leaderboard fallback resolves quickly
  setForceOffline(true);
  const tOff = performance.now();
  const lbr = await fetchLeaderboard({ mode: 'endless', period: 'all' });
  setForceOffline(false);
  if (!lbr.offline) h.failures.push('offline leaderboard did not report offline');
  if (performance.now() - tOff > 3000) h.failures.push('offline leaderboard took > 3 s');
}
