import { el, show, hide, uiRoot } from './dom';
export interface TitleScreen {
  root: HTMLElement; showLoading(text: string): void; showTitle(): void; hide(): void;
  setStreak(n: number): void; setBest(n: number): void;
  onStart: (() => void) | null; onDaily: (() => void) | null; onLeaderboard: (() => void) | null; onHangar: (() => void) | null; onSettings: (() => void) | null;
}
export function createTitleScreen(): TitleScreen {
  const root = el('div', 'screen', uiRoot);
  el('div', 'title-logo', root, 'NOVA RUSH');
  const status = el('div', 'status', root, 'Loading...');
  const press = el('div', 'press hidden', root, 'PRESS TO START');
  const menu = el('div', 'menu hidden', root);
  const bestEl = el('div', 'status hidden', root, 'BEST 0');
  const streakEl = el('div', 'status hidden', root, 'DAILY STREAK 0');
  let ready = false;       // first gesture not yet given
  let menuOn = false;
  const self: TitleScreen = {
    root, onStart: null, onDaily: null, onLeaderboard: null, onHangar: null, onSettings: null,
    showLoading(text: string): void { show(root); status.textContent = text; show(status); hide(press); hide(menu); hide(bestEl); hide(streakEl); ready = false; menuOn = false; },
    showTitle(): void {
      show(root); hide(status); ready = true;
      if (menuOn) { hide(press); show(menu); show(bestEl); show(streakEl); } else { show(press); hide(menu); }
    },
    hide(): void { hide(root); ready = false; },
    setStreak(n: number): void { streakEl.textContent = 'DAILY STREAK ' + String(n); },
    setBest(n: number): void { bestEl.textContent = 'BEST ' + n.toLocaleString('en-US'); },
  };
  const mk = (label: string, fn: () => void, hidden = false): void => {
    const b = el('button', hidden ? 'hidden' : '', menu, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); if (menuOn) fn(); });
  };
  mk('Play', () => { self.onStart?.(); });
  mk('Daily Challenge', () => { self.onDaily?.(); });
  mk('Leaderboard', () => { self.onLeaderboard?.(); });
  mk('Hangar', () => { self.onHangar?.(); });
  mk('Settings', () => { self.onSettings?.(); });
  const firstGesture = (): void => {
    if (!ready || menuOn) return;
    menuOn = true; self.showTitle();
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !ready) return;
    if (!menuOn) { firstGesture(); return; }
    if (e.code === 'Enter' || e.code === 'Space') self.onStart?.();
  });
  root.addEventListener('pointerdown', firstGesture);
  return self;
}
