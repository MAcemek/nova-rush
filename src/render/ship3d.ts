import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, DynamicDrawUsage, EdgesGeometry, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Scene, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sim } from '../core/types';
import { SHIP } from '../core/tuning';
import { SHIPFX } from './renderTuning';

export type HullId = 'arrow' | 'manta' | 'dart' | 'hammer' | 'wasp' | 'halo';

const DEG = Math.PI / 180;
const vTmp = new Vector3();
const colTmp = new Color();

function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

function radialTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
}

function trans(g: BufferGeometry, x: number, y: number, z: number): BufferGeometry { g.translate(x, y, z); return g; }

export function buildHulls(): Map<HullId, BufferGeometry> {
  const hulls = new Map<HullId, BufferGeometry>();
  const merge = (parts: BufferGeometry[]): BufferGeometry => {
    const g = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p))!;
    g.computeVertexNormals();
    return g;
  };
  const cone = (r: number, h: number, seg: number): BufferGeometry => { const g = new ConeGeometry(r, h, seg); g.rotateX(-Math.PI / 2); return g; };
  hulls.set('arrow', merge([
    cone(0.55, 3.0, 6), trans(new BoxGeometry(2.6, 0.12, 0.9), 0, 0, 0.4),
    trans(new BoxGeometry(0.1, 0.5, 0.6), -1.2, 0.25, 0.6), trans(new BoxGeometry(0.1, 0.5, 0.6), 1.2, 0.25, 0.6),
  ]));
  const sph = (r: number, sx: number, sy: number, sz: number): BufferGeometry => { const g = new SphereGeometry(r, 12, 8); g.scale(sx, sy, sz); return g; };
  const rotZ = (g: BufferGeometry, a: number, x: number, z: number): BufferGeometry => { g.rotateZ(a); g.translate(x, 0, z); return g; };
  hulls.set('manta', merge([trans(new BoxGeometry(3.4, 0.1, 1.6), 0, 0, 0.2), sph(0.7, 1, 0.4, 2)]));
  hulls.set('dart', merge([cone(0.35, 3.6, 5), trans(new BoxGeometry(1.6, 0.08, 0.5), 0, 0, 0.8)]));
  hulls.set('hammer', merge([new BoxGeometry(0.9, 0.5, 2.4), trans(new BoxGeometry(3.0, 0.4, 0.5), 0, 0, -1.1)]));
  hulls.set('wasp', merge([
    sph(0.6, 1, 0.8, 2.6),
    rotZ(new BoxGeometry(1.4, 0.05, 0.4), 0.4, 0.8, -0.3), rotZ(new BoxGeometry(1.4, 0.05, 0.4), -0.4, -0.8, -0.3),
    rotZ(new BoxGeometry(1.4, 0.05, 0.4), 0.4, 0.8, 0.5), rotZ(new BoxGeometry(1.4, 0.05, 0.4), -0.4, -0.8, 0.5),
  ]));
  const ring = new TorusGeometry(1.4, 0.12, 6, 32); ring.rotateX(Math.PI / 2);
  hulls.set('halo', merge([cone(0.5, 2.4, 6), ring]));
  return hulls;
}

class Trail {
  readonly pts = new Float32Array(SHIPFX.trailPoints * 3);
  head = 0; accum = 0;
  readonly mesh: Mesh;
  private readonly posAttr: BufferAttribute;
  readonly uniforms = { uColor: { value: new Color(0x5ff4ff) } };
  constructor(scene: Scene) {
    const N = SHIPFX.trailPoints;
    const geo = new BufferGeometry();
    this.posAttr = new BufferAttribute(new Float32Array(N * 2 * 3), 3);
    this.posAttr.setUsage(DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    const fade = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const f = 1 - i / (N - 1); fade[i * 2] = f; fade[i * 2 + 1] = f; }
    geo.setAttribute('aFade', new BufferAttribute(fade, 1));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2,
      vertexShader: /* glsl */ `attribute float aFade; varying float vFade; void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vFade; void main() { float a = vFade * vFade; gl_FragColor = vec4(uColor * 2.0 * a, a); }`,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  fill(x: number, y: number, z: number): void {
    for (let i = 0; i < SHIPFX.trailPoints; i++) { this.pts[i * 3] = x; this.pts[i * 3 + 1] = y; this.pts[i * 3 + 2] = z; }
    this.accum = 0; this.write();
  }
  push(x: number, y: number, z: number): void {
    this.head = (this.head + 1) % SHIPFX.trailPoints;
    this.pts[this.head * 3] = x; this.pts[this.head * 3 + 1] = y; this.pts[this.head * 3 + 2] = z;
  }
  advance(dz: number): void { for (let i = 0; i < SHIPFX.trailPoints; i++) this.pts[i * 3 + 2] = this.pts[i * 3 + 2]! + dz; }
  write(): void {
    const N = SHIPFX.trailPoints, a = this.posAttr.array as Float32Array, hw = SHIPFX.trailWidth / 2;
    for (let k = 0; k < N; k++) {
      const i = (this.head - k + N) % N;
      const x = this.pts[i * 3]!, y = this.pts[i * 3 + 1]!, z = this.pts[i * 3 + 2]!;
      a[k * 6] = x; a[k * 6 + 1] = y + hw; a[k * 6 + 2] = z;
      a[k * 6 + 3] = x; a[k * 6 + 4] = y - hw; a[k * 6 + 5] = z;
    }
    this.posAttr.needsUpdate = true;
  }
}

export class Ship3D {
  readonly group: Group;
  bank = 0;
  drawX = 0;
  private readonly hulls: Map<HullId, BufferGeometry>;
  private readonly body: Mesh;
  private readonly edges: LineSegments;
  private readonly mat: MeshStandardMaterial;
  private readonly glows: Sprite[] = [];
  private readonly trails: [Trail, Trail];
  private hullId: HullId = 'arrow';
  /** When non-null the ship sits at x=0 with this yaw (hangar preview). */
  previewYaw: number | null = null;

