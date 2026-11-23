import type { GameRenderer } from './renderer';

function raf(): Promise<void> { return new Promise((r) => { requestAnimationFrame(() => { r(); }); }); }

export async function warmup(r: GameRenderer, onProgress: (text: string) => void): Promise<void> {
  onProgress('Building ships...');
  await raf();
  onProgress('Warming up effects...');
  const now = performance.now();
  r.world.debugFillAllKinds();
  r.fx.debugSpawnAll();
  r.fx.debugShowNuke();
  r.popups.debugSpawnAll(now);
  r.post.flash(0.2, 100);
  r.post.warp = 0.5;
  r.post.distort[0]!.set(0.5, 0.5, 0.1, 0.02);
  r.ship.reset();
  onProgress('Compiling shaders...');
  r.gl.compile(r.scene, r.camera);
  for (let i = 0; i < 3; i++) {
    r.render(null, 0, 1 / 60, performance.now());
    await raf();
  }
  onProgress('Ready');
  r.world.reset(); r.fx.reset(); r.popups.reset(); r.post.reset(); r.post.warp = 0;
  r.ship.reset();
}
