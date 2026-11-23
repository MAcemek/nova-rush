import { el, show, hide, uiRoot } from './dom';
import { COSMETICS, buy, equip } from '../meta/cosmetics';
import type { CosmeticKind } from '../meta/cosmetics';
import { saveProfile, store } from '../meta/profile';
import { achievementName, grantAchievement } from '../meta/achievements';
import { toast } from './toasts';

export interface HangarScreen { root: HTMLElement; open(): void; close(): void; onBack: () => void; onChange: () => void; readonly isOpen: boolean }

export function createHangarScreen(): HangarScreen {
  const root = el('div', 'screen hidden', uiRoot);
  const wrap = el('div', 'panel-wrap', root);
  el('div', 'title-logo', wrap, 'HANGAR').style.fontSize = '36px';
  const bal = el('div', 'go-cry', wrap);
  const tabs = el('div', 'tabs', wrap);
  const cards = el('div', 'cards', wrap);
  const back = el('button', '', wrap, 'Back');
  back.style.marginTop = '12px';
  let kind: CosmeticKind = 'hull';
  let open = false;
  const kinds: CosmeticKind[] = ['hull', 'paint', 'laser', 'trail'];
  const tabBtns = kinds.map((k) => {
    const b = el('button', '', tabs, k[0]!.toUpperCase() + k.slice(1));
    b.addEventListener('click', () => { kind = k; render(); });
    return { b, k };
  });
  function render(): void {
    const p = store.profile;
    bal.textContent = '\u25C6 ' + p.crystals.toLocaleString('en-US') + ' crystals';
    for (const t of tabBtns) t.b.classList.toggle('on', t.k === kind);
    cards.replaceChildren();
    for (const c of COSMETICS) {
      if (c.kind !== kind) continue;
      const owned = p.cosmetics.owned.includes(c.id), equipped = p.cosmetics[c.kind] === c.id;
      const card = el('div', 'card' + (equipped ? ' eq' : ''), cards);
      const sw = el('div', 'swatch', card);
      sw.style.background = c.kind === 'hull' ? '#7ef0ff' : '#' + c.color.toString(16).padStart(6, '0');
      el('div', '', card, c.name);
      el('div', '', card, equipped ? 'EQUIPPED' : owned ? 'OWNED' : '\u25C6 ' + String(c.price)).style.fontSize = '12px';
      card.addEventListener('click', () => {
        if (owned) { equip(p, c.id); }
        else if (buy(p, c.id)) {
          toast('Unlocked ' + c.name, 'info');
          if (grantAchievement(p, 'buy_cosmetic')) toast('Achievement: ' + achievementName('buy_cosmetic'), 'achievement');
        } else { toast('Not enough crystals', 'warn'); return; }
        saveProfile(p);
        self.onChange();
        render();
      });
    }
  }
  const self: HangarScreen = {
    root, onBack: () => { /* set by main */ }, onChange: () => { /* set by main */ },
    get isOpen(): boolean { return open; },
    open(): void { open = true; show(root); render(); },
    close(): void { open = false; hide(root); },
  };
  back.addEventListener('click', () => { self.onBack(); });
  window.addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { e.stopPropagation(); self.onBack(); } }, true);
  return self;
}
