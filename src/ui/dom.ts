export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
export function setText(node: HTMLElement, cache: { v: string }, value: string): void {
  if (value !== cache.v) { cache.v = value; node.textContent = value; }
}
export function show(node: HTMLElement): void { node.classList.remove('hidden'); }
export function hide(node: HTMLElement): void { node.classList.add('hidden'); }
export const uiRoot: HTMLElement = document.getElementById('ui')!;
