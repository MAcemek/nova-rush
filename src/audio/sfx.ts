import { EvType } from '../core/types';
import type { SimEvent } from '../core/types';
import type { FxListener } from '../render/fx';
import { presetForKind } from '../render/renderTuning';

export const audio: {
  ctx: AudioContext | null; master: GainNode | null; sfxGain: GainNode | null; musicGain: GainNode | null; comp: DynamicsCompressorNode | null;
  duck: BiquadFilterNode | null; delaySend: GainNode | null; white: AudioBuffer | null; pink: AudioBuffer | null;
} = { ctx: null, master: null, sfxGain: null, musicGain: null, comp: null, duck: null, delaySend: null, white: null, pink: null };

let volMusic = 0.6, volSfx = 0.8;

export function ensureAudio(): void {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') void audio.ctx.resume(); return; }
  const ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  const duck = ctx.createBiquadFilter(); duck.type = 'lowpass'; duck.frequency.value = 20000;
  const master = ctx.createGain(); master.gain.value = 1;
  const sfxGain = ctx.createGain(); sfxGain.gain.value = volSfx;
  const musicGain = ctx.createGain(); musicGain.gain.value = volMusic;
  sfxGain.connect(comp); musicGain.connect(comp); comp.connect(duck); duck.connect(master); master.connect(ctx.destination);
  const delaySend = ctx.createGain(); delaySend.gain.value = 0.25;
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.12;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  delaySend.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(comp);
  audio.ctx = ctx; audio.comp = comp; audio.master = master; audio.sfxGain = sfxGain; audio.musicGain = musicGain; audio.duck = duck; audio.delaySend = delaySend;
  initAudioAssets();
}

export function initAudioAssets(): void {
  const ctx = audio.ctx;
  if (!ctx || audio.white) return;
  const n = ctx.sampleRate * 2;
  const white = ctx.createBuffer(1, n, ctx.sampleRate);
  const pink = ctx.createBuffer(1, n, ctx.sampleRate);
  const w = white.getChannelData(0), p = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
  }
  audio.white = white; audio.pink = pink;
}

export function currentVolumes(): { music: number; sfx: number } { return { music: volMusic, sfx: volSfx }; }

export function setVolumes(music: number, sfx: number): void {
  volMusic = music; volSfx = sfx;
  const ctx = audio.ctx;
  if (!ctx || !audio.musicGain || !audio.sfxGain) return;
  audio.musicGain.gain.setTargetAtTime(music, ctx.currentTime, 0.05);
  audio.sfxGain.gain.setTargetAtTime(sfx, ctx.currentTime, 0.05);
}

// ---- voice limiter ----
const MAX_VOICES = 24;
interface Voice { src: AudioScheduledSourceNode[]; nodes: AudioNode[]; gain: GainNode | null; endAt: number; startedAt: number; active: boolean; gen: number; live: number }
const voices: Voice[] = [];
for (let i = 0; i < MAX_VOICES; i++) voices.push({ src: [], nodes: [], gain: null, endAt: 0, startedAt: 0, active: false, gen: 0, live: 0 });

function release(v: Voice): void {
  for (let i = 0; i < v.nodes.length; i++) { try { v.nodes[i]!.disconnect(); } catch { /* already disconnected */ } }
  v.nodes.length = 0; v.src.length = 0; v.gain = null; v.active = false; v.live = 0;
}

function beginVoice(ctx: AudioContext): Voice {
  let pick: Voice | null = null;
  for (let i = 0; i < MAX_VOICES; i++) { if (!voices[i]!.active) { pick = voices[i]!; break; } }
  if (!pick) {
    let oldest = voices[0]!;
    for (let i = 1; i < MAX_VOICES; i++) if (voices[i]!.startedAt < oldest.startedAt) oldest = voices[i]!;
    pick = oldest;
    const now = ctx.currentTime;
    if (pick.gain) pick.gain.gain.setTargetAtTime(0, now, 0.003);
    for (let i = 0; i < pick.src.length; i++) { try { pick.src[i]!.stop(now + 0.02); } catch { /* not started */ } }
    const oldNodes = pick.nodes.slice();
    window.setTimeout(() => { for (let i = 0; i < oldNodes.length; i++) { try { oldNodes[i]!.disconnect(); } catch { /* ok */ } } }, 60);
    pick.nodes = []; pick.src = [];
  }
  pick.gen++; pick.active = true; pick.live = 0; pick.startedAt = ctx.currentTime;
  const g = ctx.createGain(); g.gain.value = 1;
  g.connect(audio.sfxGain!);
  pick.gain = g; pick.nodes.push(g);
  return pick;
}

