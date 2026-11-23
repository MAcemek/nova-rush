import type { InputFrame } from './types';

export const REPLAY_FORMAT = 1;
export const FLAG_FIRE = 1, FLAG_NUKE = 2, FLAG_ROLL_L = 4, FLAG_ROLL_R = 8, FLAG_JUMP = 16;

export function packFlags(f: InputFrame): number {
  return (f.fire ? FLAG_FIRE : 0) | (f.nuke ? FLAG_NUKE : 0) | (f.roll === -1 ? FLAG_ROLL_L : 0) | (f.roll === 1 ? FLAG_ROLL_R : 0) | (f.jump ? FLAG_JUMP : 0);
}

export function writeVarint(out: number[], v: number): void {
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
}

export function encodeReplay(steer: ArrayLike<number>, flags: ArrayLike<number>, length: number): Uint8Array {
  const out: number[] = [REPLAY_FORMAT];
  let lastT = 0;
  for (let t = 0; t < length; t++) {
    if (t === 0 || steer[t] !== steer[t - 1] || flags[t] !== flags[t - 1]) {
      writeVarint(out, t - lastT);
      out.push(steer[t]! & 0xff);
      out.push(flags[t]!);
      lastT = t;
    }
  }
  return Uint8Array.from(out);
}

export class ReplayRecorder {
  readonly steer: Int8Array;
  readonly flags: Uint8Array;
  length = 0;
  constructor(capacity = 108000) { this.steer = new Int8Array(capacity); this.flags = new Uint8Array(capacity); }
  reset(): void { this.length = 0; }
  push(f: InputFrame): void {
    if (this.length >= this.steer.length) return;
    this.steer[this.length] = f.steer;
    this.flags[this.length] = packFlags(f);
    this.length++;
  }
  encode(): Uint8Array { return encodeReplay(this.steer, this.flags, this.length); }
}

export class InputStream {
  readonly ticks: Int32Array;
  readonly steers: Int8Array;
  readonly flagBytes: Uint8Array;
  readonly count: number;
  private cursor = 0;
  constructor(ticks: Int32Array, steers: Int8Array, flagBytes: Uint8Array, count: number) {
    this.ticks = ticks; this.steers = steers; this.flagBytes = flagBytes; this.count = count;
  }
  frameAt(t: number, out: InputFrame): InputFrame {
    if (this.count === 0) { out.steer = 0; out.fire = false; out.nuke = false; out.roll = 0; out.jump = false; return out; }
    if (t < this.ticks[this.cursor]!) this.cursor = 0;
    while (this.cursor + 1 < this.count && this.ticks[this.cursor + 1]! <= t) this.cursor++;
    const f = this.flagBytes[this.cursor]!;
    out.steer = this.steers[this.cursor]!;
    out.fire = (f & FLAG_FIRE) !== 0;
    out.nuke = (f & FLAG_NUKE) !== 0;
    out.jump = (f & FLAG_JUMP) !== 0;
    out.roll = (f & FLAG_ROLL_L) !== 0 ? -1 : (f & FLAG_ROLL_R) !== 0 ? 1 : 0;
    return out;
  }
}

export function decodeReplay(bytes: Uint8Array): InputStream {
  const bad = (): never => { throw new Error('bad_replay'); };
  if (bytes.length === 0 || bytes[0] !== REPLAY_FORMAT) bad();
  const ticks: number[] = [], steers: number[] = [], flags: number[] = [];
  let i = 1, t = 0;
  while (i < bytes.length) {
    let v = 0, mul = 1, n = 0, b = 0;
    for (;;) {
      if (i >= bytes.length) bad();
      b = bytes[i++]!;
      n++;
      if (n > 5) bad();
      v += (b & 0x7f) * mul; mul *= 128;
      if ((b & 0x80) === 0) break;
    }
    if (i + 2 > bytes.length) bad();
    const sb = bytes[i++]!, fl = bytes[i++]!;
    if (ticks.length === 0) { if (v !== 0) bad(); } else if (v === 0) bad();
    if ((fl & 0xe0) !== 0) bad();
    if ((fl & FLAG_ROLL_L) !== 0 && (fl & FLAG_ROLL_R) !== 0) bad();
    const st = sb > 127 ? sb - 256 : sb;
    if (st === -128) bad();
    t += v;
    if (t > 2147483647) bad();
    ticks.push(t); steers.push(st); flags.push(fl);
  }
  return new InputStream(Int32Array.from(ticks), Int8Array.from(steers), Uint8Array.from(flags), ticks.length);
}
