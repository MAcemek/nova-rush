import { createRequire } from 'node:module';
import type { DatabaseSync as DbType } from 'node:sqlite';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
export type Db = DbType;
export const SCHEMA = `CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, seed INTEGER NOT NULL, day TEXT, score INTEGER NOT NULL, distance INTEGER NOT NULL, max_combo INTEGER NOT NULL, duration_ticks INTEGER NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, replay TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS runs_mode_day_score ON runs (mode, day, score DESC);`;
export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec(SCHEMA);
  return db;
}

export interface RunRow { name: string; mode: 'endless' | 'daily'; seed: number; day: string | null; score: number; distance: number; maxCombo: number; durationTicks: number; version: number; createdAt: number; replay: string }
export interface BestRow { name: string; score: number; distance: number; maxCombo: number; createdAt: number }
export interface Statements { insertRun(r: RunRow): void; bestPerName(mode: string, since: number, day: string | null): BestRow[] }

export function createStatements(db: Db): Statements {
  const ins = db.prepare('INSERT INTO runs (name, mode, seed, day, score, distance, max_combo, duration_ticks, version, created_at, replay) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const best = db.prepare('SELECT name, score, distance, max_combo AS maxCombo, created_at AS createdAt FROM (SELECT name, score, distance, max_combo, created_at, ROW_NUMBER() OVER (PARTITION BY name ORDER BY score DESC, created_at ASC, id ASC) AS rn FROM runs WHERE mode = ? AND created_at >= ? AND (? IS NULL OR day = ?)) WHERE rn = 1 ORDER BY score DESC, createdAt ASC, name ASC');
  return {
    insertRun(r: RunRow): void {
      ins.run(r.name, r.mode, r.seed, r.day, r.score, r.distance, r.maxCombo, r.durationTicks, r.version, r.createdAt, r.replay);
    },
    bestPerName(mode: string, since: number, day: string | null): BestRow[] {
      const rows = best.all(mode, since, day, day) as Record<string, unknown>[];
      return rows.map((x) => ({ name: String(x['name']), score: Number(x['score']), distance: Number(x['distance']), maxCombo: Number(x['maxCombo']), createdAt: Number(x['createdAt']) }));
    },
  };
}
