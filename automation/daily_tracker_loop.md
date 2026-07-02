# MI PE Tracker — Recurring Automation Loop

This file is the **source of truth** for the recurring tracker automation. Because the
execution container is ephemeral, the loop prompt lives here in version control so every
scheduled run (or manual re-run) uses the same, up-to-date instructions.

## How the loop runs

Set up in **[code.claude.com](https://code.claude.com) → project → Settings → Triggers**.
Two triggers reference the prompts below. (Times shown ET; the web scheduler is UTC — in
summer/EDT use the UTC column.)

| Trigger | Cadence (ET) | Cron (UTC, EDT) | Max turns |
|---|---|---|---|
| Daily PE Tracker Update | Weekdays 7:00 AM | `0 11 * * 1-5` | 15 |
| Weekly PE/M&A Memo | Saturday 9:00 AM | `0 13 * * 6` | 20 |

---

## TRIGGER 1 — Daily Tracker Update (the loop action)

**Branch:** `claude/eloquent-pasteur-id8nr1`

```
You are continuing the MI PE Tracker daily update cadence (next cycle in the sequence).

Source document (canonical): MI PE Tracking System v1.xlsx in
My Drive → Market research → Financial markets (file ID: 1WnTvf-CKyj-p8FSZQBDQEEn6ISFj1Fne).
Working layer: tracker/MI_PE_Tracker.md. Drive companion folder ID: 1UpoxDkHNnDbPEWOJFb8TUN7UYu-JUUGF.

Tasks (≤15 research loops):
1. Read tracker/MI_PE_Tracker.md to find the last completed cycle number; increment it.
2. RESEARCH THE NEWS ONLINE from reputable sources (CNBC, Reuters, Bloomberg, TheStreet,
   WSJ, PwC, FT, official Fed/Treasury, PE Hub, Wikipedia for event timelines). Gather, for
   the most recent completed trading day:
   - S&P 500 + Nasdaq + Dow close and % move
   - WTI + Brent crude price
   - 10Y Treasury yield + any Fed/Fedspeak
   - Any new PE / M&A deal announcements
   - Geopolitical / supply-chain developments material to the tracked theses
   Verifiable data only — no fabricated figures; flag any gaps explicitly. Never delete history.
3. Append new rows to sections 2 (S&P Tracker), 2b (Oil Tracker), and 3 (Sector Intelligence
   Log). Refresh the Status Board (section 1). Flag thesis changes in section 4. Update
   portfolio implications (section 5) if warranted. Add all sources to section 6.
4. UPDATE THE GOOGLE DRIVE SPREADSHEETS (NOT Google Docs — use structured spreadsheets so the
   numbers are queryable "actual knowledge"). Two canonical companion spreadsheets live in the
   Financial markets folder (parentId 1UpoxDkHNnDbPEWOJFb8TUN7UYu-JUUGF):
   - "MI PE Tracker — Market Data (Cycles 1-3)" (id 1C-YKZ8ho4YseFyEuBUMko-3SV-JbvXij2GiSNadn9QI)
     Columns: Date, Cycle, S&P 500 Close, S&P Daily %, Nasdaq Close, Nasdaq Daily %, Dow Daily %,
     WTI, Brent, 10Y Yield, Fed Funds, Signal, Key Note, Source
   - "MI PE Tracker — Deal Register & Signals (Cycles 1-3)" (id 1QdS3RAVEm0faQWdZWVC6Fjv74bZnVp63DPnDBkhtH2g)
     Columns: Date, Sector, Headline, Acquirer/Sponsor, Target, Value, Signal, Impact, Source
   Append this cycle's rows. The Drive MCP create_file tool cannot append in place, so the
   pattern is: read the existing sheet, add the new row(s), and re-create the spreadsheet via
   create_file (contentMimeType text/csv → converts to a Google Sheet) with the full cumulative
   data and an updated title "...(through Cycle N)". Keep ONE Market Data sheet and ONE Deal
   Register sheet as the rolling source of truth — do not spawn a new doc per cycle. Always use
   text/csv (spreadsheet), never text/plain (doc). Preserve all empty cells (consecutive commas)
   so columns stay aligned.
5. UPDATE THE CANONICAL WORKBOOK `MI_PE_Tracking_System.xlsx` (repo root) — the real 5-tab
   structure and now the primary loop target. Load it with openpyxl, append this cycle's rows to:
   - "Master Log MI_PE" (Date, S&P 500, S&P Δ%, Nasdaq, Nasdaq Δ%, WTI, Brent, AI/Tech Signal,
     M&A/PE Signal, Healthcare Signal, Defense Signal, Oil Signal, Key Macro Theme, Notes)
   - "S&P 500 Tracker" (Date, Close, Daily Δ, Daily Δ%, 5-Day MA, 7-Day MA, MTD%, Signal, YTD Context, Notes)
   - "Oil Tracker" (Date, WTI, Brent, WTI-Brent Spread, WTI Δ%, Brent MTD%, Brent YoY%, Geo Driver)
   - "Sector Intelligence Log" (Date, Sector, Category, Headline, Value/Metric, Signal, Source/Context, Impact)
   Update "Master Log MI_PE"!A2 timestamp each touch. Never delete rows; flag any gap, never fabricate.
   Continuous coverage is Apr 20 2026 → today (May 6–Jun 4 backfilled with verified milestones).
6. Commit tracker/MI_PE_Tracker.md AND MI_PE_Tracking_System.xlsx with message
   "tracker: Cycle #N update (YYYY-MM-DD)" and push to branch claude/eloquent-pasteur-id8nr1.

Stop after 15 research-update loops.
```

---

## TRIGGER 2 — Weekly Memo

**Branch:** `claude/eloquent-pasteur-id8nr1`

```
Produce the weekly PE/M&A memo for the week just ended.

Source: tracker/MI_PE_Tracker.md (working layer). Canonical: MI PE Tracking System v1.xlsx
(My Drive → Market research → Financial markets).

Tasks:
1. Read tracker/MI_PE_Tracker.md to gather the week's data.
2. RESEARCH THE NEWS ONLINE from reputable sources for any final/late-breaking market and
   PE/M&A news for the week.
3. Write memos/Weekly_Memo_YYYY-MM-DD.md (Saturday's date) in the 10-section format:
   1. Executive Summary (5 bullets, durable vs noise)
   2. Biggest Market Changes This Week
   3. PE & M&A Activity Worth Watching
   4. Outlier Opportunities That Strengthened
   5. Opportunities That Weakened / Became Crowded
   6. Signals to Monitor Next Week
   7. Long-Term (10–20 Year) Portfolio Implications
   8. Suggested Positioning (Core / Opportunistic / Avoid)
   9. Highest-Conviction Idea This Week
   10. Biggest Risk to the Current Thesis Map
4. UPDATE GOOGLE DRIVE — SPREADSHEETS ONLY (no Google Docs): append that week's numeric rows
   to BOTH canonical Google Sheets in the Financial markets folder:
   - Market Data sheet (id 1C-YKZ8ho4YseFyEuBUMko-3SV-JbvXij2GiSNadn9QI): add daily equity/oil/rates rows
   - Deal Register sheet (id 1QdS3RAVEm0faQWdZWVC6Fjv74bZnVp63DPnDBkhtH2g): add any new deals/signals
   Use contentMimeType text/csv → Google Sheets conversion. Read existing sheet data first, append
   new rows, re-create with full cumulative data. Title pattern: "MI PE Tracker — Market Data
   (through Cycle N)" and "MI PE Tracker — Deal Register & Signals (through Cycle N)".
   NO Google Docs — all Drive output is spreadsheets.
5. Create a Gmail draft to ibernard1116@gmail.com, subject
   "Weekly PE/M&A Memo — Week ending [Friday date]", body = the memo.
6. Commit memos/Weekly_Memo_YYYY-MM-DD.md and push to claude/eloquent-pasteur-id8nr1.
```

---

## Conventions (inherited from the canonical sheet)
- Verifiable data only — no fabricated figures; gaps explicitly flagged.
- Never delete historical rows; the loop only appends.
- "🟡 NEW" marks rows added in the current cycle.
- Git history is the non-destructive change log.

## Manual run log
| Cycle | Date | Notes |
|---|---|---|
| 1 | 2026-06-22 | Decoded canonical sheet (last logged Jun 5); extended → Jun 18. |
| 2 | 2026-06-22 | Jun 18 close confirmed 7,500.58; H1 PE context; Drive companion created. |
| 3 | 2026-06-23 | Jun 22 close; Nasdaq-100 rebalance; Montagu/BMC + NextEra/Caliber deals; oil premium fading. |

## Drive output switched to spreadsheets (2026-06-23)
Per user direction, numeric data now goes into **Google Sheets** (not Docs) for queryable "actual knowledge":
- **Market Data sheet:** https://docs.google.com/spreadsheets/d/1C-YKZ8ho4YseFyEuBUMko-3SV-JbvXij2GiSNadn9QI/edit
- **Deal Register sheet:** https://docs.google.com/spreadsheets/d/1QdS3RAVEm0faQWdZWVC6Fjv74bZnVp63DPnDBkhtH2g/edit

Both seeded with Cycles 1–3. Future cycles append to these same two sheets (rolling source of truth).
