import './style.css';
import { EvType } from './core/types';
import type { InputFrame, Sim, SimEvent } from './core/types';
import type { FrameStats, GameApi, Quality, RunConfig, Screen } from './gameApi';
import { createSim } from './core/sim';
import { createBot, botDecide } from './core/bot';
import type { BotState } from './core/bot';
import { checkInvariants } from './core/invariants';
import { ReplayRecorder } from './core/replay';
import { installErrorHandlers, recordError, showCrashOverlay } from './debug/errors';
import { createTitleScreen } from './ui/title';
import { createGameOverScreen } from './ui/gameover';
import { Hud, createHudModel, updateHudModel } from './ui/hud';
import { el, uiRoot } from './ui/dom';
import { GameRenderer } from './render/renderer';
import { FxBus } from './render/fx';
import { InputSampler } from './input';
import { GameLoop } from './loop';
import { createDebugPanel } from './debug/debugPanel';
import { runSelftest } from './debug/selftest';
import { audio, ensureAudio, setVolumes, sfxChime, sfxListener } from './audio/sfx';
import { warmup } from './render/warmup';
import { music } from './audio/music';
import { Word } from './render/popups';
import { SectorState } from './core/types';
import { params } from './params';
import { loadProfile, saveProfile, store } from './meta/profile';
import { applyRun, dailyBonus, ensureMissions, missionById, summarize } from './meta/missions';
import { achievementName, checkAchievements, grantAchievement } from './meta/achievements';
import { byId } from './meta/cosmetics';
import { addLocalEntry, fetchDaily, fetchLeaderboard, net, runFlagsFor, submitRun } from './api/client';
import type { RunFlags } from './api/client';
import { buildPayload, utcDay } from './api/schema';
import type { RunPayload } from './api/schema';
import { toast } from './ui/toasts';
import { createLeaderboardScreen } from './ui/leaderboard';
import { createHangarScreen } from './ui/hangar';
import { createSettingsScreen } from './ui/settings';
import { createPauseScreen } from './ui/pause';
import { createTutorialUi } from './ui/tutorial';
import { createTouchControls } from './ui/touch';
import { QualityMonitor } from './render/quality';
import { TUTORIAL } from './core/tuning';

installErrorHandlers();

const boot0 = loadProfile();
store.profile = boot0.profile;
ensureMissions(store.profile, utcDay(Date.now()));
saveProfile(store.profile);

const title = createTitleScreen();
title.showLoading('Loading...');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const sampler = new InputSampler(canvas);
sampler.attach();
const renderer = new GameRenderer(canvas, 'medium', sampler);
const fxBus = new FxBus();
const recorder = new ReplayRecorder();
const hud = new Hud(uiRoot);
const hudModel = createHudModel();
let lastMult = 1;
let warnUntil = 0;
function triggerWarning(now: number): void { warnUntil = now + 2500; renderer.popups.word(Word.Warning, 0, -30, now); }
fxBus.on(renderer.fx.listener);
fxBus.on(renderer.popups.listener);
fxBus.on(sfxListener);
fxBus.on((e: SimEvent): number => {
  if (e.type === EvType.Kill) hud.pulse('score');
  else if (e.type === EvType.ComboUp) { if (e.b !== lastMult) { lastMult = e.b; hud.pulse('mult'); } }
  else if (e.type === EvType.ShipHit) hud.pulse('hull');
  else if (e.type === EvType.Formation) formationsThisRun++;
  else if (e.type === EvType.BossSpawn) triggerWarning(performance.now());
  else if (e.type === EvType.WarpStart) renderer.startWarp(e.a + 1);
  return 0;
});
const gameOver = createGameOverScreen();
const leaderboard = createLeaderboardScreen();
const hangar = createHangarScreen();
let dailyInfo: { day: string; seed: number; offline: boolean } | null = null;
let runFlags: RunFlags = { countsForProfile: false, submittable: false };
let formationsThisRun = 0;
let bestDistAtStart = 0;
let gateChimed = false;
let gateAnnounced = false;
let runSeq = 0;
let pendingPayload: RunPayload | null = null;
let lbReturn: 'title' | 'gameover' = 'title';

