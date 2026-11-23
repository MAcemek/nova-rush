import { step } from './core/sim';
import type { Sim, InputFrame, SimEvent } from './core/types';
import type { Screen, FrameStats } from './gameApi';

const TICK = 1 / 60, MAX_STEPS = 5;
const RING = 600;

export interface LoopHost {
  readonly state: () => Screen;            // 'run' steps the sim
  readonly getSim: () => Sim | null;
  readonly sampleInput: (shipX: number) => InputFrame;
  readonly onTick: (input: InputFrame, events: readonly SimEvent[]) => void;
  readonly dispatch: (events: readonly SimEvent[], nowMs: number) => number;
  readonly render: (alpha: number, dt: number, nowMs: number) => void;
  readonly onSimOver: () => void;
  readonly onError: (err: unknown) => void;
  readonly onWork?: (workMs: number, dt: number) => void;
}

export class GameLoop {
  simSpeed = 1;
  running = false;
  private readonly host: LoopHost;
  private acc = 0;
  private last = 0;
  private lastRaf = 0;
  private lastDt = 0;
  private hitstopUntil = 0;
  private readonly work = new Float32Array(RING);
  private readonly scratch = new Float32Array(RING);
  private frames = 0;
  private longFrames = 0;
  private maxWork = 0;

  constructor(host: LoopHost) {
    this.host = host;
    this.last = performance.now();
    document.addEventListener('visibilitychange', () => { this.lastRaf = 0; this.last = performance.now(); });
  }

  start(): void {
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  resetTiming(): void {
    this.acc = 0;
    this.last = performance.now();
    this.lastRaf = 0;
    this.hitstopUntil = 0;
  }

  stats(): FrameStats {
    const n = this.frames < RING ? this.frames : RING;
    const s = this.scratch;
    for (let i = 0; i < n; i++) s[i] = this.work[i]!;
    const view = s.subarray(0, n);
    view.sort();
    const p50 = n > 0 ? view[Math.min(n - 1, Math.floor(n * 0.5))]! : 0;
    const p95 = n > 0 ? view[Math.min(n - 1, Math.floor(n * 0.95))]! : 0;
    return { p50, p95, max: this.maxWork, longFrames: this.longFrames, frames: this.frames };
  }

  resetStats(): void {
    this.frames = 0; this.longFrames = 0; this.maxWork = 0; this.lastRaf = 0;
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const t0 = performance.now();
    try {
      if (this.lastRaf > 0 && now - this.lastRaf > 33 && document.visibilityState === 'visible') this.longFrames++;
      this.lastRaf = now;
      const host = this.host;
      let dt = (now - this.last) / 1000; this.last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt < 0) dt = 0;
      this.lastDt = dt;
      const inHitstop = now < this.hitstopUntil;
      const sim = host.getSim();
      if (host.state() === 'run' && sim !== null && !inHitstop) {
        this.acc += dt * this.simSpeed;
        let steps = 0;
        while (this.acc >= TICK && steps < MAX_STEPS) {
          const input = host.sampleInput(sim.ship.x);
          const events = step(sim, input);
          host.onTick(input, events);
          const hs = host.dispatch(events, now);
          this.acc -= TICK; steps++;
          if (hs > 0) { const until = now + hs; if (until > this.hitstopUntil) this.hitstopUntil = until; break; }
          if (sim.over) break;
        }
        if (steps === MAX_STEPS) this.acc = 0;
        if (sim.over) host.onSimOver();
      }
      const alpha = this.acc / TICK < 1 ? this.acc / TICK : 1;
      host.render(alpha, inHitstop ? dt * 0.05 : dt, now);
    } catch (err) {
      this.host.onError(err);
    }
    const w = performance.now() - t0;
    this.work[this.frames % RING] = w;
    this.frames++;
    if (w > this.maxWork) this.maxWork = w;
    if (this.host.onWork) this.host.onWork(w, this.lastDt);
  };
}
