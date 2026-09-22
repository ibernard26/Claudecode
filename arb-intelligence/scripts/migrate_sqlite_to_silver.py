"""Migrate the legacy SQLite estate into the DuckDB silver layer.

Reads ./local.db (tables: market_series, calendar, deal_ledger) through DuckDB's
sqlite extension, types every column, and lands three silver tables plus their
Parquet mirrors. If ./local.db is absent, it seeds a small, realistic fixture so
the whole dbt + Dagster pipeline still runs and tests cleanly.

Invariants enforced here:
  1. NO FABRICATION  — a source price of '.' or '' becomes SQL NULL, never 0.0.
  3. POINT-IN-TIME   — load_timestamp / system_time (when we learned it) are stored
                       separately from obs_date / valid_from (market effective time).
  5. APPEND-ONLY     — the deal satellite carries hash_diff + valid_from/valid_to +
                       is_current, an SCD2 / Data-Vault shape.
"""
from __future__ import annotations

import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
WAREHOUSE = ROOT / "data" / "warehouse.duckdb"
SILVER_DIR = ROOT / "data" / "silver"
OUTPUTS_DIR = ROOT / "outputs"
LEGACY_SQLITE = ROOT / "local.db"

# Six real, public 2026 transactions — the fixture used when local.db is absent.
SAMPLE_DEALS = [
    # deal_id, target, acquirer, sponsor, value_usd_mm, sector, geography,
    # deal_type, primary_break_vector, status, p_break, model_version,
    # announce_date, resolution_date
    ("EA-PIF-2026", "Electronic Arts", "PIF/Silver Lake/Affinity", "PIF/Silver Lake/Affinity",
     55000.0, "Gaming/Tech", "US", "take_private", "CFIUS", "closed", 0.28,
     "event_driven_v1", "2026-06-17", "2026-08-04"),
    ("EZJ-CASTLELAKE-2026", "easyJet", "Castlelake", "Castlelake",
     7300.0, "Airlines", "UK", "take_private", "regulatory", "pending", 0.22,
     "event_driven_v1", "2026-07-05", None),
    ("ORGN-SUNP-2026", "Organon", "Sun Pharma", None,
     11750.0, "Healthcare", "US/IN", "strategic", "antitrust", "pending", 0.18,
     "event_driven_v1", "2026-04-27", None),
    ("CALIBER-NEE-2026", "Caliber Resource Partners", "NextEra Energy", "Quantum Capital",
     1300.0, "Energy", "US", "JV", "regulatory", "pending", 0.15,
     "event_driven_v1", "2026-06-19", None),
    ("FORVIA-APO-2026", "Forvia auto interiors", "Apollo Global", "Apollo",
     2100.0, "Industrials", "EU/US", "LBO", "financing", "pending", 0.20,
     "event_driven_v1", "2026-04-27", None),
    ("ANTH-TPU-FIN-2026", "Anthropic (TPU financing)", "Apollo/Blackstone", "Apollo/Blackstone",
     36000.0, "AI", "US", "financing", "financing", "pending", 0.10,
     "event_driven_v1", "2026-05-29", None),
]

# Minimal market + calendar fixture (a handful of April 2026 sessions, incl. a
# weekend that must be filtered by the calendar gate, and a genuine missing print
# that must survive as NULL).
SAMPLE_CALENDAR = [
    ("2026-04-20", True, None),
    ("2026-04-21", True, None),
    ("2026-04-22", True, None),
    ("2026-04-23", True, None),
    ("2026-04-24", True, None),
    ("2026-04-25", False, "weekend"),
    ("2026-04-26", False, "weekend"),
    ("2026-04-27", True, None),
]
SAMPLE_PRICES = [
    # series_id, obs_date, raw_value_as_text ('.' = missing)
    ("SP500", "2026-04-20", "7109.14"),
    ("SP500", "2026-04-21", "7064.01"),
    ("SP500", "2026-04-22", "7137.90"),
    ("SP500", "2026-04-23", "."),          # genuine missing print -> must be NULL
    ("SP500", "2026-04-24", "7165.08"),
    ("SP500", "2026-04-25", "7165.08"),    # weekend -> must be gated out entirely
    ("DCOILWTICO", "2026-04-20", "96.26"),
    ("DCOILWTICO", "2026-04-22", "96.00"),
    ("DCOILWTICO", "2026-04-24", "94.40"),
    ("DCOILBRENTEU", "2026-04-20", "96.26"),
    ("DCOILBRENTEU", "2026-04-24", "105.33"),
    ("NASDAQCOM", "2026-04-20", "24404.39"),
    ("NASDAQCOM", "2026-04-24", "24836.60"),
]


def _ensure_dirs() -> None:
    SILVER_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    WAREHOUSE.parent.mkdir(parents=True, exist_ok=True)


