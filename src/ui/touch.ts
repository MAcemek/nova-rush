import { el, uiRoot } from './dom';
import type { InputSampler } from '../input';
import type { GameApi } from '../gameApi';

export interface TouchControls { root: HTMLElement; enable(): void; setVisible(v: boolean): void; readonly enabled: boolean }

export function createTouchControls(sampler: InputSampler, game: GameApi, canvas: HTMLCanvasElement): TouchControls {
  const root = el('div', 'touch-controls hidden', uiRoot);
  const roll = el('button', 'touch-roll', root, 'ROLL');
  const nuke = el('button', 'touch-nuke', root, 'NUKE');
  const jump = el('button', 'touch-jump', root, 'JUMP');
  let enabled = false, want = false;
  const paint = (): void => { root.classList.toggle('hidden', !(enabled && want)); };
  let id = -1, startX = 0, baseX = 0, lastDragSign: -1 | 1 = 1, lastClientX = 0;
  const bind = (b: HTMLElement, fn: () => void): void => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
  };
  bind(nuke, () => { sampler.injectNuke(); });
  bind(roll, () => { sampler.injectRoll(lastDragSign); });
  bind(jump, () => { sampler.injectJump(); });
  const self: TouchControls = {
    root, setVisible(v: boolean): void { want = v; paint(); },
    get enabled(): boolean { return enabled; },
    enable(): void {
      if (enabled) return;
      enabled = true; sampler.autoFire = true; sampler.touchEnabled = true;
      paint();
    },
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    self.enable();
    if (id !== -1 || e.clientX >= window.innerWidth / 2) return;
    const sim = game.sim;
    id = e.pointerId; startX = e.clientX; lastClientX = e.clientX; baseX = sim ? sim.ship.x : 0;
    try { canvas.setPointerCapture(id); } catch { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const v = baseX + (e.clientX - startX) * 28 / (window.innerWidth * 0.5);
    sampler.touchSteerX = v < -14 ? -14 : v > 14 ? 14 : v;
    sampler.touchActive = true;
    if (e.clientX !== lastClientX) { lastDragSign = e.clientX > lastClientX ? 1 : -1; lastClientX = e.clientX; }
  });
  const end = (e: PointerEvent): void => { if (e.pointerId === id) { id = -1; sampler.touchActive = false; } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) self.enable();
  return self;
}
