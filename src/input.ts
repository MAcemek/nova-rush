import type { InputFrame } from './core/types';

export type SteerMode = 'keyboard' | 'mouse';

const frame: InputFrame = { steer: 0, fire: false, nuke: false, roll: 0, jump: false };

/** Keys that cannot be bound to the nuke (steering, roll, jump, fire, menus). */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['Escape', 'Space', 'Enter', 'Tab', 'KeyA', 'KeyD', 'KeyW', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Human-readable name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code.replace(/(Left|Right)$/, ' $1').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function clamp127(v: number): number { return v < -127 ? -127 : v > 127 ? 127 : v; }

export class InputSampler {
  steerMode: SteerMode = 'keyboard';
  nukeKey = 'KeyN';
  autoFire = true;
  pointerNdcX = 0; pointerNdcY = 0; pointerWorldX = 0;
  pointerInside = false; touchActive = false; touchEnabled = false; touchSteerX = 0;

  private readonly target: HTMLElement;
  private readonly held = new Set<string>();
  private attached = false;
  private mouseFire = false;
  private keyRamp = 0;
  private pendingNuke = false;
  private pendingJump = false;
  private pendingRoll: -1 | 0 | 1 = 0;
  private lastTapGroup = 0;
  private lastTapTime = -1e9;

  constructor(target: HTMLElement) { this.target = target; }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', (e) => { this.onKeyDown(e); });
    window.addEventListener('keyup', (e) => { this.held.delete(e.code); });
    this.target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.mouseFire = true; else if (e.button === 2) this.pendingNuke = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.mouseFire = false;
    });
    this.target.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointerNdcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerNdcY = -(e.clientY / window.innerHeight) * 2 + 1;
      this.pointerInside = true;
    });
    this.target.addEventListener('pointerleave', () => { this.pointerInside = false; });
    this.target.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    window.addEventListener('blur', () => { this.clearHeld(); });
  }

  private onKeyDown(e: KeyboardEvent): void {
    const c = e.code;
    if (c === 'Space' || c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowUp' || c === 'ArrowDown') e.preventDefault();
    if (e.repeat) return;
    this.held.add(c);
    if (c === this.nukeKey) this.pendingNuke = true;
    else if (c === 'KeyW' || c === 'ArrowUp') this.pendingJump = true;
    else if (c === 'KeyQ') this.pendingRoll = -1;
    else if (c === 'KeyE') this.pendingRoll = 1;
    else {
      const group = c === 'KeyA' || c === 'ArrowLeft' ? -1 : c === 'KeyD' || c === 'ArrowRight' ? 1 : 0;
      if (group !== 0) {
        if (group === this.lastTapGroup && e.timeStamp - this.lastTapTime < 250) { this.pendingRoll = group as -1 | 1; this.lastTapGroup = 0; }
        else { this.lastTapGroup = group; this.lastTapTime = e.timeStamp; }
      }
    }
  }

  sample(shipX: number): InputFrame {
    const h = this.held;
    const left = h.has('KeyA') || h.has('ArrowLeft');
    const right = h.has('KeyD') || h.has('ArrowRight');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const goal = dir * 127;
    const stp = 127 / 4;
    if (this.keyRamp < goal) { this.keyRamp += stp; if (this.keyRamp > goal) this.keyRamp = goal; }
    else if (this.keyRamp > goal) { this.keyRamp -= stp; if (this.keyRamp < goal) this.keyRamp = goal; }
    let steer: number;
    if (this.touchActive) steer = clamp127(Math.round((this.touchSteerX - shipX) * 127 / 6));
    else if (dir !== 0 || this.steerMode === 'keyboard' || !this.pointerInside) steer = Math.round(this.keyRamp);
    else steer = clamp127(Math.round((this.pointerWorldX - shipX) * 127 / 6));
    frame.steer = steer;
    frame.fire = this.autoFire || this.touchEnabled || h.has('Space') || this.mouseFire;
    frame.nuke = this.pendingNuke;
    frame.roll = this.pendingRoll;
    frame.jump = this.pendingJump;
    this.pendingNuke = false; this.pendingRoll = 0; this.pendingJump = false;
    return frame;
  }

  clearHeld(): void {
    this.held.clear(); this.mouseFire = false; this.keyRamp = 0;
    this.pendingNuke = false; this.pendingRoll = 0; this.pendingJump = false; this.touchActive = false;
    this.lastTapGroup = 0;
  }

  heldKeysSnapshot(out: Set<string>): void {
    out.clear();
    for (const k of this.held) out.add(k);
  }

  injectNuke(): void { this.pendingNuke = true; }
  injectJump(): void { this.pendingJump = true; }
  injectRoll(dir: -1 | 1): void { this.pendingRoll = dir; }
}
