import { z } from 'zod';
import type { Sim } from '../core/types';
import { SIM_VERSION } from '../core/tuning';
import { stateHash } from '../core/sim';
import type { ReplayRecorder } from '../core/replay';
import { bytesToBase64 } from './base64';

export const NAME_RE = /^[A-Za-z0-9_]{3,12}$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const RunPayloadSchema = z.object({
  version: z.number().int(),
  mode: z.enum(['endless', 'daily']),
  seed: z.number().int().min(0).max(4294967295),
  day: z.string().regex(DAY_RE).optional(),
  name: z.string().regex(NAME_RE),
  replay: z.string().max(200000).regex(/^[A-Za-z0-9+/]*={0,2}$/),
  claimed: z.object({
    score: z.number().int().min(0), distance: z.number().int().min(0),
    ticks: z.number().int().min(1), stateHash: z.number().int().min(0).max(4294967295),
  }),
});
export type RunPayload = z.infer<typeof RunPayloadSchema>;
export interface RunAccepted { ok: true; rank: number; total: number }
export interface RunRejected { ok: false; reason: string }        // HTTP 422
export interface ApiError { error: string }
export interface DailyInfo { day: string; seed: number }
export interface HealthInfo { ok: true; version: number }
export interface LbEntry { rank: number; name: string; score: number; distance: number; maxCombo: number; createdAt: number }
export interface LeaderboardResponse { mode: 'endless' | 'daily'; period: 'all' | 'week' | 'today'; day: string | null; total: number; entries: LbEntry[]; around: LbEntry[] | null }
export const LbQuerySchema = z.object({
  mode: z.enum(['endless', 'daily']).default('endless'),
  period: z.enum(['all', 'week', 'today']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  around: z.string().regex(NAME_RE).optional(),
  day: z.string().regex(DAY_RE).optional(),
});

export function utcDay(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }

export function buildPayload(sim: Sim, rec: ReplayRecorder, mode: 'endless' | 'daily', day: string | null, name: string): RunPayload {
  const p: RunPayload = {
    version: SIM_VERSION, mode, seed: sim.seed, name,
    replay: bytesToBase64(rec.encode()),
    claimed: { score: sim.score, distance: Math.floor(sim.distance), ticks: sim.tick, stateHash: stateHash(sim) },
  };
  if (mode === 'daily' && day) p.day = day;
  return p;
}
