export const errorLog: { count: number; last: string[] } = { count: 0, last: [] };
export function recordError(msg: string): void {
  errorLog.count++;
  errorLog.last.push(msg);
  if (errorLog.last.length > 20) errorLog.last.shift();
}
export function installErrorHandlers(): void {
  window.addEventListener('error', (e) => { recordError(String(e.message)); });
  window.addEventListener('unhandledrejection', (e) => { recordError('unhandled: ' + String(e.reason)); });
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => { recordError(args.map(String).join(' ')); orig(...args); };
}

let crashShown = false;
export function showCrashOverlay(err: unknown, showStack: boolean): void {
  if (crashShown) return;
  crashShown = true;
  const root = document.createElement('div');
  root.className = 'screen crash';
  root.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(3,4,12,.92);color:#e8f4ff';
  const h = document.createElement('div');
  h.className = 'title-logo'; h.textContent = 'Something went wrong';
  h.style.fontSize = '36px';
  root.appendChild(h);
  const b = document.createElement('button');
  b.textContent = 'Restart'; b.style.marginTop = '20px';
  b.addEventListener('click', () => { location.reload(); });
  root.appendChild(b);
  if (showStack) {
    const pre = document.createElement('pre');
    pre.textContent = err instanceof Error ? (err.stack ?? err.message) : String(err);
    pre.style.cssText = 'max-width:90vw;max-height:40vh;overflow:auto;font-size:12px;margin-top:16px';
    root.appendChild(pre);
  }
  document.body.appendChild(root);
}