function applyCosmetics(): void {
  const c = store.profile.cosmetics;
  renderer.ship.setHull(byId(c.hull)?.hull ?? 'arrow');
  renderer.ship.setPaint(byId(c.paint)?.color ?? 0xe8eef7);
  renderer.world.setLaserColor(byId(c.laser)?.color ?? 0x5ff4ff);
  renderer.ship.setTrailColor(byId(c.trail)?.color ?? 0x5ff4ff);
}
function applySettings(): void {
  const st = store.profile.settings;
  sampler.nukeKey = st.nukeKey;
  sampler.steerMode = st.steering; sampler.autoFire = st.autoFire || sampler.touchEnabled;
  setVolumes(st.musicVol, st.sfxVol);
  renderer.rig.shakeScale = st.reduceShake ? 0.3 : 1;
  renderer.post.photosensitive = st.photosensitive;
}
function applyQualityBoot(): void {
  const q = store.profile.settings.quality;
  if (!params.selftest && q !== 'medium') renderer.setQuality(q);
}
function modeKey(): 'endless' | 'daily' { return cfgRef !== null && cfgRef.mode === 'daily' ? 'daily' : 'endless'; }
hud.onPause = (): void => { pause(); };
const pauseScreen = createPauseScreen();
const tutorialUi = createTutorialUi();
const qualityMon = new QualityMonitor((q) => {
  renderer.setQuality(q);
  store.profile.settings.quality = q; saveProfile(store.profile);
  settings.refresh();
  toast('Quality lowered to ' + q.toUpperCase() + ' for smoother play', 'warn');
});
let throwOnce = false;
let settingsFrom: 'title' | 'paused' = 'title';
const settings = createSettingsScreen({
  apply: applySettings,
  setQuality: (q) => { renderer.setQuality(q); qualityMon.reset(); },
});

let screen: Screen = 'loading';
let simRef: Sim | null = null;
let cfgRef: RunConfig | null = null;
let bot: BotState = createBot();
let loop: GameLoop;
let lastRestart = 0;
let maxAliveSeen = 0;
let maxDroppedSeen = 0;
let nukeEvents = 0;
let errored = false;
let overHandled = false;
let overAt = 0;
let pendingForceNuke = false;
let invariantsOn = params.debug || params.selftest !== null;
const violations: string[] = [];
const heldAtDeath = new Set<string>();
let fpsFrames = 0, fpsStart = 0, fps = 0;

let touch: ReturnType<typeof createTouchControls>;
const autoFrame: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0 };

function randomSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]!; }

function showScreen(s: Screen): void {
  screen = s;
  if (s === 'paused') pauseScreen.show(cfgRef !== null && cfgRef.mode === 'tutorial'); else pauseScreen.hide();
  touch.setVisible(s === 'run');
  if (s !== 'run' && s !== 'paused') tutorialUi.hide();
}

function pause(): void {
  if (screen !== 'run') return;
  music.pause();
  showScreen('paused');
  sampler.clearHeld();
}
function resume(): void {
  if (screen !== 'paused') return;
  showScreen('run');
  sampler.clearHeld();
  loop.resetTiming();
  if (!params.selftest) ensureAudio();
  music.resume();
}

function toTitle(): void {
  gameOver.hide(); hud.hide(); simRef = null;
  leaderboard.close(); hangar.close(); settings.close(); renderer.previewMode = false;
  tutorialUi.hide();
  title.setBest(store.profile.best.endless); title.setStreak(store.profile.daily.streak);
  showScreen('title');
  title.showTitle();
}