  constructor(scene: Scene) {
    this.group = new Group();
    this.group.rotation.order = 'YXZ';
    this.hulls = buildHulls();
    const geo = this.hulls.get('arrow')!;
    this.mat = new MeshStandardMaterial({ color: 0xe8eef7, metalness: 0.4, roughness: 0.45 });
    this.body = new Mesh(geo, this.mat);
    this.group.add(this.body);
    const em = new LineBasicMaterial({ color: 0x7ef0ff, toneMapped: false });
    em.color.multiplyScalar(2);
    this.edges = new LineSegments(new EdgesGeometry(geo, 25), em);
    this.group.add(this.edges);
    const tex = radialTexture();
    for (let i = 0; i < 2; i++) {
      const s = new Sprite(new SpriteMaterial({ map: tex, color: 0x66e6ff, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      const o = SHIPFX.engineOffsets[i]!;
      s.position.set(o[0], o[1], o[2]);
      this.group.add(s); this.glows.push(s);
    }
    this.trails = [new Trail(scene), new Trail(scene)];
    scene.add(this.group);
  }

  setHull(id: HullId): void {
    const g = this.hulls.get(id) ?? this.hulls.get('arrow')!;
    this.hullId = id;
    this.body.geometry = g;
    this.edges.geometry.dispose();
    this.edges.geometry = new EdgesGeometry(g, 25);
  }
  setPaint(hex: number): void { this.mat.color.setHex(hex); }
  setTrailColor(hex: number): void { colTmp.setHex(hex); this.trails[0].uniforms.uColor.value.copy(colTmp); this.trails[1].uniforms.uColor.value.copy(colTmp); }
  get currentHull(): HullId { return this.hullId; }

  wingTipWorld(side: -1 | 1, out: Vector3): Vector3 {
    const t = SHIPFX.wingTip;
    out.set(side * t[0], t[1], t[2]);
    return out.applyMatrix4(this.group.matrixWorld);
  }

  reset(): void {
    this.bank = 0;
    this.group.updateMatrixWorld(true);
    for (let s = 0; s < 2; s++) {
      this.wingTipWorld(s === 0 ? -1 : 1, vTmp);
      this.trails[s]!.fill(vTmp.x, vTmp.y, vTmp.z);
    }
  }

  update(sim: Sim | null, alpha: number, dt: number, timeSec: number): void {
    let x = 0, vx = 0, steer = 0, rollAngle = 0, ws = 42, visible = true, y = 0;
    if (sim) {
      const s = sim.ship;
      x = s.px + (s.x - s.px) * alpha; vx = s.vx; steer = s.steer; ws = sim.worldSpeed;
      if (s.rollTicks > 0) {
        const p = clamp((SHIP.rollTicks - s.rollTicks + alpha) / SHIP.rollTicks, 0, 1);
        rollAngle = -s.rollDir * Math.PI * 2 * p;
      }
      if (s.jumpTicks > 0) y = 4.2 * Math.sin(Math.PI * clamp((SHIP.jumpTicks - s.jumpTicks + alpha) / SHIP.jumpTicks, 0, 1));
      visible = !s.dead;
      if (s.invulnTicks > 0 && !s.dead) visible = Math.floor(timeSec / 0.08) % 2 === 0;
    }
    this.drawX = x;
    const target = -clamp(vx / 30, -1, 1) * SHIPFX.bankMaxDeg * DEG;
    this.bank += (target - this.bank) * (1 - Math.exp(-SHIPFX.bankRate * dt));
    const yaw = this.previewYaw !== null ? this.previewYaw : -(steer / 127) * SHIPFX.yawMaxDeg * DEG;
    this.group.position.set(x, y, 0);
    this.group.rotation.set(0, yaw, this.bank + rollAngle);
    this.group.visible = visible;
    this.group.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      this.glows[i]!.scale.setScalar(0.9 + 0.25 * Math.sin(timeSec * 22 + i) + 0.6 * (ws - 42) / 73);
    }
    const step = SHIPFX.trailSeconds / SHIPFX.trailPoints;
    for (let s = 0; s < 2; s++) {
      const tr = this.trails[s]!;
      tr.advance(ws * dt);
      tr.accum += dt;
      let pushes = 0;
      while (tr.accum >= step && pushes < 2) {
        this.wingTipWorld(s === 0 ? -1 : 1, vTmp);
        tr.push(vTmp.x, vTmp.y, vTmp.z);
        tr.accum -= step; pushes++;
      }
      if (tr.accum > step) tr.accum = step;
      tr.write();
      tr.mesh.visible = visible;
    }
  }
}
