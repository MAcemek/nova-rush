import { el, uiRoot } from './dom';

export type ToastKind = 'info' | 'mission' | 'achievement' | 'warn';
let pool: HTMLElement[] | null = null;
let next = 0;
let stack: HTMLElement | null = null;

export function toast(text: string, kind: ToastKind): void {
  if (!pool) {
    stack = el('div', 'toast-stack', uiRoot);
    pool = [];
    for (let i = 0; i < 3; i++) { const t = el('div', 'toast hidden', stack); pool.push(t); }
  }
  const t = pool[next]!;
  next = (next + 1) % pool.length;
  t.textContent = text;
  t.className = 'toast ' + kind;
  stack!.appendChild(t);
  for (const a of t.getAnimations()) a.cancel();
  t.animate(
    [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'translateY(0)', offset: 0.1 }, { opacity: 1, transform: 'translateY(0)', offset: 0.9 }, { opacity: 0, transform: 'translateY(-6px)' }],
    { duration: 3000, easing: 'ease-out' },
  ).onfinish = (): void => { t.classList.add('hidden'); };
}