function openLeaderboard(from: 'title' | 'gameover', mode?: 'endless' | 'daily'): void {
  lbReturn = from;
  title.hide(); gameOver.root.classList.add('hidden');
  showScreen('leaderboard');
  leaderboard.open(mode);
}
function openHangar(from: 'title' | 'gameover'): void {
  lbReturn = from;
  title.hide(); gameOver.root.classList.add('hidden');
  showScreen('hangar');
  renderer.previewMode = true;
  hangar.open();
}
function backFromSub(): void {
  leaderboard.close(); hangar.close(); renderer.previewMode = false;
  if (lbReturn === 'gameover' && simRef) {
    gameOver.root.classList.remove('hidden');
    overAt = performance.now();
    showScreen('gameover');
  } else toTitle();
}
function openSettings(from: 'title' | 'paused'): void {
  settingsFrom = from;
  if (from === 'title') { title.hide(); showScreen('settings'); }
  else { pauseScreen.hide(); screen = 'settings'; }
  settings.open();
}
settings.onBack = (): void => {
  settings.close();
  if (settingsFrom === 'paused') showScreen('paused'); else toTitle();
};
title.onSettings = (): void => { openSettings('title'); };
pauseScreen.onResume = (): void => { resume(); };
pauseScreen.onRestart = (): void => { showScreen('run'); restart(); };
pauseScreen.onSettings = (): void => { openSettings('paused'); };
pauseScreen.onQuit = (): void => { toTitle(); };
pauseScreen.onSkipTutorial = (): void => { endTutorial(false); };
tutorialUi.onSkip = (): void => { endTutorial(false); };
leaderboard.onBack = backFromSub;
hangar.onBack = backFromSub;
hangar.onChange = applyCosmetics;
gameOver.onPlay = (): void => { restart(); };
gameOver.onLeaderboard = (): void => { openLeaderboard('gameover', modeKey()); };
gameOver.onHangar = (): void => { openHangar('gameover'); };

function handleVisibility(hidden: boolean): void {
  if (hidden && screen === 'run') pause();
  sampler.clearHeld();
  if (hidden && audio.ctx) void audio.ctx.suspend();
}

function endTutorial(completed: boolean): void {
  const p = store.profile;
  p.tutorialDone = true;
  if (completed && grantAchievement(p, 'cadet')) toast('Achievement: ' + achievementName('cadet'), 'achievement');
  saveProfile(p);
  tutorialUi.hide();
  startRun({ mode: 'endless', seed: params.seed ?? randomSeed(), day: null, god: params.god || panel.state.god, boss: params.boss, autopilot: params.autopilot, selftest: false });
}

function startRun(cfg: RunConfig): number {
  const t0 = performance.now();
  title.hide(); gameOver.hide(); settings.close();
  if (cfg.mode === 'tutorial') tutorialUi.show(); else tutorialUi.hide();
  cfgRef = cfg;
  const sim = createSim({ seed: cfg.seed, mode: cfg.mode, god: cfg.god, boss: cfg.boss ?? undefined });
  simRef = sim;
  recorder.reset(); lastMult = 1;
  runFlags = runFlagsFor(cfg);
  formationsThisRun = 0; gateChimed = false; gateAnnounced = false; pendingPayload = null; runSeq++;
  bestDistAtStart = runFlags.countsForProfile ? store.profile.bestDistance[cfg.mode === 'daily' ? 'daily' : 'endless'] : 0;
  renderer.world.gateZ = null;
  renderer.resetForRun(sim);
  hud.reset(); hud.setBadges(cfg.autopilot, cfg.god); hud.show();
  bot = createBot();
  sampler.clearHeld();
  loop.resetTiming();
  overHandled = false;
  warnUntil = 0;
  music.start(sim.sectorIndex);
  if (sim.boss.active) triggerWarning(performance.now());
  showScreen('run');
  lastRestart = performance.now() - t0;
  return lastRestart;
}

function restart(): number {
  const c = cfgRef;
  if (!c) return 0;
  let seed = c.seed;
  if (c.mode === 'endless' && !c.selftest && params.seed === null) seed = randomSeed();
  return startRun({ ...c, seed });
}

const game: GameApi = {
  get screen(): Screen { return screen; },
  get sim(): Sim | null { return simRef; },
  get config(): RunConfig | null { return cfgRef; },
  startRun,
  restart,
  pause,
  resume,
  setScreen(s: Screen): void { showScreen(s); },
  setQuality(q: Quality): void { renderer.setQuality(q); },
  setSimSpeed(n: number): void { loop.simSpeed = n; },
  forceNuke(): void { pendingForceNuke = true; },
  simulateVisibility(hidden: boolean): void { handleVisibility(hidden); },
  frameStats(): FrameStats { return loop.stats(); },
  resetFrameStats(): void { loop.resetStats(); },
  drawCalls(): number { return renderer.drawCalls(); },
  maxAlive(): number { return maxAliveSeen; },
  resetMaxAlive(): void { maxAliveSeen = 0; maxDroppedSeen = 0; },
  heapMb(): number | null {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? m.usedJSHeapSize / 1048576 : null;
  },
  lastRestartMs(): number { return lastRestart; },
  setInvariantChecking(on: boolean): void { invariantsOn = on; },
  invariantViolations(): readonly string[] { return violations; },
  maxDropped(): number { return maxDroppedSeen; },
  isPaused(): boolean { return screen === 'paused'; },
  nukeCount(): number { return nukeEvents; },
};

