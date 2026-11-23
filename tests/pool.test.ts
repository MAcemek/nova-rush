import { describe, it, expect } from 'vitest';
import { Pool } from '../src/core/pool';
class It { alive = false; slot: number; constructor(slot: number) { this.slot = slot; } }
describe('pool', () => {
  it('works', () => {
    const p = new Pool<It>(8, (s) => new It(s));
    for (let i = 0; i < 8; i++) { expect(p.spawn()!.slot).toBe(i); expect(p.aliveCount).toBe(p.countAlive()); }
    expect(p.spawn()).toBeNull();
    p.kill(p.items[3]!);
    expect(p.spawn()).toBeNull();
    expect(p.aliveCount).toBe(7); expect(p.countAlive()).toBe(7);
    p.flush();
    expect(p.freeCount).toBe(1);
    expect(p.spawn()!.slot).toBe(3);
    p.kill(p.items[1]!); p.kill(p.items[1]!);
    expect(p.aliveCount).toBe(p.countAlive());
    const order: number[] = [];
    for (const it of p.items) if (it.alive) order.push(it.slot);
    expect(order).toEqual([0, 2, 3, 4, 5, 6, 7]);
  });
});
