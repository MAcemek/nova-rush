import {
  CanvasTexture, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, LinearMipmapLinearFilter, Mesh, PlaneGeometry,
  Scene, ShaderMaterial, SRGBColorSpace,
} from 'three';
import { EvType, Kind } from '../core/types';
import type { Sim, SimEvent } from '../core/types';
import type { FxListener } from './fx';

export enum Word { CloseCall = 0, PerfectDodge = 1, Chain = 2, Formation = 3, NewRecord = 4, Warning = 5, Best = 6, PowerBase = 7 }   // PowerBase + PowerType = pickup name

const WORD_TEXT = ['CLOSE CALL', 'PERFECT DODGE', 'CHAIN', 'FORMATION', 'NEW RECORD TERRITORY', 'WARNING', 'BEST',
  'SPREAD SHOT', 'RAPID FIRE', 'PIERCE BEAM', 'MAGNET', 'DOUBLE SCORE', 'SHIELD', 'JUMP: W / UP', 'BATTERING RAM', 'REPAIR +1', 'FULL REPAIR'];
const SMALL = '0123456789+×,';
const G_PLUS = 10, G_TIMES = 11, G_COMMA = 12, G_WORD0 = 13;
const POOL = 64, MAXG = 24;
const LIFE = 0.9;
const COL_NUM = 0xffe27a, COL_MULT = 0x7ef0ff;
const WORD_COL = [0x7ef0ff, 0xff7ef0, 0xff9a2e, 0xffe14a, 0xffd54a, 0xff4040, 0xffd54a,
  0x7aff5a, 0xffe14a, 0xff5aff, 0x5aa0ff, 0xffd54a, 0x3df6ff, 0x9a7bff, 0xd0d8e8, 0xff5a7e, 0xffffff];

const scratch = new Color();

interface PopupRec { active: boolean; x: number; z: number; born: number; scale: number; n: number; glyphs: Int16Array; colors: Uint32Array }

export class Popups {
  sim: Sim | null = null;
  private readonly mesh: Mesh;
  private readonly geo: InstancedBufferGeometry;
  private readonly aCenter: InstancedBufferAttribute;
  private readonly aRect: InstancedBufferAttribute;
  private readonly aUv: InstancedBufferAttribute;
  private readonly aColor: InstancedBufferAttribute;
  private readonly glyphUv: Float32Array;     // u0,v0,u1,v1,aspect per glyph
  private readonly pool: PopupRec[] = [];
  private readonly digits = new Int16Array(12);
  private lastNow = 0;

