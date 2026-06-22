#!/usr/bin/env node
// verify_harness_sync — proves the vendored cross-repo artifacts have not drifted:
//   (a) the historical conformance harness, and
//   (b) the platform historical golden (byte-identity source of truth).
//
//  HARD : sha256(local vendored copy) === recorded .sha256 (tamper detect).
//  SOFT : if the platform repo is reachable, byte-compare the vendored copy against the
//         live platform source (source-drift detect). Platform unreachable / artifact
//         absent => warning + skip the cross-repo check (the local sha stays hard).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const VENDORED = join(repoRoot, 'test/conformance/_vendored/historical.conformance.mjs');
const SHA_FILE = join(repoRoot, 'test/conformance/_vendored/historical.conformance.sha256');
const GOLDEN = join(repoRoot, 'test/conformance/_vendored/platform-historical-golden.json');
const GOLDEN_SHA_FILE = join(repoRoot, 'test/conformance/_vendored/platform-historical-golden.sha256');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function fail(msg) {
  console.error(`verify_harness_sync: FAIL — ${msg}`);
  process.exit(1);
}

const PLATFORM = process.env.PLATFORM_REPO ?? '/home/alexxxnikolskiy/projects/trading-platform';

// === harness ===
// --- HARD: local vendored copy matches its recorded checksum ---
if (!existsSync(VENDORED)) fail(`vendored harness missing: ${VENDORED}`);
if (!existsSync(SHA_FILE)) fail(`checksum file missing: ${SHA_FILE}`);

const vendoredBuf = readFileSync(VENDORED);
const localSha = sha256(vendoredBuf);
const recordedSha = readFileSync(SHA_FILE, 'utf8').trim();
if (localSha !== recordedSha) {
  fail(`vendored harness sha256 mismatch (local tamper):\n  recorded ${recordedSha}\n  actual   ${localSha}`);
}

// --- SOFT: cross-repo byte-identity against the platform source artifact ---
const TSCONFIG = join(PLATFORM, 'packages/sdk/conformance/tsconfig.historical.json');
const ARTIFACT = join(PLATFORM, 'dist/packages/sdk/conformance/historical.conformance.js');

if (!existsSync(PLATFORM) || !existsSync(TSCONFIG)) {
  console.warn(`verify_harness_sync: WARN — platform repo unreachable (${PLATFORM}); harness cross-repo check skipped`);
} else {
  try {
    execFileSync('npx', ['tsc', '-p', TSCONFIG], { cwd: PLATFORM, stdio: 'ignore' });
  } catch {
    console.warn('verify_harness_sync: WARN — platform harness recompile failed; using existing artifact if present');
  }
  if (!existsSync(ARTIFACT)) {
    console.warn(`verify_harness_sync: WARN — platform artifact absent (${ARTIFACT}); harness cross-repo check skipped`);
  } else {
    const platformBuf = readFileSync(ARTIFACT);
    if (sha256(platformBuf) !== localSha) {
      fail(`vendored harness drifted from platform source:\n  platform sha ${sha256(platformBuf)}\n  vendored sha ${localSha}\n  re-vendor: cp ${ARTIFACT} ${VENDORED} && sha256 -> .sha256`);
    }
    console.log('verify_harness_sync: harness cross-repo byte-identity OK');
  }
}

// === golden ===
// --- HARD: vendored platform golden matches its recorded checksum ---
if (!existsSync(GOLDEN)) fail(`vendored golden missing: ${GOLDEN}`);
if (!existsSync(GOLDEN_SHA_FILE)) fail(`golden checksum file missing: ${GOLDEN_SHA_FILE}`);

const goldenBuf = readFileSync(GOLDEN);
const goldenSha = sha256(goldenBuf);
const recordedGoldenSha = readFileSync(GOLDEN_SHA_FILE, 'utf8').trim();
if (goldenSha !== recordedGoldenSha) {
  fail(`vendored golden sha256 mismatch (local tamper):\n  recorded ${recordedGoldenSha}\n  actual   ${goldenSha}`);
}

// --- SOFT: cross-repo byte-identity against the live platform MANIFEST ---
const PLATFORM_GOLDEN = join(PLATFORM, 'test/fixtures/historical-golden/MANIFEST.json');
if (!existsSync(PLATFORM) || !existsSync(PLATFORM_GOLDEN)) {
  console.warn(`verify_harness_sync: WARN — platform golden unreachable (${PLATFORM_GOLDEN}); golden cross-repo check skipped`);
} else {
  const platformGoldenBuf = readFileSync(PLATFORM_GOLDEN);
  if (sha256(platformGoldenBuf) !== goldenSha) {
    fail(`vendored golden drifted from platform source:\n  platform sha ${sha256(platformGoldenBuf)}\n  vendored sha ${goldenSha}\n  re-vendor: cp ${PLATFORM_GOLDEN} ${GOLDEN} && sha256 -> .sha256`);
  }
  console.log('verify_harness_sync: golden cross-repo byte-identity OK');
}

console.log('verify_harness_sync: OK');
