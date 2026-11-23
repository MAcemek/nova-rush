import { z } from 'zod';
import type { RunConfig } from '../gameApi';
import { RunPayloadSchema } from './schema';
import { dailySeed } from '../core/daily';
import type { DailyInfo, LbEntry, LeaderboardResponse, RunPayload } from './schema';

export interface RunFlags { countsForProfile: boolean; submittable: boolean }
export interface LbResult { offline: boolean; data: LeaderboardResponse }
export type SubmitStatus = 'accepted' | 'rejected' | 'queued' | 'skipped' | 'local';
export interface SubmitResult { status: SubmitStatus; rank?: number; total?: number; reason?: string }
export interface LocalEntry { name: string; score: number; distance: number; day: string | null; at: number }

/** Static build with no API server (npm run build:demo): scores stay in this browser. */
export const IS_DEMO: boolean = import.meta.env?.MODE === 'demo';

export const net: { offline: boolean } = { offline: false };
let forceOffline = false;
let flushing = false;
export function setForceOffline(on: boolean): void { forceOffline = on; if (on) net.offline = true; }

export function runFlagsFor(cfg: RunConfig): RunFlags {
  const counts = (cfg.mode === 'endless' || cfg.mode === 'daily') && !cfg.god && cfg.boss === null && !cfg.autopilot && !cfg.selftest;
  return { countsForProfile: counts, submittable: counts };
}

// ---- storage helpers (every access guarded) ----
const QUEUE_KEY = 'nova-rush.queue';
const LOCAL_KEY = 'nova-rush.local';
const QueueSchema = z.array(RunPayloadSchema).max(20);
const LocalEntrySchema = z.object({ name: z.string(), score: z.number().int(), distance: z.number().int(), day: z.string().nullable(), at: z.number() });
const LocalSchema = z.object({ endless: z.array(LocalEntrySchema).max(20), daily: z.array(LocalEntrySchema).max(20) });

function loadQueue(): RunPayload[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw === null) return [];
    const r = QueueSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : [];
  } catch { return []; }
}
function saveQueue(q: RunPayload[]): void { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* ignore */ } }
function enqueue(p: RunPayload): void {
  const q = loadQueue();
  q.push(p);
  while (q.length > 20) q.shift();
  saveQueue(q);
}
export function queueLength(): number { return loadQueue().length; }

function loadLocal(): { endless: LocalEntry[]; daily: LocalEntry[] } {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw === null) return { endless: [], daily: [] };
    const r = LocalSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : { endless: [], daily: [] };
  } catch { return { endless: [], daily: [] }; }
}

export function addLocalEntry(mode: 'endless' | 'daily', e: LocalEntry): void {
  const b = loadLocal();
  const list = b[mode];
  list.push(e);
  list.sort((x, y) => y.score - x.score || x.at - y.at);
  b[mode] = list.slice(0, 20);
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

export function localBoard(mode: 'endless' | 'daily', day: string | null): LocalEntry[] {
  const list = loadLocal()[mode];
  return mode === 'daily' ? list.filter((x) => x.day === day) : list;
}

// ---- network ----
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (IS_DEMO) throw new Error('demo build has no server');
  if (forceOffline) { net.offline = true; throw new Error('offline'); }
  const ac = new AbortController();
  const timer = setTimeout(() => { ac.abort(); }, 2500);
  let res: Response;
  try {
    res = await fetch('/api' + path, { ...init, signal: ac.signal });
  } catch (err) {
    net.offline = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  net.offline = false;
  if (!flushing && loadQueue().length > 0) void flushQueue();
  return res;
}

function postRun(p: RunPayload): Promise<Response> {
  return apiFetch('/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
}

export async function fetchDaily(): Promise<DailyInfo & { offline: boolean }> {
  try {
    const r = await apiFetch('/daily');
    if (r.ok) {
      const j = (await r.json()) as DailyInfo;
      return { day: j.day, seed: j.seed, offline: false };
    }
  } catch { /* offline */ }
  const day = new Date().toISOString().slice(0, 10);
  return { day, seed: dailySeed(day), offline: true };
}

export async function fetchLeaderboard(q: { mode: 'endless' | 'daily'; period: 'all' | 'week' | 'today'; around?: string; day?: string; limit?: number }): Promise<LbResult> {
  const sp = new URLSearchParams();
  sp.set('mode', q.mode); sp.set('period', q.period);
  if (q.around) sp.set('around', q.around);
  if (q.day) sp.set('day', q.day);
  if (q.limit) sp.set('limit', String(q.limit));
  try {
    const r = await apiFetch('/leaderboard?' + sp.toString());
    if (r.ok) return { offline: false, data: (await r.json()) as LeaderboardResponse };
  } catch { /* fall through to local */ }
  const day = q.mode === 'daily' ? (q.day ?? new Date().toISOString().slice(0, 10)) : null;
  const local = localBoard(q.mode, day);
  const entries: LbEntry[] = local.map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, distance: e.distance, maxCombo: 0, createdAt: e.at }));
  return { offline: true, data: { mode: q.mode, period: q.period, day, total: entries.length, entries, around: null } };
}

export async function submitRun(p: RunPayload, flags: RunFlags): Promise<SubmitResult> {
  if (!flags.submittable) return { status: 'skipped' };
  if (IS_DEMO) return { status: 'local' };
  try {
    const r = await postRun(p);
    if (r.status === 200) {
      const j = (await r.json()) as { rank: number; total: number };
      return { status: 'accepted', rank: j.rank, total: j.total };
    }
    if (r.status === 422) {
      const j = (await r.json().catch(() => ({}))) as { reason?: string };
      return { status: 'rejected', reason: j.reason ?? 'rejected' };
    }
    if (r.status === 400) return { status: 'rejected', reason: 'bad_request' };
  } catch { /* network failure */ }
  enqueue(p);
  return { status: 'queued' };
}

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const q = loadQueue();
    const keep: RunPayload[] = [];
    let stopped = false;
    for (const p of q) {
      if (stopped) { keep.push(p); continue; }
      try {
        const r = await postRun(p);
        if (r.status === 200 || r.status === 400 || r.status === 422) continue;
        keep.push(p);
        stopped = true;
      } catch { keep.push(p); stopped = true; }
    }
    // Entries enqueued while flushing are preserved.
    const now = loadQueue();
    const added = now.slice(q.length);
    saveQueue(keep.concat(added));
  } finally {
    flushing = false;
  }
}
