"""Dagster orchestration for the merger-arb data estate.

Asset graph (daily, weekday 5:00 PM):

    verified_nyse_session
            │  (halts cleanly on a non-trading day)
            ▼
    fred_bronze_ingestion   ── appends today's prints to silver.stg_fred_prices
            ▼
    run_dbt_models_and_tests ── `dbt run` then `dbt test`; raises if tests fail
            ▼
    export_analytical_artifacts ── writes ./outputs/Deal_Grade_Scorecard_Gold.xlsx

The dbt step is the guardrail: a failed invariant test aborts the run before any
artifact is exported, so a bad load can never reach the scorecard.
"""
from __future__ import annotations

import datetime as dt
import os
import subprocess
from pathlib import Path

import duckdb
from dagster import (
    Definitions,
    ScheduleDefinition,
    asset,
    define_asset_job,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WAREHOUSE = PROJECT_ROOT / "data" / "warehouse.duckdb"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"

ACTIVE_SERIES = [
    "SP500", "NASDAQCOM", "DJIA", "DCOILWTICO", "DCOILBRENTEU", "DGS10", "FEDFUNDS",
]
FRED_SERIES_MAP = {  # our id -> FRED series id (equal here; explicit for clarity)
    "SP500": "SP500", "NASDAQCOM": "NASDAQCOM", "DJIA": "DJIA",
    "DCOILWTICO": "DCOILWTICO", "DCOILBRENTEU": "DCOILBRENTEU",
    "DGS10": "DGS10", "FEDFUNDS": "FEDFUNDS",
}
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"


@asset
def verified_nyse_session(context) -> dict:
    """Gate the whole run on the calendar. If today is not a trading day, log and
    halt ingestion cleanly (downstream assets receive is_trading=False and skip
    the network + writes)."""
    today = dt.date.today()
    con = duckdb.connect(WAREHOUSE.as_posix(), read_only=True)
    try:
        row = con.execute(
            "SELECT is_trading, holiday_reason FROM gold.dim_date WHERE calendar_date = ?",
            [today],
        ).fetchone()
    except duckdb.Error:
        row = None
    finally:
        con.close()

    if row is None:
        context.log.warning(f"{today} not present in dim_date; treating as non-session.")
        is_trading, reason = False, "not_in_calendar"
    else:
        is_trading, reason = bool(row[0]), row[1]

    if not is_trading:
        context.log.info(f"{today} is not an NYSE session ({reason}). Halting ingestion.")
    else:
        context.log.info(f"{today} is a trading session. Proceeding.")
    return {"date": today.isoformat(), "is_trading": is_trading, "reason": reason}


def _fetch_fred(series_id: str, api_key: str, obs_date: str) -> str | None:
    """Return the raw string value for one series on obs_date, or None. A FRED
    '.' (missing) is returned as None — never coerced (Invariant 1)."""
    import requests

    params = {
        "series_id": FRED_SERIES_MAP[series_id],
        "api_key": api_key,
        "file_type": "json",
        "observation_start": obs_date,
        "observation_end": obs_date,
    }
    resp = requests.get(FRED_BASE, params=params, timeout=30)
    resp.raise_for_status()
    obs = resp.json().get("observations", [])
    if not obs:
        return None
    raw = obs[-1].get("value", ".")
    return None if str(raw).strip() in (".", "") else str(raw)


@asset
def fred_bronze_ingestion(context,
                          verified_nyse_session: dict) -> dict:
    """Pull today's observation for each active series and append to
    silver.stg_fred_prices. Uses FRED when FRED_API_KEY is set; otherwise a
    deterministic mock payload so the pipeline runs in dev. Missing prints are
    written as true NULLs."""
    if not verified_nyse_session["is_trading"]:
        context.log.info("Non-session day; nothing to ingest.")
        return {"appended": 0, "skipped": True}

    obs_date = verified_nyse_session["date"]
    api_key = os.getenv("FRED_API_KEY")
    rows: list[tuple] = []

    if api_key:
        context.log.info("FRED_API_KEY present — pulling live observations.")
        for sid in ACTIVE_SERIES:
            try:
                val = _fetch_fred(sid, api_key, obs_date)
            except Exception as exc:  # dead-letter: log and continue, do not fabricate
                context.log.error(f"FRED fetch failed for {sid}: {exc}")
                val = None
            rows.append((sid, obs_date, val))
    else:
        context.log.warning("No FRED_API_KEY — using mock payload (dev mode).")
        mock = {"SP500": "7700.00", "NASDAQCOM": "26200.00", "DJIA": "52000.00",
                "DCOILWTICO": "86.78", "DCOILBRENTEU": "93.82",
                "DGS10": "4.55", "FEDFUNDS": "3.50"}
        rows = [(sid, obs_date, mock.get(sid)) for sid in ACTIVE_SERIES]

    con = duckdb.connect(WAREHOUSE.as_posix())
    con.execute("CREATE SCHEMA IF NOT EXISTS silver;")
    con.execute("""
        CREATE TABLE IF NOT EXISTS silver.stg_fred_prices (
            series_id VARCHAR, observation_date DATE, raw_value DOUBLE,
            load_timestamp TIMESTAMP
        );
    """)
    appended = 0
    for sid, d, val in rows:
        con.execute(
            "INSERT INTO silver.stg_fred_prices VALUES (?, CAST(? AS DATE), ?, CURRENT_TIMESTAMP)",
            [sid, d, (float(val) if val is not None else None)],
        )
        appended += 1
    con.close()
    context.log.info(f"Appended {appended} observations for {obs_date}.")
    return {"appended": appended, "skipped": False}


@asset(deps=[fred_bronze_ingestion])
def run_dbt_models_and_tests(context) -> dict:
    """`dbt run` then `dbt test`. A non-zero dbt test exit (a violated invariant)
    raises and aborts the run before any artifact is exported."""
    env = {**os.environ}
    for phase in ("run", "test"):
        context.log.info(f"dbt {phase} …")
        proc = subprocess.run(
            ["dbt", phase, "--profiles-dir", ".", "--project-dir", "."],
            cwd=PROJECT_ROOT, capture_output=True, text=True, env=env,
        )
        context.log.info(proc.stdout[-4000:] if proc.stdout else "(no stdout)")
        if proc.returncode != 0:
            context.log.error(proc.stderr[-4000:] if proc.stderr else "(no stderr)")
            raise RuntimeError(f"dbt {phase} failed (exit {proc.returncode}) — see logs.")
    return {"status": "passed"}


@asset(deps=[run_dbt_models_and_tests])
def export_analytical_artifacts(context) -> str:
    """Read gold.mart_deal_scorecard and write the Excel scorecard."""
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUTS_DIR / "Deal_Grade_Scorecard_Gold.xlsx"

    con = duckdb.connect(WAREHOUSE.as_posix(), read_only=True)
    cur = con.execute("SELECT * FROM gold.mart_deal_scorecard ORDER BY deal_id")
    columns = [d[0] for d in cur.description]
    rows = cur.fetchall()  # plain Python rows — no pandas/numpy dependency
    con.close()

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Deal Scorecard"
    ws.append(columns)
    for r in rows:
        ws.append(list(r))
    wb.save(out_path.as_posix())
    context.log.info(f"Wrote {out_path} ({len(rows)} deals).")
    return out_path.as_posix()


daily_pipeline_job = define_asset_job(name="daily_pipeline_job")

weekday_5pm_schedule = ScheduleDefinition(
    name="weekday_5pm_schedule",
    job=daily_pipeline_job,
    cron_schedule="0 17 * * 1-5",  # 17:00, Mon–Fri
    execution_timezone="America/New_York",
)

defs = Definitions(
    assets=[
        verified_nyse_session,
        fred_bronze_ingestion,
        run_dbt_models_and_tests,
        export_analytical_artifacts,
    ],
    jobs=[daily_pipeline_job],
    schedules=[weekday_5pm_schedule],
)