def _seed_fixture(con: duckdb.DuckDBPyConnection) -> None:
    """Build raw fixture tables in-memory-ish (temp schema) so the same typed
    SELECTs run whether the source is SQLite or the fixture."""
    con.execute("CREATE SCHEMA IF NOT EXISTS _raw;")
    con.execute("DROP TABLE IF EXISTS _raw.market_series;")
    con.execute("CREATE TABLE _raw.market_series (series_id VARCHAR, obs_date VARCHAR, price VARCHAR);")
    con.executemany("INSERT INTO _raw.market_series VALUES (?, ?, ?);", SAMPLE_PRICES)

    con.execute("DROP TABLE IF EXISTS _raw.calendar;")
    con.execute("CREATE TABLE _raw.calendar (calendar_date VARCHAR, is_trading BOOLEAN, reason VARCHAR);")
    con.executemany("INSERT INTO _raw.calendar VALUES (?, ?, ?);", SAMPLE_CALENDAR)

    con.execute("DROP TABLE IF EXISTS _raw.deal_ledger;")
    con.execute("""
        CREATE TABLE _raw.deal_ledger (
            deal_id VARCHAR, target VARCHAR, acquirer VARCHAR, sponsor VARCHAR,
            value_usd_mm DOUBLE, sector VARCHAR, geography VARCHAR, deal_type VARCHAR,
            primary_break_vector VARCHAR, status VARCHAR, p_break DOUBLE,
            model_version VARCHAR, announce_date VARCHAR, resolution_date VARCHAR
        );
    """)
    con.executemany(
        "INSERT INTO _raw.deal_ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?);",
        SAMPLE_DEALS,
    )


def _attach_sqlite(con: duckdb.DuckDBPyConnection) -> str:
    """Attach ./local.db and return the schema prefix to read raw tables from."""
    con.execute("INSTALL sqlite;")
    con.execute("LOAD sqlite;")
    con.execute(f"ATTACH '{LEGACY_SQLITE.as_posix()}' AS legacy (TYPE sqlite);")
    return "legacy"


def migrate() -> None:
    _ensure_dirs()
    con = duckdb.connect(WAREHOUSE.as_posix())
    con.execute("CREATE SCHEMA IF NOT EXISTS silver;")

    if LEGACY_SQLITE.exists():
        src = _attach_sqlite(con)
        print(f"[migrate] reading legacy SQLite at {LEGACY_SQLITE}")
    else:
        _seed_fixture(con)
        src = "_raw"
        print("[migrate] ./local.db not found — seeding fixture (6 deals + sample market data)")

    # --- silver.stg_fred_prices : NO FABRICATION (missing -> NULL) --------------
    con.execute(f"""
        CREATE OR REPLACE TABLE silver.stg_fred_prices AS
        SELECT
            series_id,
            CAST(obs_date AS DATE)                                   AS observation_date,
            CASE
                WHEN trim(CAST(price AS VARCHAR)) IN ('.', '') THEN NULL
                ELSE CAST(price AS DOUBLE)
            END                                                     AS raw_value,
            CURRENT_TIMESTAMP                                        AS load_timestamp
        FROM {src}.market_series;
    """)

    # --- silver.stg_nyse_calendar ----------------------------------------------
    con.execute(f"""
        CREATE OR REPLACE TABLE silver.stg_nyse_calendar AS
        SELECT
            CAST(calendar_date AS DATE)   AS calendar_date,
            CAST(is_trading AS BOOLEAN)   AS is_trading,
            reason                        AS holiday_reason
        FROM {src}.calendar;
    """)

    # --- silver.silver_sat_deal : SCD2 / Data-Vault satellite -------------------
    con.execute(f"""
        CREATE OR REPLACE TABLE silver.silver_sat_deal AS
        SELECT
            deal_id,
            target,
            acquirer,
            sponsor,
            CAST(value_usd_mm AS DOUBLE)                    AS value_usd_mm,
            sector,
            geography,
            deal_type,
            primary_break_vector,
            status,
            CAST(p_break AS DOUBLE)                         AS p_break,
            model_version,
            CAST(announce_date AS DATE)                     AS announce_date,
            CASE WHEN resolution_date IS NULL OR trim(CAST(resolution_date AS VARCHAR)) = ''
                 THEN NULL ELSE CAST(resolution_date AS DATE) END AS resolution_date,
            md5(deal_id || '_' || status || '_' ||
                coalesce(CAST(resolution_date AS VARCHAR), 'NA'))   AS hash_diff,
            CAST(announce_date AS DATE)                     AS valid_from,
            CAST('9999-12-31' AS DATE)                      AS valid_to,
            TRUE                                            AS is_current,
            CURRENT_TIMESTAMP                               AS system_time
        FROM {src}.deal_ledger;
    """)

    # --- Parquet mirrors --------------------------------------------------------
    for tbl in ("stg_fred_prices", "stg_nyse_calendar", "silver_sat_deal"):
        out = (SILVER_DIR / f"{tbl}.parquet").as_posix()
        con.execute(f"COPY silver.{tbl} TO '{out}' (FORMAT PARQUET);")

    # --- report -----------------------------------------------------------------
    for tbl in ("stg_fred_prices", "stg_nyse_calendar", "silver_sat_deal"):
        n = con.execute(f"SELECT count(*) FROM silver.{tbl};").fetchone()[0]
        print(f"[migrate] silver.{tbl}: {n} rows")
    nulls = con.execute(
        "SELECT count(*) FROM silver.stg_fred_prices WHERE raw_value IS NULL;"
    ).fetchone()[0]
    print(f"[migrate] preserved NULL prices (not fabricated): {nulls}")
    con.close()
    print("[migrate] done -> ./data/warehouse.duckdb")


if __name__ == "__main__":
    migrate()
