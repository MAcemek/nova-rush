export class Pool<T extends { alive: boolean; slot: number }> {
  readonly items: T[];
  readonly capacity: number;
  private readonly free: Int32Array;
  freeLen: number;
  private readonly pending: Int32Array;
  pendingLen = 0;
  aliveCount = 0;
  constructor(capacity: number, factory: (slot: number) => T) {
    this.capacity = capacity;
    this.items = [];
    this.free = new Int32Array(capacity);
    this.pending = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) { this.items.push(factory(i)); this.free[i] = capacity - 1 - i; }
    this.freeLen = capacity;
  }
  spawn(): T | null {
    if (this.freeLen === 0) return null;
    const slot = this.free[--this.freeLen]!;
    const it = this.items[slot]!;
    it.alive = true;
    this.aliveCount++;
    return it;
  }
  kill(item: T): void {
    if (!item.alive) return;
    item.alive = false;
    this.pending[this.pendingLen++] = item.slot;
    this.aliveCount--;
  }
  flush(): void {
    for (let i = 0; i < this.pendingLen; i++) this.free[this.freeLen++] = this.pending[i]!;
    this.pendingLen = 0;
  }
  get freeCount(): number { return this.freeLen; }
  countAlive(): number {
    let n = 0;
    const items = this.items;
    for (let i = 0; i < items.length; i++) if (items[i]!.alive) n++;
    return n;
  }
}
