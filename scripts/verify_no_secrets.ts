import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { scanText } from '../src/safety/secret-scan.js';

const DATA_EXTS = new Set(['.json', '.ndjson', '.parquet', '.csv', '.txt', '.yaml', '.yml', '.env']);
const EXCLUDE_DIRS = ['src/', 'test/', 'docs/', 'scripts/', '.github/', 'node_modules/'];
const EXCLUDE_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts']);

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}
function extOf(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i >= 0 ? b.slice(i) : '';
}

/** Clarification #2: data files anywhere (by ext or under data/), excluding source/test/docs/config + .gitkeep. */
export function inScope(path: string): boolean {
  if (basename(path) === '.gitkeep') return false;
  if (EXCLUDE_DIRS.some((d) => path.startsWith(d))) return false;
  if (EXCLUDE_FILES.has(path)) return false;
  return path.startsWith('data/') || DATA_EXTS.has(extOf(path));
}

/** Pure: returns `"path: label, label"` for every file with forbidden-pattern hits. */
export function scanFiles(entries: ReadonlyArray<{ path: string; content: string }>): string[] {
  const out: string[] = [];
  for (const { path, content } of entries) {
    const hits = scanText(content);
    if (hits.length > 0) out.push(`${path}: ${hits.join(', ')}`);
  }
  return out;
}

function main(): void {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const inScopePaths = tracked.filter(inScope);
  const entries = inScopePaths.map((path) => {
    let content = '';
    try { content = readFileSync(path, 'utf8'); } catch { /* unreadable as utf8 — treat as empty */ }
    return { path, content };
  });
  const violations = scanFiles(entries);
  if (violations.length) {
    console.error(`Secret/forbidden-pattern violations in committed data:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`no-secrets OK (${inScopePaths.length} data file(s) scanned)`);
}

// Run main() only when invoked directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