touch = createTouchControls(sampler, game, canvas);
applySettings();

if (params.debug) (window as unknown as { __game: GameApi }).__game = game;
const panel = createDebugPanel(game, params.debug, {
  throwInFrame: () => { throwOnce = true; },
  setMouseSteering: (on: boolean) => { sampler.steerMode = on ? 'mouse' : 'keyboard'; },
  setBiome: (i: number) => { renderer.env.setBiome(i, true); },
});

function updateGate(sim: Sim, nowMs: number): void {
  if (bestDistAtStart <= 0 || screen !== 'run') { renderer.world.gateZ = null; return; }
  const z = -(bestDistAtStart - sim.distance);
  renderer.world.gateZ = z > -260 && z < 25 ? z : null;
  if (!gateAnnounced && z > -60 && z < 25) { gateAnnounced = true; renderer.popups.word(Word.Best, 0, Math.min(z, -8), nowMs); }
  if (!gateChimed && sim.distance >= bestDistAtStart) {
    gateChimed = true; sfxChime();
    renderer.popups.word(Word.NewRecord, renderer.ship.drawX, -6, nowMs);
  }
}

function showInvReport(sim: Sim, msgs: readonly string[]): void {
  let pre = document.getElementById('inv-report');
  if (!pre) { pre = document.createElement('pre'); pre.id = 'inv-report'; document.body.appendChild(pre); }
  pre.textContent = 'INVARIANT VIOLATION tick ' + sim.tick + ' seed ' + sim.seed + '\n' + msgs.join('\n');
}

loop = new GameLoop({
  state: () => screen,
  getSim: () => simRef,
  sampleInput: (shipX: number) => {
    const sim = simRef!;
    let f: InputFrame;
    if (cfgRef !== null && cfgRef.autopilot) f = botDecide(sim, bot, autoFrame);
    else f = sampler.sample(shipX);
    if (pendingForceNuke) { pendingForceNuke = false; f.nuke = true; }
    return f;
  },
  onTick: (input: InputFrame, events: readonly SimEvent[]) => {
    const sim = simRef!;
    recorder.push(input);
    if (sim.entities.aliveCount > maxAliveSeen) maxAliveSeen = sim.entities.aliveCount;
    if (sim.dropped > maxDroppedSeen) maxDroppedSeen = sim.dropped;
    for (let i = 0; i < events.length; i++) if (events[i]!.type === EvType.NukeDetonate) nukeEvents++;
    if (invariantsOn) {
      const v = checkInvariants(sim);
      if (v.length > 0) {
        for (let i = 0; i < v.length && violations.length < 50; i++) violations.push('tick ' + sim.tick + ' ' + v[i]!);
        if (params.debug && !params.selftest) { pause(); showInvReport(sim, v); }
      }
    }
  },
  dispatch: (events: readonly SimEvent[], nowMs: number) => fxBus.dispatch(events, nowMs),
  render: (alpha: number, dt: number, nowMs: number) => {
    if (throwOnce) { throwOnce = false; throw new Error('debug: throw in frame'); }
    renderer.render(simRef, alpha, dt, nowMs);
    if (screen === 'gameover') gameOver.update(nowMs);
    fpsFrames++;
    if (nowMs - fpsStart >= 1000) { fps = fpsFrames * 1000 / (nowMs - fpsStart); fpsFrames = 0; fpsStart = nowMs; }
    if (simRef && (screen === 'run' || screen === 'paused')) {
      updateHudModel(hudModel, simRef, store.profile.best[modeKey()], net.offline, fps, store.profile.settings.showFps);
      updateGate(simRef, nowMs);
      if (cfgRef !== null && cfgRef.mode === 'tutorial') tutorialUi.update(simRef.tick, touch.enabled);
      hudModel.warning = nowMs < warnUntil;
      hud.update(hudModel, dt, nowMs);
      music.setState(simRef.combo, simRef.boss.active, simRef.sectorState === SectorState.Warp, simRef.sectorIndex);
    }
    music.update(); renderer.beat = music.beat;
    panel.update(nowMs);
  },
  onSimOver: () => {
    if (overHandled || !simRef) return;
    overHandled = true;
    if (cfgRef !== null && cfgRef.mode === 'tutorial') { endTutorial(simRef.tick >= TUTORIAL.endTick); return; }
    sampler.heldKeysSnapshot(heldAtDeath);
    overAt = performance.now();
    music.gameOver();
    showScreen('gameover');
    finishRun(simRef);
  },
  onError: (err: unknown) => {
    if (errored) return;
    errored = true;
    recordError('frame error: ' + String(err));
    console.error('[nova-rush] frame error', err);
    if (screen === 'run') pause();
    showCrashOverlay(err, params.debug);
  },
  onWork: (w: number, dt: number) => {
    if (screen === 'run' && !params.selftest) qualityMon.push(w, dt, renderer.quality);
  },
});

