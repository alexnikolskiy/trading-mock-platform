# Feature 002 — CI Guard — Design

**Status:** approved (design accepted 2026-06-16; pre-authorized for implementation once the plan reflects the three clarifications below).

## Problem

The mock-platform invariants that keep it safe and standalone are currently enforced only by local discipline. Nothing stops a PR from breaking them. Feature 002 makes them automatic CI gates on every PR.

## Goal

A GitHub Actions CI guard that, on every PR to `main` (and every push to `main`), enforces:
1. `pnpm check` — typecheck + tests.
2. Contract import-isolation guard (already inside `pnpm check`).
3. Secret / forbidden-pattern scan over committed data.
4. No private / forbidden dependencies (`trading-platform`, `pg`, `ccxt`, exchange SDKs, non-registry specifiers).
5. `docker build` on public deps only, with no private access.

## Boundaries (unchanged)

Read-side guard ONLY. **No new service runtime.** No live Surface B / MCP / backtest (`backtesting_moved_to_trading_backtester`). The only `src/` change is an export-only refactor of the existing `src/safety/secret-scan.ts` so the CI scanner and the runtime share one pattern source — no new runtime behavior.

## Approach (chosen: B — two parallel jobs)

GitHub Actions workflow `.github/workflows/ci.yml`:
- **Triggers:** `pull_request` targeting `main` **and** `push` to `main`.
- **Setup (both jobs):** `actions/checkout`; `pnpm/action-setup` pinning **pnpm 11** (repo's `packageManager` is unset, so pin explicitly); `actions/setup-node` node 22 with pnpm-store cache; `pnpm install --frozen-lockfile`.
- **Job `checks`** (ubuntu-latest): `pnpm check` → `pnpm verify:no-forbidden-deps` → `pnpm verify:no-secrets`.
- **Job `docker`** (ubuntu-latest): `docker build -t trading-mock-platform:ci .` (no push, no registry login).

Two parallel jobs give fast feedback on the cheap guards while `docker build` runs concurrently. Rejected: single sequential job (docker blocks fast feedback); matrix/composite actions (overkill).

## Components

### 1. `scripts/verify_no_forbidden_deps.mjs` (new — standalone Node, like `verify_contract_isolation.mjs`)

Reads `package.json` and `pnpm-lock.yaml`. Fails (exit 1, prints all violations) if any of:
- **Runtime allowlist** — a direct `package.json` `dependencies` key is NOT in `{hono, @hono/node-server, @hono/node-ws, ajv}`. *(Clarification #1: checked against direct `dependencies` only — NOT transitive lockfile entries — so legitimate transitive prod deps of the allowed packages don't false-fail.)*
- **Denylist anywhere** — `trading-platform`, `@trading-platform/*`, `pg`, `ccxt`, or a small exchange-SDK list (e.g. `binance-api-node`, `node-binance-api`, `bybit-api`, `okx-api`) appears as a package name **anywhere in `pnpm-lock.yaml`** (covers direct + transitive). *(Clarification #1: denylist scans the whole lockfile, as intended.)*
- **Non-registry specifiers** — any `package.json` dep value uses `file:` / `link:` / `git+` / `workspace:`.

npm script: `"verify:no-forbidden-deps": "node scripts/verify_no_forbidden_deps.mjs"`.

### 2. `src/safety/secret-scan.ts` (export-only refactor — behavior-preserving)

- Export the existing `FORBIDDEN` array.
- Add a pure `scanText(content: string): string[]` returning the labels of all matched patterns (`[]` = clean).
- Re-express `scanForSecrets(name, content)` on top of `scanText` — STILL THROWS on the first match, same message, same behavior. *(Clarification #2 of the design: existing `secret-scan.test.ts` must stay green; add a small `scanText` test.)*

### 3. `scripts/verify_no_secrets.ts` (new — run via `tsx`, reuses the patterns)

- Imports `scanText` from `src/safety/secret-scan.ts` (single source of truth — no pattern drift).
- Enumerates `git ls-files`; selects **data files** to scan: a tracked file is in scope if its extension is one of `.json .ndjson .parquet .csv .txt .yaml .yml .env` (extension match anywhere in the tree, *not* limited to `data/`), OR it sits under `data/`. *(Clarification #2: catch committed `.env`/dumps/parquet wherever they land; `fixtures/**` is in scope.)*
- **Exclusions:** paths under `src/`, `test/`, `docs/`, `scripts/`, `.github/`, `node_modules/`; the config files `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`; and `**/.gitkeep`. *(Clarification #2: `.gitkeep` excluded.)* These exclusions prevent false-positives from the scanner's own pattern literals (which live in `src/`/`test/`/`docs/`).
- Runs `scanText` on each in-scope file, collects ALL `{file, labels}` violations, prints them, exits 1 if any.

npm script: `"verify:no-secrets": "tsx scripts/verify_no_secrets.ts"`.

### 4. `.github/workflows/ci.yml` (new)

Two-job workflow per the Approach section.

### 5. `README.md` (update)

Add a **CI / branch protection** section: list the five enforced gates, and a manual operator step — enable branch protection on `main` requiring the `checks` and `docker` status checks. *(Clarification #3: branch protection is documented only; CI does not and cannot set it, and we do not touch GitHub settings.)*

## What each PR enforces

`pnpm check` (types + tests) · contract import-isolation · data secret/forbidden-pattern scan · forbidden/private deps (allowlist + denylist + non-registry) · docker public-only build.

## Testing (TDD)

- `scripts/verify_no_forbidden_deps.mjs`: unit test asserts it PASSES on the real repo, and FAILS on injected violations (a temp `package.json` adding a runtime dep outside the allowlist; one adding `pg`; one with a `file:` specifier; a synthetic lockfile containing `ccxt`).
- `scripts/verify_no_secrets.ts`: unit test asserts it PASSES on the real repo, and FAILS on a temp in-scope data file containing an `AKIA…`-style key; asserts a `.gitkeep` and an `src/` file with the same pattern are NOT flagged.
- `scanText`: small test (returns labels; `[]` for clean; `scanForSecrets` still throws).
- The YAML maps 1:1 to these already-tested `pnpm` scripts (Actions can't run locally; the scripts are the unit of test).

## Out of scope

Live Surface B transport, MCP gateway, backtester, real exporter, any service-runtime change beyond the export-only `secret-scan.ts` refactor, and any GitHub repo-settings automation (branch protection is a documented manual step).
