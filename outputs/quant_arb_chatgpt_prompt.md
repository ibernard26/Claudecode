# Copy-paste prompt for ChatGPT — build the quant arbitrage project

Paste everything inside the code block below into ChatGPT (GPT-5 or o-series with a
code interpreter / canvas). It will generate a complete, GitHub-ready Python repo.
When it finishes, follow the "Take it to GitHub" steps at the very bottom of this file.

---

```
ROLE
You are a senior quantitative developer. Build me a complete, production-quality,
GitHub-ready Python project that calculates and evaluates arbitrage across the
specific markets I already track. Output the FULL repository file by file, each in
its own code block with its exact path as a header (e.g. `# src/arb/merger.py`),
so I can paste each into GitHub directly. Do not summarize — write the actual code,
tests, README, and config. Prefer a small dependency footprint (must run on an
8 GB Intel Mac, no packages that compile from source).

PROJECT NAME
market-arb  (a research engine, not investment advice — say so in the README)

THE MARKETS I TRACK (use exactly these)
- US equity indices: S&P 500 (FRED: SP500), NASDAQ Composite (FRED: NASDAQCOM)
- Crude benchmarks: WTI Cushing spot (FRED: DCOILWTICO), Brent Europe spot (FRED: DCOILBRENTEU)
- Merger / M&A deal flow (the primary focus — see the seed deals below)
All price data comes from FRED via one free API key (env var FRED_API_KEY). FRED
encodes a missing observation as the string "." — that MUST become SQL NULL, never
a carried-forward or interpolated value.

THREE ARBITRAGE ENGINES TO BUILD
1. MERGER ARBITRAGE (core). For each announced deal compute:
   - gross spread = (offer_price - current_price) / current_price
   - annualized return = gross spread × (365 / days_to_expected_close)
   - break-adjusted expected value:
       EV = p_close × (offer_price - current_price) − p_break × downside_to_unaffected
       where p_break is the model's break probability and downside_to_unaffected is
       (current_price - estimated_unaffected_price).
   - Rank live deals by break-adjusted annualized EV.
2. CRUDE SPREAD ARB. Brent−WTI spread series; z-score vs a rolling mean/σ;
   flag mean-reversion entries when |z| exceeds a configurable band; report the
   spread's current percentile. Guard against gaps (NULLs never fill forward).
3. INDEX RELATIVE VALUE (baseline only). A simple SP500/NASDAQCOM ratio z-score.
   Clearly label this as a weak baseline, not a live signal.

THE DEAL-BREAK MODEL (this is the differentiated part — implement it carefully)
The rare, expensive event is the deal BREAKING. Treat it as an imbalanced binary
classification problem (base rate π ≈ 0.10):
- Positive class y = 1 ⇔ deal status = 'broken'. Base rate is low.
- PENDING DEALS ARE CENSORED, never negatives. Exclude them from any evaluation
  set until they resolve. This keeps every study point-in-time honest.
- POINT-IN-TIME everywhere: a metric computed `as_of` date D may only use deals
  with resolution_date <= D. No lookahead. Write a unit test that injects a deal
  resolving AFTER D and asserts the metrics are unchanged.
- Score p_break at ANNOUNCE and never revise it with hindsight.
- Features observable at announce: offer premium, sponsor type (strategic / LBO /
  take-private / foreign-sovereign), sector, geography, deal size, and a
  primary_break_vector label (antitrust / CFIUS / financing / shareholder-vote /
  regulatory). Start with a transparent logistic-regression baseline; keep the
  model swappable behind an interface.

EVALUATION (report both, never one alone)
- ROC AUC — implement as the Mann–Whitney rank statistic with AVERAGED tied ranks
  (AUC = (Σ rank(pos) − n_pos(n_pos+1)/2) / (n_pos·n_neg)) AND cross-check it
  against sklearn.metrics.roc_auc_score in a test. ROC AUC is prevalence-invariant,
  so it can look reassuring while breaks are missed — that is exactly why we also
  report PR AUC.
- PR AUC (average_precision_score) — ALWAYS printed beside its baseline π. A PR AUC
  of 0.30 is strong at π=0.10 and mediocre at π=0.25; the number is meaningless
  without the prevalence line.
- COST-BASED OPERATING POINT, never 0.5: choose t* = argmin(FP·cost_fp + FN·cost_fn)
  with cost_fn (an unhedged break → full drawdown) set 15× cost_fp (spread forgone
  hedging a deal that closes). Report the confusion matrix at t* and how t* shifts
  across cost ratios {5,10,15,20}. Flag any cohort with n < 20 as too thin to cite.

NON-NEGOTIABLE DESIGN RULES (bake these in)
1. SQLite is the single source of truth. Any exported spreadsheet is an OUTPUT.
2. Nothing derived is stored — spreads, z-scores, MAs, EV are computed on read.
3. A gap stays a gap: missing data is NULL, never forward-filled or interpolated.
4. A trading-calendar gate: no price may be written on a weekend/US market holiday.
5. The signal/threshold rules live in ONE config module, versioned by a
   STRATEGY_VERSION string, so a change is deliberate and a contract test catches
   drift. Ship tests/test_strategy_contract.py that pins every constant.
