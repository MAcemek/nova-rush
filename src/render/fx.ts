import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NormalBlending, SphereGeometry, Points, Quaternion, RingGeometry, Scene, ShaderMaterial, TetrahedronGeometry, Vector3,
} from 'three';
import type { Blending, PerspectiveCamera } from 'three';
import { EvType, Kind, KillCause } from '../core/types';
import type { Sim, SimEvent } from '../core/types';
import type { Quality } from '../gameApi';
import type { Post } from './post';
import type { CameraRig } from './cameraRig';
import { NUKE } from '../core/tuning';
import { DISTORT, EXPLOSIONS, HITSTOP_MS, PARTICLES, POST, RINGS, SHARDS, presetForKind } from './renderTuning';
import type { ExplosionPreset } from './renderTuning';

export type FxListener = (e: SimEvent, nowMs: number) => number;   // returns hitstop ms (0 = none)
export class FxBus {
  private readonly listeners: FxListener[] = [];
  on(l: FxListener): void { this.listeners.push(l); }          // only during boot
  dispatch(events: readonly SimEvent[], nowMs: number): number {
    let hs = 0;
    for (let i = 0; i < events.length; i++) for (let j = 0; j < this.listeners.length; j++) {
      const v = this.listeners[j]!(events[i]!, nowMs); if (v > hs) hs = v;
    }
    return hs;
  }
}

const TWO_PI = Math.PI * 2;
const scratchColor = new Color();
const scratchColor2 = new Color();
const m4 = new Matrix4();
const qA = new Quaternion();
const vP = new Vector3();
const vS = new Vector3();
const vAxis = new Vector3();
const vProj = new Vector3();

function rr(range: number[]): number { return range[0]! + Math.random() * (range[1]! - range[0]!); }

export class ParticleSystem {
  readonly points: Points;
  private readonly cap: number;
  private qcap: number;
  private cursor = 0; private spawnedThisFrame = 0;
  private readonly pos: Float32Array; private readonly vel: Float32Array; private readonly birth: Float32Array;
  private readonly life: Float32Array; private readonly size: Float32Array; private readonly col: Float32Array;
  private readonly attrs: BufferAttribute[];
  private readonly itemSizes: number[];
  private minSlot = 1e9; private maxSlot = -1; private fullDirty = false; private lastSlot = -1;
  private readonly uniforms: { uTime: { value: number }; uGravity: { value: number }; uGrow: { value: number }; uScale: { value: number } };

