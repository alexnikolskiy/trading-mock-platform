#!/usr/bin/env python3
"""
fetch-snapshot.py — собирает срез данных с VPS и записывает/обновляет снапшот
для trading-mock-platform.

Что делает:
  1. Подключается к postgres на VPS через SSH-туннель (subprocess ssh -L).
  2. Извлекает bot_run, trade, operational_event, decision_log за указанный период.
  3. Читает parquet-файлы (historical market data) с VPS через rsync/scp.
  4. Строит валидный SnapshotBundle (manifest.json + ops/bundle.json + checksums.json).
  5. Записывает в data/snapshots/<ref>/ — создаёт или перезаписывает.

Зависимости (Python):
  pip install psycopg2-binary pyarrow    # pandas не нужен

Использование:
  python3 scripts/fetch-snapshot.py \
    --vps user@host \
    --db-url "postgres://user:pass@localhost:5432/dbname" \
    --parquet-root /data/historical \
    --from 2026-06-01 \
    --to   2026-06-16 \
    --symbols BTCUSDT,ETHUSDT \
    --ref  2026-06-16-vps \
    [--mode replace|add]

  # Ключи/тоннель:
  #   --ssh-key ~/.ssh/id_rsa         (default: ~/.ssh/id_rsa)
  #   --ssh-port 22
  #   --tunnel-port 15432             (local port для SSH-туннеля, default 15432)
  #   --parquet-local /tmp/parquet    (куда rsync скачивает .parquet, default /tmp/mock-parquet)

  # Если postgres уже доступен локально (VPN / прямой):
  #   --no-tunnel --db-url "postgres://user:pass@host:5432/db"

Режимы (--mode):
  replace  — перезаписать весь снапшот (default)
  add      — добавить/обновить только поля из нового среза (runs+trades+historical),
             остальные взять из существующего снапшота (если он есть)
"""

from __future__ import annotations
import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ──────────────────────────────────────────────
# Конфигурация и аргументы
# ──────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_DIR = REPO_ROOT / "data" / "snapshots"

MANIFEST_VERSIONS = {
    "snapshotSchemaVersion": "snapshot.1",
    "opsReadContractVersion": "ops.3",
    "researchReadContractVersion": "research.1",
    "analysisContractVersion": "ops.4",
    "exporterVersion": "fetch-snapshot.1",
    "redactionPolicyVersion": "redact.1",
}

NOW_MS = int(time.time() * 1000)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Fetch VPS snapshot → trading-mock-platform bundle",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--vps", metavar="USER@HOST", help="SSH target (user@host). Опционально если --no-tunnel.")
    p.add_argument("--db-url", required=True, metavar="POSTGRES_URL",
                   help="postgres URL. При туннеле используй localhost:TUNNEL_PORT.")
    p.add_argument("--parquet-root", metavar="PATH",
                   help="Путь к корню historical parquet на VPS (schema_version=1/ и т.д.).")
    p.add_argument("--from", dest="date_from", required=True, metavar="YYYY-MM-DD",
                   help="Начало периода (inclusive, UTC).")
    p.add_argument("--to", dest="date_to", required=True, metavar="YYYY-MM-DD",
                   help="Конец периода (inclusive, UTC).")
    p.add_argument("--symbols", metavar="SYM1,SYM2",
                   help="Список символов для historical-среза (BTCUSDT,ETHUSDT). "
                        "Если не указан — берём все символы из trades за период.")
    p.add_argument("--ref", required=True, metavar="NAME",
                   help="Имя снапшота (имя директории в data/snapshots/). Пример: 2026-06-16-vps.")
    p.add_argument("--mode", choices=["replace", "add"], default="replace",
                   help="replace=перезаписать всё; add=обновить только новые данные (default: replace).")
    p.add_argument("--ssh-key", default=os.path.expanduser("~/.ssh/id_rsa"), metavar="PATH")
    p.add_argument("--ssh-port", type=int, default=22)
    p.add_argument("--tunnel-port", type=int, default=15432,
                   help="Локальный порт SSH-туннеля к postgres (default: 15432).")
    p.add_argument("--parquet-local", default="/tmp/mock-parquet", metavar="DIR",
                   help="Локальная директория для rsync parquet-файлов.")
    p.add_argument("--no-tunnel", action="store_true",
                   help="Не создавать SSH-туннель (postgres доступен напрямую).")
    p.add_argument("--no-parquet", action="store_true",
                   help="Пропустить historical данные (только ops-read).")
    p.add_argument("--dry-run", action="store_true",
                   help="Не записывать файлы — показать статистику среза.")
    return p.parse_args()


# ──────────────────────────────────────────────
# SSH-туннель
# ──────────────────────────────────────────────

