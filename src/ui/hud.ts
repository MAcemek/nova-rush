import type { Sim } from '../core/types';
import { BIOME_NAMES, BOSS_NAMES, POWER } from '../core/tuning';
import { el, setText } from './dom';

export interface HudModel {
  score: number; multiplier: number; combo: number; comboFrac: number;
  distance: number; sectorName: string; sectorNumber: number;
  best: number; hull: number; shield: number; heat: number; overheated: boolean;
  nukes: number; nukeMeter: number;
  powers: number[];
  bossActive: boolean; bossName: string; bossHpFrac: number; bossPhase: number;
  warning: boolean;
  offline: boolean; fps: number; showFps: boolean;
}

export function createHudModel(): HudModel {
  return {
    score: 0, multiplier: 1, combo: 0, comboFrac: 0, distance: 0, sectorName: BIOME_NAMES[0]!, sectorNumber: 1,
    best: 0, hull: 3, shield: 0, heat: 0, overheated: false, nukes: 0, nukeMeter: 0, powers: [0, 0, 0, 0, 0, 0, 0],
    bossActive: false, bossName: '', bossHpFrac: 1, bossPhase: 1, warning: false, offline: false, fps: 0, showFps: false,
  };
}

export function updateHudModel(m: HudModel, sim: Sim, best: number, offline: boolean, fps: number, showFps: boolean): void {
  m.score = sim.score; m.multiplier = sim.multiplier; m.combo = sim.combo; m.comboFrac = sim.comboTimer / 120;
  m.distance = Math.floor(sim.distance); m.sectorNumber = sim.sectorIndex + 1; m.sectorName = BIOME_NAMES[sim.sectorIndex % 5]!;
  m.best = best; m.hull = sim.ship.hull; m.shield = sim.ship.shield; m.heat = sim.heat / 100; m.overheated = sim.overheatTicks > 0;
  m.nukes = sim.nukes; m.nukeMeter = sim.nukeMeter / 100;
  for (let i = 0; i < HUD_POWERS.length; i++) m.powers[i] = sim.powerTicks[HUD_POWERS[i]!]! / POWER.duration;
  m.bossActive = sim.boss.active; m.bossName = BOSS_NAMES[sim.boss.id]!;
  m.bossHpFrac = sim.boss.maxHpTotal > 0 ? sim.boss.hpTotal / sim.boss.maxHpTotal : 1; m.bossPhase = sim.boss.phase;
  m.offline = offline; m.fps = fps; m.showFps = showFps;
}

const KF_POP: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }];
const OPT_POP: KeyframeAnimationOptions = { duration: 180, easing: 'ease-out' };
const KF_WARN: Keyframe[] = [{ transform: 'translateX(-120%)' }, { transform: 'translateX(0)' }];
const OPT_WARN: KeyframeAnimationOptions = { duration: 350, easing: 'ease-out' };
const NUKE_C = 100.53, POWER_C = 87.96;
const SVGNS = 'http://www.w3.org/2000/svg';
const LETTERS = ['S', 'R', 'P', 'M', '2', 'J', 'B'];
/** PowerType index shown in each HUD slot (Shield/Repair/Overhaul are instant, not timed). */
const HUD_POWERS = [0, 1, 2, 3, 4, 6, 7];

function svgCircle(parent: SVGElement, r: number, cls: string): SVGCircleElement {
  const c = document.createElementNS(SVGNS, 'circle');
  c.setAttribute('cx', '20'); c.setAttribute('cy', '20'); c.setAttribute('r', String(r)); c.setAttribute('class', cls);
  parent.appendChild(c);
  return c;
}