  constructor(cap: number, blending: Blending, grow: number) {
    this.cap = cap; this.qcap = cap;
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3); this.birth = new Float32Array(cap);
    this.life = new Float32Array(cap); this.size = new Float32Array(cap); this.col = new Float32Array(cap * 3);
    const geo = new BufferGeometry();
    const defs: [string, Float32Array, number][] = [
      ['position', this.pos, 3], ['aVel', this.vel, 3], ['aBirth', this.birth, 1], ['aLife', this.life, 1], ['aSize', this.size, 1], ['aColor', this.col, 3],
    ];
    this.attrs = []; this.itemSizes = [];
    for (const [name, arr, n] of defs) {
      const a = new BufferAttribute(arr, n);
      a.setUsage(DynamicDrawUsage);
      geo.setAttribute(name, a);
      this.attrs.push(a); this.itemSizes.push(n);
    }
    geo.setDrawRange(0, cap);
    this.uniforms = { uTime: { value: 0 }, uGravity: { value: PARTICLES.gravity }, uGrow: { value: grow }, uScale: { value: 800 } };
    const additive = blending === AdditiveBlending;
    const mat = new ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending,
      vertexShader: /* glsl */ `
        uniform float uTime, uGravity, uGrow, uScale;
        attribute vec3 aVel; attribute float aBirth, aLife, aSize; attribute vec3 aColor;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float t = uTime - aBirth; float alive = step(0.0, t) * step(t, aLife);
          vec3 p = position + aVel * t + vec3(0.0, 0.5 * uGravity * t * t, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float k = 1.0 - t / max(aLife, 1e-3); vAlpha = alive * k; vColor = aColor;
          gl_PointSize = alive * aSize * (1.0 + uGrow * t) * uScale / max(-mv.z, 0.1);
          if (alive < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: additive
        ? /* glsl */ `varying vec3 vColor; varying float vAlpha;
          void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vAlpha; if (a < 0.003) discard; gl_FragColor = vec4(vColor * a, a); }`
        : /* glsl */ `varying vec3 vColor; varying float vAlpha;
          void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vAlpha; if (a < 0.003) discard; gl_FragColor = vec4(vColor, a * 0.6); }`,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
  }

  setQualityCap(n: number): void {
    this.qcap = Math.min(n, this.cap);
    if (this.cursor >= this.qcap) this.cursor = 0;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, now: number): void {
    if (this.spawnedThisFrame >= PARTICLES.maxSpawnPerFrame) return;
    this.spawnedThisFrame++;
    const s = this.cursor;
    this.cursor = (s + 1) % this.qcap;
    if (s < this.lastSlot) this.fullDirty = true;
    this.lastSlot = s;
    if (s < this.minSlot) this.minSlot = s;
    if (s > this.maxSlot) this.maxSlot = s;
    const p = this.pos, v = this.vel, c = this.col;
    p[s * 3] = x; p[s * 3 + 1] = y; p[s * 3 + 2] = z;
    v[s * 3] = vx; v[s * 3 + 1] = vy; v[s * 3 + 2] = vz;
    this.birth[s] = now; this.life[s] = life; this.size[s] = size;
    c[s * 3] = r; c[s * 3 + 1] = g; c[s * 3 + 2] = b;
  }

  clear(): void {
    this.life.fill(0);
    this.cursor = 0; this.lastSlot = -1;
    this.minSlot = 0; this.maxSlot = this.cap - 1; this.fullDirty = true;
  }

  update(now: number, pixelRatio: number, viewportHeight: number, tanHalfFov: number): void {
    this.spawnedThisFrame = 0;
    this.uniforms.uTime.value = now;
    this.uniforms.uScale.value = viewportHeight * pixelRatio * 0.5 / tanHalfFov;
    if (this.maxSlot < 0 && !this.fullDirty) return;
    let start = this.minSlot, end = this.maxSlot;
    if (this.fullDirty) { start = 0; end = Math.max(this.maxSlot, this.qcap - 1); }
    for (let i = 0; i < this.attrs.length; i++) {
      const a = this.attrs[i]!;
      a.clearUpdateRanges();
      a.addUpdateRange(start * this.itemSizes[i]!, (end - start + 1) * this.itemSizes[i]!);
      a.needsUpdate = true;
    }
    this.minSlot = 1e9; this.maxSlot = -1; this.fullDirty = false; this.lastSlot = -1;
  }
}

class ShardPool {
  readonly mesh: InstancedMesh;
  private cursor = 0;
  private readonly birth = new Float32Array(SHARDS.cap);
  private readonly start = new Float32Array(SHARDS.cap * 3);
  private readonly vel = new Float32Array(SHARDS.cap * 3);
  private readonly axis = new Float32Array(SHARDS.cap * 3);
  private readonly spin = new Float32Array(SHARDS.cap);
  private readonly wasAlive = new Uint8Array(SHARDS.cap);
  private colorDirty = false;

  constructor(scene: Scene) {
    const mat = new MeshStandardMaterial({ flatShading: true, roughness: 0.6, emissive: 0x111111 });
    this.mesh = new InstancedMesh(new TetrahedronGeometry(0.35), mat, SHARDS.cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const white = new Color(0xffffff);
    for (let i = 0; i < SHARDS.cap; i++) { this.mesh.setColorAt(i, white); this.birth[i] = -1e9; this.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); }
    this.mesh.instanceColor!.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = SHARDS.cap;
    scene.add(this.mesh);
  }

  spawn(now: number, x: number, z: number, vzBase: number, hex: number): void {
    const s = this.cursor; this.cursor = (s + 1) % SHARDS.cap;
    this.birth[s] = now;
    this.start[s * 3] = x; this.start[s * 3 + 1] = 0; this.start[s * 3 + 2] = z;
    const th = Math.random() * TWO_PI, cy = Math.random() * 1.4 - 0.2, sy = Math.sqrt(1 - cy * cy), sp = rr(SHARDS.speed);
    this.vel[s * 3] = sy * Math.cos(th) * sp; this.vel[s * 3 + 1] = cy * sp; this.vel[s * 3 + 2] = sy * Math.sin(th) * sp + vzBase;
    vAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    if (vAxis.lengthSq() < 1e-6) vAxis.set(0, 1, 0);
    vAxis.normalize();
    this.axis[s * 3] = vAxis.x; this.axis[s * 3 + 1] = vAxis.y; this.axis[s * 3 + 2] = vAxis.z;
    this.spin[s] = rr(SHARDS.spin);
    scratchColor.setHex(hex);
    this.mesh.setColorAt(s, scratchColor);
    this.colorDirty = true;
  }

  update(now: number): void {
    for (let i = 0; i < SHARDS.cap; i++) {
      const t = now - this.birth[i]!;
      if (t >= 0 && t < SHARDS.life) {
        const u = t / SHARDS.life;
        const sc = 1 - u * u * u;
        vP.set(this.start[i * 3]! + this.vel[i * 3]! * t, this.start[i * 3 + 1]! + this.vel[i * 3 + 1]! * t + 0.5 * PARTICLES.gravity * t * t, this.start[i * 3 + 2]! + this.vel[i * 3 + 2]! * t);
        vAxis.set(this.axis[i * 3]!, this.axis[i * 3 + 1]!, this.axis[i * 3 + 2]!);
        qA.setFromAxisAngle(vAxis, this.spin[i]! * t);
        vS.set(sc, sc, sc);
        m4.compose(vP, qA, vS);
        this.mesh.setMatrixAt(i, m4);
        this.wasAlive[i] = 1;
      } else if (this.wasAlive[i] === 1) {
        this.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
        this.wasAlive[i] = 0;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colorDirty) { this.mesh.instanceColor!.needsUpdate = true; this.colorDirty = false; }
  }

  clear(): void {
    this.birth.fill(-1e9);
    for (let i = 0; i < SHARDS.cap; i++) { this.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); this.wasAlive[i] = 0; }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class RingPool {
  readonly mesh: InstancedMesh;
  private cursor = 0;
  private readonly birth = new Float32Array(RINGS.cap).fill(-1e9);
  private readonly x = new Float32Array(RINGS.cap);
  private readonly z = new Float32Array(RINGS.cap);
  private readonly radius = new Float32Array(RINGS.cap);
  private readonly hex = new Uint32Array(RINGS.cap);
  private readonly wasAlive = new Uint8Array(RINGS.cap);

  constructor(scene: Scene) {
    const geo = new RingGeometry(0.92, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new InstancedMesh(geo, mat, RINGS.cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const white = new Color(0xffffff);
    for (let i = 0; i < RINGS.cap; i++) { this.mesh.setColorAt(i, white); this.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); }
    this.mesh.instanceColor!.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  spawn(now: number, x: number, z: number, radius: number, hex: number): void {
    const s = this.cursor; this.cursor = (s + 1) % RINGS.cap;
    this.birth[s] = now; this.x[s] = x; this.z[s] = z; this.radius[s] = radius; this.hex[s] = hex;
  }

  update(now: number): void {
    let colorDirty = false;
    for (let i = 0; i < RINGS.cap; i++) {
      const t = now - this.birth[i]!;
      if (t >= 0 && t < RINGS.life) {
        const u = t / RINGS.life;
        const e = 1 - (1 - u) * (1 - u) * (1 - u);
        const r = this.radius[i]! * e;
        vP.set(this.x[i]!, 0.05, this.z[i]!);
        vS.set(r, r, r);
        m4.compose(vP, qA.identity(), vS);
        this.mesh.setMatrixAt(i, m4);
        scratchColor.setHex(this.hex[i]!).multiplyScalar(2 * (1 - u));
        this.mesh.setColorAt(i, scratchColor);
        colorDirty = true;
        this.wasAlive[i] = 1;
      } else if (this.wasAlive[i] === 1) {
        this.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
        this.wasAlive[i] = 0;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorDirty) this.mesh.instanceColor!.needsUpdate = true;
  }

  clear(): void {
    this.birth.fill(-1e9);
    for (let i = 0; i < RINGS.cap; i++) { this.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); this.wasAlive[i] = 0; }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Fx {
  readonly additive: ParticleSystem;
  readonly smoke: ParticleSystem;
  sim: Sim | null = null;
  fxTime = 0;
  private readonly camera: PerspectiveCamera;
  private readonly post: Post;
  private readonly rig: CameraRig;
  private readonly shards: ShardPool;
  private readonly rings: RingPool;
  private qFactor = 0.75;
  private pixelRatio = 1; private viewH = 720;
  private readonly dBirth = new Float32Array(DISTORT.slots).fill(-1e9);
  private readonly dX = new Float32Array(DISTORT.slots);
  private readonly dZ = new Float32Array(DISTORT.slots);
  shipX = 0; alpha = 0;
  private readonly missile: Mesh;
  private readonly dome: Mesh;
  private warmShow = false;
  private domeBirth = -1e9; private domeX = 0; private domeZ = 0;
  private static readonly DCAP = 256;
  private readonly delAt = new Float64Array(Fx.DCAP);
  private readonly delX = new Float32Array(Fx.DCAP);
  private readonly delZ = new Float32Array(Fx.DCAP);
  private readonly delPreset: ExplosionPreset[] = [];
  private readonly delUsed = new Uint8Array(Fx.DCAP);
  private delCursor = 0;

  constructor(scene: Scene, camera: PerspectiveCamera, post: Post, rig: CameraRig) {
    this.camera = camera; this.post = post; this.rig = rig;
    this.additive = new ParticleSystem(PARTICLES.capAdditive, AdditiveBlending, 0);
    this.smoke = new ParticleSystem(PARTICLES.capNormal, NormalBlending, 1.2);
    this.additive.points.renderOrder = 2; this.smoke.points.renderOrder = 1;
    scene.add(this.additive.points); scene.add(this.smoke.points);
    this.shards = new ShardPool(scene);
    this.rings = new RingPool(scene);
    for (let i = 0; i < Fx.DCAP; i++) this.delPreset.push(EXPLOSIONS.asteroidS);
    const mg = new ConeGeometry(0.3, 1.2, 8); mg.rotateX(-Math.PI / 2);
    const mm = new MeshBasicMaterial({ color: 0xffd0a0, toneMapped: false }); mm.color.multiplyScalar(3);
    this.missile = new Mesh(mg, mm); this.missile.visible = false; this.missile.frustumCulled = false;
    scene.add(this.missile);
    const dm = new MeshBasicMaterial({ color: 0xfff1c0, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 1 });
    this.dome = new Mesh(new SphereGeometry(1, 32, 16), dm); this.dome.visible = false; this.dome.frustumCulled = false; this.dome.renderOrder = 4;
    scene.add(this.dome);
    this.setQuality('medium');
  }

  setQuality(q: Quality): void {
    this.qFactor = q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1;
    this.additive.setQualityCap(PARTICLES.qualityCap[q]);
    this.smoke.setQualityCap(PARTICLES.qualityCap[q] / 2);
  }

  setView(pixelRatio: number, heightPx: number): void { this.pixelRatio = pixelRatio; this.viewH = heightPx; }

  explosion(p: ExplosionPreset, x: number, z: number, scale: number, worldSpeed: number): void {
    const now = this.fxTime;
    const add = this.additive;
    scratchColor.setHex(p.color);
    add.spawn(x, 0.4, z, 0, 0, worldSpeed * 0.8, PARTICLES.flashLife, p.flash * scale, scratchColor.r * 4, scratchColor.g * 4, scratchColor.b * 4, now);
    scratchColor2.setHex(0xffffff);
    const cr = (scratchColor.r + scratchColor2.r) * 0.5 * 3, cg = (scratchColor.g + scratchColor2.g) * 0.5 * 3, cb = (scratchColor.b + scratchColor2.b) * 0.5 * 3;
    const n = Math.round(p.sparks * this.qFactor);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * TWO_PI, cy = Math.random() * 1.2 - 0.2, sy = Math.sqrt(1 - cy * cy), sp = rr(PARTICLES.sparkSpeed);
      add.spawn(x, 0.2, z, sy * Math.cos(th) * sp, cy * sp, sy * Math.sin(th) * sp + worldSpeed * 0.8, rr(PARTICLES.sparkLife), rr(PARTICLES.sparkSize) * scale, cr, cg, cb, now);
    }
    scratchColor2.setHex(0x40444c);
    for (let i = 0; i < p.smoke; i++) {
      const th = Math.random() * TWO_PI, sp = 1 + Math.random() * 2;
      this.smoke.spawn(x, 0.3, z, Math.cos(th) * sp, Math.random() * 1.5, Math.sin(th) * sp + worldSpeed * 0.8, rr(PARTICLES.smokeLife), rr(PARTICLES.smokeSize) * scale, scratchColor2.r, scratchColor2.g, scratchColor2.b, now);
    }
    for (let i = 0; i < p.shards; i++) this.shards.spawn(now, x, z, worldSpeed * 0.8, p.color);
    this.rings.spawn(now, x, z, p.ring * scale, p.color);
    if (p.distortion) this.spawnDistortion(x, z);
  }

  private spawnDistortion(x: number, z: number): void {
    let slot = 0, oldest = 1e18;
    for (let i = 0; i < DISTORT.slots; i++) {
      if (this.fxTime - this.dBirth[i]! >= DISTORT.life) { slot = i; oldest = -1; break; }
      if (this.dBirth[i]! < oldest) { oldest = this.dBirth[i]!; slot = i; }
    }
    this.dBirth[slot] = this.fxTime; this.dX[slot] = x; this.dZ[slot] = z;
  }

  readonly listener: FxListener = (e: SimEvent): number => {
    const ws = this.sim ? this.sim.worldSpeed : 42;
    switch (e.type) {
      case EvType.Kill: {
        const p = presetForKind(e.kind);
        if (e.b === KillCause.Nuke && this.sim) {
          const dx = e.x - this.sim.ship.x, dz = e.z - NUKE.offsetZ;
          const frac = Math.min(1, Math.max(0, Math.sqrt(dx * dx + dz * dz) / NUKE.radius));
          const i = this.delCursor; this.delCursor = (i + 1) % Fx.DCAP;
          this.delAt[i] = this.fxTime + 0.15 * frac; this.delX[i] = e.x; this.delZ[i] = e.z; this.delPreset[i] = p; this.delUsed[i] = 1;
          return 0;
        }
        this.explosion(p, e.x, e.z, 1, ws);
        this.rig.addTrauma(p.trauma);
        return e.kind === Kind.AsteroidL ? HITSTOP_MS.asteroidL : e.kind === Kind.Gunship ? HITSTOP_MS.gunship : 0;
      }
      case EvType.Damage: {
        for (let i = 0; i < 6; i++) {
          const th = Math.random() * TWO_PI, sp = 4 + Math.random() * 8;
          this.additive.spawn(e.x, 0.2, e.z, Math.cos(th) * sp, Math.random() * 5, Math.sin(th) * sp + ws * 0.8, 0.25, 0.3, 2.4, 2.4, 2.6, this.fxTime);
        }
        return 0;
      }
      case EvType.ShipHit:
        this.explosion(EXPLOSIONS.playerHit, e.x, 0, 0.6, ws);
        this.rig.addTrauma(0.5);
        this.post.flash(0.25, 120);
        return HITSTOP_MS.playerHit;
      case EvType.MineBlast:
        this.rings.spawn(this.fxTime, e.x, e.z, 14, EXPLOSIONS.mine.color);
        this.explosion(EXPLOSIONS.mine, e.x, e.z, 1, ws);
        return 0;
      case EvType.NukeDetonate:
        this.explosion(EXPLOSIONS.nuke, e.x, e.z, 1, ws);
        this.domeBirth = this.fxTime; this.domeX = e.x; this.domeZ = e.z;
        this.rig.addTrauma(0.8);
        this.post.flash(1.0, POST.nukeFlashMs);
        return HITSTOP_MS.nuke;
      case EvType.BossPhase:
        this.rig.addTrauma(0.4);
        return HITSTOP_MS.bossPhase;
      case EvType.BossDefeated:
        this.explosion(EXPLOSIONS.boss, e.x, e.z, 1.5, ws);
        this.post.flash(0.6, 150);
        return 0;
      default:
        return 0;
    }
  };

  update(dt: number, sim: Sim | null): void {
    this.fxTime += dt;
    this.sim = sim;
    const now = this.fxTime;
    this.camera.updateMatrixWorld();
    for (let i = 0; i < Fx.DCAP; i++) {
      if (this.delUsed[i] === 1 && now >= this.delAt[i]!) {
        this.delUsed[i] = 0;
        this.explosion(this.delPreset[i]!, this.delX[i]!, this.delZ[i]!, 1, sim ? sim.worldSpeed : 42);
      }
    }
    if (sim && sim.nukeFlight > 0) {
      const z = NUKE.offsetZ * (1 - (sim.nukeFlight - this.alpha) / NUKE.flightTicks);
      this.missile.visible = true; this.missile.position.set(this.shipX, 0, z);
      for (let i = 0; i < 2; i++) this.additive.spawn(this.shipX + (Math.random() - 0.5) * 0.3, 0, z + 0.8, (Math.random() - 0.5) * 2, Math.random() * 2, sim.worldSpeed * 0.8, 0.35, 0.5, 4, 2.4, 1, now);
    } else this.missile.visible = this.warmShow;
    const du = (now - this.domeBirth) / 0.6;
    if (du >= 0 && du < 1) {
      const e = 1 - (1 - du) * (1 - du) * (1 - du);
      this.dome.visible = true; this.dome.position.set(this.domeX, 0, this.domeZ); this.dome.scale.setScalar(NUKE.radius * e);
      (this.dome.material as MeshBasicMaterial).opacity = 0.6 * (1 - du);
    } else this.dome.visible = this.warmShow;
    this.shards.update(now);
    this.rings.update(now);
    for (let i = 0; i < DISTORT.slots; i++) {
      const t = now - this.dBirth[i]!;
      const d = this.post.distort[i]!;
      if (t >= 0 && t < DISTORT.life) {
        const u = t / DISTORT.life;
        vProj.set(this.dX[i]!, 0, this.dZ[i]!).project(this.camera);
        d.set(vProj.x * 0.5 + 0.5, vProj.y * 0.5 + 0.5, DISTORT.maxRadius * u, DISTORT.strength * (1 - u));
      } else d.w = 0;
    }
    const tanHalf = Math.tan(this.camera.fov * Math.PI / 360);
    this.additive.update(now, this.pixelRatio, this.viewH, tanHalf);
    this.smoke.update(now, this.pixelRatio, this.viewH, tanHalf);
  }

  reset(): void {
    this.additive.clear(); this.smoke.clear(); this.shards.clear(); this.rings.clear();
    this.dBirth.fill(-1e9);
    for (let i = 0; i < DISTORT.slots; i++) this.post.distort[i]!.w = 0;
    this.delUsed.fill(0); this.warmShow = false; this.domeBirth = -1e9; this.dome.visible = false; this.missile.visible = false;
  }

  /** Warmup only: make the nuke missile/dome visible so their programs and buffers are compiled/uploaded. reset() hides them. */
  debugShowNuke(): void { this.warmShow = true; this.missile.visible = true; this.dome.visible = true; }

  debugSpawnAll(): void {
    const keys = Object.keys(EXPLOSIONS) as (keyof typeof EXPLOSIONS)[];
    for (let i = 0; i < keys.length; i++) this.explosion(EXPLOSIONS[keys[i]!], 0, -20, 1, 42);
  }
}