function track(v: Voice, n: AudioNode): void { v.nodes.push(n); }
function start(v: Voice, s: AudioScheduledSourceNode, t0: number, t1: number): void {
  v.nodes.push(s); v.src.push(s);
  const gen = v.gen;
  v.live++;
  s.onended = () => { if (v.gen !== gen) return; if (--v.live <= 0) release(v); };
  s.start(t0); s.stop(t1);
}
function sendDelay(v: Voice, ctx: AudioContext, amount: number): void {
  if (!audio.delaySend) return;
  const g = ctx.createGain(); g.gain.value = amount;
  v.gain!.connect(g); g.connect(audio.delaySend); track(v, g);
}
function env(p: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + Math.max(attack, 0.004));
  p.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, 0.004) + decay);
}
function osc(ctx: AudioContext, type: OscillatorType, f: number): OscillatorNode { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
function noise(ctx: AudioContext, buf: AudioBuffer): AudioBufferSourceNode { const s = ctx.createBufferSource(); s.buffer = buf; return s; }
function panner(ctx: AudioContext, pan: number): StereoPannerNode { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); return p; }

let lastLaser = -1;

export function sfxLaser(pan: number): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (t - lastLaser < 0.05) return;
  lastLaser = t;
  const v = beginVoice(ctx);
  const o = osc(ctx, 'square', 880 * (0.97 + 0.06 * Math.random()));
  o.frequency.setValueAtTime(o.frequency.value, t);
  o.frequency.exponentialRampToValueAtTime(o.frequency.value * 0.5, t + 0.06);
  const g = ctx.createGain(); env(g.gain, t, 0.08, 0.004, 0.066);
  const p = panner(ctx, pan * 0.35);
  o.connect(g); g.connect(p); p.connect(v.gain!); track(v, g); track(v, p);
  start(v, o, t, t + 0.08);
}

export function sfxHit(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const o = osc(ctx, 'square', 1800);
  const g = ctx.createGain(); env(g.gain, t, 0.05, 0.004, 0.02);
  o.connect(g); g.connect(v.gain!); track(v, g);
  start(v, o, t, t + 0.04);
}

export function sfxExplosion(size: number, pan: number): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running' || !audio.white) return;
  const t = ctx.currentTime;
  const s = Math.max(0.15, size);
  const v = beginVoice(ctx);
  const n = noise(ctx, audio.white);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(800 + 2400 * s / 1.5, t); lp.frequency.exponentialRampToValueAtTime(120, t + s);
  const g = ctx.createGain(); env(g.gain, t, 0.5 * Math.min(1, s), 0.004, s);
  const p = panner(ctx, Math.max(-1, Math.min(1, pan / 14)) * 0.5);
  n.connect(lp); lp.connect(g); g.connect(p); p.connect(v.gain!); track(v, lp); track(v, g); track(v, p);
  start(v, n, t, t + s + 0.05);
  const sub = osc(ctx, 'sine', 90);
  sub.frequency.setValueAtTime(90, t); sub.frequency.exponentialRampToValueAtTime(35, t + 0.8 * s);
  const sg = ctx.createGain(); env(sg.gain, t, 0.6 * s / 1.5, 0.004, 0.8 * s);
  sub.connect(sg); sg.connect(v.gain!); track(v, sg);
  start(v, sub, t, t + 0.8 * s + 0.05);
}