  constructor(scene: Scene) {
    const W = 1024, H = 1024, CH = 80;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8; ctx.strokeStyle = '#0a0d18'; ctx.fillStyle = '#ffffff';
    const n = SMALL.length + WORD_TEXT.length;
    this.glyphUv = new Float32Array(n * 5);
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const text = i < SMALL.length ? SMALL[i]! : WORD_TEXT[i - SMALL.length]!;
      const cw = Math.ceil(ctx.measureText(text).width) + 12;
      if (cx + cw > W) { cx = 0; cy += CH; }
      ctx.strokeText(text, cx + 6, cy + CH / 2);
      ctx.fillText(text, cx + 6, cy + CH / 2);
      const o = i * 5;
      this.glyphUv[o] = cx / W; this.glyphUv[o + 1] = 1 - (cy + CH) / H; this.glyphUv[o + 2] = (cx + cw) / W; this.glyphUv[o + 3] = 1 - cy / H;
      this.glyphUv[o + 4] = cw / CH;
      cx += cw;
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;

    const plane = new PlaneGeometry(1, 1);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = plane.index;
    this.geo.setAttribute('position', plane.attributes['position']!);
    this.geo.setAttribute('uv', plane.attributes['uv']!);
    const cap = POOL * MAXG;
    this.aCenter = new InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.aCenter.setUsage(DynamicDrawUsage);
    this.aRect = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aRect.setUsage(DynamicDrawUsage);
    this.aUv = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aUv.setUsage(DynamicDrawUsage);
    this.aColor = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aColor.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('aCenter', this.aCenter); this.geo.setAttribute('aRect', this.aRect);
    this.geo.setAttribute('aUv', this.aUv); this.geo.setAttribute('aColor', this.aColor);
    this.geo.instanceCount = 0;
    const mat = new ShaderMaterial({
      uniforms: { map: { value: tex } },
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      vertexShader: /* glsl */ `
        attribute vec3 aCenter; attribute vec4 aRect; attribute vec4 aUv; attribute vec4 aColor;
        varying vec2 vUv; varying vec4 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
          mv.xy += aRect.xy + position.xy * aRect.zw;
          gl_Position = projectionMatrix * mv;
          vUv = mix(aUv.xy, aUv.zw, position.xy + 0.5);
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec2 vUv; varying vec4 vColor;
        void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vColor.rgb * 1.6, t.a * vColor.a); }`,
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    for (let i = 0; i < POOL; i++) this.pool.push({ active: false, x: 0, z: 0, born: 0, scale: 1, n: 0, glyphs: new Int16Array(MAXG), colors: new Uint32Array(MAXG) });
  }

  private alloc(): PopupRec {
    let oldest = 0, oldestBorn = 1e18;
    for (let i = 0; i < POOL; i++) {
      const p = this.pool[i]!;
      if (!p.active) return p;
      if (p.born < oldestBorn) { oldestBorn = p.born; oldest = i; }
    }
    return this.pool[oldest]!;
  }

  private pushNumber(p: PopupRec, v: number, color: number): void {
    if (v < 0) v = 0;
    v = Math.floor(v);
    let nd = 0;
    if (v === 0) this.digits[nd++] = 0;
    while (v > 0 && nd < 12) { this.digits[nd++] = v % 10; v = Math.floor(v / 10); }
    for (let i = nd - 1; i >= 0; i--) {
      if (p.n >= MAXG) return;
      p.glyphs[p.n] = this.digits[i]!; p.colors[p.n] = color; p.n++;
      if (i > 0 && i % 3 === 0 && p.n < MAXG) { p.glyphs[p.n] = G_COMMA; p.colors[p.n] = color; p.n++; }
    }
  }
  private pushGlyph(p: PopupRec, g: number, color: number): void {
    if (p.n >= MAXG) return;
    p.glyphs[p.n] = g; p.colors[p.n] = color; p.n++;
  }

  number(points: number, mult: number, x: number, z: number, now: number): void {
    const p = this.alloc();
    p.active = true; p.x = x; p.z = z; p.born = now; p.n = 0;
    p.scale = Math.min(2.4, Math.max(0.8, 0.8 + 0.7 * Math.log10(points / 50 + 1)));
    this.pushGlyph(p, G_PLUS, COL_NUM);
    this.pushNumber(p, points, COL_NUM);
    if (mult > 1) { this.pushGlyph(p, G_TIMES, COL_MULT); this.pushNumber(p, mult, COL_MULT); }
  }

  word(w: Word, x: number, z: number, now: number, suffixPlus?: number, suffixTimes?: number, colorHex?: number): void {
    const p = this.alloc();
    p.active = true; p.x = x; p.z = z; p.born = now; p.n = 0; p.scale = 1.2;
    const col = colorHex ?? WORD_COL[w]!;
    this.pushGlyph(p, G_WORD0 + w, col);
    if (suffixPlus !== undefined) { this.pushGlyph(p, G_PLUS, col); this.pushNumber(p, suffixPlus, col); }
    if (suffixTimes !== undefined) { this.pushGlyph(p, G_TIMES, col); this.pushNumber(p, suffixTimes, col); }
  }

  update(now: number): void {
    const dtS = this.lastNow > 0 ? Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000)) : 0;
    this.lastNow = now;
    const ws = this.sim ? this.sim.worldSpeed : 42;
    let g = 0;
    const cen = this.aCenter.array as Float32Array, rect = this.aRect.array as Float32Array;
    const uv = this.aUv.array as Float32Array, col = this.aColor.array as Float32Array;
    for (let pi = 0; pi < POOL; pi++) {
      const p = this.pool[pi]!;
      if (!p.active) continue;
      const u = (now - p.born) / (LIFE * 1000);
      if (u >= 1) { p.active = false; continue; }
      p.z += ws * 0.5 * dtS;
      if (p.z > -6) p.z = -6;
      const y = 1.5 + 2.5 * u;
      const alpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      const hgt = 0.9 * p.scale;
      let total = 0;
      for (let i = 0; i < p.n; i++) total += hgt * this.glyphUv[p.glyphs[i]! * 5 + 4]!;
      let ox = -total / 2;
      for (let i = 0; i < p.n; i++) {
        const gi = p.glyphs[i]!;
        const w = hgt * this.glyphUv[gi * 5 + 4]!;
        const o3 = g * 3, o4 = g * 4;
        cen[o3] = p.x; cen[o3 + 1] = y; cen[o3 + 2] = p.z;
        rect[o4] = ox + w / 2; rect[o4 + 1] = 0; rect[o4 + 2] = w; rect[o4 + 3] = hgt;
        uv[o4] = this.glyphUv[gi * 5]!; uv[o4 + 1] = this.glyphUv[gi * 5 + 1]!; uv[o4 + 2] = this.glyphUv[gi * 5 + 2]!; uv[o4 + 3] = this.glyphUv[gi * 5 + 3]!;
        scratch.setHex(p.colors[i]!);
        col[o4] = scratch.r; col[o4 + 1] = scratch.g; col[o4 + 2] = scratch.b; col[o4 + 3] = alpha;
        ox += w;
        g++;
      }
    }
    this.geo.instanceCount = g;
    if (g > 0 || this.prevG > 0) {
      this.aCenter.needsUpdate = true; this.aRect.needsUpdate = true; this.aUv.needsUpdate = true; this.aColor.needsUpdate = true;
    }
    this.prevG = g;
  }
  private prevG = 0;

  reset(): void {
    for (let i = 0; i < POOL; i++) this.pool[i]!.active = false;
    this.geo.instanceCount = 0; this.prevG = 0;
  }

  readonly listener: FxListener = (e: SimEvent, now: number): number => {
    switch (e.type) {
      case EvType.Kill: if (e.a > 0) this.number(e.a, this.sim ? this.sim.multiplier : 1, e.x, e.z, now); break;
      case EvType.NearMiss: this.word(Word.CloseCall, e.x, e.z, now, e.a); break;
      case EvType.PerfectDodge: this.word(Word.PerfectDodge, e.x, e.z, now, e.a); break;
      case EvType.Pickup: if (e.kind === Kind.PowerUp) this.word(Word.PowerBase + e.a, this.sim ? this.sim.ship.x : e.x, -6, now); break;
      case EvType.Chain: this.word(Word.Chain, e.x, e.z, now, undefined, e.a); break;
      case EvType.Formation: this.word(Word.Formation, e.x, e.z, now, e.a); break;
      default: break;
    }
    return 0;
  };

  debugSpawnAll(now: number): void {
    this.number(300, 4, 0, -20, now);
    for (let w = 0; w < 7; w++) this.word(w as Word, (w - 3) * 2, -20, now, 100);
  }
}
