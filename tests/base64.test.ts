import { describe, it, expect } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '../src/api/base64';
import { RateLimiter } from '../server/rateLimit';
describe('base64', () => {
  it('round trips all lengths', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
    }
    expect(bytesToBase64(Uint8Array.from([1, 0, 0]))).toBe('AQAA');
  });
  it('rejects bad input', () => {
    expect(() => base64ToBytes('AQ=')).toThrow('bad_base64');
    expect(() => base64ToBytes('AQ!A')).toThrow('bad_base64');
  });
});
describe('RateLimiter', () => {
  it('refills over time', () => {
    let t = 0;
    const r = new RateLimiter(2, 1, () => t);
    expect(r.take('a')).toBe(true); expect(r.take('a')).toBe(true); expect(r.take('a')).toBe(false);
    t = 1000;
    expect(r.take('a')).toBe(true);
    expect(r.take('b')).toBe(true);
  });
});
