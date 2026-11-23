import { audio, currentVolumes } from './sfx';

const CHORDS: number[][][] = [
  [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]],      // Azure
  [[2, 5, 9], [10, 14, 17], [5, 9, 12], [0, 4, 7]],       // Red Giant
  [[4, 7, 11], [0, 4, 7], [7, 11, 14], [2, 6, 9]],        // Ice
  [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],     // Hive
  [[6, 9, 13], [2, 6, 9], [9, 13, 16], [4, 8, 11]],       // Void
];
const BASS_IDX = [0, 2, 1, 2];
const LEAD_IDX = [0, 1, 2, 1, 2, 0, 1, 2];

function freq(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }

export class Music {
  beat = 0;
  private timerId: number | null = null;
  private step = 0;
  private nextNoteTime = 0;
  private lastKickTime = -10;
  private combo = 0; private boss = false; private warp = false; private sector = 0;
  private runSec = 0;
  private filter: BiquadFilterNode | null = null;
  private rumble: { src: AudioBufferSourceNode; gain: GainNode; lp: BiquadFilterNode } | null = null;
  private stopTimer: number | null = null;
  private lastWarp = false;

  private readonly tick = (): void => {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running') { return; }
    const bpm = Math.min(150, 110 + 2 * this.sector);
    const dur = 60 / bpm / 4;
    if (this.nextNoteTime < ctx.currentTime - 0.5) this.nextNoteTime = ctx.currentTime + 0.05;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.schedule(ctx, this.step, this.nextNoteTime, dur);
      this.nextNoteTime += dur;
      this.runSec += dur;
      this.step = (this.step + 1) % 64;
    }
  };

  start(sectorIndex: number): void {
    const ctx = audio.ctx;
    this.sector = sectorIndex;
    this.stopInterval();
    if (this.stopTimer !== null) { window.clearTimeout(this.stopTimer); this.stopTimer = null; }
    if (!ctx || !audio.musicGain) return;
    this.killRumble();
    if (!this.filter) {
      this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 600;
      this.filter.connect(audio.musicGain);
    }
    const t = ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setTargetAtTime(600, t, 0.05);
    audio.musicGain.gain.cancelScheduledValues(t);
    audio.musicGain.gain.setTargetAtTime(currentVolumes().music, t, 0.05);
    this.step = 0; this.runSec = 0; this.lastKickTime = -10; this.lastWarp = false;
    this.nextNoteTime = t + 0.05;
    this.timerId = window.setInterval(this.tick, 25);
  }

  stop(): void { this.stopInterval(); }
  private stopInterval(): void { if (this.timerId !== null) { window.clearInterval(this.timerId); this.timerId = null; } }

  pause(): void { this.stopInterval(); }
  resume(): void {
    const ctx = audio.ctx;
    if (!ctx || this.timerId !== null || this.stopTimer !== null) return;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.timerId = window.setInterval(this.tick, 25);
  }

  setState(combo: number, boss: boolean, warp: boolean, sectorIndex: number): void {
    this.combo = combo; this.boss = boss; this.warp = warp; this.sector = sectorIndex;
    if (warp !== this.lastWarp) {
      this.lastWarp = warp;
      const ctx = audio.ctx;
      if (ctx && this.filter) this.filter.frequency.setTargetAtTime(warp ? 4000 : 600, ctx.currentTime, 0.4);
    }
  }

  gameOver(): void {
    const ctx = audio.ctx;
    if (!ctx || !audio.musicGain || !audio.pink || !audio.comp) return;
    const t = ctx.currentTime;
    audio.musicGain.gain.setTargetAtTime(0, t, 0.5);
    this.killRumble();
    const src = ctx.createBufferSource(); src.buffer = audio.pink; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120;
    const gain = ctx.createGain(); gain.gain.value = 0.0001;
    src.connect(lp); lp.connect(gain); gain.connect(audio.comp);
    gain.gain.setTargetAtTime(0.15, t, 0.5);
    src.start();
    this.rumble = { src, gain, lp };
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => { this.stopInterval(); this.stopTimer = null; }, 2000);
  }

  private killRumble(): void {
    const r = this.rumble;
    if (!r) return;
    this.rumble = null;
    const ctx = audio.ctx;
    try { if (ctx) r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); r.src.stop((ctx ? ctx.currentTime : 0) + 0.3); } catch { /* already stopped */ }
    r.src.onended = () => { r.src.disconnect(); r.lp.disconnect(); r.gain.disconnect(); };
  }

  update(): void {
    const ctx = audio.ctx;
    if (!ctx) { this.beat = 0; return; }
    const b = 1 - (ctx.currentTime - this.lastKickTime) / 0.25;
    this.beat = b > 0 ? b : 0;
  }

  private schedule(ctx: AudioContext, step: number, t: number, dur: number): void {
    const biome = this.sector % 5;
    const chord = CHORDS[biome]![Math.floor(step / 16) % 4]!;
    const f = this.filter!;
    // bass
    this.note(ctx, 'sawtooth', freq(36 + chord[BASS_IDX[step % 4]!]!), t, 0.12, 0.12, f);
    // drums
    if (this.runSec >= 10) {
      if (step % 4 === 0) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g); g.connect(audio.musicGain!);
        this.finish(o, [g], t, t + 0.27);
        this.lastKickTime = t;
      }
      if (audio.white) {
        if (step % 16 === 4 || step % 16 === 12) this.noiseHit(ctx, t, 1500, 0.15, 0.2);
        if (step % 2 === 0) this.noiseHit(ctx, t, 7000, 0.03, 0.04);
      }
    }
    // pads
    if (this.combo >= 10 && step % 16 === 0) {
      const barDur = dur * 16;
      for (let ti = 0; ti < 3; ti++) {
        for (let d = -1; d <= 1; d++) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq(48 + chord[ti]!); o.detune.value = d * 6;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4); g.gain.setValueAtTime(0.05, t + barDur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + barDur);
          o.connect(g); g.connect(f);
          this.finish(o, [g], t, t + barDur + 0.05);
        }
      }
    }
    // lead
    if ((this.boss || this.combo >= 25) && step % 2 === 0) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq(72 + chord[LEAD_IDX[(step / 2) % 8]!]!);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(lp); lp.connect(g); g.connect(audio.musicGain!);
      this.finish(o, [lp, g], t, t + 0.2);
    }
  }

  private note(ctx: AudioContext, type: OscillatorType, f: number, t: number, peak: number, decay: number, dest: AudioNode): void {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + decay);
    o.connect(g); g.connect(dest);
    this.finish(o, [g], t, t + decay + 0.03);
  }

  private noiseHit(ctx: AudioContext, t: number, hp: number, dur: number, peak: number): void {
    const n = ctx.createBufferSource(); n.buffer = audio.white!;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + dur);
    n.connect(f); f.connect(g); g.connect(audio.musicGain!);
    this.finish(n, [f, g], t, t + dur + 0.03);
  }

  private finish(src: AudioScheduledSourceNode, nodes: AudioNode[], t0: number, t1: number): void {
    src.start(t0); src.stop(t1);
    src.onended = () => { src.disconnect(); for (let i = 0; i < nodes.length; i++) nodes[i]!.disconnect(); };
  }
}

export const music = new Music();