6. No fabrication: unresolved deals stay 'pending', unpublished prints stay NULL.

SEED THE DEALS TABLE with these real, public transactions (all US-market-relevant,
2026). Store them 'pending' unless a resolution is given; do NOT invent p_break
scores or resolution dates I haven't supplied:
- Electronic Arts — $55B take-private, PIF/Silver Lake/Affinity/Kushner, $210/sh
  all-cash; primary break vector CFIUS; RESOLVED closed 2026-08-04 (CFIUS cleared
  2026-07-30). This is the worked example — largest LBO on record.
- easyJet — $7.3B take-private by Castlelake at 690p/share cash; break vector
  UK regulatory + shareholder vote; pending.
- Sun Pharma / Organon — $11.75B strategic; break vector generics antitrust; pending.
- NextEra Energy / Caliber Resource Partners — $1.3B JV with Quantum Capital;
  break vector energy-infrastructure clearance; pending.
- Apollo / Forvia auto interiors — $2.1B LBO; pending.
- Apollo & Blackstone / Anthropic — $36B TPU financing package (private credit, not
  M&A arb) — include as a ledger row but mark deal_type='financing' and exclude it
  from the arb ranking.

REQUIRED REPO STRUCTURE
market-arb/
  README.md               (what it is, quickstart, the design rules, a results-honesty note)
  LICENSE                 (MIT)
  requirements.txt        (requests, pandas, numpy, scikit-learn, python-dotenv, pytest)
  .gitignore              (.env, *.db, __pycache__, .venv)
  .env.example            (FRED_API_KEY=, DB_PATH=data/market_arb.db)
  schema.sql              (series, prices[+is_derived], market_calendar, deals, signals)
  src/
    config.py             (FRED series map, market holidays, STRATEGY_VERSION, cost consts, thresholds)
    db.py                 (thin sqlite layer; upsert never overwrites a real value with NULL)
    ingest/
      fred.py             ("." → NULL; one key, one client)
      calendar.py         (build NYSE calendar; gate ingestion)
    arb/
      merger.py           (spread, annualized, break-adjusted EV, deal ranking)
      crude_spread.py     (Brent−WTI z-score, percentile, entry flags)
      index_rv.py         (SP500/NASDAQ ratio z-score — labeled weak baseline)
    model/
      break_model.py      (logistic baseline behind a swappable interface; p_break at announce)
      metrics.py          (confusion, rank ROC AUC + sklearn cross-check, PR AUC vs π, cost-based t*, cohort scorecard)
    cli.py                (init, pull, calendar, arb, score, scorecard, backtest — argparse)
  tests/
    test_calendar.py      (weekends/holidays are never trading days)
    test_ingest.py        ("." maps to NULL; NULL never overwrites a value)
    test_merger.py        (spread + break-adjusted EV math on a known example)
    test_crude_spread.py  (z-score correct; a NULL gap does not fill forward)
    test_metrics.py       (censoring; no-lookahead; averaged-rank ties; cost t* pushes down as FN cost rises)
    test_strategy_contract.py (pins STRATEGY_VERSION, positive class, 15:1 cost, π floor, MIN_N=20)
  .github/workflows/ci.yml (run pytest on push)

QUALITY BAR
- Every module has a docstring explaining WHY, not just what.
- Every new behavior has a test; the suite must be green.
- Type hints throughout; no hard-coded magic numbers outside config.py.
- The README quickstart must run end to end:
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env   # add FRED key
    python -m src.cli init
    python -m src.cli pull
    python -m src.cli arb           # ranked merger + crude-spread opportunities
    python -m src.cli scorecard     # deal-break evaluation (honest empty state if all pending)
    pytest -q
- If the break model has no resolved, scored deals yet, the scorecard must say so
  plainly (n=0, censored) rather than fabricate a metric. A gradeable null is a
  correct result, not a failure.

Now generate the entire repository, file by file, complete and runnable.
```

---

## Take it to GitHub (after ChatGPT generates the files)

1. On GitHub, create a new empty repo named `market-arb` (no README/license — ChatGPT provides them).
2. On your Mac:
   ```bash
   mkdir market-arb && cd market-arb
   # paste each file ChatGPT produced into the path it names
   git init -b main
   git add -A
   git commit -m "Initial commit: market-arb quant arbitrage engine"
   git remote add origin git@github.com:<your-username>/market-arb.git
   git push -u origin main
   ```
3. Add your free FRED key: copy `.env.example` to `.env`, paste the key, and run the
   README quickstart to confirm the suite is green before you share the repo.

_Tip: if any file is truncated in ChatGPT's output, reply "continue with the exact
file <path>, full contents" and it will resume that one file._
