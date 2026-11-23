import { describe, it, expect } from 'vitest';
import { verifyRun } from '../server/verify';
import { makeRun, makeUnfinished } from './helpers';
import { dailySeed } from '../src/core/daily';
import { utcDay } from '../src/api/schema';
import { SIM_VERSION } from '../src/core/tuning';
import { base64ToBytes, bytesToBase64 } from '../src/api/base64';

const NOW = Date.parse('2026-03-10T12:00:00Z');
const DAY = utcDay(NOW);
const genuine = makeRun(4242);
const genuineDaily = makeRun(dailySeed(DAY), { mode: 'daily', day: DAY });

describe('verifyRun', () => {
  it('accepts a genuine endless run', () => {
    const o = verifyRun(genuine.payload, NOW);
    expect(o.ok).toBe(true);
    if (o.ok) {
      expect(o.result.score).toBe(genuine.payload.claimed.score);
      expect(o.result.distance).toBe(genuine.payload.claimed.distance);
      expect(o.result.stateHash).toBe(genuine.payload.claimed.stateHash);
    }
  });
  it('accepts a genuine daily run', () => {
    expect(genuineDaily.payload.day).toBe(DAY);
    expect(verifyRun(genuineDaily.payload, NOW).ok).toBe(true);
  });
  it('rejects tampered score', () => {
    const p = structuredClone(genuine.payload); p.claimed.score += 1;
    expect(verifyRun(p, NOW)).toEqual({ ok: false, reason: 'score_mismatch' });
  });
  it('rejects ticks - 1', () => {
    const p = structuredClone(genuine.payload); p.claimed.ticks -= 1;
    expect(verifyRun(p, NOW).ok).toBe(false);
  });
  it('rejects tampered stateHash', () => {
    const p = structuredClone(genuine.payload); p.claimed.stateHash = (p.claimed.stateHash ^ 1) >>> 0;
    expect(verifyRun(p, NOW)).toEqual({ ok: false, reason: 'hash_mismatch' });
  });
  it('rejects seed + 1', () => {
    const p = structuredClone(genuine.payload); p.seed += 1;
    expect(verifyRun(p, NOW).ok).toBe(false);
  });
  it('rejects a truncated replay', () => {
    const p = structuredClone(genuine.payload);
    p.replay = bytesToBase64(base64ToBytes(p.replay).slice(0, -1));
    expect(verifyRun(p, NOW).ok).toBe(false);
  });
  it('rejects wrong version', () => {
    const p = structuredClone(genuine.payload); p.version = 99;
    expect(SIM_VERSION).not.toBe(99);
    expect(verifyRun(p, NOW)).toEqual({ ok: false, reason: 'bad_version' });
  });
  it('rejects a daily with the wrong seed', () => {
    const p = structuredClone(genuineDaily.payload); p.seed += 1;
    expect(verifyRun(p, NOW)).toEqual({ ok: false, reason: 'bad_daily_seed' });
  });
  it('rejects a daily from 3 days ago', () => {
    const old = utcDay(NOW - 3 * 86400000);
    const r = makeRun(dailySeed(old), { mode: 'daily', day: old });
    expect(verifyRun(r.payload, NOW)).toEqual({ ok: false, reason: 'bad_daily_seed' });
  });
  it('rejects a replay that never dies', () => {
    expect(verifyRun(makeUnfinished(7, 600), NOW)).toEqual({ ok: false, reason: 'not_over' });
  });
  it('rejects invalid base64', () => {
    const p = structuredClone(genuine.payload); p.replay = 'AQ=';
    expect(verifyRun(p, NOW)).toEqual({ ok: false, reason: 'bad_replay' });
  });
});
