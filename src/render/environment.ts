import {
  AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh, Mesh, MeshBasicMaterial,
  PlaneGeometry, Points, PointsMaterial, Scene, ShaderMaterial, SphereGeometry,
} from 'three';
import type { PerspectiveCamera } from 'three';
import { BIOMES, ENV, STARS } from './renderTuning';
import type { BiomeVisual } from './renderTuning';

const white = new Color(0xffffff);
const tmpA = new Color();
const tmpB = new Color();

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uA0, uB0, uC0, uA1, uB1, uC1; uniform float uMix, uTime; varying vec3 vWorld;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vn(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    float n = fbm(d * 3.0 + vec3(0.0, 0.0, uTime * 0.01));
    vec3 c0 = mix(uA0, uB0, smoothstep(0.2, 0.7, n)); c0 = mix(c0, uC0, smoothstep(0.65, 0.95, n) * 0.7);
    vec3 c1 = mix(uA1, uB1, smoothstep(0.2, 0.7, n)); c1 = mix(c1, uC1, smoothstep(0.65, 0.95, n) * 0.7);
    gl_FragColor = vec4(mix(c0, c1, uMix) * 0.9, 1.0);
  }
`;
const GRID_FRAG = /* glsl */ `
  uniform float uOffset, uBeat, uAlpha; uniform vec3 uColor; varying vec3 vWorld;
  void main() {
    float lx = abs(fract(vWorld.x / 4.0 + 0.5) - 0.5) * 4.0;
    float lz = abs(fract((vWorld.z - uOffset) / 8.0 + 0.5) - 0.5) * 8.0;
    float line = max(1.0 - smoothstep(0.0, 0.16, lx), 1.0 - smoothstep(0.0, 0.32, lz));
    float fade = smoothstep(-520.0, -40.0, vWorld.z);
    float a = uAlpha * (1.0 + 1.5 * uBeat) * fade * line;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export class Environment {
  streakBoost = 1;
  private readonly stars: InstancedMesh;
  private readonly pos: Float32Array;
  private readonly count: number;
  private readonly sky: Mesh;
  private readonly skyU: { [k: string]: { value: unknown } };
  private readonly planets: Mesh[] = [];
  private readonly dust: Points;
  private readonly dustPos: Float32Array;
  private readonly dustMat: PointsMaterial;
  private readonly grid: Mesh;
  private readonly gridU: { uOffset: { value: number }; uColor: { value: Color }; uBeat: { value: number }; uAlpha: { value: number } };
  private from: BiomeVisual = BIOMES[0]!;
  private to: BiomeVisual = BIOMES[0]!;
  private mix = 0;
  private fading = false;
  private fadeT = 0;
  private gridOffset = 0;
  private currentIndex = 0;

  constructor(scene: Scene) {
    this.count = STARS.count;
    this.pos = new Float32Array(this.count * 3);
    const geo = new BoxGeometry(0.05, 0.05, 1);
    const mat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.stars = new InstancedMesh(geo, mat, this.count);
    this.stars.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < this.count; i++) this.stars.setColorAt(i, white);
    if (this.stars.instanceColor) this.stars.instanceColor.setUsage(DynamicDrawUsage);
    this.stars.frustumCulled = false;
    for (let i = 0; i < this.count; i++) this.place(i, true);
    scene.add(this.stars);
    this.write(42);

    // sky
    this.skyU = {
      uA0: { value: new Color() }, uB0: { value: new Color() }, uC0: { value: new Color() },
      uA1: { value: new Color() }, uB1: { value: new Color() }, uC1: { value: new Color() }, uMix: { value: 0 }, uTime: { value: 0 },
    };
    this.sky = new Mesh(new SphereGeometry(ENV.skyRadius, 32, 16), new ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: BackSide, depthWrite: false }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);
    // planets
    for (let i = 0; i < 2; i++) {
      const p = new Mesh(new SphereGeometry(1, 32, 16), new MeshBasicMaterial({ color: 0xffffff }));
      p.frustumCulled = false; p.renderOrder = -9;
      this.planets.push(p); scene.add(p);
    }
    // dust
    this.dustPos = new Float32Array(ENV.dustCount * 3);
    for (let i = 0; i < ENV.dustCount; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 60; this.dustPos[i * 3 + 1] = -4 + Math.random() * 12; this.dustPos[i * 3 + 2] = -120 + Math.random() * 140;
    }
    const dg = new BufferGeometry();
    const da = new BufferAttribute(this.dustPos, 3); da.setUsage(DynamicDrawUsage);
    dg.setAttribute('position', da);
    this.dustMat = new PointsMaterial({ size: 0.08, transparent: true, blending: AdditiveBlending, depthWrite: false, color: 0xffffff });
    this.dust = new Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);
    // grid
    this.gridU = { uOffset: { value: 0 }, uColor: { value: new Color() }, uBeat: { value: 0 }, uAlpha: { value: ENV.gridAlpha } };
    const gg = new PlaneGeometry(ENV.gridWidth, ENV.gridLength); gg.rotateX(-Math.PI / 2);
    this.grid = new Mesh(gg, new ShaderMaterial({
      uniforms: this.gridU, transparent: true, depthWrite: false, blending: AdditiveBlending,
      vertexShader: SKY_VERT, fragmentShader: GRID_FRAG,
    }));
    this.grid.position.set(0, ENV.gridY, -250); this.grid.frustumCulled = false; this.grid.renderOrder = -5;
    scene.add(this.grid);
    this.setBiome(0, true);
  }

  private place(i: number, anyZ: boolean): void {
    let x = 0, y = 0;
    do {
      x = (Math.random() - 0.5) * STARS.spreadX;
      y = (Math.random() - 0.5) * STARS.spreadY;
    } while (Math.abs(x) < 20 && Math.abs(y) < 8);
    const p = this.pos;
    p[i * 3] = x; p[i * 3 + 1] = y;
    p[i * 3 + 2] = anyZ ? STARS.farZ + Math.random() * (STARS.nearZ - STARS.farZ) : STARS.farZ;
  }

  setStarCount(n: number): void {
    this.stars.count = n < this.count ? n : this.count;
    this.stars.instanceMatrix.needsUpdate = true;
  }

  get biomeIndex(): number { return this.currentIndex; }

  setBiome(index: number, instant: boolean): void {
    const idx = ((index % BIOMES.length) + BIOMES.length) % BIOMES.length;
    if (!instant && idx === this.currentIndex && !this.fading) return;
    this.currentIndex = idx;
    if (instant) { this.from = BIOMES[idx]!; this.to = BIOMES[idx]!; this.mix = 0; this.fading = false; }
    else {
      if (this.fading) { this.from = this.to; }
      this.to = BIOMES[idx]!; this.mix = 0; this.fading = true; this.fadeT = 0;
    }
    this.applyPalette();
  }

  private applyPalette(): void {
    const u = this.skyU;
    (u['uA0']!.value as Color).setHex(this.from.skyA); (u['uB0']!.value as Color).setHex(this.from.skyB); (u['uC0']!.value as Color).setHex(this.from.skyC);
    (u['uA1']!.value as Color).setHex(this.to.skyA); (u['uB1']!.value as Color).setHex(this.to.skyB); (u['uC1']!.value as Color).setHex(this.to.skyC);
    u['uMix']!.value = this.mix;
    this.applyMixed();
  }

  private applyMixed(): void {
    const m = this.mix;
    tmpA.setHex(this.from.grid); tmpB.setHex(this.to.grid); this.gridU.uColor.value.lerpColors(tmpA, tmpB, m);
    tmpA.setHex(this.from.dust); tmpB.setHex(this.to.dust); this.dustMat.color.lerpColors(tmpA, tmpB, m);
    for (let i = 0; i < 2; i++) {
      const pa = this.from.planets[i]!, pb = this.to.planets[i]!;
      tmpA.setHex(pa.color); tmpB.setHex(pb.color);
      (this.planets[i]!.material as MeshBasicMaterial).color.lerpColors(tmpA, tmpB, m);
      const s = pa.size + (pb.size - pa.size) * m;
      this.planets[i]!.scale.setScalar(s);
      this.planets[i]!.userData['px'] = pa.pos[0] + (pb.pos[0] - pa.pos[0]) * m;
      this.planets[i]!.userData['py'] = pa.pos[1] + (pb.pos[1] - pa.pos[1]) * m;
      this.planets[i]!.userData['pz'] = pa.pos[2] + (pb.pos[2] - pa.pos[2]) * m;
    }
  }

  private write(ws: number): void {
    const arr = this.stars.instanceMatrix.array as Float32Array;
    const sz = (STARS.baseLen + STARS.lenPerSpeed * ws) * this.streakBoost;
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      const o = i * 16;
      arr[o] = 1; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
      arr[o + 12] = p[i * 3]!; arr[o + 13] = p[i * 3 + 1]!; arr[o + 14] = p[i * 3 + 2]!; arr[o + 15] = 1;
    }
    this.stars.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, worldSpeed: number, timeSec: number, beat = 0, camera?: PerspectiveCamera): void {
    const p = this.pos;
    const dz = worldSpeed * dt;
    for (let i = 0; i < this.count; i++) {
      const zi = i * 3 + 2;
      const z = p[zi]! + dz;
      if (z > STARS.nearZ) this.place(i, false);
      else p[zi] = z;
    }
    this.write(worldSpeed);
    if (this.fading) {
      this.fadeT += dt;
      this.mix = Math.min(1, this.fadeT / ENV.crossfadeSec);
      if (this.mix >= 1) { this.from = this.to; this.mix = 0; this.fading = false; }
      this.applyPalette();
    }
    this.skyU['uTime']!.value = timeSec;
    const cx = camera ? camera.position.x : 0, cy = camera ? camera.position.y : 5.5, cz = camera ? camera.position.z : 11;
    this.sky.position.set(cx, cy, cz);
    for (let i = 0; i < 2; i++) {
      const pl = this.planets[i]!;
      pl.position.set(cx + (pl.userData['px'] as number), pl.userData['py'] as number, pl.userData['pz'] as number);
    }
    const dp = this.dustPos;
    for (let i = 0; i < ENV.dustCount; i++) {
      let z = dp[i * 3 + 2]! + dz;
      if (z > 20) z -= 140;
      dp[i * 3 + 2] = z;
    }
    (this.dust.geometry.attributes['position'] as BufferAttribute).needsUpdate = true;
    this.gridOffset += dz;
    this.gridU.uOffset.value = this.gridOffset;
    this.gridU.uBeat.value = beat;
  }
}
