const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REV = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) REV[TABLE.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i]!, b = i + 1 < n ? bytes[i + 1]! : 0, c = i + 2 < n ? bytes[i + 2]! : 0;
    out += TABLE[a >> 2]! + TABLE[((a & 3) << 4) | (b >> 4)]!;
    out += i + 1 < n ? TABLE[((b & 15) << 2) | (c >> 6)]! : '=';
    out += i + 2 < n ? TABLE[c & 63]! : '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  if (s.length % 4 !== 0) throw new Error('bad_base64');
  let pad = 0;
  if (s.endsWith('==')) pad = 2; else if (s.endsWith('=')) pad = 1;
  const out = new Uint8Array(s.length / 4 * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const v: number[] = [];
    for (let k = 0; k < 4; k++) {
      const ch = s.charCodeAt(i + k);
      if (s[i + k] === '=') {
        if (i + 4 !== s.length || k < 4 - pad) throw new Error('bad_base64');
        v.push(0);
      } else {
        const x = ch < 128 ? REV[ch]! : -1;
        if (x < 0) throw new Error('bad_base64');
        v.push(x);
      }
    }
    const n = (v[0]! << 18) | (v[1]! << 12) | (v[2]! << 6) | v[3]!;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
