import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { execFile } from 'node:child_process';
import { createApp } from '../server/index';
import type { LeaderboardResponse } from '../src/api/schema';

let server: Server, base = '';
beforeAll(async () => {
  const { app } = createApp(':memory:');
  await new Promise<void>((res) => { server = app.listen(0, '127.0.0.1', () => { res(); }); });
  base = 'http://127.0.0.1:' + String((server.address() as AddressInfo).port);
});
afterAll(() => { server.close(); });

function runBot(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/bot.ts', '--submit', base, '--name', 'BOTPILOT'], { timeout: 120000 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

describe('e2e', () => {
  it('bot replay is verified and shown on the leaderboard', async () => {
    const out = await runBot();
    const j = JSON.parse(out.trim()) as { ok: boolean; rank: number };
    expect(j.ok).toBe(true);
    expect(j.rank).toBe(1);
    const lb = await (await fetch(base + '/api/leaderboard?around=BOTPILOT')).json() as LeaderboardResponse;
    expect(lb.entries[0]!.name).toBe('BOTPILOT');
    expect(lb.around!.some((e) => e.name === 'BOTPILOT')).toBe(true);
  }, 150000);
  it('tampered payload returns 422', async () => {
    const r = await fetch(base + '/api/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, mode: 'endless', seed: 1, name: 'HACKER', replay: 'AQAAAQ==', claimed: { score: 999999, distance: 10, ticks: 100, stateHash: 1 } }),
    });
    expect(r.status).toBe(422);
  });
});
