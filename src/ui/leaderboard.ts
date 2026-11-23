import { el, show, hide, uiRoot } from './dom';
import { fetchLeaderboard } from '../api/client';
import { store } from '../meta/profile';
import type { LbEntry } from '../api/schema';

export interface LeaderboardScreen { root: HTMLElement; open(mode?: 'endless' | 'daily'): void; close(): void; onBack: () => void; readonly isOpen: boolean }

export function createLeaderboardScreen(): LeaderboardScreen {
  const root = el('div', 'screen hidden', uiRoot);
  const wrap = el('div', 'panel-wrap', root);
  el('div', 'title-logo', wrap, 'LEADERBOARD').style.fontSize = '36px';
  const modeTabs = el('div', 'tabs', wrap);
  const periodTabs = el('div', 'tabs', wrap);
  const note = el('div', 'lb-note hidden', wrap, 'Offline \u2014 showing local scores');
  const table = el('table', 'lb-table', wrap);
  const aroundTitle = el('div', 'lb-sub hidden', wrap, 'AROUND YOU');
  const aroundTable = el('table', 'lb-table', wrap);
  const back = el('button', '', wrap, 'Back');
  let mode: 'endless' | 'daily' = 'endless';
  let period: 'all' | 'week' | 'today' = 'all';
  let open = false;
  let token = 0;
  const modeBtns = (['endless', 'daily'] as const).map((m) => {
    const b = el('button', '', modeTabs, m === 'endless' ? 'Endless' : 'Daily');
    b.addEventListener('click', () => { mode = m; refresh(); });
    return { b, m };
  });
  const periodBtns = (['all', 'week', 'today'] as const).map((p) => {
    const b = el('button', '', periodTabs, p === 'all' ? 'All' : p === 'week' ? 'Week' : 'Today');
    b.addEventListener('click', () => { period = p; refresh(); });
    return { b, p };
  });

  function fill(t: HTMLTableElement, rows: readonly LbEntry[]): void {
    t.replaceChildren();
    const me = store.profile.name;
    const head = el('tr', '', t);
    for (const h of ['#', 'NAME', 'SCORE', 'DIST']) el('th', '', head, h);
    for (const r of rows) {
      const tr = el('tr', r.name === me ? 'me' : '', t);
      el('td', '', tr, String(r.rank)); el('td', '', tr, r.name);
      el('td', '', tr, r.score.toLocaleString('en-US')); el('td', '', tr, r.distance.toLocaleString('en-US') + ' m');
    }
    if (rows.length === 0) { const tr = el('tr', '', t); const td = el('td', '', tr, 'No scores yet'); td.colSpan = 4; }
  }

  function refresh(): void {
    for (const x of modeBtns) x.b.classList.toggle('on', x.m === mode);
    for (const x of periodBtns) x.b.classList.toggle('on', x.p === period);
    periodTabs.classList.toggle('hidden', mode === 'daily');
    const my = ++token;
    void fetchLeaderboard({ mode, period: mode === 'daily' ? 'all' : period, around: store.profile.name ?? undefined }).then((r) => {
      if (my !== token || !open) return;
      note.classList.toggle('hidden', !r.offline);
      fill(table, r.data.entries);
      const hasAround = r.data.around !== null && r.data.around.length > 0;
      aroundTitle.classList.toggle('hidden', !hasAround);
      aroundTable.classList.toggle('hidden', !hasAround);
      if (hasAround) fill(aroundTable, r.data.around!);
    });
  }

  const self: LeaderboardScreen = {
    root, onBack: () => { /* set by main */ },
    get isOpen(): boolean { return open; },
    open(m?: 'endless' | 'daily'): void { if (m) mode = m; open = true; show(root); refresh(); },
    close(): void { open = false; token++; hide(root); },
  };
  back.addEventListener('click', () => { self.onBack(); });
  window.addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { e.stopPropagation(); self.onBack(); } }, true);
  return self;
}
