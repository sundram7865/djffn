# Plan: UK Wind Forecast Decision Tool (pilot)

## 1. Problem in one paragraph

A UK utility's day-ahead buying team has to lock in purchases on **D-1** for delivery day **D**.
Whatever wind does not deliver has to be bought elsewhere. The team therefore needs:

1. **What will wind give me tomorrow?** The latest national wind forecast that was *actually available* at the
   moment the decision had to be made (never a later revision).
2. **How wrong could it be?** A quantified error profile of those forecasts so they can carry a buffer.

Data: Elexon BMRS only: `FUELHH` (actual, `fuelType=WIND`) and `WINDFOR` (forecast, many versions per target).
Scope: purchase decisions made in **January 2026**.

## 2. Key assumptions (all configurable / documented)

| Topic | Decision | Why |
|---|---|---|
| Decision cutoff | **09:20 UK local time on D-1** by default (EPEX SPOT GB 60-min day-ahead auction gate closure). Presets: 09:50 (Nord Pool N2EX GB day-ahead), 15:30 (EPEX GB 30-min auction). Any HH:MM is accepted by API and UI. | Earliest of the two main GB hourly day-ahead auctions; a team bidding in either must have its view by then. Conservative: never uses information that would not have been available. |
| Selection rule | For each target time in D: the forecast with the **max `publishTime` such that `publishTime <= cutoff`**. | Exactly what a trader could have seen. Published *at* the cutoff counts as available. |
| Delivery day | GB settlement day, 00:00–24:00 **Europe/London** local time. | Matches Elexon settlement periods 1–48. |
| Time zones | All storage and computation in **UTC**; cutoff is defined in Europe/London and converted with `zoneinfo`. January is GMT, so local = UTC, but the code is DST-safe. | Avoids silent off-by-one-hour bugs. |
| Scope | Decisions (cutoffs) in January 2026 → delivery days **2 Jan – 1 Feb 2026** (31 days). | "Decisions made in January": the 31 Jan decision delivers on 1 Feb; 1 Jan delivery was decided in December. |
| Resolution | WINDFOR is **hourly**, FUELHH is **half-hourly**. Score on the 24 hourly timestamps where both exist (join on `startTime`, as the brief specifies). The `:30` actuals are displayed but not scored. | No invented forecast values. Sensitivity check vs. hourly-mean actual is documented (<1% MAE difference). Also matches hourly day-ahead auction products. |
| Error sign | `error = forecast − actual`. Positive = forecast too high = **wind shortfall** → buyer is short. | Shortfall is the expensive side for a buyer, so it is reported separately. |
| Data access | Snapshot ingested once from Elexon, validated, committed as CSV + manifest. Deployed app never calls Elexon. | January 2026 is historical; makes the app fast, deterministic and demo-proof. |

## 3. Architecture

```
Elexon API ──(scripts/ingest.py, once)──► backend/data/*.csv + manifest.json (committed)
                                                │
                     FastAPI (pandas, pure functions, in-memory cache)
                       core/selection.py   cutoff → selected forecast per target
                       core/metrics.py     MAE/RMSE/bias/MAPE/WAPE, percentiles, breakdowns
                       core/insights.py    computed plain-language guidance
                       api/routes.py       /api/meta /api/forecast /api/accuracy /api/horizon /api/cutoffs
                                                │ JSON
                React + TypeScript (Vite, Tailwind, Recharts, TanStack Query)
                  View 1 "Tomorrow's wind"   View 2 "Forecast accuracy"   Methodology drawer
```

- **Docker**: one multi-stage image (node build → python runtime that serves API + static SPA); `docker compose up`.
- **Deployment**: Vercel (free tier). Static Vite build + one Python function (`api/index.py`) that mounts the same
  FastAPI app; rewrites `/api/*` to it. `heroku.yml` provided as a container-based alternative.
- **CI**: GitHub Actions: ruff (lint + format check), pytest, eslint, prettier check, tsc, vitest, build.

## 4. Data model

- `forecasts.csv`: `publish_time, start_time, generation_mw` (UTC ISO, unique on (publish, start)).
- `actuals.csv`: `start_time, settlement_date, settlement_period, generation_mw` (UTC, unique on start).
- `manifest.json`: source URLs, query windows, fetched-at, raw/clean row counts, duplicates dropped, gaps, checksums.

## 5. API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/meta` | scope, default cutoff, presets, bands, sign convention, data-quality summary |
| `GET /api/forecast?date&cutoff` | View 1: selected forecast for one delivery day, KPIs, planning band, actuals (reveal), DQ |
| `GET /api/accuracy?start&end&cutoff` | View 2: joined series, KPIs, percentiles, histogram, by hour/level/day, insight, DQ |
| `GET /api/horizon?start&end` | error vs forecast age using **all** forecast versions |
| `GET /api/cutoffs?start&end` | metric sweep over cutoff times on D-1 (every 30 min) + preset comparison |

## 6. Milestones (vertical slices, commit after each)

1. Plan + API exploration notes (this file, `docs/DATA_NOTES.md`).
2. Ingestion script + committed snapshot + validation.
3. Selection logic + exhaustive unit tests (exact-cutoff, multiple versions, missing, day boundaries, DST).
4. Metrics + insights + independent-calculation tests.
5. FastAPI endpoints + API tests.
6. Frontend shell, design system, View 1.
7. View 2 (accuracy, distribution, breakdowns, horizon, cutoff comparison).
8. Docker, CI, lint/format, Vercel/Heroku config.
9. Docs: README, ARCHITECTURE, VIDEO_SCRIPT, SUBMISSION_CHECKLIST. Final verification.

## 7. Out of scope (documented as next steps)

Live refresh/scheduling, other renewables, embedded generation, price data, probabilistic model training,
auth, per-user saved settings.
