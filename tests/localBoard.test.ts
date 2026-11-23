import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UNNAMED, addLocalEntry, localBoard, nameLocalEntries } from '../src/api/client';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('local leaderboard', () => {
  it('names earlier unnamed runs in both modes and leaves named runs alone', () => {
    addLocalEntry('endless', { name: UNNAMED, score: 10, distance: 1, day: null, at: 1 });
    addLocalEntry('endless', { name: 'OTHER', score: 20, distance: 1, day: null, at: 2 });
    addLocalEntry('daily', { name: UNNAMED, score: 30, distance: 1, day: '2026-01-01', at: 3 });
    nameLocalEntries('TESTER');
    expect(localBoard('endless', null).map((e) => e.name)).toEqual(['OTHER', 'TESTER']);
    expect(localBoard('daily', '2026-01-01').map((e) => e.name)).toEqual(['TESTER']);
  });
});
