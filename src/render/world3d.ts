import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, IcosahedronGeometry, Matrix4, MeshBasicMaterial,
  MeshStandardMaterial, OctahedronGeometry, Quaternion, RingGeometry, Scene, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { BufferGeometry, PerspectiveCamera } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kind, PowerType } from '../core/types';
import type { Sim } from '../core/types';
import { Inst } from './instanced';

const m4 = new Matrix4();
const q1 = new Quaternion();
const q2 = new Quaternion();
const v1 = new Vector3();
const v2 = new Vector3();
const vOne = new Vector3();
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);

export function fract(x: number): number { return x - Math.floor(x); }
export function hid(id: number, s: number): number { return fract(Math.sin(id * 12.9898 + s * 78.233) * 43758.5453); }

function hash3(x: number, y: number, z: number): number { return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453); }
function smooth(t: number): number { return t * t * (3 - 2 * t); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  return lerp(
    lerp(lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
    lerp(lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy), fz) - 0.5;
}

export function makeRockGeometry(radius: number, detail: number, amp: number, seed: number): BufferGeometry {
  const g = new IcosahedronGeometry(radius, detail);
  const p = g.attributes['position']!;
  for (let i = 0; i < p.count; i++) {
    v1.fromBufferAttribute(p, i);
    const len = v1.length();
    v2.copy(v1).divideScalar(len);
    const n = noise3(v2.x * 1.7 + seed, v2.y * 1.7 + seed * 1.3, v2.z * 1.7 + seed * 0.7);
    v1.copy(v2).multiplyScalar(len * (1 + amp * n * 2));
    p.setXYZ(i, v1.x, v1.y, v1.z);
  }
  g.computeVertexNormals();
  return g;
}

function nonIndexed(g: BufferGeometry): BufferGeometry { return g.index ? g.toNonIndexed() : g; }
export function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const parts2 = parts.map((p) => { const n = nonIndexed(p); n.deleteAttribute('uv'); return n; });
  return mergeGeometries(parts2)!;
}

const AST_COLOR = [0x9a8f84, 0x8a7d70, 0x75695e];
const POWER_COLOR: number[] = [];
POWER_COLOR[PowerType.Spread] = 0x7aff5a; POWER_COLOR[PowerType.Rapid] = 0xffe14a; POWER_COLOR[PowerType.Pierce] = 0xff5aff;
POWER_COLOR[PowerType.Magnet] = 0x5aa0ff; POWER_COLOR[PowerType.X2] = 0xffd54a; POWER_COLOR[PowerType.Shield] = 0x3df6ff;
POWER_COLOR[PowerType.Jump] = 0x9a7bff; POWER_COLOR[PowerType.Ram] = 0xd0d8e8; POWER_COLOR[PowerType.Repair] = 0xff5a7e; POWER_COLOR[PowerType.Overhaul] = 0xffffff;

function mineGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [new IcosahedronGeometry(0.7, 0)];
  const dirs: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.707, 0.707, 0], [-0.707, 0.707, 0]];
  for (const d of dirs) {
    const c = new ConeGeometry(0.18, 0.6, 5);
    c.translate(0, 0.95, 0);
    q1.setFromUnitVectors(AXIS_Y, v1.set(d[0], d[1], d[2]).normalize());
    c.applyQuaternion(q1);
    parts.push(c);
  }
  return mergeParts(parts);
}