const PENT = [0, 3, 5, 7, 10];
export function sfxComboStep(combo: number): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const step = combo % 15;
  const oct = Math.floor(step / 5);
  const f = 261.63 * Math.pow(2, oct + PENT[step % 5]! / 12);
  const v = beginVoice(ctx);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
  const g = ctx.createGain(); env(g.gain, t, 0.22, 0.004, 0.35);
  lp.connect(g); g.connect(v.gain!); track(v, lp); track(v, g);
  const o1 = osc(ctx, 'triangle', f); o1.connect(lp);
  const o2 = osc(ctx, 'sine', f * 2); o2.detune.value = 7; o2.connect(lp);
  start(v, o1, t, t + 0.45); start(v, o2, t, t + 0.45);
  const o3 = osc(ctx, 'sine', f * 4);
  const sg = ctx.createGain(); env(sg.gain, t, 0.04, 0.004, 0.15);
  o3.connect(sg); sg.connect(v.gain!); track(v, sg);
  start(v, o3, t, t + 0.25);
  sendDelay(v, ctx, 1);
}

export function sfxComboLost(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000;
  lp.connect(v.gain!); track(v, lp);
  const notes = [392, 311.1, 261.6];
  for (let i = 0; i < 3; i++) {
    const o = osc(ctx, 'triangle', notes[i]!);
    const g = ctx.createGain(); env(g.gain, t + i * 0.09, 0.12, 0.004, 0.12);
    o.connect(g); g.connect(lp); track(v, g);
    start(v, o, t + i * 0.09, t + i * 0.09 + 0.14);
  }
}

export function sfxNearMiss(side: number): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running' || !audio.pink) return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const n = noise(ctx, audio.pink);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.12); bp.frequency.exponentialRampToValueAtTime(600, t + 0.35);
  const g = ctx.createGain(); env(g.gain, t, 0.25, 0.01, 0.34);
  const p = panner(ctx, side * 0.8);
  n.connect(bp); bp.connect(g); g.connect(p); p.connect(v.gain!); track(v, bp); track(v, g); track(v, p);
  start(v, n, t, t + 0.37);
}

export function sfxPickup(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const f = [523.3, 659.3, 784, 1046.5];
  for (let i = 0; i < 4; i++) {
    const o = osc(ctx, 'sine', f[i]!);
    const g = ctx.createGain(); env(g.gain, t + i * 0.07, 0.12, 0.004, 0.15);
    o.connect(g); g.connect(v.gain!); track(v, g);
    start(v, o, t + i * 0.07, t + i * 0.07 + 0.2);
  }
}

export function sfxJump(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const o = osc(ctx, 'triangle', 280);
  o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.18);
  const g = ctx.createGain(); env(g.gain, t, 0.14, 0.01, 0.22);
  o.connect(g); g.connect(v.gain!); track(v, g);
  start(v, o, t, t + 0.26);
}

export function sfxHeal(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const f = [392, 523.3, 659.3];
  for (let i = 0; i < 3; i++) {
    const o = osc(ctx, 'triangle', f[i]!);
    const g = ctx.createGain(); env(g.gain, t + i * 0.1, 0.14, 0.01, 0.3);
    o.connect(g); g.connect(v.gain!); track(v, g);
    start(v, o, t + i * 0.1, t + i * 0.1 + 0.35);
  }
}

export function sfxOverheat(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running' || !audio.white) return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const n = noise(ctx, audio.white);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
  const g = ctx.createGain(); env(g.gain, t, 0.15, 0.004, 0.4);
  n.connect(hp); hp.connect(g); g.connect(v.gain!); track(v, hp); track(v, g);
  start(v, n, t, t + 0.45);
}

export function sfxCooled(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const o = osc(ctx, 'square', 2400);
  const g = ctx.createGain(); env(g.gain, t, 0.08, 0.004, 0.015);
  o.connect(g); g.connect(v.gain!); track(v, g);
  start(v, o, t, t + 0.04);
}

export function sfxNukeLaunch(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const o = osc(ctx, 'sawtooth', 120);
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.5);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(4000, t + 0.5);
  const g = ctx.createGain(); env(g.gain, t, 0.15, 0.05, 0.45);
  o.connect(lp); lp.connect(g); g.connect(v.gain!); track(v, lp); track(v, g);
  start(v, o, t, t + 0.6);
}

