# arb-intelligence

An end-to-end, in-process **OLAP data estate** for a merger-arbitrage research
platform: **DuckDB** (storage/compute) + **dbt** (transformations) + **Dagster**
(orchestration). It migrates a legacy SQLite/Sheets/Excel setup into a tiered
Bronze→Silver→Gold model and **programmatically enforces five data invariants**.

## The five invariants (enforced, not just documented)
| # | Invariant | Where it's enforced |
|---|---|---|
| 1 | **No fabrication** — a missing print is a true `NULL`, never `0.0`/ffill/interp | `migrate_sqlite_to_silver.py` (`'.'`→`NULL`) + `tests/assert_no_forward_fill_fabrication.sql` |
| 2 | **Calendar gate** — no price on a non-trading date | `fact_price` INNER JOIN `dim_date WHERE is_trading` + `tests/assert_no_prices_on_non_trading_days.sql` |
| 3 | **Point-in-time / no lookahead** — effective time ≠ load time | `valid_time` vs `system_time` columns + `tests/assert_no_lookahead_temporal_order.sql` |
| 4 | **Censored outcomes** — pending deals excluded from metrics | `mart_deal_scorecard` (`is_censored`, NULL label/Brier) + `tests/assert_pending_deals_are_censored.sql` |
| 5 | **Append-only / auditable** — SCD2 / Data-Vault deal history | `silver_sat_deal` (`hash_diff`, `valid_from/to`, `is_current`, `system_time`) |

## Quickstart
```bash
python -m pip install -e .          # or: pip install duckdb dbt-core dbt-duckdb dagster dagster-dbt requests openpyxl pydantic
python scripts/migrate_sqlite_to_silver.py     # lands silver.* (uses ./local.db, else a 6-deal fixture)
dbt run  --profiles-dir . --project-dir .      # builds staging → gold → marts
dbt test --profiles-dir . --project-dir .      # runs the 4 invariant tests
# full orchestrated run (gate → ingest → dbt run+test → export xlsx):
dagster asset materialize --select '*' -m orchestrator.pipeline
# or launch the UI:  dagster dev -m orchestrator.pipeline
```
Set `FRED_API_KEY` to pull live observations; without it, ingestion uses a labeled
mock payload so the pipeline runs in dev. The Dagster schedule fires weekdays 17:00
America/New_York.

## Layout
```
scripts/migrate_sqlite_to_silver.py   SQLite→DuckDB silver load (+ Parquet mirrors, fixture fallback)
models/staging/                       views over the landed silver sources
models/gold/                          dim_date, dim_series, dim_deal, fact_price (incremental), fact_deal_state (bitemporal)
models/marts/mart_deal_scorecard.sql  censored Brier scorecard
tests/                                4 singular SQL tests (one per invariant, rows-on-failure)
orchestrator/pipeline.py              Dagster assets + weekday 17:00 schedule
macros/generate_schema_name.sql       verbatim schema names (staging/silver/gold)
```

## Verified
On a clean run against the fixture: **8 dbt models build, 4 invariant tests pass**,
the full Dagster job returns `RUN_SUCCESS`, and `outputs/Deal_Grade_Scorecard_Gold.xlsx`
is produced. Spot-checks confirm the weekend print is gated out of `fact_price`, a
genuinely-missing print survives as `NULL`, and the 5 pending deals are censored
(NULL label + NULL Brier) while the resolved EA deal scores a Brier of 0.28² = 0.0784.

_Research tooling, not investment advice._
