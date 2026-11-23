import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA } from './renderTuning';

const look = new Vector3();

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

export class CameraRig {
  x = 0; v = 0; trauma = 0; shakeScale = 1;
  fovBoost = 0;
  private fov = CAMERA.fovMin;
  readonly camera: PerspectiveCamera;
  constructor(camera: PerspectiveCamera) { this.camera = camera; }

  addTrauma(t: number): void {
    const n = this.trauma + t * this.shakeScale;
    this.trauma = n > 1 ? 1 : n;
  }

  snap(x: number): void { this.x = x; this.v = 0; }

  update(shipX: number, bankRad: number, worldSpeed: number, dt: number, timeSec: number): void {
    const w = CAMERA.omega;
    const f = 1 + 2 * dt * w;
    const det = f + dt * dt * w * w;
    const nx = (f * this.x + dt * this.v + dt * dt * w * w * shipX) / det;
    const nv = (this.v + dt * w * w * (shipX - this.x)) / det;
    this.x = nx; this.v = nv;

    const cam = this.camera;
    const s = this.trauma * this.trauma;
    const f1 = timeSec * CAMERA.shakeFreq;
    const n1 = Math.sin(f1 + 1) * 0.5 + Math.sin(f1 * 2.3 + 1.7) * 0.5;
    const n2 = Math.sin(f1 + 2) * 0.5 + Math.sin(f1 * 2.3 + 3.4) * 0.5;
    const n3 = Math.sin(f1 + 3) * 0.5 + Math.sin(f1 * 2.3 + 5.1) * 0.5;
    cam.position.set(this.x + n1 * s * CAMERA.shakeMaxOffset, CAMERA.offsetY + n2 * s * CAMERA.shakeMaxOffset, CAMERA.offsetZ);
    look.set(shipX * CAMERA.lookXFactor, 0, CAMERA.lookZ);
    cam.lookAt(look);
    cam.rotateZ(-bankRad * CAMERA.rollFactor + n3 * s * CAMERA.shakeMaxRoll);

    const target = CAMERA.fovMin + (CAMERA.fovMax - CAMERA.fovMin) * clamp01((worldSpeed - 42) / (115 - 42)) + this.fovBoost;
    if (Math.abs(target - this.fov) > 0.01) {
      this.fov = target;
      cam.fov = target;
      cam.updateProjectionMatrix();
    }
    const t = this.trauma - CAMERA.traumaDecay * dt;
    this.trauma = t > 0 ? t : 0;
  }
}
