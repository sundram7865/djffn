# Data notes — Elexon BMRS FUELHH & WINDFOR

All findings below come from calling the live API (base `https://data.elexon.co.uk/bmrs/api/v1`) and the
published OpenAPI spec (`https://data.elexon.co.uk/swagger/v1/swagger.json`). Nothing here is assumed from
memory. Numbers marked *(snapshot)* are reproduced by `backend/scripts/profile_snapshot.py`.

## 1. Endpoints and parameters

| Dataset | Endpoint | Filters (from OpenAPI) |
|---|---|---|
| Actuals | `GET /datasets/FUELHH/stream` | `publishDateTimeFrom/To` **or** `settlementDateFrom/To` (not both), `settlementPeriod[]`, `fuelType[]` |
| Forecast | `GET /datasets/WINDFOR/stream` | `publishDateTimeFrom/To` only. With no filter it returns only the latest run. |

- No auth / API key needed. Responses are plain JSON arrays (no envelope).
- A full month of WINDFOR (`~21k` rows, 2.4 MB) returned in ~2.6 s in one call. The ingestion still chunks by
  7 days to be gentle and resilient.

## 2. Schemas (as returned)

**FUELHH**
```json
{"dataset":"FUELHH","publishTime":"2026-01-03T00:00:00Z","startTime":"2026-01-02T23:30:00Z",
 "settlementDate":"2026-01-02","settlementPeriod":48,"fuelType":"WIND","generation":14202}
```
- `startTime`, `publishTime`: ISO-8601 **UTC** (`Z` suffix). `settlementDate`: local GB date string.
- `generation`: integer MW (average over the 30-minute settlement period).
- Resolution: **30 minutes**. `publishTime = startTime + 30 min` (published at end of period).
- In January (GMT) settlement period 1 starts at 00:00Z and period 48 at 23:30Z, so
  `startTime.date() == settlementDate` for every row.

**WINDFOR**
```json
{"dataset":"WINDFOR","publishTime":"2026-01-01T11:30:00Z","startTime":"2026-01-01T00:00:00Z","generation":19960}
```
- `startTime`, `publishTime`: ISO-8601 **UTC**. `generation`: integer MW.
- Resolution: **hourly** — every `startTime` is on the hour (`:00`). This is a **resolution mismatch** with FUELHH.

## 3. WINDFOR publication pattern

- **8 runs per day** at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC.
- Every run has **73 hourly values** covering a fixed window: **21:00 on (publish day − 1) to 21:00 on
  (publish day + 2)** UTC. So all runs on the same day share the same target window.
- Horizon (`startTime − publishTime`) ranges from **−25.5 h** (back-cast of already-started hours) to **+66.5 h**.
  Negative-horizon values are ignored for decision analysis.
- Irregularity found: on **15 Jan 2026 the 11:30 run was published at 12:25** (55 min late). It does not affect the
  default cutoff but is surfaced as a data-quality note.
- No duplicate `(publishTime, startTime)` pairs; no null generation values; snapshot range 2,250–21,353 MW
  *(snapshot)*.
- Runs genuinely update: for overlapping targets, a run differs from the previous run by **273 MW on average**
  *(snapshot)*; only ~0–6 % of runs are exact republications of the previous values.

### What this means for the decision
For a cutoff on D-1, the forecast run selected is:

| Cutoff (UK, D-1) | Run used | Horizon to delivery day D |
|---|---|---|
| 09:20 (EPEX GB DA 60-min) | 07:30 | 16.5 h – 39.5 h |
| 09:50 (N2EX GB DA) | 09:30 | 14.5 h – 37.5 h |
| 15:30 (EPEX GB DA 30-min) | 15:30 (published exactly at the cutoff → included) | 8.5 h – 31.5 h |

Every run published on D-1 covers all 24 hours of D, so with a D-1 cutoff there are no structural gaps.
(With a D-2 cutoff, hours 22:00–23:00 of D would *not* be covered — a real edge case the code handles.)

## 4. FUELHH quality

- Window 31 Dec 2025 – 2 Feb 2026: 1,632 rows, exactly 48 per settlement date, no duplicate `startTime`,
  no gaps in the half-hour grid. Min 1,695 MW, max 17,805 MW.
- The ingestion still de-duplicates (keeping the latest `publishTime`) in case of revisions.

## 5. Day-ahead market timing (researched)

| Auction | Gate closure (UK local, D-1) | Source |
|---|---|---|
| EPEX SPOT GB day-ahead, 60-min products | **09:20**, results from 09:30 | EPEX trading brochure; moved from 11:00 after Brexit (Jan 2021) |
| Nord Pool N2EX GB day-ahead | **09:50**, results by 10:00 | Nord Pool support article "About the N2EX day-ahead auction" |
| EPEX SPOT GB day-ahead, 30-min products | **15:30**, results from 15:45 | EPEX trading brochure |

The default cutoff is **09:20** (earliest gate closure); the others are one-click presets and any time can be entered.

## 6. Scope reasoning

"Purchase decisions made in January 2026" → decision times (cutoffs) on 1–31 Jan → delivery days **2 Jan – 1 Feb**.
Data fetched accordingly:

- WINDFOR runs published 30 Dec 2025 00:00Z → 2 Feb 2026 00:00Z. Earlier runs feed the long-horizon analysis.
  Runs on 1 Feb are used *only* in the forecast-age analysis (short horizons for 1 Feb targets), never for a decision.
- FUELHH settlement dates 1 Jan – 1 Feb 2026.

## 7. Findings (default 09:20 cutoff, 31 delivery days, 744 scored hours) *(snapshot)*

| Metric | Value |
|---|---|
| MAE / RMSE | 2,022 MW / 2,497 MW (WAPE 17.9 % of wind energy) |
| Bias (forecast − actual) | **+1,746 MW** — forecast too high in **85 %** of hours |
| 9-in-10 shortfall buffer (P90 of error) | 4,154 MW; 1-in-20 (P95) 5,268 MW; worst hour 6,894 MW |
| Bias by forecast level | < 8 GW: +325 MW · 8–14 GW: +1,527 MW · ≥ 14 GW: +2,513 MW |
| 9-in-10 buffer by level | < 8 GW: 1,887 MW · 8–14 GW: 3,638 MW · ≥ 14 GW: 4,660 MW |
| Later cutoffs | 09:50 → MAE 1,996 MW (−1.3 %) · 15:30 → 1,859 MW (−8.1 %) · 23:30 → 1,807 MW |
| Forecast age | MAE 1,654 MW at 0–6 h → 2,151 MW at 36–42 h → 2,319 MW at 42–48 h |
| Worst / best days | 28 Jan MAE 5,329 MW · 12 Jan 4,875 MW · 19 Jan 684 MW (the only clearly under-forecast day) |
| Early-cutoff gap | Cutoffs before 02:30 on D-1 leave 22:00–23:00 of D uncovered (682 of 744 hours) |

- The over-forecast grows with wind level. Plausible causes include **curtailment / constraint actions** (metered
  output is post-curtailment) and **coverage differences** between the two datasets. Elexon WIND data alone cannot
  separate these, so the app reports the bias and does not claim a cause.
- **Resolution sensitivity:** scoring against the mean of both half-hours in the hour instead of the half-hour that
  starts on the hour changes MAE by < 1 % (2,039 vs 2,022 MW). Joining on `startTime` is therefore safe.
- Wind-level bands (by **forecast**, because that is what a buyer knows when deciding): Low < 8 GW,
  Medium 8–14 GW, High ≥ 14 GW — roughly balanced in January (140 / 268 / 336 hours).
