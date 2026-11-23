import { el, show, hide, uiRoot } from './dom';
import { saveProfile, store } from '../meta/profile';
import type { Quality } from '../gameApi';
import { RESERVED_KEYS, keyLabel } from '../input';

export interface SettingsHooks { apply(): void; setQuality(q: Quality): void }
export interface SettingsScreen { root: HTMLElement; open(): void; close(): void; onBack: () => void; refresh(): void; readonly isOpen: boolean }

export function createSettingsScreen(hooks: SettingsHooks): SettingsScreen {
  const root = el('div', 'screen hidden', uiRoot);
  const wrap = el('div', 'panel-wrap settings', root);
  el('div', 'title-logo', wrap, 'SETTINGS').style.fontSize = '36px';
  const st = (): typeof store.profile.settings => store.profile.settings;
  const changed = (): void => { saveProfile(store.profile); hooks.apply(); };
  const row = (label: string): HTMLElement => { const r = el('label', 'set-row', wrap); el('span', '', r, label); return r; };
  const refreshers: Array<() => void> = [];
  let binding = false;

  const radio = <T extends string>(label: string, opts: Array<[T, string]>, get: () => T, set: (v: T) => void): void => {
    const r = row(label);
    const grp = el('span', 'set-group', r);
    const btns = opts.map(([v, text]) => {
      const b = el('button', '', grp, text);
      b.addEventListener('click', () => { set(v); paint(); changed(); });
      return { b, v };
    });
    const paint = (): void => { for (const x of btns) x.b.classList.toggle('on', x.v === get()); };
    refreshers.push(paint); paint();
  };
  const check = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
    const r = row(label);
    const c = el('input', '', r); c.type = 'checkbox';
    c.addEventListener('change', () => { set(c.checked); changed(); });
    refreshers.push(() => { c.checked = get(); });
  };
  const range = (label: string, get: () => number, set: (v: number) => void): void => {
    const r = row(label);
    const c = el('input', '', r); c.type = 'range'; c.min = '0'; c.max = '1'; c.step = '0.05';
    c.addEventListener('input', () => { set(Number(c.value)); changed(); });
    refreshers.push(() => { c.value = String(get()); });
  };

  radio<'keyboard' | 'mouse'>('Steering', [['keyboard', 'Keyboard'], ['mouse', 'Mouse']], () => st().steering, (v) => { st().steering = v; });
  check('Auto-fire', () => st().autoFire, (v) => { st().autoFire = v; });
  range('Music volume', () => st().musicVol, (v) => { st().musicVol = v; });
  range('SFX volume', () => st().sfxVol, (v) => { st().sfxVol = v; });
  check('Reduce screen shake', () => st().reduceShake, (v) => { st().reduceShake = v; });
  check('Photosensitive-safe effects', () => st().photosensitive, (v) => { st().photosensitive = v; });
  {
    const r = row('Nuke key');
    const b = el('button', 'key-bind', r);
    let listening = false;
    const paint = (): void => { b.textContent = listening ? 'Press a key… (Esc cancels)' : keyLabel(st().nukeKey); b.classList.toggle('on', listening); };
    const stop = (): void => { listening = false; binding = false; window.removeEventListener('keydown', onKey, true); paint(); };
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') { stop(); return; }
      if (RESERVED_KEYS.has(e.code)) { b.textContent = keyLabel(e.code) + ' is used — pick another'; return; }
      st().nukeKey = e.code; stop(); changed();
    };
    b.addEventListener('click', (e) => { e.preventDefault(); if (listening) { stop(); return; } listening = true; binding = true; paint(); window.addEventListener('keydown', onKey, true); });
    refreshers.push(() => { if (listening) stop(); else paint(); });
    paint();
  }
  radio<Quality>('Quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => st().quality, (v) => { st().quality = v; hooks.setQuality(v); });
  check('Show FPS', () => st().showFps, (v) => { st().showFps = v; });

  const back = el('button', '', wrap, 'Back');
  back.style.marginTop = '12px';
  let isOpen = false;
  const self: SettingsScreen = {
    root, onBack: () => {},
    get isOpen(): boolean { return isOpen; },
    refresh(): void { for (const f of refreshers) f(); },
    open(): void { isOpen = true; self.refresh(); show(root); },
    close(): void { isOpen = false; hide(root); },
  };
  back.addEventListener('click', () => { self.onBack(); });
  window.addEventListener('keydown', (e) => {
    if (!isOpen || binding || e.code !== 'Escape' || e.repeat) return;
    e.stopImmediatePropagation(); self.onBack();
  }, true);
  return self;
}
