import { ACESFilmicToneMapping, AmbientLight, DirectionalLight, PerspectiveCamera, Plane, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three';
import type { Sim } from '../core/types';
import type { Quality } from '../gameApi';
import type { InputSampler } from '../input';
import { CameraRig } from './cameraRig';
import { Environment } from './environment';
import { Ship3D } from './ship3d';
import { World3D } from './world3d';
import { Post } from './post';
import { Fx } from './fx';
import { Popups } from './popups';
import { CAMERA, QUALITY_PIXEL_RATIO } from './renderTuning';

const planeY0 = new Plane(new Vector3(0, 1, 0), 0);
const ray = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

export class GameRenderer {
  readonly gl: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;
  readonly env: Environment;
  readonly ship: Ship3D;
  readonly world: World3D;
  readonly post: Post;
  readonly fx: Fx;
  readonly popups: Popups;
  quality: Quality;
  private readonly sampler: InputSampler;
  private resizeTimer = 0;
  beat = 0;
  /** Hangar preview: ship shown at x=0, slowly yawing, no sim. */
  previewMode = false;
  private warpT = -1;
  private lastSector = -1;
  private biomeInstant = true;

  constructor(canvas: HTMLCanvasElement, quality: Quality, sampler: InputSampler) {
    this.quality = quality;
    this.sampler = sampler;
    this.gl = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1;
    this.gl.info.autoReset = false;
    this.gl.setClearColor(0x05060d);
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(CAMERA.fovMin, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
    this.scene.add(new AmbientLight(0x6688aa, 0.6));
    const dir = new DirectionalLight(0xffffff, 1.6);
    dir.position.set(4, 10, 6);
    this.scene.add(dir);
    this.rig = new CameraRig(this.camera);
    this.env = new Environment(this.scene);
    this.ship = new Ship3D(this.scene);
    this.world = new World3D(this.scene);
    this.post = new Post(this.gl, this.scene, this.camera);
    this.fx = new Fx(this.scene, this.camera, this.post, this.rig);
    this.popups = new Popups(this.scene);
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PIXEL_RATIO[quality]));
    this.resize();
    window.addEventListener('resize', () => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => { this.resize(); }, 100);
    });
  }

  startWarp(nextSectorIndex: number): void {
    this.warpT = 0;
    this.env.setBiome(nextSectorIndex, false);
  }

  private updateWarp(dt: number): void {
    if (this.warpT < 0) return;
    this.warpT += dt;
    const u = this.warpT / 2;
    if (u >= 1) {
      this.warpT = -1; this.post.warp = 0; this.env.streakBoost = 1; this.rig.fovBoost = 0;
      return;
    }
    const s = Math.sin(Math.PI * u);
    this.post.warp = s; this.env.streakBoost = 1 + 7 * s; this.rig.fovBoost = 10 * s;
  }

  get fxTime(): number { return this.fx.fxTime; }

  resetForRun(sim: Sim): void {
    this.world.reset();
    this.fx.reset(); this.popups.reset(); this.post.reset();
    this.fx.sim = sim; this.popups.sim = sim;
    this.warpT = -1; this.post.warp = 0; this.env.streakBoost = 1; this.rig.fovBoost = 0;
    this.rig.snap(0); this.rig.trauma = 0;
    this.lastSector = sim.sectorIndex; this.env.setBiome(sim.sectorIndex, true); this.biomeInstant = false;
    this.ship.reset();
  }

  render(sim: Sim | null, alpha: number, dt: number, nowMs: number): void {
    const t = nowMs / 1000;
    this.gl.info.reset();
    const ws = sim ? sim.worldSpeed : 42;
    this.updateWarp(dt);
    this.ship.previewYaw = this.previewMode ? t * 0.7 : null;
    this.ship.update(this.previewMode ? null : sim, alpha, dt, t);
    this.rig.update(this.ship.drawX, this.ship.bank, ws, dt, t);
    if (sim) this.world.update(sim, alpha, t, this.camera);
    this.fx.shipX = this.ship.drawX; this.fx.alpha = alpha;
    this.fx.update(dt, sim);
    this.popups.update(nowMs);
    if (sim && sim.sectorIndex !== this.lastSector) { this.lastSector = sim.sectorIndex; this.env.setBiome(sim.sectorIndex, this.biomeInstant); this.biomeInstant = false; }
    this.env.update(dt, ws, t, this.beat, this.camera);
    if (this.sampler.pointerInside) {
      ndc.set(this.sampler.pointerNdcX, this.sampler.pointerNdcY);
      ray.setFromCamera(ndc, this.camera);
      if (ray.ray.intersectPlane(planeY0, hit)) this.sampler.pointerWorldX = hit.x;
    }
    this.post.trauma = this.rig.trauma; this.post.speed = ws;
    this.post.lowHull = sim !== null && sim.ship.hull === 1 && !sim.ship.dead;
    this.post.render(dt, t);
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.gl.getPixelRatio();
    this.post.setSize(w, h, pr);
    this.fx.setView(pr, h);
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PIXEL_RATIO[q]));
    this.fx.setQuality(q);
    this.env.setStarCount(q === 'low' ? 1500 : q === 'medium' ? 2400 : 3000);
    this.resize();
  }

  drawCalls(): number { return this.gl.info.render.calls; }
}
