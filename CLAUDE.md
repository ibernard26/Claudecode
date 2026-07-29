# MI | PE Market Intelligence — Project

## What this repo is
A living PE/M&A market intelligence tracker. The canonical data source is a Google Drive
spreadsheet; this repo is the working layer that extends, analyses, and publishes from it.

## Canonical source
| Item | Value |
|---|---|
| File | `MI PE Tracking System v1.xlsx` |
| Drive path | `My Drive → Market research → Financial markets` |
| File ID | `1WnTvf-CKyj-p8FSZQBDQEEn6ISFj1Fne` |
| Last canonical entry | June 5, 2026 (Drive original; automation lapsed May 6–Jun 4) |
| Repo canonical workbook | `MI_PE_Tracking_System.xlsx` — continuous Apr 20 → today; May 6–Jun 4 backfilled with verified milestones; the loop appends here every cycle |

## Project structure
```
CLAUDE.md                          ← this file (auto-loaded by Claude Code)
MI_PE_Tracking_System.xlsx         ← CANONICAL 5-tab workbook, primary loop target (Apr 20→today)
tracker/MI_PE_Tracker.md           ← living working layer (append-only, never delete rows)
memos/Weekly_Memo_YYYY-MM-DD.md    ← Saturday weekly memos
automation/daily_tracker_loop.md   ← loop prompt + cron config for both triggers
outputs/                           ← finished deliverables (reports, exports)
.claude/commands/daily-report.md   ← /daily-report slash command
.mcp.json                          ← MCP server config (Google Drive)
MI_PE_Dashboard.html               ← Chart.js dashboard (update JS arrays daily)
Asymmetric_PE_MA_Opportunities_Mid2026.md ← contrarian brief (top-10 NC/AS scored)
MI_PE_Market_Intelligence_Report.md      ← full initial report
```

## Google Drive companion spreadsheets (rolling, sheets not docs)
All Drive output is Google Sheets (CSV → Sheet conversion). Two rolling files:
- **Market Data:** `1C-YKZ8ho4YseFyEuBUMko-3SV-JbvXij2GiSNadn9QI`
  Cols: Date, Cycle, S&P 500 Close, S&P Daily %, Nasdaq Close, Nasdaq Daily %, Dow Daily %, WTI, Brent, 10Y Yield, Fed Funds, Signal, Key Note, Source
- **Deal Register & Signals:** `1QdS3RAVEm0faQWdZWVC6Fjv74bZnVp63DPnDBkhtH2g`
  Cols: Date, Sector, Headline, Acquirer/Sponsor, Target, Value, Signal, Impact, Source

Never create Google Docs for numeric data — spreadsheets only.

## Recurring loop schedule
| Trigger | Time | Cron (local) | Max turns |
|---|---|---|---|
| Daily tracker update | Weekdays 7:03 AM | `3 7 * * 1-5` | 15 |
| Weekly memo | Saturdays 9:03 AM | `3 9 * * 6` | 20 |

Full prompts in `automation/daily_tracker_loop.md`. Cron job IDs this session: `1bdabe09` (daily), `ccd524e3` (weekly).

## Core conventions (inherited from canonical sheet)
- **Verifiable data only** — no fabricated figures; gaps explicitly flagged.
- **Append-only** — never delete historical rows from the tracker.
- `🟡 NEW` marks rows added in the current cycle; `🟡🟡` = Cycle 2, `🟡🟡🟡` = Cycle 3, etc.
- **Git = non-destructive change log** — commit every cycle.
- **Durable vs noise** — always label signals as one or the other.

## Thesis scoring (Asymmetric Brief)
NC = Non-Consensus score 1–10 · AS = Asymmetry score 1–10

## Branch
All work: `claude/eloquent-pasteur-id8nr1` (PR #1 open)

## Key tracked themes (current conviction)
1. AI physical picks-and-shovels: HV/grid electrical services, data-center thermal, nuclear supply chain (NC:6–8 / AS:7–9)
2. Defense Tier 3/4 sub-tier suppliers (NC:7 / AS:8)
3. Mid-market corporate carve-outs (NC:6 / AS:8)
4. Distressed/rescue capital → fallen-angel software LBOs (NC:6 / AS:8)
5. PFAS/water O&M, fire & life-safety inspection (mandated recurring) (NC:6–8 / AS:7–9)

## Canonical strategy — LOCKED (`event_driven_v1`)
The live research strategy is **event-driven / merger-arb deal-break scoring**,
defined once in `pe-tracker/pe-tracker/STRATEGY.md` and pinned in
`pe-tracker/pe-tracker/src/config.py`. Every loop cycle and every session runs
this same contract — it must never differentiate run to run:
- Positive class = the deal **breaks** (`y=1 ⇔ status='broken'`); pending deals
  are **censored**, never negatives.
- **Point-in-time**: a metric `as_of` D uses only deals resolved on/before D. No lookahead.
- Graded with **both** ROC AUC (prevalence-invariant) and PR AUC **beside π**.
- Operating point is **cost-based** (`t*`, FN:FP = 15:1), never 0.5.
- Index momentum (`ma5_v1`) is **retired to a baseline** (no edge, p=0.44) — not a trade signal.
- No fabrication: unpublished prints stay `n/d`, unresolved deals stay `pending`.

`tests/test_strategy_contract.py` fails the build if any of these constants
drift, so the strategy cannot silently diverge. Changing it requires bumping
`STRATEGY_VERSION` + STRATEGY.md + the contract test in one commit.

## /daily-report command
Run `/daily-report` to execute the full daily cycle:
research → tracker update → spreadsheet update → **event-driven strategy layer
(deal-break scorecard + workbook regen, per STRATEGY.md)** → commit/push.
See `.claude/commands/daily-report.md` for the full spec.
