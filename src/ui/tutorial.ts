import { el, uiRoot } from './dom';
import { keyLabel } from '../input';
import { store } from '../meta/profile';

const desktopPrompts = (): string[] => [
  'STEER — A / D, ← →, or mouse',
  'SHOOT — lasers fire automatically. Watch the heat bar!',
  'SKIM PAST HAZARDS FOR A CLOSE CALL BONUS',
  'BARREL ROLL — Q / E or double-tap A / D',
  'NUKE — press ' + keyLabel(store.profile.settings.nukeKey) + ' or right-click',
];
const TOUCH = [
  'DRAG ON THE LEFT HALF TO STEER',
  'SHOOT — lasers fire automatically. Watch the heat bar!',
  'SKIM PAST HAZARDS FOR A CLOSE CALL BONUS',
  'TAP ROLL',
  'TAP NUKE',
];
const BOUNDS = [280, 620, 940, 1180];

export function tutorialStep(tick: number): number {
  let i = 0;
  while (i < BOUNDS.length && tick >= BOUNDS[i]!) i++;
  return i;
}

export interface TutorialUi { root: HTMLElement; show(): void; hide(): void; update(tick: number, touch: boolean): void; onSkip: () => void }

export function createTutorialUi(): TutorialUi {
  const root = el('div', 'tutorial hidden', uiRoot);
  const prompt = el('div', 'tutorial-prompt', root);
  const skip = el('button', 'tutorial-skip', root, 'Skip tutorial');
  let last = -1, lastTouch = false;
  const self: TutorialUi = {
    root, onSkip: () => {},
    show(): void { last = -1; root.classList.remove('hidden'); },
    hide(): void { root.classList.add('hidden'); },
    update(tick: number, touch: boolean): void {
      const s = tutorialStep(tick);
      if (s !== last || touch !== lastTouch) { last = s; lastTouch = touch; prompt.textContent = (touch ? TOUCH : desktopPrompts())[s]!; }
    },
  };
  skip.addEventListener('click', (e) => { e.stopPropagation(); self.onSkip(); });
  return self;
}
