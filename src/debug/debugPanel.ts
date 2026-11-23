import GUI from 'lil-gui';
import type { GameApi, Quality } from '../gameApi';

export interface DebugHooks { setMouseSteering?: (on: boolean) => void; setBiome?: (i: number) => void; throwInFrame?: () => void }
export interface DebugPanel { update(nowMs: number): void; toggle(): void; readonly state: { god: boolean; simSpeed: number; quality: Quality; invariants: boolean; mouse: boolean; biome: number } }

export function createDebugPanel(game: GameApi, visible: boolean, hooks: DebugHooks = {}): DebugPanel {
  const div = document.createElement('div');
  div.id = 'debug';
  document.body.appendChild(div);
  const gui = new GUI({ title: 'debug' });
  const state = { god: false, simSpeed: 1, quality: 'medium' as Quality, invariants: true, mouse: false, biome: 0 };
  gui.add(state, 'god').name('god (next run)');
  gui.add(state, 'simSpeed', [1, 2, 4]).onChange((v: number) => { game.setSimSpeed(Number(v)); });
  gui.add(state, 'quality', ['low', 'medium', 'high']).onChange((v: Quality) => { game.setQuality(v); });
  gui.add(state, 'invariants').onChange((v: boolean) => { game.setInvariantChecking(v); });
  gui.add(state, 'mouse').name('mouse steering').onChange((v: boolean) => { if (hooks.setMouseSteering) hooks.setMouseSteering(v); });
  if (hooks.setBiome) gui.add(state, 'biome', { Azure: 0, 'Red Giant': 1, Ice: 2, Hive: 3, Void: 4 }).onChange((v: number) => { hooks.setBiome!(Number(v)); });
  if (hooks.throwInFrame) gui.add({ fn: hooks.throwInFrame }, 'fn').name('throw in frame');
  let shown = visible;
  const apply = (): void => {
    div.style.display = shown ? 'block' : 'none';
    gui.domElement.style.display = shown ? '' : 'none';
  };
  apply();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote' && !e.repeat) { shown = !shown; apply(); }
  });
  let nextDue = 0;
  let fpsStart = 0, fpsFrames = 0, fps = 0;
  return {
    state,
    toggle(): void { shown = !shown; apply(); },
    update(nowMs: number): void {
      fpsFrames++;
      if (nowMs - fpsStart >= 1000) { fps = fpsFrames * 1000 / (nowMs - fpsStart); fpsFrames = 0; fpsStart = nowMs; }
      if (nowMs < nextDue) return;
      nextDue = nowMs + 500;
      if (!shown) return;
      const s = game.frameStats();
      const heap = game.heapMb();
      div.textContent =
        'fps ' + fps.toFixed(0) + '\n' +
        'p50 ' + s.p50.toFixed(2) + ' ms\n' +
        'p95 ' + s.p95.toFixed(2) + ' ms\n' +
        'long ' + s.longFrames + '\n' +
        'draw ' + game.drawCalls() + '\n' +
        'alive ' + game.maxAlive() + '\n' +
        'dropped ' + game.maxDropped() + '\n' +
        'restart ' + game.lastRestartMs().toFixed(1) + ' ms\n' +
        'heap ' + (heap === null ? 'n/a' : heap.toFixed(1) + ' MB') + '\n' +
        'tick ' + (game.sim ? game.sim.tick : 0);
    },
  };
}