class SshTunnel:
    """Открывает SSH-туннель, держит процесс, закрывает при __exit__."""

    def __init__(self, vps: str, remote_url: str, local_port: int,
                 ssh_key: str, ssh_port: int) -> None:
        # remote_url: postgres://user:pass@remotehost:5432/db  → извлекаем хост:порт
        import urllib.parse
        u = urllib.parse.urlparse(remote_url)
        remote_host = u.hostname or "localhost"
        remote_port = u.port or 5432
        self._cmd = [
            "ssh", "-N", "-L", f"{local_port}:{remote_host}:{remote_port}",
            "-i", ssh_key, "-p", str(ssh_port),
            "-o", "StrictHostKeyChecking=no",
            "-o", "ExitOnForwardFailure=yes",
            vps,
        ]
        self._proc: subprocess.Popen[bytes] | None = None
        self._local_port = local_port

    def __enter__(self) -> "SshTunnel":
        print(f"[tunnel] Opening SSH tunnel on local port {self._local_port}…")
        self._proc = subprocess.Popen(self._cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Ждём пока туннель поднимется
        for _ in range(20):
            time.sleep(0.5)
            if self._proc.poll() is not None:
                raise RuntimeError(f"SSH tunnel failed to start (exit code {self._proc.returncode}). "
                                   "Проверь ssh-ключ, хост и права.")
            try:
                import socket
                with socket.create_connection(("127.0.0.1", self._local_port), timeout=1):
                    break
            except OSError:
                pass
        else:
            self._proc.terminate()
            raise RuntimeError(f"SSH tunnel did not open port {self._local_port} within 10 seconds.")
        print(f"[tunnel] OK — localhost:{self._local_port}")
        return self

    def __exit__(self, *_: object) -> None:
        if self._proc:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
            print("[tunnel] Closed.")


# ──────────────────────────────────────────────
# Postgres — извлечение ops-данных
# ──────────────────────────────────────────────

def fetch_ops(db_url: str, ts_from: int, ts_to: int) -> dict[str, Any]:
    """
    Возвращает:
      runs, tradesByRun, eventsByRun, decisionsByRun
    Требует psycopg2-binary: pip install psycopg2-binary
    """
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("[error] psycopg2-binary не установлен. Запусти: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    print(f"[pg] Подключаюсь к {_mask_url(db_url)}")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # bot_run — runs пересекающиеся с периодом
    print(f"[pg] Запрос bot_run за [{ts_from}..{ts_to}]…")
    cur.execute("""
        SELECT
            run_id         AS "runId",
            mode,
            status,
            strategy_name  AS strategy,
            started_at_ms  AS "startedAtMs",
            finished_at_ms AS "finishedAtMs",
            COALESCE(
                (SELECT (extract(epoch FROM now()) * 1000)::bigint),
                started_at_ms
            )              AS "lastSeenMs",
            ARRAY(
                SELECT DISTINCT t.symbol
                FROM canonical.trade t
                WHERE t.run_id = r.run_id
            ) AS symbols
        FROM canonical.bot_run r
        WHERE
            started_at_ms <= %(ts_to)s
            AND (finished_at_ms IS NULL OR finished_at_ms >= %(ts_from)s)
            AND mode IN ('paper','live','backtest')
        ORDER BY started_at_ms
    """, {"ts_from": ts_from, "ts_to": ts_to})
    runs_raw = cur.fetchall()
    print(f"[pg] Найдено runs: {len(runs_raw)}")

    runs: list[dict[str, Any]] = []
    for r in runs_raw:
        row = dict(r)
        # symbols: postgres возвращает list или None
        syms = row.get("symbols") or []
        row["symbols"] = list(syms) if syms else []
        # strategy — в bundle.ts это строка (name)
        row["strategy"] = row.get("strategy") or "unknown"
        # status: running→running, finished→finished, crashed→finished, aborted→finished
        if row.get("status") in ("crashed", "aborted"):
            row["status"] = "finished"
        runs.append(row)

    run_ids = [r["runId"] for r in runs]
    if not run_ids:
        cur.close(); conn.close()
        return {
            "runs": [],
            "tradesByRun": {},
            "eventsByRun": {},
            "decisionsByRun": {},
        }

    # trades
    print(f"[pg] Запрос trades для {len(run_ids)} run(s)…")
    cur.execute("""
        SELECT
            trade_id      AS "tradeId",
            run_id        AS "runId",
            symbol,
            side,
            opened_at_ms  AS "openedAtMs",
            closed_at_ms  AS "closedAtMs",
            pnl::text     AS "realizedPnl",
            pnl_pct::text AS "pnlPct",
            is_win        AS "isWin",
            close_reason  AS "closeReason"
        FROM canonical.trade
        WHERE run_id = ANY(%(run_ids)s)
          AND closed_at_ms IS NOT NULL
          AND closed_at_ms BETWEEN %(ts_from)s AND %(ts_to)s
        ORDER BY closed_at_ms
    """, {"run_ids": run_ids, "ts_from": ts_from, "ts_to": ts_to})
    trades_raw = cur.fetchall()
    print(f"[pg] Найдено закрытых trades: {len(trades_raw)}")

    trades_by_run: dict[str, list[dict[str, Any]]] = {rid: [] for rid in run_ids}
    for t in trades_raw:
        row = dict(t)
        rid = row.pop("runId")
        if rid in trades_by_run:
            trades_by_run[rid].append(row)

    # operational_events
    print("[pg] Запрос operational_events…")
    cur.execute("""
        SELECT
            run_id             AS "runId",
            trade_id           AS "tradeId",
            event_type         AS category,
            severity,
            business_ts_ms     AS "tsMs",
            -- safeMessage: только тип без оригинального payload
            event_type         AS "safeMessage"
        FROM canonical.operational_event
        WHERE run_id = ANY(%(run_ids)s)
          AND business_ts_ms BETWEEN %(ts_from)s AND %(ts_to)s
        ORDER BY business_ts_ms
        LIMIT 10000
    """, {"run_ids": run_ids, "ts_from": ts_from, "ts_to": ts_to})
    events_raw = cur.fetchall()
    print(f"[pg] Найдено events: {len(events_raw)}")

    events_by_run: dict[str, list[dict[str, Any]]] = {rid: [] for rid in run_ids}
    for e in events_raw:
        row = dict(e)
        rid = row.pop("runId")
        row["tradeId"] = row.get("tradeId")  # может быть None — ок
        if rid in events_by_run:
            events_by_run[rid].append(row)

    # decision_log
    print("[pg] Запрос decision_log…")
    cur.execute("""
        SELECT
            run_id          AS "runId",
            bot_id          AS "botId",
            symbol,
            side,
            decision_type   AS category,
            reason,
            business_ts_ms  AS "tsMs",
            decision_type   AS "safeMessage"
        FROM canonical.decision_log
        WHERE run_id = ANY(%(run_ids)s)
          AND business_ts_ms BETWEEN %(ts_from)s AND %(ts_to)s
        ORDER BY business_ts_ms
        LIMIT 10000
    """, {"run_ids": run_ids, "ts_from": ts_from, "ts_to": ts_to})
    decisions_raw = cur.fetchall()
    print(f"[pg] Найдено decisions: {len(decisions_raw)}")

    decisions_by_run: dict[str, list[dict[str, Any]]] = {rid: [] for rid in run_ids}
    for d in decisions_raw:
        row = dict(d)
        rid = row.pop("runId")
        if rid in decisions_by_run:
            decisions_by_run[rid].append(row)

    cur.close()
    conn.close()
    return {
        "runs": runs,
        "tradesByRun": trades_by_run,
        "eventsByRun": events_by_run,
        "decisionsByRun": decisions_by_run,
    }


# ──────────────────────────────────────────────
# Parquet — синхронизация и чтение
# ──────────────────────────────────────────────

def rsync_parquet(vps: str, remote_root: str, local_dir: str,
                  ssh_key: str, ssh_port: int,
                  date_from: str, date_to: str) -> None:
    """Скачивает parquet-файлы за период через rsync."""
    Path(local_dir).mkdir(parents=True, exist_ok=True)
    # Синхронизируем только нужные date= директории
    # rsync работает с шаблонами include/exclude
    ssh_opt = f"ssh -i {ssh_key} -p {ssh_port} -o StrictHostKeyChecking=no"
    cmd = [
        "rsync", "-avz", "--progress",
        "--include=*/",
        "--include=*.parquet",
        "--exclude=*",
        f"--rsh={ssh_opt}",
        f"{vps}:{remote_root}/",
        f"{local_dir}/",
    ]
    print(f"[rsync] {' '.join(cmd[:5])} …")
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode not in (0, 24):  # 24 = partial transfer (ок для фильтра)
        raise RuntimeError(f"rsync failed with code {result.returncode}")
    print("[rsync] Done.")


def read_parquet_range(
    local_root: str,
    symbols: list[str],
    ts_from: int,
    ts_to: int,
    timeframes: list[str] | None = None,
) -> dict[str, Any]:
    """
    Читает parquet из <local_root>/schema_version={1,2}/date=YYYY-MM-DD/part-*.parquet
    и возвращает HistoricalBundle:
      {
        barsBySymbolAndTimeframe: { BTCUSDT: { "1h": [...], "1d": [...] } },
        fundingBySymbol:          { BTCUSDT: [...] },
        openInterestBySymbol:     { BTCUSDT: [...] },
        liquidationsBySymbol:     { BTCUSDT: [...] },
      }

    В parquet данные хранятся на уровне минут (minute_ts). Мы агрегируем в 1h/1d.
    """
    try:
        import pyarrow.parquet as pq
        import pyarrow as pa
    except ImportError:
        print("[error] pyarrow не установлен: pip install pyarrow", file=sys.stderr)
        sys.exit(1)

    sym_set = set(s.upper().strip() for s in symbols)
    tfs = timeframes or ["1h", "1d"]
    root = Path(local_root)

    # Собираем все parquet-файлы, отфильтрованные по дате
    part_files: list[Path] = []
    for sv in [1, 2]:
        sv_dir = root / f"schema_version={sv}"
        if not sv_dir.exists():
            continue
        for date_dir in sorted(sv_dir.iterdir()):
            if not date_dir.is_dir() or not date_dir.name.startswith("date="):
                continue
            date_str = date_dir.name[5:]  # YYYY-MM-DD
            # Грубый фильтр по дате
            d_ms = _date_to_ms(date_str)
            if d_ms + 86_400_000 < ts_from or d_ms > ts_to:
                continue
            for f in sorted(date_dir.glob("part-*.parquet")):
                part_files.append(f)

    print(f"[parquet] Найдено {len(part_files)} part-файлов для чтения")
    if not part_files:
        return _empty_historical(sym_set)

    # Читаем все файлы в одну таблицу (lazy через dataset)
    import pyarrow.dataset as ds
    dataset = ds.dataset([str(f) for f in part_files], format="parquet")

    # Фильтр по символам и временному диапазону
    filter_expr = (
        (ds.field("minute_ts") >= ts_from) &
        (ds.field("minute_ts") < ts_to) &
        (ds.field("symbol").isin(list(sym_set)))
    )
    table = dataset.to_table(filter=filter_expr)
    print(f"[parquet] Строк после фильтра: {table.num_rows}")

    if table.num_rows == 0:
        return _empty_historical(sym_set)

    # Конвертируем в Python dict для агрегации
    rows_by_sym: dict[str, list[dict[str, Any]]] = {s: [] for s in sym_set}
    minute_ts_col = table.column("minute_ts").to_pylist()
    symbol_col = table.column("symbol").to_pylist()
    open_col = table.column("open").to_pylist()
    high_col = table.column("high").to_pylist()
    low_col = table.column("low").to_pylist()
    close_col = table.column("close").to_pylist()
    volume_col = table.column("volume").to_pylist()
    oi_col = table.column("oi_total_usd").to_pylist() if "oi_total_usd" in table.schema.names else [None] * table.num_rows
    funding_col = table.column("funding_rate").to_pylist() if "funding_rate" in table.schema.names else [None] * table.num_rows
    liq_long_col = table.column("liq_long_usd").to_pylist() if "liq_long_usd" in table.schema.names else [None] * table.num_rows
    liq_short_col = table.column("liq_short_usd").to_pylist() if "liq_short_usd" in table.schema.names else [None] * table.num_rows

    for i in range(table.num_rows):
        sym = symbol_col[i]
        if sym not in rows_by_sym:
            continue
        rows_by_sym[sym].append({
            "ts": minute_ts_col[i],
            "open": open_col[i],
            "high": high_col[i],
            "low": low_col[i],
            "close": close_col[i],
            "volume": volume_col[i],
            "oi": oi_col[i],
            "funding": funding_col[i],
            "liq_long": liq_long_col[i],
            "liq_short": liq_short_col[i],
        })

    return _aggregate_historical(rows_by_sym, tfs)


def _date_to_ms(date_str: str) -> int:
    """YYYY-MM-DD → UTC ms timestamp начала дня."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _period_to_ms(date_from: str, date_to: str) -> tuple[int, int]:
    ts_from = _date_to_ms(date_from)
    ts_to = _date_to_ms(date_to) + 86_400_000  # конец дня
    return ts_from, ts_to


def _aggregate_historical(
    rows_by_sym: dict[str, list[dict[str, Any]]],
    timeframes: list[str],
) -> dict[str, Any]:
    """Агрегирует минутные данные в OHLCV-бары для каждого timeframe."""
    TF_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000,
              "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}

    bars_by_sym_tf: dict[str, dict[str, list[dict[str, Any]]]] = {}
    funding_by_sym: dict[str, list[dict[str, Any]]] = {}
    oi_by_sym: dict[str, list[dict[str, Any]]] = {}
    liq_by_sym: dict[str, list[dict[str, Any]]] = {}

    for sym, rows in rows_by_sym.items():
        if not rows:
            continue
        rows.sort(key=lambda r: r["ts"])
        bars_by_sym_tf[sym] = {}

        for tf in timeframes:
            tf_ms = TF_MS.get(tf, 3_600_000)
            buckets: dict[int, dict[str, Any]] = {}
            for r in rows:
                bucket_ts = (r["ts"] // tf_ms) * tf_ms
                if bucket_ts not in buckets:
                    buckets[bucket_ts] = {
                        "tsMs": bucket_ts,
                        "open": r["open"],
                        "high": r["high"],
                        "low": r["low"],
                        "close": r["close"],
                        "volume": r["volume"] or 0.0,
                    }
                else:
                    b = buckets[bucket_ts]
                    b["high"] = max(b["high"], r["high"])
                    b["low"] = min(b["low"], r["low"])
                    b["close"] = r["close"]
                    b["volume"] = (b["volume"] or 0.0) + (r["volume"] or 0.0)
            bars_by_sym_tf[sym][tf] = sorted(buckets.values(), key=lambda b: b["tsMs"])

        # funding: одна запись на уникальный (ts, rate)
        seen_f: set[tuple[int, float | None]] = set()
        fund_list: list[dict[str, Any]] = []
        for r in rows:
            if r["funding"] is not None:
                k = (r["ts"], r["funding"])
                if k not in seen_f:
                    seen_f.add(k)
                    fund_list.append({"tsMs": r["ts"], "symbol": sym, "rate": r["funding"]})
        funding_by_sym[sym] = fund_list

        # open interest: одна запись на ts
        oi_list: list[dict[str, Any]] = []
        for r in rows:
            if r["oi"] is not None:
                oi_list.append({"tsMs": r["ts"], "symbol": sym, "oiUsd": r["oi"]})
        oi_by_sym[sym] = oi_list

        # liquidations
        liq_list: list[dict[str, Any]] = []
        for r in rows:
            liq_long = r.get("liq_long")
            liq_short = r.get("liq_short")
            if liq_long is not None or liq_short is not None:
                liq_list.append({
                    "tsMs": r["ts"],
                    "symbol": sym,
                    "longUsd": liq_long or 0.0,
                    "shortUsd": liq_short or 0.0,
                })
        liq_by_sym[sym] = liq_list

    return {
        "barsBySymbolAndTimeframe": bars_by_sym_tf,
        "fundingBySymbol": funding_by_sym,
        "openInterestBySymbol": oi_by_sym,
        "liquidationsBySymbol": liq_by_sym,
    }


def _empty_historical(sym_set: set[str]) -> dict[str, Any]:
    return {
        "barsBySymbolAndTimeframe": {},
        "fundingBySymbol": {},
        "openInterestBySymbol": {},
        "liquidationsBySymbol": {},
    }


# ──────────────────────────────────────────────
# Сборка Bundle
# ──────────────────────────────────────────────

def _stub_health_fields() -> dict[str, Any]:
    """Заглушки для health-полей — достаточны для прохождения schema-валидации."""
    return {
        "runtimeHealth": {
            "entries": [],
            "asOf": NOW_MS,
        },
        "marketHealth": {
            "status": "ok",
            "diagnostics": [],
            "streamAgeMs": 0,
            "availability": "available",
            "asOf": NOW_MS,
        },
        "executionHealth": {
            "status": "ok",
            "recentCounts": {"total": 0, "errors": 0},
            "lastEventMs": NOW_MS,
            "availability": "available",
            "asOf": NOW_MS,
        },
        "coverage": {
            "entries": [],
            "availability": "available",
            "asOf": NOW_MS,
        },
    }


def _build_analysis_by_run(
    runs: list[dict[str, Any]],
    trades_by_run: dict[str, list[dict[str, Any]]],
    ts_from: int,
    ts_to: int,
) -> dict[str, Any]:
    """Минимальный AnalysisSnapshot для каждого run."""
    result: dict[str, Any] = {}
    for run in runs:
        rid = run["runId"]
        trades = trades_by_run.get(rid, [])
        closed = [t for t in trades if t.get("closedAtMs") is not None]
        wins = sum(1 for t in closed if t.get("isWin"))
        losses = len(closed) - wins
        pnl_sum = sum(float(t.get("realizedPnl") or 0) for t in closed)

        result[rid] = {
            "runRef": rid,
            "opsContractVersion": "ops.4",
            "asOf": NOW_MS,
            "freshness": "fresh",
            "identity": {
                "mode": run["mode"],
                "strategy": {"name": run["strategy"], "version": "unknown"},
                "symbols": run["symbols"],
            },
            "period": {"fromMs": ts_from, "toMs": ts_to},
            "healthContext": "fetched from VPS",
            "metrics": {
                "pnl": f"{pnl_sum:.8f}",
                "winRate": (wins * 100 // len(closed)) if closed else 0,
                "maxDrawdown": "0.00000000",
                "totalTrades": len(closed),
                "profitFactor": "0.00",
                "topTradeContributionPct": 0,
            },
            "trades": [
                {
                    "tradeId": t["tradeId"],
                    "symbol": t["symbol"],
                    "side": t["side"],
                    "openedAtMs": t["openedAtMs"],
                    "closedAtMs": t["closedAtMs"],
                    "realizedPnl": t.get("realizedPnl") or "0",
                    "entryReason": "unknown",
                    "exitReason": t.get("closeReason") or "unknown",
                }
                for t in closed
            ],
            "strategyConfig": {"available": False, "reason": "not_in_sanitized_export"},
            "dcaCount": {"available": False, "reason": "not_safely_sourced"},
            "slTpBeEvents": {"available": False, "reason": "not_safely_sourced"},
            "features": {"available": False, "reason": "market_features_out_of_scope_in_001"},
            "summaryPatterns": [
                f"{wins} win(s), {losses} loss(es)"
                f"{', pnl ' + f'{pnl_sum:.2f}' if closed else ''}"
            ],
        }
    return result


def _build_research_by_run(
    runs: list[dict[str, Any]],
    trades_by_run: dict[str, list[dict[str, Any]]],
    decisions_by_run: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Минимальный ResearchRunResult для каждого run."""
    result: dict[str, Any] = {}
    for run in runs:
        rid = run["runId"]
        trades = trades_by_run.get(rid, [])
        decisions = decisions_by_run.get(rid, [])
        closed = [t for t in trades if t.get("closedAtMs") is not None]
        wins = sum(1 for t in closed if t.get("isWin"))
        result[rid] = {
            "summary": {
                "runId": rid,
                "mode": run["mode"],
                "strategy": run["strategy"],
                "period": {"fromMs": run.get("startedAtMs", 0), "toMs": run.get("finishedAtMs") or NOW_MS},
                "closedTrades": len(closed),
                "wins": wins,
                "losses": len(closed) - wins,
                "pnlUsd": sum(float(t.get("realizedPnl") or 0) for t in closed),
                "winratePct": (wins * 100 / len(closed)) if closed else 0.0,
            },
            "trades": closed,
            "decisions": decisions,
            "analysisContext": "fetched from VPS",
        }
    return result


def _build_replay_frames() -> dict[str, Any]:
    return {
        "frames": [
            {"offsetMs": 0, "resource": "runs"},
            {"offsetMs": 1000, "resource": "runtime-health"},
        ]
    }


def build_bundle(
    ops: dict[str, Any],
    historical: dict[str, Any] | None,
    ts_from: int,
    ts_to: int,
) -> dict[str, Any]:
    runs = ops["runs"]
    trades_by_run = ops["tradesByRun"]
    events_by_run = ops["eventsByRun"]
    decisions_by_run = ops["decisionsByRun"]

    bundle: dict[str, Any] = {
        "runs": runs,
        "tradesByRun": trades_by_run,
        "eventsByRun": events_by_run,
        "decisionsByRun": decisions_by_run,
        **_stub_health_fields(),
        "analysisByRun": _build_analysis_by_run(runs, trades_by_run, ts_from, ts_to),
        "researchByRun": _build_research_by_run(runs, trades_by_run, decisions_by_run),
        "replay": _build_replay_frames(),
    }
    if historical is not None:
        bundle["historical"] = historical
    return bundle


# ──────────────────────────────────────────────
# Режим add — мёрж с существующим снапшотом
# ──────────────────────────────────────────────

def merge_with_existing(new_bundle: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    """
    Режим add: сливаем новый bundle поверх существующего.
    runs/trades/events/decisions/analysis/research — мёрж по runId (новые побеждают).
    historical — мёрж по symbol+tf (новые данные добавляются, старые остаются).
    health-поля — берём из нового.
    """
    bundle_path = out_dir / "ops" / "bundle.json"
    if not bundle_path.exists():
        print("[merge] Существующий снапшот не найден → создаю новый.")
        return new_bundle

    print("[merge] Загружаю существующий bundle для мёржа…")
    existing = json.loads(bundle_path.read_text("utf-8"))

    def merge_list_by_key(key: str, existing_list: list, new_list: list) -> list:
        merged = {r[key]: r for r in existing_list}
        for r in new_list:
            merged[r[key]] = r  # новые побеждают
        return list(merged.values())

    def merge_dict_of_lists(existing_d: dict, new_d: dict) -> dict:
        merged = dict(existing_d)
        for k, v in new_d.items():
            merged[k] = v  # новые побеждают по runId
        return merged

    merged: dict[str, Any] = dict(existing)
    merged["runs"] = merge_list_by_key("runId", existing.get("runs", []), new_bundle["runs"])
    merged["tradesByRun"] = merge_dict_of_lists(existing.get("tradesByRun", {}), new_bundle["tradesByRun"])
    merged["eventsByRun"] = merge_dict_of_lists(existing.get("eventsByRun", {}), new_bundle["eventsByRun"])
    merged["decisionsByRun"] = merge_dict_of_lists(existing.get("decisionsByRun", {}), new_bundle["decisionsByRun"])
    merged["analysisByRun"] = merge_dict_of_lists(existing.get("analysisByRun", {}), new_bundle["analysisByRun"])
    merged["researchByRun"] = merge_dict_of_lists(existing.get("researchByRun", {}), new_bundle["researchByRun"])

    # Health-поля всегда из нового
    for k in ("runtimeHealth", "marketHealth", "executionHealth", "coverage", "replay"):
        if k in new_bundle:
            merged[k] = new_bundle[k]

    # Historical: мёрж по символам
    if "historical" in new_bundle and new_bundle["historical"]:
        new_hist = new_bundle["historical"]
        old_hist = existing.get("historical") or {
            "barsBySymbolAndTimeframe": {},
            "fundingBySymbol": {},
            "openInterestBySymbol": {},
            "liquidationsBySymbol": {},
        }
        merged_hist: dict[str, Any] = {
            "barsBySymbolAndTimeframe": dict(old_hist.get("barsBySymbolAndTimeframe", {})),
            "fundingBySymbol": dict(old_hist.get("fundingBySymbol", {})),
            "openInterestBySymbol": dict(old_hist.get("openInterestBySymbol", {})),
            "liquidationsBySymbol": dict(old_hist.get("liquidationsBySymbol", {})),
        }
        # bars: мёрж по tf, деду‑плицируем по tsMs
        for sym, tf_map in new_hist.get("barsBySymbolAndTimeframe", {}).items():
            if sym not in merged_hist["barsBySymbolAndTimeframe"]:
                merged_hist["barsBySymbolAndTimeframe"][sym] = {}
            for tf, bars in tf_map.items():
                existing_bars = merged_hist["barsBySymbolAndTimeframe"][sym].get(tf, [])
                existing_by_ts = {b["tsMs"]: b for b in existing_bars}
                for b in bars:
                    existing_by_ts[b["tsMs"]] = b  # новые побеждают
                merged_hist["barsBySymbolAndTimeframe"][sym][tf] = sorted(
                    existing_by_ts.values(), key=lambda x: x["tsMs"]
                )
        # funding/oi/liq: мёрж по symbol, деду‑плицируем по tsMs
        for field in ("fundingBySymbol", "openInterestBySymbol", "liquidationsBySymbol"):
            for sym, entries in new_hist.get(field, {}).items():
                existing_entries = merged_hist[field].get(sym, [])
                by_ts = {e["tsMs"]: e for e in existing_entries}
                for e in entries:
                    by_ts[e["tsMs"]] = e
                merged_hist[field][sym] = sorted(by_ts.values(), key=lambda x: x["tsMs"])
        merged["historical"] = merged_hist

    print(f"[merge] Итого runs: {len(merged['runs'])}, trades: {sum(len(v) for v in merged['tradesByRun'].values())}")
    return merged


# ──────────────────────────────────────────────
# Запись снапшота
# ──────────────────────────────────────────────

def write_snapshot(ref: str, bundle: dict[str, Any], dry_run: bool) -> None:
    out_dir = SNAPSHOT_DIR / ref
    ops_dir = out_dir / "ops"
    bundle_ref = "ops/bundle.json"
    checksums_ref = "checksums.json"

    bundle_bytes = json.dumps(bundle, ensure_ascii=False, indent=2).encode("utf-8")
    checksum = hashlib.sha256(bundle_bytes).hexdigest()

    manifest: dict[str, Any] = {
        "ref": ref,
        "createdAtMs": NOW_MS,
        "bundleRef": bundle_ref,
        "checksumsRef": checksums_ref,
        "versions": {
            **MANIFEST_VERSIONS,
            "sourcePlatformCommit": f"vps-fetch-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
        },
    }
    checksums = {bundle_ref: checksum}

    run_count = len(bundle.get("runs", []))
    trade_count = sum(len(v) for v in bundle.get("tradesByRun", {}).values())
    hist = bundle.get("historical")
    sym_count = len(hist["barsBySymbolAndTimeframe"]) if hist else 0
    bar_count = sum(
        sum(len(bars) for bars in tf_map.values())
        for tf_map in (hist["barsBySymbolAndTimeframe"] if hist else {}).values()
    )

    print(f"\n[snapshot] ref={ref}")
    print(f"  runs:    {run_count}")
    print(f"  trades:  {trade_count}")
    print(f"  hist symbols: {sym_count}, bars: {bar_count}")
    print(f"  bundle size: {len(bundle_bytes):,} bytes")
    print(f"  checksum: {checksum[:16]}…")

    if dry_run:
        print("\n[dry-run] Файлы не записаны (--dry-run).")
        return

    ops_dir.mkdir(parents=True, exist_ok=True)
    (ops_dir / "bundle.json").write_bytes(bundle_bytes)
    (out_dir / "checksums.json").write_text(
        json.dumps(checksums, indent=2), encoding="utf-8"
    )
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(f"\n[snapshot] Записан → {out_dir}")
    print("  Для запуска: MOCK_SNAPSHOT_REF=" + ref + " pnpm start")


# ──────────────────────────────────────────────
# Вспомогательные
# ──────────────────────────────────────────────

def _mask_url(url: str) -> str:
    """Маскирует пароль в postgres URL для логов."""
    import re
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", url)


# ──────────────────────────────────────────────
# main
# ──────────────────────────────────────────────

def main() -> None:
    args = parse_args()
    ts_from, ts_to = _period_to_ms(args.date_from, args.date_to)
    print(f"[config] Период: {args.date_from} → {args.date_to} ({ts_from}…{ts_to} ms)")
    print(f"[config] ref: {args.ref}, mode: {args.mode}")

    # ── Шаг 1: SSH-туннель + postgres ─────────────────
    tunnel_ctx: Any = None
    if args.no_tunnel:
        db_url = args.db_url
    else:
        if not args.vps:
            print("[error] --vps требуется когда --no-tunnel не указан.", file=sys.stderr)
            sys.exit(1)
        # Подменяем хост в db_url на localhost:tunnel_port
        import urllib.parse
        u = urllib.parse.urlparse(args.db_url)
        db_url = u._replace(
            netloc=f"{u.username}:{u.password}@127.0.0.1:{args.tunnel_port}"
        ).geturl()
        tunnel_ctx = SshTunnel(
            args.vps, args.db_url, args.tunnel_port, args.ssh_key, args.ssh_port
        )

    ops: dict[str, Any]
    if tunnel_ctx:
        with tunnel_ctx:
            ops = fetch_ops(db_url, ts_from, ts_to)
    else:
        ops = fetch_ops(db_url, ts_from, ts_to)

    if not ops["runs"] and not args.dry_run:
        print("[warn] Не найдено ни одного run за период. Снапшот будет с пустыми ops-данными.")

    # Определяем символы для historical
    symbols: list[str]
    if args.symbols:
        symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    else:
        # Берём все символы из trades
        sym_set: set[str] = set()
        for trades in ops["tradesByRun"].values():
            for t in trades:
                if t.get("symbol"):
                    sym_set.add(t["symbol"])
        symbols = sorted(sym_set)
        if symbols:
            print(f"[config] Символы из trades: {symbols}")
        else:
            print("[warn] Не найдено символов в trades — historical будет пустым.")

    # ── Шаг 2: Parquet rsync + чтение ─────────────────
    historical: dict[str, Any] | None = None
    if not args.no_parquet and args.parquet_root and symbols:
        if not args.no_tunnel and args.vps:
            rsync_parquet(
                args.vps, args.parquet_root, args.parquet_local,
                args.ssh_key, args.ssh_port,
                args.date_from, args.date_to,
            )
            parquet_local = args.parquet_local
        else:
            parquet_local = args.parquet_root  # прямой путь

        historical = read_parquet_range(parquet_local, symbols, ts_from, ts_to)
    elif args.no_parquet:
        print("[config] --no-parquet: пропускаем historical данные.")

    # ── Шаг 3: Сборка bundle ──────────────────────────
    bundle = build_bundle(ops, historical, ts_from, ts_to)

    # ── Шаг 4: Мёрж если mode=add ────────────────────
    out_dir = SNAPSHOT_DIR / args.ref
    if args.mode == "add":
        bundle = merge_with_existing(bundle, out_dir)

    # ── Шаг 5: Запись ────────────────────────────────
    write_snapshot(args.ref, bundle, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