export function sfxNukeBoom(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running' || !audio.pink) return;
  sfxExplosion(1.5, 0);
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const n = noise(ctx, audio.pink);
  n.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
  const g = ctx.createGain(); env(g.gain, t, 0.4, 0.01, 3);
  n.connect(lp); lp.connect(g); g.connect(v.gain!); track(v, lp); track(v, g);
  start(v, n, t, t + 3.05);
  const o = osc(ctx, 'sine', 55);
  o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(30, t + 2);
  const og = ctx.createGain(); env(og.gain, t, 0.35, 0.01, 2);
  o.connect(og); og.connect(v.gain!); track(v, og);
  start(v, o, t, t + 2.1);
}

export function sfxPlayerHit(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running' || !audio.white) return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const o = osc(ctx, 'square', 110);
  const g = ctx.createGain(); env(g.gain, t, 0.4, 0.004, 0.25);
  o.connect(g); g.connect(v.gain!); track(v, g);
  start(v, o, t, t + 0.3);
  const n = noise(ctx, audio.white);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900;
  const ng = ctx.createGain(); env(ng.gain, t, 0.4, 0.004, 0.25);
  n.connect(bp); bp.connect(ng); ng.connect(v.gain!); track(v, bp); track(v, ng);
  start(v, n, t, t + 0.3);
  if (audio.duck) {
    audio.duck.frequency.setTargetAtTime(600, t, 0.01);
    audio.duck.frequency.setTargetAtTime(20000, t + 0.3, 0.08);
  }
}

export function sfxRoll(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running' || !audio.pink) return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const n = noise(ctx, audio.pink);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200;
  const g = ctx.createGain(); env(g.gain, t, 0.1, 0.02, 0.18);
  n.connect(bp); bp.connect(g); g.connect(v.gain!); track(v, bp); track(v, g);
  start(v, n, t, t + 0.22);
}

export function sfxPerfectDodge(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const f = [1760, 2637];
  for (let i = 0; i < 2; i++) {
    const o = osc(ctx, 'sine', f[i]!);
    const g = ctx.createGain(); env(g.gain, t, 0.1, 0.004, 0.3);
    o.connect(g); g.connect(v.gain!); track(v, g);
    start(v, o, t, t + 0.35);
  }
  sendDelay(v, ctx, 1);
}

export function sfxChime(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  const f = [1046.5, 1568, 2093];
  for (let i = 0; i < 3; i++) {
    const o = osc(ctx, 'sine', f[i]!);
    const g = ctx.createGain(); env(g.gain, t, 0.12, 0.004, 1.2);
    o.connect(g); g.connect(v.gain!); track(v, g);
    start(v, o, t, t + 1.3);
  }
  sendDelay(v, ctx, 1);
}

export function sfxWarning(): void {
  const ctx = audio.ctx; if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const v = beginVoice(ctx);
  for (let i = 0; i < 4; i++) {
    const o = osc(ctx, 'square', i % 2 === 0 ? 440 : 330);
    const g = ctx.createGain(); env(g.gain, t + i * 0.15, 0.1, 0.004, 0.13);
    o.connect(g); g.connect(v.gain!); track(v, g);
    start(v, o, t + i * 0.15, t + i * 0.15 + 0.15);
  }
}

export const sfxListener: FxListener = (e: SimEvent): number => {
  switch (e.type) {
    case EvType.Fire: sfxLaser(e.a); break;
    case EvType.Damage: sfxHit(); break;
    case EvType.Kill: sfxExplosion(presetForKind(e.kind).sfx, e.x); break;
    case EvType.ComboUp: sfxComboStep(e.a); break;
    case EvType.ComboLost: sfxComboLost(); break;
    case EvType.NearMiss: sfxNearMiss(e.b); break;
    case EvType.Pickup: sfxPickup(); break;
    case EvType.Overheat: sfxOverheat(); break;
    case EvType.Cooled: sfxCooled(); break;
    case EvType.NukeLaunch: sfxNukeLaunch(); break;
    case EvType.NukeDetonate: sfxNukeBoom(); break;
    case EvType.ShipHit: sfxPlayerHit(); break;
    case EvType.Roll: sfxRoll(); break;
    case EvType.Jump: sfxJump(); break;
    case EvType.Heal: if (e.b > 0) sfxHeal(); break;
    case EvType.PerfectDodge: sfxPerfectDodge(); break;
    case EvType.BossSpawn: sfxWarning(); break;
    default: break;
  }
  return 0;
};
