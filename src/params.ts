import type { BossParam } from './core/types';
export interface Params { selftest: 'quick' | 'full' | null; debug: boolean; autopilot: boolean; god: boolean; boss: BossParam | null; seed: number | null }
export function readParams(search: string): Params {
  const q = new URLSearchParams(search);
  const st = q.get('selftest');
  const b = q.get('boss');
  const sd = q.get('seed');
  let seed: number | null = null;
  if (sd !== null && sd !== '') { const n = parseInt(sd, 10); if (Number.isFinite(n)) seed = n >>> 0; }
  return {
    selftest: st === 'quick' || st === 'full' ? st : null,
    debug: q.get('debug') === '1',
    autopilot: q.get('autopilot') === '1',
    god: q.get('god') === '1',
    boss: b === 'hive' || b === 'warden' || b === 'serpent' ? b : null,
    seed,
  };
}
export const params: Params = readParams(location.search);