export function barrierMaterial(hex: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(hex) } },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * im * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec3 vPos;
      void main() {
        float s = 0.5 + 0.5 * sin((vPos.y * 6.0 + vPos.x * 2.0) - uTime * 8.0);
        vec3 c = uColor * (0.6 + 1.6 * s);
        float edge = step(0.66, abs(vPos.y) / 0.8);
        gl_FragColor = vec4(c * (1.0 + edge * 1.5), 1.0);
      }`,
  });
}

export class World3D {
  private readonly asteroids: Inst[] = [];
  private readonly bolts: Inst;
  private readonly mine: Inst; private readonly mineCore: Inst;
  private readonly barrier: Inst; private readonly laserWall: Inst;
  private readonly barrierMat: ShaderMaterial; private readonly wallMat: ShaderMaterial;
  private readonly drone: Inst; private readonly swarmer: Inst; private readonly gunship: Inst; private readonly warden: Inst; private readonly wardenShield: Inst;
  private readonly crystal: Inst; private readonly powerUp: Inst; private readonly nukePickup: Inst;
  private readonly bulletOrb: Inst; private readonly bulletRing: Inst;
  private readonly hiveBody: Inst; private readonly hiveCore: Inst; private readonly primeBody: Inst; private readonly primeRing: Inst;
  private readonly serpent: Inst; private readonly telegraph: Inst;
  private readonly all: Inst[] = [];
  private laserHex = 0x5ff4ff;
  private readonly gate: Inst;
  /** World z of the personal-best gate ring, or null when hidden. */
  gateZ: number | null = null;

  constructor(scene: Scene) {
    const add = (i: Inst): Inst => { this.all.push(i); scene.add(i.mesh); return i; };
    const rockMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05, flatShading: true });
    for (let v = 0; v < 4; v++) this.asteroids.push(add(new Inst(makeRockGeometry(1, 2, 0.18, v * 17.3), rockMat, 512)));
    this.bolts = add(new Inst(new BoxGeometry(0.14, 0.14, 1.8), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 256));
    this.mine = add(new Inst(mineGeometry(), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.6 }), 256));
    this.mineCore = add(new Inst(new SphereGeometry(0.35, 10, 8), new MeshBasicMaterial({ toneMapped: false }), 256));
    this.barrierMat = barrierMaterial(0x3ad0ff);
    this.wallMat = barrierMaterial(0xff2a6a);
    this.barrier = add(new Inst(new BoxGeometry(1.5, 1.6, 0.6), this.barrierMat, 512));
    this.laserWall = add(new Inst(new BoxGeometry(1.5, 2.2, 0.4), this.wallMat, 256));
    const aliveMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x220018, metalness: 0.3, roughness: 0.4 });
    const droneGeo = mergeParts([new OctahedronGeometry(1.0), new TorusGeometry(1.2, 0.12, 6, 24).rotateX(Math.PI / 2)]);
    this.drone = add(new Inst(droneGeo, aliveMat, 128));
    this.swarmer = add(new Inst(new ConeGeometry(0.7, 1.6, 4).rotateX(Math.PI / 2), aliveMat, 256));
    const gunGeo = mergeParts([new BoxGeometry(3.2, 0.8, 2.2), new CylinderGeometry(0.4, 0.4, 2.6, 8).rotateX(Math.PI / 2).translate(1.9, 0, 0), new CylinderGeometry(0.4, 0.4, 2.6, 8).rotateX(Math.PI / 2).translate(-1.9, 0, 0)]);
    this.gunship = add(new Inst(gunGeo, aliveMat, 32));
    this.warden = add(new Inst(new DodecahedronGeometry(1.4), aliveMat, 64));
    const shieldGeo = new TorusGeometry(2.4, 0.12, 6, 32, Math.PI * 1.4).rotateZ(-0.7 * Math.PI).rotateX(-Math.PI / 2);
    this.wardenShield = add(new Inst(shieldGeo, new MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }), 64));
    this.crystal = add(new Inst(new OctahedronGeometry(0.6), new MeshBasicMaterial({ toneMapped: false }), 256));
    this.powerUp = add(new Inst(mergeParts([new IcosahedronGeometry(0.8, 0), new TorusGeometry(1.1, 0.07, 6, 24)]), new MeshBasicMaterial({ toneMapped: false }), 32));
    this.nukePickup = add(new Inst(mergeParts([new SphereGeometry(0.8, 16, 12), new TorusGeometry(1.1, 0.07, 6, 24)]), new MeshBasicMaterial({ toneMapped: false }), 16));
    this.bulletRing = add(new Inst(new RingGeometry(0.55, 0.78, 24), new MeshBasicMaterial({ color: 0x1a0010, transparent: true, opacity: 0.9, depthWrite: false }), 512, 1));
    this.bulletOrb = add(new Inst(new SphereGeometry(0.5, 12, 8), new MeshBasicMaterial({ toneMapped: false }), 512, 2));
    const bossMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2, flatShading: true });
    this.hiveBody = add(new Inst(makeRockGeometry(6, 1, 0.6 / 6, 3.1), bossMat, 1));
    this.hiveCore = add(new Inst(new SphereGeometry(2, 20, 14), new MeshBasicMaterial({ toneMapped: false }), 1));
    this.primeBody = add(new Inst(new OctahedronGeometry(5), bossMat, 1));
    this.primeRing = add(new Inst(new TorusGeometry(6.5, 0.3, 8, 48).rotateX(Math.PI / 2), bossMat, 1));
    this.serpent = add(new Inst(new SphereGeometry(1.8, 16, 12), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3, emissive: 0x1a0a30 }), 16));
    this.gate = add(new Inst(new TorusGeometry(16, 0.45, 8, 64), new MeshBasicMaterial({ toneMapped: false }), 1));
    this.telegraph = add(new Inst(new BoxGeometry(1.5, 0.1, 6), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 32));
  }

  setLaserColor(hex: number): void { this.laserHex = hex; }

  reset(): void { for (let i = 0; i < this.all.length; i++) this.all[i]!.reset(); }

  debugFillAllKinds(): void {
    for (let i = 0; i < this.all.length; i++) {
      const a = this.all[i]!;
      a.begin();
      vOne.set(1, 1, 1); q1.identity(); v2.set(-8 + (i % 8) * 2.2, 0, -20 - Math.floor(i / 8) * 4);
      m4.compose(v2, q1, vOne);
      a.push(m4, 0xffffff, 1);
      a.end();
    }
  }

  update(sim: Sim, alpha: number, timeSec: number, camera?: PerspectiveCamera): void {
    for (let i = 0; i < this.all.length; i++) this.all[i]!.begin();
    this.barrierMat.uniforms['uTime']!.value = timeSec; this.wallMat.uniforms['uTime']!.value = timeSec;
    const ws = sim.worldSpeed;
    const items = sim.entities.items;
    for (let i = 0; i < items.length; i++) {
      const e = items[i]!;
      if (!e.alive) continue;
      const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
      const k = e.kind;
      const fl = e.flashTicks > 0;
      v2.set(x, 0, z);
      switch (k) {
        case Kind.AsteroidS: case Kind.AsteroidM: case Kind.AsteroidL:
          v1.set(hid(e.id, 1) - 0.5, hid(e.id, 2) - 0.5, hid(e.id, 3) - 0.5);
          if (v1.lengthSq() < 1e-6) v1.set(0, 1, 0);
          v1.normalize();
          q1.setFromAxisAngle(v1, timeSec * (0.4 + 1.2 * hid(e.id, 4)));
          vOne.set(e.r, e.r, e.r);
          m4.compose(v2, q1, vOne);
          this.asteroids[e.id % 4]!.push(m4, fl ? 0xffffff : AST_COLOR[k]!, fl ? 2 : 1);
          break;
        case Kind.Mine:
          v1.set(hid(e.id, 1) - 0.5, hid(e.id, 2) - 0.5, hid(e.id, 3) - 0.5);
          if (v1.lengthSq() < 1e-6) v1.set(0, 1, 0);
          v1.normalize();
          q1.setFromAxisAngle(v1, timeSec * 0.5);
          vOne.set(1, 1, 1);
          m4.compose(v2, q1, vOne);
          this.mine.push(m4, fl ? 0xffffff : 0x3a2626, fl ? 2 : 1);
          q1.identity();
          m4.compose(v2, q1, vOne);
          this.mineCore.push(m4, 0xff3a2a, Math.sin(timeSec * 8 + e.id) > 0 ? 3 : 0.4);
          break;
        case Kind.Barrier:
          q1.identity(); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne); this.barrier.push(m4, 0xffffff, 1); break;
        case Kind.LaserWall:
          q1.identity(); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne); this.laserWall.push(m4, 0xffffff, 1); break;
        case Kind.Drone: case Kind.ShieldDrone:
          q1.setFromAxisAngle(AXIS_Y, timeSec * 2 + e.id); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne);
          this.drone.push(m4, fl ? 0xffffff : k === Kind.Drone ? 0xff3df2 : 0x3df6ff, fl ? 2 : 1); break;
        case Kind.Swarmer:
          q1.setFromAxisAngle(AXIS_Y, Math.atan2(e.vx, ws + e.vz)); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne);
          this.swarmer.push(m4, fl ? 0xffffff : 0xffe14a, fl ? 2 : 1); break;
        case Kind.Gunship:
          q1.identity(); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne);
          this.gunship.push(m4, fl ? 0xffffff : 0xff9a2e, fl ? 2 : 1); break;
        case Kind.Warden:
          q1.setFromAxisAngle(AXIS_Y, timeSec * 0.8 + e.id); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne);
          this.warden.push(m4, fl ? 0xffffff : 0x3df6ff, fl ? 2 : 1);
          q2.setFromAxisAngle(AXIS_Y, Math.atan2(-e.d, e.c));
          m4.compose(v2, q2, vOne);
          this.wardenShield.push(m4, 0x3df6ff, 2);
          break;
        case Kind.Crystal:
          q1.setFromAxisAngle(AXIS_Y, timeSec * 2 + e.id); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne); this.crystal.push(m4, 0x7ef0ff, 2.5); break;
        case Kind.PowerUp:
          q1.setFromAxisAngle(AXIS_Y, timeSec * 2 + e.id); q2.setFromAxisAngle(AXIS_X, 0.6); q1.multiply(q2);
          vOne.set(1, 1, 1); m4.compose(v2, q1, vOne); this.powerUp.push(m4, POWER_COLOR[e.a] ?? 0xffffff, 2); break;
        case Kind.NukePickup:
          q1.setFromAxisAngle(AXIS_Y, timeSec * 2 + e.id); q2.setFromAxisAngle(AXIS_X, 0.6); q1.multiply(q2);
          vOne.set(1, 1, 1); m4.compose(v2, q1, vOne); this.nukePickup.push(m4, 0xff6a2a, 2); break;
        case Kind.BossHive: {
          q1.setFromAxisAngle(AXIS_Y, timeSec * 0.15); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne);
          this.hiveBody.push(m4, fl ? 0xffffff : 0x2f8a3a, fl ? 2 : 1);
          const open = e.c === 1;
          v2.set(x, 0.5, z + 5);
          const cs = open ? 1.3 + 0.1 * Math.sin(timeSec * 10) : 0.6;
          vOne.set(cs, cs, cs); q1.identity(); m4.compose(v2, q1, vOne);
          this.hiveCore.push(m4, 0xff3df2, open ? 4 : 1);
          break;
        }
        case Kind.BossPrime:
          q1.setFromAxisAngle(AXIS_Y, timeSec * 0.6); vOne.set(1, 1, 1); m4.compose(v2, q1, vOne);
          this.primeBody.push(m4, fl ? 0xffffff : 0x6fd8ff, fl ? 2 : 1);
          q2.setFromAxisAngle(AXIS_X, 0.35); q1.multiply(q2); m4.compose(v2, q1, vOne);
          this.primeRing.push(m4, fl ? 0xffffff : 0x6fd8ff, fl ? 2 : 1);
          break;
        case Kind.BossSerpent: {
          const head = e.a === sim.boss.headIndex;
          const sc = head ? 1.3 : 1;
          q1.identity(); vOne.set(sc, sc, sc); m4.compose(v2, q1, vOne);
          this.serpent.push(m4, fl ? 0xffffff : 0xb06bff, fl ? 2 : head ? 2 : 0.6);
          break;
        }
        default: break;
      }
    }
    const boss = sim.boss;
    if (boss.active && boss.telegraph > 0) {
      const blink = Math.sin(timeSec * 8 * Math.PI * 2) > 0 ? 2 : 0.6;
      const gaps = boss.gapCount;
      for (let x = -14; x <= 14 + 1e-9; x += 1.6) {
        if (Math.abs(x - boss.gap0) < 4.25) continue;
        if (gaps === 2 && Math.abs(x - boss.gap1) < 4.25) continue;
        v2.set(x, -0.9, -12); vOne.set(1, 1, 1); q1.identity(); m4.compose(v2, q1, vOne);
        this.telegraph.push(m4, 0xff2a6a, blink);
      }
    }
    const bolts = sim.bolts.items;
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i]!;
      if (!b.alive) continue;
      const x = b.px + (b.x - b.px) * alpha, z = b.pz + (b.z - b.pz) * alpha;
      q1.setFromAxisAngle(AXIS_Y, Math.atan2(b.vx, b.vz));
      v2.set(x, 0, z); vOne.set(1, 1, 1);
      m4.compose(v2, q1, vOne);
      this.bolts.push(m4, this.laserHex, 3);
    }
    const bullets = sim.bullets.items;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i]!;
      if (!b.alive) continue;
      const x = b.px + (b.x - b.px) * alpha, z = b.pz + (b.z - b.pz) * alpha;
      v2.set(x, 0, z); vOne.set(1, 1, 1);
      if (camera) q1.copy(camera.quaternion); else q1.identity();
      m4.compose(v2, q1, vOne);
      this.bulletRing.push(m4, 0xffffff, 1);
      q2.identity();
      m4.compose(v2, q2, vOne);
      this.bulletOrb.push(m4, 0xff2fd0, 3);
    }
    if (this.gateZ !== null) { v2.set(0, 0, this.gateZ); vOne.set(1, 1, 1); q1.identity(); m4.compose(v2, q1, vOne); this.gate.push(m4, 0xffd54a, 3); }
    for (let i = 0; i < this.all.length; i++) this.all[i]!.end();
  }
}
