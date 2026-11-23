import type { Sim, BossParam } from './core/types';
export type Screen = 'loading' | 'title' | 'run' | 'paused' | 'gameover' | 'leaderboard' | 'hangar' | 'settings';
export type Quality = 'low' | 'medium' | 'high';
export interface RunConfig { mode: 'endless' | 'daily' | 'tutorial'; seed: number; day: string | null; god: boolean; boss: BossParam | null; autopilot: boolean; selftest: boolean }
export interface FrameStats { p50: number; p95: number; max: number; longFrames: number; frames: number }
export interface GameApi {
  readonly screen: Screen;
  readonly sim: Sim | null;
  readonly config: RunConfig | null;
  startRun(cfg: RunConfig): number;        // returns ms taken (performance.now delta)
  restart(): number;                        // same cfg (endless: new random seed unless selftest/seed param); returns ms
  pause(): void; resume(): void;
  setScreen(s: Screen): void;
  setQuality(q: Quality): void;
  setSimSpeed(n: number): void;
  forceNuke(): void;                        // injects a nuke press for the next tick
  simulateVisibility(hidden: boolean): void; // runs the same handler as visibilitychange
  frameStats(): FrameStats; resetFrameStats(): void;
  drawCalls(): number; maxAlive(): number; resetMaxAlive(): void;
  heapMb(): number | null;                  // performance.memory?.usedJSHeapSize / 2^20 when available
  lastRestartMs(): number;
  setInvariantChecking(on: boolean): void; invariantViolations(): readonly string[]; maxDropped(): number;
  isPaused(): boolean;
  nukeCount(): number;                      // NukeDetonate events seen this page session
}
