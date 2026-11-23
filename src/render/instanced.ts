import { Color, DynamicDrawUsage, InstancedMesh } from 'three';
import type { BufferGeometry, Material, Matrix4 } from 'three';

const white = new Color(0xffffff);
const scratchColor = new Color();

/** InstancedMesh wrapper following the plan's InstancedMesh rules (max count, dynamic usage, colours initialised, cached writes). */
export class Inst {
  readonly mesh: InstancedMesh;
  n = 0;
  private prevCount = 0;
  private readonly cap: number;
  private readonly hex: Uint32Array;
  private readonly mul: Float32Array;
  private colorDirty = false;

  constructor(geo: BufferGeometry, mat: Material | Material[], cap: number, renderOrder = 0) {
    this.cap = cap;
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, white);
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.count = 0;
    this.hex = new Uint32Array(cap).fill(0xffffff);
    this.mul = new Float32Array(cap).fill(1);
  }

  begin(): void { this.n = 0; this.colorDirty = false; }

  /** Returns false when full. */
  push(m: Matrix4, hex: number, mul = 1): boolean {
    const i = this.n;
    if (i >= this.cap) return false;
    this.mesh.setMatrixAt(i, m);
    if (this.hex[i] !== hex || this.mul[i] !== mul) {
      this.hex[i] = hex; this.mul[i] = mul;
      scratchColor.setHex(hex).multiplyScalar(mul);
      this.mesh.setColorAt(i, scratchColor);
      this.colorDirty = true;
    }
    this.n = i + 1;
    return true;
  }

  end(): void {
    const n = this.n;
    this.mesh.count = n;
    if (n > 0 || n !== this.prevCount) this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colorDirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.prevCount = n;
  }

  reset(): void { this.n = 0; this.mesh.count = 0; this.prevCount = 0; }
}
