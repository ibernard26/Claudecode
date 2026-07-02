# /daily-report

Execute the full MI PE Tracker daily cycle. Run this every weekday morning (or on-demand).

## What this command does

1. **Determine cycle number** — read `tracker/MI_PE_Tracker.md`, find the last cycle number, increment.
2. **Research news** from reputable sources (CNBC, Reuters, Bloomberg, TheStreet, WSJ, FT, Fed.gov, PE Hub, Wikipedia). For the most recent completed trading day gather:
   - S&P 500, Nasdaq, Dow: close price and % move
   - WTI and Brent crude prices
   - 10Y Treasury yield + any Fed / Fedspeak
   - New PE / M&A deal announcements
   - Geopolitical / supply-chain developments material to tracked theses
   Verifiable data only — no fabricated figures; flag gaps explicitly; never delete historical rows.
3. **Update `tracker/MI_PE_Tracker.md`**:
   - Append row(s) to Section 2 (S&P Tracker) and Section 2b (Oil Tracker)
   - Append signals to Section 3 (Sector Intelligence Log)
   - Refresh Section 1 (Status Board — overwrite current snapshot)
   - Flag any thesis direction changes in Section 4
   - Append sources to Section 6
4. **Update Google Drive spreadsheets** (spreadsheets only — no Docs):
   - Read existing **Market Data** sheet (ID `1C-YKZ8ho4YseFyEuBUMko-3SV-JbvXij2GiSNadn9QI`)
   - Read existing **Deal Register** sheet (ID `1QdS3RAVEm0faQWdZWVC6Fjv74bZnVp63DPnDBkhtH2g`)
   - Append new rows to each, then re-create both as Google Sheets via `create_file` with `contentMimeType: text/csv`
   - Updated titles: `MI PE Tracker — Market Data (through Cycle N)` and `MI PE Tracker — Deal Register & Signals (through Cycle N)`
   - Drive folder: `1UpoxDkHNnDbPEWOJFb8TUN7UYu-JUUGF`
5. **Update the canonical workbook** — append this cycle's rows to `MI_PE_Tracking_System.xlsx`
   (repo root) across its 5 tabs (Master Log MI_PE, S&P 500 Tracker, Oil Tracker, Sector
   Intelligence Log) via openpyxl; update the Master Log A2 timestamp. Never delete rows; flag
   gaps, never fabricate. This is the primary structured loop target.
6. **Write outputs** — save a dated summary to `outputs/daily-brief-YYYY-MM-DD.md`
6. **Commit and push**:
   ```
   git add tracker/MI_PE_Tracker.md outputs/daily-brief-YYYY-MM-DD.md
   git commit -m "tracker: Cycle #N update (YYYY-MM-DD)"
   git push -u origin claude/eloquent-pasteur-id8nr1
   ```

## Canonical source
`MI PE Tracking System v1.xlsx` · Drive file ID `1WnTvf-CKyj-p8FSZQBDQEEn6ISFj1Fne`
Last canonical entry: June 5, 2026

## Stop conditions
- All required tracker sections refreshed ✓
- Both Drive spreadsheets updated ✓
- `outputs/daily-brief-YYYY-MM-DD.md` written ✓
- Committed and pushed ✓

## Conventions
- Never delete historical rows
- `🟡` × cycle-number marks new rows
- Durable vs noise label on every signal
- Verifiable data only
