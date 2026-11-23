import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[]): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const RULES: RegExp[] = [
  /from\s+['"]three/, /from\s+['"]node:/, /\brequire\s*\(/, /\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/,
  /Math\.random\b/, /\bDate\b/, /\bperformance\b/, /Math\.(sin|cos|tan|atan2|pow|exp|log|hypot)\b/, /\*\*/, /\bInfinity\b/,
];
describe('core purity', () => {
  it('src/core has no banned APIs', () => {
    const files = walk('src/core', []);
    expect(files.length).toBeGreaterThan(5);
    const errs: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const r of RULES) if (r.test(src)) errs.push(f + ' matches ' + r);
    }
    expect(errs).toEqual([]);
  });
});
