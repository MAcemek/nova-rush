import { el, hide, show, uiRoot } from './dom';
import { Kind } from '../core/types';
import { NAME_RE } from '../api/schema';
import type { RunSummary } from '../meta/missions';

export interface GameOverMission { text: string; progress: number; target: number; done: boolean; justDone: boolean }
export interface GameOverData { score: number; prevBest: number; summary: RunSummary; crystalsEarned: number; missions: GameOverMission[]; needsName: boolean }
export interface GameOverScreen {
  root: HTMLElement;
  show(data: GameOverData): void; update(now: number): void; setRankInfo(text: string, closeText: string | null): void; hide(): void;
  readonly inputFocused: boolean;
  onSubmitName: ((name: string) => void) | null; onPlay: (() => void) | null; onLeaderboard: (() => void) | null; onHangar: (() => void) | null;
}

const fmt = (n: number): string => n.toLocaleString('en-US');
function mmss(ticks: number): string { const s = Math.floor(ticks / 60); return String(Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0'); }

export function createGameOverScreen(): GameOverScreen {
  const root = el('div', 'screen hidden', uiRoot);
  el('div', 'title-logo', root, 'GAME OVER').style.fontSize = '44px';
  const scoreEl = el('div', 'go-score', root, '0');
  const newBest = el('div', 'go-new hidden', root, 'NEW BEST!');
  const grid = el('div', 'go-grid', root);
  const cry = el('div', 'go-cry', root);
  const missionsEl = el('div', '', root);
  const rankEl = el('div', 'go-rank', root);
  const closeEl = el('div', 'status', root);
  const nameRow = el('div', 'go-name hidden', root);
  const input = el('input', '', nameRow);
  input.maxLength = 12; input.placeholder = 'PILOT NAME'; input.autocomplete = 'off'; input.spellcheck = false;
  const submit = el('button', '', nameRow, 'Submit');
  const nameErr = el('div', 'lb-note hidden', root, '3-12 letters, numbers or _');
  const btns = el('div', 'go-btns', root);
  const bPlay = el('button', '', btns, 'Play again');
  const bLb = el('button', '', btns, 'Leaderboard');
  const bHangar = el('button', '', btns, 'Hangar');
  let focused = false;
  let target = 0, startAt = -1, lastWrite = 0, lastShown = -1;
  const self: GameOverScreen = {
    root, onSubmitName: null, onPlay: null, onLeaderboard: null, onHangar: null,
    get inputFocused(): boolean { return focused; },
    show(d: GameOverData): void {
      target = d.score; startAt = -1; lastShown = -1; lastWrite = 0;
      scoreEl.textContent = '0';
      newBest.classList.toggle('hidden', !(d.score > d.prevBest));
      const s = d.summary;
      grid.replaceChildren();
      const stat = (label: string, v: string): void => { const c = el('div', '', grid); c.append(label + ' '); el('b', '', c, v); };
      stat('Distance', fmt(s.distance) + ' m'); stat('Kills', fmt(s.kills.reduce((a, b, i) => a + (i <= Kind.Warden ? b : 0), 0))); stat('Max combo', String(s.maxCombo));
      stat('Close calls', String(s.nearMisses)); stat('Perfect dodges', String(s.perfectDodges)); stat('Nukes', String(s.nukesUsed));
      stat('Bosses', String(s.bossesKilled)); stat('Sector', String(s.sectorReached)); stat('Time', mmss(s.ticks));
      cry.textContent = d.crystalsEarned > 0 ? '+' + fmt(d.crystalsEarned) + ' crystals' : '';
      missionsEl.replaceChildren();
      for (const m of d.missions) {
        const row = el('div', 'go-mission' + (m.done ? ' done' : ''), missionsEl, (m.justDone ? '\u2605 ' : '') + m.text + '  ' + String(Math.min(m.progress, m.target)) + '/' + String(m.target));
        const bar = el('div', 'bar', row); const fill = el('i', '', bar);
        fill.style.width = String(Math.round(Math.min(1, m.progress / m.target) * 100)) + '%';
      }
      rankEl.textContent = ''; closeEl.textContent = '';
      nameRow.classList.toggle('hidden', !d.needsName); nameErr.classList.add('hidden');
      input.value = '';
      show(root);
      if (d.needsName) input.focus();
    },
    update(now: number): void {
      if (startAt < 0) startAt = now;
      if (lastShown === target) return;
      if (now - lastWrite < 33) return;
      lastWrite = now;
      const u = Math.min(1, (now - startAt) / 1200);
      const v = u >= 1 ? target : Math.floor(target * (1 - Math.pow(1 - u, 3)));
      if (v !== lastShown) { lastShown = v; scoreEl.textContent = fmt(v); }
    },
    setRankInfo(text: string, closeText: string | null): void { rankEl.textContent = text; closeEl.textContent = closeText ?? ''; },
    hide(): void { hide(root); focused = false; input.blur(); },
  };
  const doSubmit = (): void => {
    const n = input.value.trim();
    if (!NAME_RE.test(n)) { nameErr.classList.remove('hidden'); return; }
    nameRow.classList.add('hidden'); nameErr.classList.add('hidden'); focused = false; input.blur();
    self.onSubmitName?.(n);
  };
  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') doSubmit(); });
  input.addEventListener('focus', () => { focused = true; });
  input.addEventListener('blur', () => { focused = false; });
  bPlay.addEventListener('click', () => { self.onPlay?.(); });
  bLb.addEventListener('click', () => { self.onLeaderboard?.(); });
  bHangar.addEventListener('click', () => { self.onHangar?.(); });
  return self;
}
