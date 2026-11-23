// FNV-1a over 32-bit words; floats hashed by their exact bits
const f64 = new Float64Array(1), w = new Uint32Array(f64.buffer);
export class Hasher {
  h = 0x811c9dc5;
  u32(v: number): void { this.h = Math.imul(this.h ^ (v >>> 0), 0x01000193) >>> 0; }
  f64(v: number): void { f64[0] = v; this.u32(w[0]!); this.u32(w[1]!); }
}
