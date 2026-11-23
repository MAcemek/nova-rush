import express from 'express';
import path from 'node:path';
import { openDb, createStatements, type Db } from './db';
import { RateLimiter } from './rateLimit';
import { verifyRun } from './verify';
import { SIM_VERSION } from '../src/core/tuning';
import { dailySeed } from '../src/core/daily';
import { LbQuerySchema, RunPayloadSchema, utcDay } from '../src/api/schema';
import type { LbEntry, LeaderboardResponse } from '../src/api/schema';

export interface AppOptions { serveDist?: string | null; now?: () => number; rateCapacity?: number; rateRefillPerSec?: number }

const BLOCKED = ['admin', 'moderator', 'system', 'null', 'undefined', 'fuck', 'shit', 'cunt', 'bitch', 'nazi', 'hitler'];

export function createApp(dbPath: string, opts: AppOptions = {}): { app: express.Express; db: Db } {
  const db = openDb(dbPath);
  const stmts = createStatements(db);
  const now = opts.now ?? Date.now;
  const limiter = new RateLimiter(opts.rateCapacity ?? 10, opts.rateRefillPerSec ?? 10 / 60, now);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', (_req, res) => { res.json({ ok: true, version: SIM_VERSION }); });

  app.get('/api/daily', (_req, res) => {
    const day = utcDay(now());
    res.json({ day, seed: dailySeed(day) });
  });

  app.post('/api/runs', (req, res) => {
    if (!limiter.take(req.ip ?? 'unknown')) { res.status(429).json({ error: 'rate_limited' }); return; }
    const parsed = RunPayloadSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'bad_request' }); return; }
    const p = parsed.data;
    const lower = p.name.toLowerCase();
    for (const w of BLOCKED) if (lower.includes(w)) { res.status(400).json({ error: 'bad_name' }); return; }
    const out = verifyRun(p, now());
    if (!out.ok) { res.status(422).json({ ok: false, reason: out.reason }); return; }
    const day = p.mode === 'daily' ? p.day! : null;
    stmts.insertRun({
      name: p.name, mode: p.mode, seed: p.seed, day, score: out.result.score, distance: out.result.distance,
      maxCombo: out.result.maxCombo, durationTicks: out.result.ticks, version: p.version, createdAt: now(), replay: p.replay,
    });
    const list = stmts.bestPerName(p.mode, 0, day);
    const rank = list.findIndex((r) => r.name === p.name) + 1;
    res.json({ ok: true, rank, total: list.length });
  });

  app.get('/api/leaderboard', (req, res) => {
    const q = LbQuerySchema.safeParse(req.query);
    if (!q.success) { res.status(400).json({ error: 'bad_request' }); return; }
    const { mode, period, limit, around } = q.data;
    const t = now();
    const day = mode === 'daily' ? (q.data.day ?? utcDay(t)) : null;
    const since = mode === 'daily' || period === 'all' ? 0 : period === 'week' ? t - 7 * 86400000 : Date.parse(utcDay(t) + 'T00:00:00Z');
    const list = stmts.bestPerName(mode, since, day);
    const toEntry = (r: (typeof list)[number], i: number): LbEntry => ({ rank: i + 1, name: r.name, score: r.score, distance: r.distance, maxCombo: r.maxCombo, createdAt: r.createdAt });
    const entries = list.slice(0, limit).map(toEntry);
    let aroundList: LbEntry[] | null = null;
    if (around) {
      const idx = list.findIndex((r) => r.name === around);
      if (idx >= 0) {
        const lo = Math.max(0, idx - 2);
        aroundList = list.slice(lo, idx + 3).map((r, i) => toEntry(r, lo + i));
      }
    }
    const body: LeaderboardResponse = { mode, period, day, total: list.length, entries, around: aroundList };
    res.json(body);
  });

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'not_found' }); });
  if (opts.serveDist) {
    const dist = opts.serveDist;
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => { res.sendFile(path.join(dist, 'index.html')); });
  }
  let logged = false;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: { type?: string; status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.type === 'entity.parse.failed' || err.status === 400) { res.status(400).json({ error: 'bad_request' }); return; }
    if (err.type === 'entity.too.large') { res.status(413).json({ error: 'too_large' }); return; }
    if (!logged) { logged = true; console.error('server error', err); }
    res.status(500).json({ error: 'internal' });
  });
  return { app, db };
}

function main(): void {
  const port = Number(process.env.NOVA_PORT ?? process.env.PORT ?? 8790);
  const dbPath = process.env.DB_PATH ?? './nova-rush.sqlite';
  const serveDist = process.argv.includes('--serve-dist') ? path.resolve('dist') : null;
  const { app } = createApp(dbPath, { serveDist });
  app.listen(port, () => console.log(`nova-rush server on http://localhost:${port}`));
}
const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (entry.endsWith('server/index.ts') || entry.endsWith('server/index.js')) main();
