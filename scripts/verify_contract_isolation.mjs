import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/contract';
const IMPORT_RE = /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    const isRelative = spec.startsWith('.');
    const isNodeStdlib = spec.startsWith('node:');
    if (isNodeStdlib) continue;
    if (!isRelative) {
      violations.push(`${file}: non-stdlib package import '${spec}' (contract layer must stay dependency-free)`);
      continue;
    }
    // relative imports must resolve to somewhere inside src/contract
    // any '../' that climbs above src/contract is a leak
    const depth = file.split('/').length - 1 - ROOT.split('/').length; // dirs below ROOT
    const climbs = (spec.match(/\.\.\//g) || []).length;
    if (climbs > depth) {
      violations.push(`${file}: relative import '${spec}' escapes ${ROOT}`);
    }
  }
}

if (violations.length) {
  console.error(`Contract isolation violations:\n${violations.join('\n')}`);
  process.exit(1);
}
console.log('contract isolation OK');
