import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = 'src/contract';
const IMPORT_RE = /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm;

// A3 (feature 004): @trading-platform/sdk is the ONE permitted external import in the contract layer,
// and ONLY in this single seam file. Every other contract file (notably research-read/dto.ts) MUST stay
// dependency-free — this is the machine guarantee that research-read remains extractable.
const SDK_SEAM_FILE = 'src/contract/ops-read/dto.sdk.ts';
const SDK_PKG_RE = /^@trading-platform\/sdk(?:\/.*)?$/;

/** Returns a violation string for an import `spec` seen in `file`, or null if the import is allowed. */
export function violationFor(file: string, spec: string): string | null {
  const norm = file.split('\\').join('/');
  if (spec.startsWith('node:')) return null;
  const isRelative = spec.startsWith('.');
  if (!isRelative) {
    if (SDK_PKG_RE.test(spec)) {
      if (norm === SDK_SEAM_FILE) return null; // the sole permitted SDK seam
      return `${file}: '@trading-platform/sdk' may be imported ONLY in ${SDK_SEAM_FILE} (A3 SDK seam) — found in a different contract file`;
    }
    return `${file}: non-stdlib package import '${spec}' (contract layer must stay dependency-free)`;
  }
  // relative imports must resolve to somewhere inside src/contract
  const depth = norm.split('/').length - 1 - ROOT.split('/').length; // dirs below ROOT
  const climbs = (spec.match(/\.\.\//g) || []).length;
  if (climbs > depth) return `${file}: relative import '${spec}' escapes ${ROOT}`;
  return null;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Scan the whole contract tree and return all violations. */
export function scanViolations(root: string = ROOT): string[] {
  const out: string[] = [];
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const v = violationFor(file, m[1] as string);
      if (v) out.push(v);
    }
  }
  return out;
}

function main(): void {
  const violations = scanViolations();
  if (violations.length) {
    console.error(`Contract isolation violations:\n${violations.join('\n')}`);
    process.exit(1);
  }
  console.log('contract isolation OK');
}

// Run main() only when invoked directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
