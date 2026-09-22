# Copy-paste prompt for Gemini — data architecture for the MI/PE market-intelligence estate

Paste everything inside the code block into Gemini (1.5/2.x Pro). It is structured
around Gemini's own five-part description of what it can do in data architecture, and
grounded in the real data we have built over the last six months. Committed to the
repo for durability; see the "what this is" note at the bottom.

---

```
ROLE
Act as my end-to-end data-architecture design partner, technical reviewer, and
implementation assistant. I have an existing, working but small analytics estate and
I want you to design its target-state architecture AND generate the concrete
artifacts (DDL, dbt models, IaC, quality tests) to get there. Organize your entire
response under the five headings you use to describe your own data-architecture
capabilities (Architectural Strategy; Data Modeling; Pipeline & Orchestration; Code
& DDL Generation; Governance, Security & Quality). Be specific and produce real
code, not prose summaries.

BUSINESS CONTEXT
This is a market-intelligence + event-driven merger-arbitrage research platform. It
tracks US markets daily and grades whether announced M&A deals will BREAK. The whole
project's credibility rests on a few non-negotiable data invariants (below) — treat
them as first-class architectural constraints, not afterthoughts.

THE DATA ASSETS (six months of history, all real)
1. Daily market series (source: FRED, one API key). Grain = one row per series per
   trading day. Series: S&P 500 (SP500), NASDAQ Composite (NASDAQCOM), Dow, WTI
   Cushing spot (DCOILWTICO), Brent Europe spot (DCOILBRENTEU), 10Y Treasury yield,
   Fed funds rate. Coverage 2026-04-20 → present. Low volume (~single-digit
   thousands of rows total) but high correctness bar.
2. Trading calendar. One row per calendar date with is_trading + reason
   (weekend / named NYSE holiday). GATES ingestion: a price may never be written on
   a non-session date.
3. Deal ledger (the differentiated asset). One row per announced M&A deal:
   deal_id, announce_date, acquirer, target, sponsor, value_usd_mm, sector,
   geography, offer_premium, deal_type (strategic/LBO/take_private/JV/financing),
   primary_break_vector (antitrust/CFIUS/financing/shareholder_vote/regulatory),
   resolution_date (NULL while pending), status (pending/closed/broken),
   p_break (model score set AT announce), model_version. Real rows include:
   - Electronic Arts $55B take-private (PIF/Silver Lake/Affinity), $210/sh, break
     vector CFIUS, RESOLVED closed 2026-08-04.
   - easyJet $7.3B (Castlelake, 690p cash), UK regulatory + vote, pending.
   - Sun Pharma / Organon $11.75B, generics antitrust, pending.
   - NextEra / Caliber Resource Partners $1.3B JV (Quantum), pending.
   - Apollo / Forvia $2.1B LBO, pending.
   - Apollo & Blackstone / Anthropic $36B financing (private credit, not arb), pending.
4. Signals. Model outputs versioned by ruleset (e.g. ma5_v1, event_driven_v1) —
   one row per (series/deal, date, ruleset).
5. Current physical stores: a single local SQLite DB (source of truth), two rolling
   Google Sheets (Market Data; Deal Register), and a 5-tab Excel workbook that is a
   generated OUTPUT, never an input.

NON-NEGOTIABLE DATA INVARIANTS (design the architecture to enforce these)
- NO FABRICATION. A missing observation is NULL ("n/d"), never interpolated,
  forward-filled, or carried over. Weekend/holiday prices must be impossible.
- POINT-IN-TIME / NO LOOKAHEAD. p_break is fixed at announce; any metric computed
  `as_of` date D may use only facts knowable on/before D. Pending deals are CENSORED
  (excluded from evaluation), never treated as non-breaks. This demands explicit
  bitemporality: valid/business time vs. system/load time.
- APPEND-ONLY / FULLY AUDITABLE. History is never mutated in place; every correction
  is a new versioned record. I must be able to reconstruct exactly what was known on
  any past date.
- REPRODUCIBLE & VERSIONED. Strategy constants live behind a STRATEGY_VERSION;
  outputs must be regenerable identically from the raw layer.

WHAT I WANT YOU TO PRODUCE, under your five capability headings:

1. ARCHITECTURAL STRATEGY & PARADIGM SELECTION
   - Recommend a paradigm for THIS scale (small data, tiny team, correctness- and
     audit-critical, cheap to run). Explicitly weigh a lakehouse vs. a plain warehouse
     vs. keeping DuckDB/SQLite — and justify against my latency (daily batch is fine;
     no sub-second need) and cost constraints. Don't over-engineer; call out where
     Data Mesh / Kafka / streaming would be overkill here and say so plainly.
   - Design a tiered Bronze/Silver/Gold (Raw/Enriched/Curated) layout and say exactly
     which of my assets lands in each tier and in what format (e.g. raw FRED JSON →
     Bronze; typed calendar-gated facts → Silver; star schema + deal scorecard → Gold).
   - Give the batch topology; note the one place a streaming/Kappa path could later
     matter (deal-status news) and why it isn't needed yet.

2. DATA MODELING & SCHEMA DESIGN
   - Design the Gold-layer DIMENSIONAL model: fact_price (daily, grain one series ×
     day), fact_deal_state (bitemporal deal history), and conformed dims dim_date
     (with is_trading), dim_series, dim_deal, dim_ruleset. Draw the star as text/ERD.
   - Because point-in-time + full audit are mandatory, ALSO give a Data Vault 2.0
     model of the raw/business layer: Hubs (Deal, Series, TradingDay), Links
     (deal↔resolution, series↔price), and Satellites carrying status/p_break history
     with load timestamps. Explain when I'd use the Vault vs. the star.
   - Show how SCD Type 2 (or the Vault satellites) captures a deal moving
     pending→closed/broken WITHOUT destroying the point-in-time p_break.
   - Define schema-evolution / contract rules for the FRED and deal feeds (JSON
     Schema or Avro), with backward-compatibility policy, since new series/fields
     will be added over time.

3. PIPELINE & ORCHESTRATION ARCHITECTURE
   - Design the ELT with dbt for transforms and one orchestrator (recommend Airflow
     vs. Dagster vs. Prefect for a solo operator; pick one and justify). Give the DAG:
     ingest FRED → calendar-gate → load Bronze → build Silver → build Gold star +
     scorecard → run quality tests → export the workbook/sheets.
   - Specify idempotency and fault tolerance: exactly-once daily upserts keyed by
     (series_id, obs_date); replayable backfills; a dead-letter path for FRED rows
     that fail the calendar gate or arrive as "."; automated checkpointing so a
     mid-run failure resumes cleanly.
   - Show the CDC-style pattern for deal-status changes even though the source is
     manual/curated (treat each verified status change as an event with a load ts).

4. CODE & DDL GENERATION
   - Write the actual DDL for the Gold model in TWO targets: BigQuery AND DuckDB
     (my likely cheap local/analytical engines); note the Snowflake/Postgres deltas.
     Include partitioning/clustering (by obs_date) and PK/unique constraints where
     the engine supports them.
   - Write representative dbt models: an INCREMENTAL fact_price with a merge key,
     a point-in-time-correct dim_deal (SCD2), and a curated deal_scorecard model.
   - Outline a minimal Terraform module to provision the cloud storage bucket, the
     warehouse/dataset, and IAM — kept intentionally small for a one-person project.

5. GOVERNANCE, SECURITY & QUALITY
   - Design the data-quality layer (dbt tests + Great Expectations or Soda) that
     ENCODES my invariants as assertions, not just generic checks:
       * no price row on a non-trading date (calendar gate),
       * no forward-filled/interpolated values (freshness + null-vs-fabricated),
       * pending deals never appear in an evaluation set (censoring),
       * no lookahead: a fact's system_time <= its valid_time cutoff,
       * schema-drift and volume-anomaly checks on the FRED feed.
   - Outline access control (RBAC roles: ingest, analyst, admin), and where
     column-level masking or encryption is warranted (there's no PII here — say so,
     and don't invent compliance needs; note only what genuinely applies).
   - Plan a lightweight data catalog + a semantic layer (dbt semantic layer /
     MetricFlow or Cube) that standardizes the core metrics — daily return, MTD,
     WTI-Brent spread, break base rate π, ROC/PR AUC — so every downstream surface
     (the workbook, a future dashboard, an LLM query) uses one definition.

CONSTRAINTS ON YOUR ANSWER
- Right-size everything to a solo operator with small data and a high correctness
  bar. Where an enterprise pattern is overkill, say so explicitly rather than
  including it for completeness.
- Every design choice must respect the four invariants above; call out exactly which
  invariant each mechanism enforces.
- Produce runnable artifacts (DDL, dbt SQL, GE/dbt tests, Terraform) in labeled code
  blocks, plus a one-paragraph migration path from the current SQLite/Sheets setup
  to the target state.
```

---

## What this is / how to use it
This prompt hands Gemini our real six-month data estate — the daily FRED market
series, the trading calendar, the merger deal ledger, the versioned signals, and the
current SQLite/Sheets/xlsx stores — and asks it to design the target data
architecture **under its own five capability headings**, enforcing our four
invariants (no fabrication, point-in-time/no-lookahead, append-only audit,
reproducible/versioned).

Paste it into Gemini as one message. If it truncates a section, reply:
`continue at section <n>, full code blocks`. When you like the result, the DDL + dbt
+ tests it produces can seed a `data-architecture/` folder in the repo.