function finishRun(sim: Sim): void {
  const cfg = cfgRef!;
  const p = store.profile;
  const mode = cfg.mode === 'daily' ? 'daily' : 'endless';
  const summary = summarize(sim, cfg.mode, formationsThisRun);
  const prevBest = p.best[mode];
  const crystalsBefore = p.crystals;
  let completed: string[] = [];
  if (runFlags.countsForProfile) {
    const today = utcDay(Date.now());
    p.best[mode] = Math.max(p.best[mode], summary.score);
    p.bestDistance[mode] = Math.max(p.bestDistance[mode], summary.distance);
    p.crystals += summary.crystals;
    p.totalRuns++;
    let kills = 0;
    for (let i = 0; i <= 8; i++) kills += summary.kills[i]!;
    p.lifetime.kills += kills; p.lifetime.bosses += summary.bossesKilled; p.lifetime.nukes += summary.nukesUsed;
    p.lifetime.distance += summary.distance; p.lifetime.runs++;
    if (mode === 'daily') {
      const yesterday = utcDay(Date.now() - 86400000);
      if (p.daily.lastDay !== today) {
        if (p.daily.lastDay === yesterday) p.daily.streak++; else p.daily.streak = 1;
        const bonus = dailyBonus(p.daily.streak);
        p.crystals += bonus;
        toast('Daily challenge complete! +' + String(bonus) + ' crystals (streak ' + String(p.daily.streak) + ')', 'mission');
      }
      p.daily.lastDay = today;
      if (p.daily.bestDay !== today || summary.score > p.daily.bestScore) { p.daily.bestDay = today; p.daily.bestScore = summary.score; }
    }
    const done = applyRun(p, summary, today);
    completed = done.map((d) => d.id);
    for (const d of done) toast('Mission complete: ' + d.text + ' (+' + String(d.reward) + ')', 'mission');
    for (const id of checkAchievements(p, summary)) toast('Achievement: ' + achievementName(id), 'achievement');
    saveProfile(p);
  }
  const missions = p.missions.map((ms) => {
    const d = missionById(ms.id);
    return { text: d?.text ?? ms.id, progress: ms.progress, target: d?.target ?? 1, done: ms.done, justDone: completed.includes(ms.id) };
  });
  if (runFlags.countsForProfile) { ensureMissions(p, utcDay(Date.now())); saveProfile(p); }
  const day = cfg.mode === 'daily' ? cfg.day : null;
  let payload: RunPayload | null = null;
  if (runFlags.submittable && (cfg.mode === 'endless' || cfg.mode === 'daily')) {
    payload = buildPayload(sim, recorder, cfg.mode, day, p.name ?? 'PILOT');
    addLocalEntry(cfg.mode, { name: p.name ?? 'YOU', score: sim.score, distance: summary.distance, day, at: Date.now() });
  }
  pendingPayload = payload;
  const needsName = payload !== null && p.name === null;
  gameOver.show({ score: sim.score, prevBest, summary, crystalsEarned: p.crystals - crystalsBefore, missions, needsName });
  if (payload === null) { gameOver.setRankInfo(cfg.mode === 'tutorial' ? '' : 'Run not ranked (debug)', null); return; }
  if (!needsName) void submitAndRank(payload, cfg.mode === 'daily' ? 'daily' : 'endless', day, runSeq);
}

