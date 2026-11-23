import { el, show, hide, uiRoot } from './dom';

export interface PauseScreen {
  root: HTMLElement; show(tutorial: boolean): void; hide(): void;
  onResume: () => void; onRestart: () => void; onSettings: () => void; onQuit: () => void; onSkipTutorial: () => void;
}

export function createPauseScreen(): PauseScreen {
  const root = el('div', 'screen hidden', uiRoot);
  el('div', 'title-logo', root, 'PAUSED');
  const menu = el('div', 'menu', root);
  const self: PauseScreen = {
    root, onResume: () => {}, onRestart: () => {}, onSettings: () => {}, onQuit: () => {}, onSkipTutorial: () => {},
    show(tutorial: boolean): void { skip.classList.toggle('hidden', !tutorial); show(root); },
    hide(): void { hide(root); },
  };
  const mk = (label: string, fn: () => void): HTMLElement => {
    const b = el('button', '', menu, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  mk('Resume', () => { self.onResume(); });
  mk('Restart', () => { self.onRestart(); });
  mk('Settings', () => { self.onSettings(); });
  const skip = mk('Skip tutorial', () => { self.onSkipTutorial(); });
  mk('Quit to title', () => { self.onQuit(); });
  return self;
}
