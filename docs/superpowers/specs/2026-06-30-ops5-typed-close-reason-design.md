# Спека: ops.4 → ops.5 зеркало — типизированный closeReason + closeReasonRaw

**Дата:** 2026-06-30
**Статус:** одобрено (дизайн), ожидает ревью спеки
**Источник истины:** `trading-platform/src/operations/dto.ts` + `close_reason.ts` (ops.5), зеркалится через
`@trading-platform/sdk/ops-read` (пакет 0.9.0, contract `ops.5`).

## Цель

Платформа подняла ops-read `ops.4 → ops.5` (PR #33, commit 396cc63): `closeReason` стал типизированным
union `CloseReason` (10 членов), и добавлено поле `closeReasonRaw: string | null` (сырьё для аудита).
Мок зеркалит это, чтобы trading-lab прошёл «full live pass»: его `isTypedCloseReason` принимает только
канонические члены — сырые строки `tp2` и т.п. дают `false` и уводят lab в fallback вместо typed-ветки.

Форензик-цены (`entryPrice`/`exitPrice` + lifecycle) уже запечены (ops.4, PR #19) — эта работа добавляет
**только** типизацию closeReason. Нового VPS-fetch нет: re-key детерминированный.

## CloseReason (10 членов)

```ts
export type CloseReason =
  | 'take_profit_final' | 'take_profit_partial' | 'stop_loss' | 'breakeven'
  | 'trailing_stop' | 'signal_exit' | 'time_exit' | 'liquidation' | 'manual' | 'other';
```

Классификатор `classifyCloseReason(raw: string | null): CloseReason | null` — чистая функция (зеркало
платформенной `src/operations/close_reason.ts`). Маппинг raw → canonical (наши значения жирным):
`tp2`/`tp_final`/`*final*`→`take_profit_final` **(tp2)**; `tp1`/`*partial*`→`take_profit_partial`;
`hard_stop`/`stop_loss`/`sl`/`stop`→`stop_loss` **(hard_stop)**; `time_exit`/`time`/`*timeout*`→`time_exit`
**(time_exit)**; `be`/`be_stop`/`breakeven`→`breakeven`; `*trail*`→`trailing_stop`;
`fail_fast`/`*signal*`/`*reversal*`→`signal_exit`; `*liquidat*`→`liquidation`; `manual`/`operator`→`manual`;
всё прочее (вкл. `run_terminated`)→`other` **(run_terminated)**; `null`/`''`→`null`.

**Ключевое:** мок несёт точную копию этой функции, поэтому re-keyed значения идентичны тем, что дал бы
свежий ops.5-fetch. Сырьё сохраняется в `closeReasonRaw`.

## Ключевое решение: lockstep-миграция (как и в ops.4)

`compat.ts` exact-match, `version.ts` — реэкспорт из SDK-сшивки. Апгрейд SDK `0.8.0 → 0.9.0` транзитивно
переводит `OPS_READ_CONTRACT_VERSION` в `ops.5`. Значит все 5 фикстур мигрируют одновременно.

## Архитектура изменений

### 1. SDK-сшивка → ops.5
- `package.json`: `@trading-platform/sdk` →
  `https://github.com/alexnikolskiy/trading-platform-sdk/releases/download/sdk-v0.9.0/trading-platform-sdk-0.9.0.tgz`.
- `src/contract/ops-read/dto.sdk.ts`: добавить `CloseReason` в type-реэкспорт (`closeReasonRaw` — поле DTO,
  приедет с `ClosedTrade`/`TradeEvidence`).
- `scripts/verify_vendored_sdk.ts`: `EXPECTED_OPS_VERSION 'ops.4' → 'ops.5'`.
- `version.ts`, `compat.ts` — **не редактируем** (ops.5 транзитивно).

### 2. Классификатор-зеркало
- Новый `src/contract/ops-read/close-reason.ts` — точная копия чистой `classifyCloseReason` (без импортов,
  dependency-free; не нарушает contract-isolation). Единственный источник классификации в моке; используется
  экспортёром (`tools/`) и миграцией (`scripts/`).

### 3. Bundle + JSON-схема
- `src/contract/snapshot/bundle.ts` — ручных правок нет (типы из SDK).
- `src/contract/snapshot/schema.ts`:
  - `$defs.closedTrade`: `closeReason` → `{ enum: [<10 членов>, null] }`; добавить `closeReasonRaw`
    (`{ type: ['string','null'] }`) в `properties` **и** `required`.
  - `$defs.tradeEvidence`: то же.
  - `$defs.tradeLifecycleEvent` — без изменений (`note` остаётся сырым reason).

### 4. Экспортёр fetch-snapshot (ops.5-aware, для будущих фетчей)
- Импортировать `classifyCloseReason` из зеркала.
- ClosedTrade: SQL-поле `close_reason` остаётся как raw → `closeReasonRaw = raw`,
  `closeReason = classifyCloseReason(raw)`.
- `tools/fetch-snapshot/trade-evidence-map.ts`: `EvidenceTradeRow` несёт raw close_reason → в `TradeEvidence`
  выставить `closeReasonRaw = raw`, `closeReason = classifyCloseReason(raw)`. Lifecycle `note` — сырой.
- `writeSnapshot` manifest: `opsReadContractVersion → ops.5`.

### 5. Миграция фикстур — `scripts/migrate-fixtures-ops5.ts`
- Для каждой фикстуры, по `tradesByRun[*][]` и `tradeEvidenceByTrade[*]`:
  `const raw = obj.closeReasonRaw ?? obj.closeReason; obj.closeReasonRaw = raw; obj.closeReason = classifyCloseReason(raw);`
  (idempotent — всегда из raw; повторный прогон стабилен). Bump manifest `opsReadContractVersion → ops.5`,
  пересчитать `checksums.json`, прогнать `loadSnapshot` (self-validation).
- Прогон на 4 standalone (`2026-06-12-real-top5`, `2026-06-16-synthetic`, `historical-golden`,
  `2026-06-18-real-all`); затем `make-extended-fixture` re-derive extended (deep-clone переносит новые поля,
  manifest через `OPS_READ_CONTRACT_VERSION` → ops.5).

### 6. Тесты
- unit `close-reason`: зеркалит платформенные кейсы (вкл. наши 4 значения + null + unknown→other).
- schema: populated bundle с canonical closeReason + closeReasonRaw → проходит; closeReason = `'tp2'` (сырое)
  → reject (enum); отсутствие closeReasonRaw → reject (required).
- апдейт `compat.test`/`loader.test`/`app.test` (ops.4→ops.5; `closeReasonRaw` в литералах bundle; discover
  assertion → ops.5); fixture-guards re-bake.

## Критерии приёмки

1. `/ops/trades` и `/ops/trade-evidence` отдают `closeReason ∈ {10 canonical}` + `closeReasonRaw` (сырьё).
2. Среди победителей ≥2 разных типизированных reason (`take_profit_final` + `time_exit` — реально в данных).
3. `loadSnapshot` валиден на всех 5 фикстурах.
4. `/ops/discover` показывает `ops.5`.
5. Гейты зелёные: `verify:vendored-sdk` (ops.5), `verify:contract-isolation`, `verify:no-forbidden-deps`,
   `typecheck`, `test`.

## Вне scope

- Изменения в trading-lab (verification — на стороне lab).
- Форензик-цены (уже сделаны в ops.4 / PR #19).
- Новый VPS-fetch (re-key детерминированный).
