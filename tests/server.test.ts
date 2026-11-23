import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/index';
import { makeRun } from './helpers';
import { SIM_VERSION } from '../src/core/tuning';
import { utcDay } from '../src/api/schema';
import type { RunPayload, LeaderboardResponse } from '../src/api/schema';

const NOW = Date.parse('2026-03-10T12:00:00Z');
let server: Server, base = '';
const a = makeRun(101, { quitAt: 1800 });
const b = makeRun(102, { quitAt: 3600 });

function post(url: string, body: unknown, raw = false): Promise<Response> {
  return fetch(url + '/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) });
}
function named(p: RunPayload, name: string): RunPayload { return { ...p, name }; }

beforeAll(async () => {
  const { app } = createApp(':memory:', { now: () => NOW });
  await new Promise<void>((res) => { server = app.listen(0, '127.0.0.1', () => { res(); }); });
  base = 'http://127.0.0.1:' + String((server.address() as AddressInfo).port);
});
afterAll(() => { server.close(); });

describe('server', () => {
  it('health', async () => {
    expect(await (await fetch(base + '/api/health')).json()).toEqual({ ok: true, version: SIM_VERSION });
  });
  it('daily is stable', async () => {
    const x = await (await fetch(base + '/api/daily')).json() as { day: string; seed: number };
    const y = await (await fetch(base + '/api/daily')).json();
    expect(x).toEqual(y);
    expect(x.day).toBe(utcDay(NOW));
  });
  it('accepts a valid run', async () => {
    const r = await post(base, named(a.payload, 'ALPHA'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, rank: 1, total: 1 });
  });
  it('ranks a higher score first and orders descending', async () => {
    expect(b.payload.claimed.score).toBeGreaterThan(a.payload.claimed.score);
    const r = await post(base, named(b.payload, 'BRAVO'));
    expect(await r.json()).toEqual({ ok: true, rank: 1, total: 2 });
    const lb = await (await fetch(base + '/api/leaderboard?mode=endless&period=all')).json() as LeaderboardResponse;
    expect(lb.entries.map((e) => e.name)).toEqual(['BRAVO', 'ALPHA']);
    expect(lb.entries[0]!.score).toBeGreaterThanOrEqual(lb.entries[1]!.score);
  });
  it('keeps one row per name with the best score', async () => {
    await post(base, named(a.payload, 'BRAVO'));
    const lb = await (await fetch(base + '/api/leaderboard')).json() as LeaderboardResponse;
    const rows = lb.entries.filter((e) => e.name === 'BRAVO');
    expect(rows.length).toBe(1);
    expect(rows[0]!.score).toBe(b.payload.claimed.score);
  });
  it('around returns <= 5 entries including the name', async () => {
    const lb = await (await fetch(base + '/api/leaderboard?around=ALPHA')).json() as LeaderboardResponse;
    expect(lb.around).not.toBeNull();
    expect(lb.around!.length).toBeLessThanOrEqual(5);
    expect(lb.around!.some((e) => e.name === 'ALPHA')).toBe(true);
  });
  it('tampered payload gives 422 with reason', async () => {
    const p = structuredClone(a.payload); p.claimed.score += 5;
    const r = await post(base, p);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ ok: false, reason: 'score_mismatch' });
  });
  it('blocked name gives 400', async () => {
    const r = await post(base, named(a.payload, 'xAdminx'));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'bad_name' });
  });
  it('malformed JSON gives 400', async () => {
    expect((await post(base, '{bad', true)).status).toBe(400);
  });
  it('wrong shape gives 400', async () => {
    expect((await post(base, { hello: 1 })).status).toBe(400);
  });
  it('unknown api route gives 404 JSON', async () => {
    const r = await fetch(base + '/api/nope');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'not_found' });
  });
  it('rate limits', async () => {
    const { app } = createApp(':memory:', { now: () => NOW, rateCapacity: 2 });
    const s = await new Promise<Server>((res) => { const x = app.listen(0, '127.0.0.1', () => { res(x); }); });
    const u = 'http://127.0.0.1:' + String((s.address() as AddressInfo).port);
    try {
      expect((await post(u, { x: 1 })).status).toBe(400);
      expect((await post(u, { x: 1 })).status).toBe(400);
      const r = await post(u, { x: 1 });
      expect(r.status).toBe(429);
      expect(await r.json()).toEqual({ error: 'rate_limited' });
    } finally { s.close(); }
  });
});