export class Hud {
  readonly root: HTMLElement;
  onPause: (() => void) | null = null;
  private readonly score: HTMLElement;
  private readonly mult: HTMLElement; private readonly combo: HTMLElement; private readonly comboFill: HTMLElement;
  private readonly distance: HTMLElement; private readonly sector: HTMLElement; private readonly best: HTMLElement;
  private readonly pips: HTMLElement[] = []; private readonly shieldPip: HTMLElement;
  private readonly heat: HTMLElement; private readonly heatFill: HTMLElement;
  private readonly nukes: HTMLElement[] = []; private readonly nukeRing: SVGCircleElement; private readonly nukeWrap: HTMLElement;
  private readonly powers: HTMLElement[] = []; private readonly powerRings: SVGCircleElement[] = [];
  private readonly boss: HTMLElement; private readonly bossName: HTMLElement; private readonly bossFill: HTMLElement; private readonly bossPhase: HTMLElement;
  private readonly warning: HTMLElement; private readonly fpsEl: HTMLElement; private readonly offlineEl: HTMLElement;
  private readonly badges: HTMLElement;
  private readonly cScore = { v: '' }; private readonly cMult = { v: '' }; private readonly cCombo = { v: '' }; private readonly cDist = { v: '' };
  private readonly cSector = { v: '' }; private readonly cBest = { v: '' }; private readonly cBossName = { v: '' }; private readonly cPhase = { v: '' }; private readonly cFps = { v: '' };
  private shown = 0; private lastWrite = 0; private lastScoreTarget = 0; private lastPopAt = 0;
  private qHeat = -1; private lastOver = false; private qHull = -1; private qShield = -1; private qNukes = -1; private qMeter = -1; private qCombo = -1; private qBoss = -1;
  private readonly qPower = [-1, -1, -1, -1, -1, -1, -1];
  private nScore = -1; private nDist = -1; private nMult = -1; private nCombo = -1; private nSector = -1; private nBest = -1; private nPhase = -1; private nFps = -1;
  private lastMult = 1; private lastWarning = false; private lastBossActive = false; private lastOffline = false; private lastShowFps = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hidden', parent);
    this.root.id = 'hud';
    const tc = el('div', 'hud-tc', this.root);
    this.score = el('div', 'hud-score', tc, '0');
    const row = el('div', 'hud-row', tc);
    this.mult = el('span', 'hud-mult hidden', row, '');
    this.combo = el('span', 'hud-combo hidden', row, '');
    const bar = el('div', 'hud-combo-bar', tc);
    this.comboFill = el('div', 'fill', bar);
    const tl = el('div', 'hud-tl', this.root);
    this.distance = el('div', 'hud-distance', tl, '0 m');
    this.sector = el('div', 'hud-sector', tl, '');
    this.badges = el('div', 'hud-badges', tl);
    const tr = el('div', 'hud-tr', this.root);
    this.best = el('div', 'hud-best', tr, '');
    const pb = el('button', 'hud-pause', tr, 'II');
    pb.addEventListener('click', () => { if (this.onPause) this.onPause(); });
    pb.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    const bl = el('div', 'hud-bl', this.root);
    const hull = el('div', 'hud-hull', bl);
    el('span', 'hull-label', hull, 'HULL');
    for (let i = 0; i < 3; i++) this.pips.push(el('span', 'pip', hull));
    this.shieldPip = el('span', 'pip shield hidden', hull);
    this.heat = el('div', 'hud-heat', bl);
    this.heatFill = el('div', 'fill', this.heat);
    const br = el('div', 'hud-br', this.root);
    const nk = el('div', 'hud-nukes', br);
    for (let i = 0; i < 3; i++) this.nukes.push(el('span', 'nuke', nk));
    this.nukeWrap = nk;
    const nsvg = document.createElementNS(SVGNS, 'svg');
    nsvg.setAttribute('class', 'hud-nuke-meter'); nsvg.setAttribute('viewBox', '0 0 40 40');
    svgCircle(nsvg, 16, 'ring-bg');
    this.nukeRing = svgCircle(nsvg, 16, 'ring-fg');
    this.nukeRing.setAttribute('stroke-dasharray', String(NUKE_C)); this.nukeRing.setAttribute('stroke-dashoffset', String(NUKE_C));
    br.appendChild(nsvg);
    const pw = el('div', 'hud-powers', br);
    for (let i = 0; i < HUD_POWERS.length; i++) {
      const p = el('div', 'power hidden', pw);
      const sv = document.createElementNS(SVGNS, 'svg');
      sv.setAttribute('viewBox', '0 0 40 40');
      svgCircle(sv, 14, 'ring-bg');
      const fg = svgCircle(sv, 14, 'ring-fg');
      fg.setAttribute('stroke-dasharray', String(POWER_C)); fg.setAttribute('stroke-dashoffset', '0');
      p.appendChild(sv);
      el('span', 'letter', p, LETTERS[i]!);
      this.powers.push(p); this.powerRings.push(fg);
    }
    this.boss = el('div', 'hud-boss hidden', this.root);
    this.bossName = el('div', 'name', this.boss, '');
    const bb = el('div', 'bar', this.boss);
    this.bossFill = el('div', 'fill', bb);
    el('div', 'notch n60', bb); el('div', 'notch n30', bb);
    this.bossPhase = el('div', 'phase', this.boss, '');
    this.warning = el('div', 'hud-warning hidden', this.root, 'WARNING');
    this.fpsEl = el('div', 'hud-fps hidden', this.root, '');
    this.offlineEl = el('div', 'hud-offline hidden', this.root, 'OFFLINE');
    void nk;
  }

  setBadges(autopilot: boolean, god: boolean): void {
    this.badges.textContent = '';
    if (autopilot) el('span', 'autopilot-badge', this.badges, 'AUTOPILOT');
    if (god) el('span', 'autopilot-badge god-badge', this.badges, 'GOD');
  }

  show(): void { this.root.classList.remove('hidden'); }
  hide(): void { this.root.classList.add('hidden'); }
  reset(): void {
    this.shown = 0; this.lastWrite = 0; this.lastScoreTarget = 0; this.lastMult = 1;
    this.cScore.v = ''; this.cMult.v = ''; this.cCombo.v = ''; this.cDist.v = ''; this.cSector.v = ''; this.cBest.v = ''; this.cBossName.v = ''; this.cPhase.v = ''; this.cFps.v = '';
    this.qHeat = -1; this.qHull = -1; this.qShield = -1; this.qNukes = -1; this.qMeter = -1; this.qCombo = -1; this.qBoss = -1;
    for (let i = 0; i < HUD_POWERS.length; i++) this.qPower[i] = -1;
    this.nScore = -1; this.nDist = -1; this.nMult = -1; this.nCombo = -1; this.nSector = -1; this.nBest = -1; this.nPhase = -1; this.nFps = -1;
    this.lastOver = false; this.lastWarning = false; this.lastBossActive = false;
    this.warning.classList.add('hidden');
  }

  update(m: HudModel, dt: number, nowMs: number): void {
    this.shown += (m.score - this.shown) * (1 - Math.exp(-12 * dt));
    if (Math.abs(m.score - this.shown) < 1) this.shown = m.score;
    if (m.score > this.lastScoreTarget && nowMs - this.lastPopAt > 120) { this.lastPopAt = nowMs; this.score.animate(KF_POP, OPT_POP); }
    this.lastScoreTarget = m.score;
    if (nowMs - this.lastWrite >= 33) {
      this.lastWrite = nowMs;
      const rs = Math.round(this.shown);
      if (rs !== this.nScore) { this.nScore = rs; setText(this.score, this.cScore, rs.toLocaleString('en-US')); }
      if (m.distance !== this.nDist) { this.nDist = m.distance; setText(this.distance, this.cDist, m.distance.toLocaleString('en-US') + ' m'); }
    }
    // multiplier / combo
    if (m.multiplier !== this.lastMult) {
      this.lastMult = m.multiplier;
      if (m.multiplier > 1) this.mult.animate(KF_POP, OPT_POP);
    }
    if (m.multiplier !== this.nMult) {
      this.nMult = m.multiplier;
      if (m.multiplier > 1) { this.mult.classList.remove('hidden'); setText(this.mult, this.cMult, '×' + m.multiplier); }
      else this.mult.classList.add('hidden');
    }
    if (m.combo !== this.nCombo) {
      this.nCombo = m.combo;
      if (m.combo >= 2) { this.combo.classList.remove('hidden'); setText(this.combo, this.cCombo, m.combo + ' COMBO'); }
      else this.combo.classList.add('hidden');
    }
    const qc = Math.round(m.comboFrac * 200);
    if (qc !== this.qCombo) { this.qCombo = qc; this.comboFill.style.transform = 'scaleX(' + (qc / 200) + ')'; }
    if (m.sectorNumber !== this.nSector) { this.nSector = m.sectorNumber; setText(this.sector, this.cSector, 'SECTOR ' + m.sectorNumber + ' · ' + m.sectorName.toUpperCase()); }
    if (m.best !== this.nBest) { this.nBest = m.best; setText(this.best, this.cBest, 'BEST ' + m.best.toLocaleString('en-US')); }
    // hull / shield / heat
    if (m.hull !== this.qHull) { this.qHull = m.hull; for (let i = 0; i < 3; i++) { const pp = this.pips[i]!; pp.classList.toggle('off', i >= m.hull); pp.classList.toggle('low', m.hull === 1 && i === 0); } }
    if (m.shield !== this.qShield) { this.qShield = m.shield; this.shieldPip.classList.toggle('hidden', m.shield === 0); }
    const q = Math.round(m.heat * 200);
    if (q !== this.qHeat) { this.qHeat = q; this.heatFill.style.transform = 'scaleX(' + (q / 200) + ')'; }
    if (m.overheated !== this.lastOver) { this.lastOver = m.overheated; this.heat.classList.toggle('overheat', m.overheated); }
    // nukes
    if (m.nukes !== this.qNukes) { this.qNukes = m.nukes; for (let i = 0; i < 3; i++) this.nukes[i]!.classList.toggle('on', i < m.nukes); }
    const qm = Math.round(m.nukeMeter * 200);
    if (qm !== this.qMeter) { this.qMeter = qm; this.nukeRing.setAttribute('stroke-dashoffset', String(NUKE_C * (1 - qm / 200))); }
    // powers
    for (let i = 0; i < HUD_POWERS.length; i++) {
      const f = m.powers[i]!;
      const qp = f > 0 ? Math.max(1, Math.round(f * 200)) : 0;
      if (qp !== this.qPower[i]) {
        this.qPower[i] = qp;
        this.powers[i]!.classList.toggle('hidden', qp === 0);
        this.powerRings[i]!.setAttribute('stroke-dashoffset', String(POWER_C * (1 - qp / 200)));
      }
    }
    // boss
    if (m.bossActive !== this.lastBossActive) { this.lastBossActive = m.bossActive; this.boss.classList.toggle('hidden', !m.bossActive); }
    if (m.bossActive) {
      if (m.bossName !== this.cBossName.v) setText(this.bossName, this.cBossName, m.bossName);
      if (m.bossPhase !== this.nPhase) { this.nPhase = m.bossPhase; setText(this.bossPhase, this.cPhase, 'PHASE ' + m.bossPhase); }
      const qb = Math.round(m.bossHpFrac * 200);
      if (qb !== this.qBoss) { this.qBoss = qb; this.bossFill.style.transform = 'scaleX(' + (qb / 200) + ')'; }
    }
    if (m.warning !== this.lastWarning) {
      this.lastWarning = m.warning;
      this.warning.classList.toggle('hidden', !m.warning);
      if (m.warning) this.warning.animate(KF_WARN, OPT_WARN);
    }
    if (m.offline !== this.lastOffline) { this.lastOffline = m.offline; this.offlineEl.classList.toggle('hidden', !m.offline); }
    if (m.showFps !== this.lastShowFps) { this.lastShowFps = m.showFps; this.fpsEl.classList.toggle('hidden', !m.showFps); }
    if (m.showFps) { const f = Math.round(m.fps); if (f !== this.nFps) { this.nFps = f; setText(this.fpsEl, this.cFps, f + ' FPS'); } }
  }

  pulse(name: 'score' | 'mult' | 'hull' | 'nuke'): void {
    if (name === 'score') { const n = performance.now(); if (n - this.lastPopAt > 120) { this.lastPopAt = n; this.score.animate(KF_POP, OPT_POP); } }
    else if (name === 'mult') this.mult.animate(KF_POP, OPT_POP);
    else if (name === 'hull') { const p = this.pips[this.qHull > 0 ? this.qHull - 1 : 0]; if (p) p.animate(KF_POP, OPT_POP); }
    else this.nukeWrap.animate(KF_POP, OPT_POP);
  }
}