async function submitAndRank(payload: RunPayload, mode: 'endless' | 'daily', day: string | null, seq: number): Promise<void> {
  gameOver.setRankInfo('Submitting...', null);
  const res = await submitRun(payload, runFlags);
  if (seq !== runSeq) return;
  if (res.status === 'accepted') {
    gameOver.setRankInfo('RANK #' + String(res.rank) + ' OF ' + String(res.total), null);
    const lb = await fetchLeaderboard({ mode, period: 'all', around: payload.name, day: day ?? undefined });
    if (seq !== runSeq || lb.data.around === null || res.rank === undefined || res.rank <= 1) return;
    const above = lb.data.around.find((e) => e.rank === res.rank! - 1);
    const mine = lb.data.around.find((e) => e.name === payload.name);
    if (above && mine) gameOver.setRankInfo('RANK #' + String(res.rank) + ' OF ' + String(res.total), (above.score - mine.score).toLocaleString('en-US') + ' pts from #' + String(above.rank) + ' (' + above.name + ')');
  } else if (res.status === 'queued') gameOver.setRankInfo('Offline \u2014 run saved and queued', null);
  else if (res.status === 'rejected') gameOver.setRankInfo('Run rejected (' + (res.reason ?? 'error') + ')', null);
  else gameOver.setRankInfo('Run not ranked (debug)', null);
}

gameOver.onSubmitName = (name: string): void => {
  store.profile.name = name; saveProfile(store.profile);
  const pl = pendingPayload;
  if (!pl) return;
  pl.name = name;
  void submitAndRank(pl, pl.mode, pl.day ?? null, runSeq);
};

// ---- global key handling ----
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !e.repeat) {
    if (screen === 'run') pause(); else if (screen === 'paused') resume();
    else if (screen === 'gameover') toTitle();
    return;
  }
  if (screen === 'gameover') {
    if (gameOver.inputFocused || performance.now() - overAt < 400 || e.repeat || heldAtDeath.has(e.code)) return;
    restart();
  }
});
window.addEventListener('keyup', (e) => { heldAtDeath.delete(e.code); });
window.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && t.closest('button,input')) return;
  if (screen === 'gameover' && !gameOver.inputFocused && performance.now() - overAt >= 400) restart();
});
document.addEventListener('visibilitychange', () => { handleVisibility(document.hidden); });
window.addEventListener('blur', () => { if (!params.selftest) handleVisibility(true); else sampler.clearHeld(); });

title.onDaily = (): void => {
  void (async (): Promise<void> => {
    if (!dailyInfo || dailyInfo.offline) dailyInfo = await fetchDaily();
    if (!params.selftest) ensureAudio();
    startRun({ mode: 'daily', seed: dailyInfo.seed, day: dailyInfo.day, god: false, boss: null, autopilot: false, selftest: false });
  })();
};
title.onLeaderboard = (): void => { openLeaderboard('title'); };
title.onHangar = (): void => { openHangar('title'); };
title.onStart = (): void => {
  if (!params.selftest) ensureAudio();
  if (!store.profile.tutorialDone && !params.selftest && !params.autopilot && params.boss === null) {
    startRun({ mode: 'tutorial', seed: 1, day: null, god: false, boss: null, autopilot: false, selftest: false });
    return;
  }
  startRun({
    mode: 'endless', seed: params.seed ?? randomSeed(), day: null,
    god: params.god || panel.state.god, boss: params.boss, autopilot: params.autopilot, selftest: false,
  });
};

async function boot(): Promise<void> {
  applyCosmetics(); applySettings(); applyQualityBoot();
  title.setBest(store.profile.best.endless); title.setStreak(store.profile.daily.streak);
  if (boot0.wasCorrupt) toast('Save data was unreadable and has been reset', 'warn');
  void fetchDaily().then((d) => { dailyInfo = d; });
  loop.start();
  await warmup(renderer, (text: string) => { title.showLoading(text); });
  loop.resetStats();
  showScreen('title');
  title.showTitle();
  if (params.selftest) void runSelftest(game, params.selftest);
}
void boot();
