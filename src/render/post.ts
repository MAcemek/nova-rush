import { PerspectiveCamera, Scene, Vector2, Vector4, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { POST } from './renderTuning';

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null as unknown },
    uCA: { value: 0 }, uVignette: { value: POST.vignette }, uRed: { value: 0 }, uWarp: { value: 0 }, uExposure: { value: 0 }, uAspect: { value: 1 },
    uDistort: { value: [] as Vector4[] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uCA, uVignette, uRed, uWarp, uExposure, uAspect; uniform vec4 uDistort[4]; varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      for (int i = 0; i < 4; i++) { vec4 d = uDistort[i]; if (d.w > 0.0) { vec2 dv = uv - d.xy; dv.x *= uAspect; float dist = length(dv);
        float ring = smoothstep(d.z - 0.04, d.z, dist) * (1.0 - smoothstep(d.z, d.z + 0.04, dist));
        vec2 dir = dv / max(dist, 1e-4); dir.x /= uAspect; uv -= dir * ring * d.w; } }
      vec2 c = uv - 0.5; vec3 col;
      if (uWarp > 0.001) { col = vec3(0.0); for (int k = 0; k < 8; k++) col += texture2D(tDiffuse, uv - c * uWarp * 0.08 * float(k) / 8.0).rgb; col /= 8.0; }
      else { col = vec3(texture2D(tDiffuse, uv + c * uCA).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * uCA).b); }
      float v = smoothstep(0.85, 0.25, length(c));
      col *= mix(1.0, v, uVignette);
      col = mix(col, col * vec3(1.0, 0.35, 0.35) + vec3(0.25, 0.0, 0.0) * (1.0 - v), uRed);
      col += vec3(uExposure);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly final: ShaderPass;
  readonly distort: Vector4[];
  trauma = 0; speed = 0; lowHull = false; warp = 0; photosensitive = true;
  private flashLeft = 0; private flashTotal = 1; private flashAmount = 0; private lastFlashAt = -1e9;
  private red = 0;

  constructor(gl: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    this.distort = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];
    this.composer = new EffectComposer(gl);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(window.innerWidth / 2, window.innerHeight / 2), POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold);
    this.composer.addPass(this.bloom);
    FINAL_SHADER.uniforms.uDistort.value = this.distort;
    this.final = new ShaderPass(FINAL_SHADER);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.round(w * pixelRatio / 2), Math.round(h * pixelRatio / 2));
    this.final.uniforms['uAspect']!.value = w / h;
  }

  flash(amount: number, ms: number): void {
    const now = performance.now();
    if (this.photosensitive) {
      if (now - this.lastFlashAt < POST.flashMinGapMsSafe) return;
      amount = Math.min(amount, POST.flashMaxSafe);
    } else amount = Math.min(amount, POST.flashMax);
    this.lastFlashAt = now;
    this.flashAmount = amount; this.flashTotal = ms / 1000; this.flashLeft = ms / 1000;
  }

  render(dt: number, timeSec: number): void {
    const u = this.final.uniforms;
    u['uCA']!.value = POST.caBase + POST.caTrauma * this.trauma + (this.speed > POST.caSpeedAt ? POST.caSpeed : 0);
    const target = this.lowHull ? POST.lowHullRed * (0.5 + 0.5 * Math.sin(timeSec * 6)) : 0;
    this.red += (target - this.red) * (1 - Math.exp(-6 * dt));
    u['uRed']!.value = this.red;
    u['uWarp']!.value = this.warp;
    if (this.flashLeft > 0) { this.flashLeft -= dt; if (this.flashLeft < 0) this.flashLeft = 0; }
    u['uExposure']!.value = this.flashAmount * (this.flashLeft / this.flashTotal);
    this.composer.render(dt);
  }

  reset(): void {
    this.flashLeft = 0; this.red = 0; this.warp = 0; this.trauma = 0; this.lastFlashAt = -1e9;
    for (let i = 0; i < this.distort.length; i++) this.distort[i]!.set(0, 0, 0, 0);
  }
}
