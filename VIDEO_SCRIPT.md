# Video script (≤ 10:00 total)

Two parts recorded back to back. **Part 1 ≈ 4:45** (customer pitch), **Part 2 ≈ 4:45** (tech lead
walkthrough). That leaves 30 s of slack. Speak to the timings, not the exact words. The numbers below are
real outputs of the app (09:20 cutoff, delivery days 2 Jan – 1 Feb 2026).

Abbreviations: **[SHOW]** what's on screen, **[DO]** the action, **[SAY]** the narration.

---

## Part 1 — Customer pitch (0:00 – 4:45)

### 0:00 – 0:25 · The problem
**[SHOW]** App home, *Tomorrow's wind*, 15 Jan 2026, light theme.
**[SAY]** "Every morning your desk has until about 09:20 to lock in tomorrow's purchases on the day-ahead
auction. Wind is the biggest unknown. Over-estimate it and you're short tomorrow, buying at whatever
the intraday and imbalance prices are. We built WindDesk to answer two questions: *what will wind give me
tomorrow*, and *how wrong could that be*?"

### 0:25 – 1:25 · What will wind give me tomorrow?
**[SHOW]** Hero card and KPI tiles.
**[SAY]** "Say it's Wednesday 14 January and you're buying for Thursday. WindDesk shows exactly what you
could see at the gate: the forecast published at **07:30, 1 hour 50 before the 09:20 EPEX gate**. Not a
later revision, not hindsight.
Thursday is forecast at **278.6 GWh**, peaking at **15.8 GW** at midnight and dropping to **8.9 GW** by
16:00."
**[DO]** Hover the chart at 16:00.
**[SAY]** "The blue band is the planning range: where actual wind landed in 8 of 10 comparable hours on
other days of the pilot. Its lower edge is the **firm wind**, **180.6 GWh**, the energy you could count
on 9 times out of 10."
**[SHOW]** Position guidance card.
**[SAY]** "So the guidance is concrete: to be covered 9 hours in 10, plan for wind to deliver about
**4.1 GW less than forecast** on average, about 98 GWh over the day."

### 1:25 – 1:55 · Trust: no hindsight
**[SHOW]** *Why this forecast?* timeline and run-versions chart.
**[SAY]** "Elexon republishes the wind forecast eight times a day. Here are all of Wednesday's runs. The
three before the gate were available; we use the newest, 07:30. The five after the gate didn't exist yet
when you had to bid, so WindDesk never uses them. That's what makes the accuracy numbers honest."

### 1:55 – 2:20 · Reveal
**[DO]** Click **Reveal what actually happened**.
**[SAY]** "With hindsight: wind delivered **253.6 GWh**, a **25 GWh shortfall**, but **96 % of hours stayed
inside the planning range**. That's what the range is for."

### 2:20 – 3:30 · How wrong could it be?
**[DO]** Switch to **Forecast accuracy** (full pilot).
**[SHOW]** Insight panel and KPI tiles.
**[SAY]** "Across all 31 January decisions: the forecast is typically off by **2.0 GW**, about 18 % of wind
output. More important is the direction: it ran **high in 85 % of hours, by 1.75 GW on average**. For a
buyer that means a systematic short position.
To cover 9 hours in 10 you'd need a **4.15 GW** buffer. In 1 hour in 20 the miss was over 5.3 GW."
**[SHOW]** Forecast-vs-actual chart (red = shortfall), then *Error by wind level*.
**[SAY]** "And the error grows with wind. When the forecast is below 8 GW, the bias is only **+0.3 GW**.
Above 14 GW it's **+2.5 GW**, with a 9-in-10 buffer of **4.7 GW**. So size the buffer to the forecast
level, not a flat number."

### 3:30 – 4:05 · Tail days
**[SHOW]** Daily calendar. **[DO]** Click **28 Jan** (darkest cell).
**[SAY]** "Some days are tail days. On 28 January the forecast said 267 GWh and wind delivered 138, about
half. The calendar flags these days, and one click opens the exact forecast you would have bought on."
**[DO]** Show the day view briefly, then go back to accuracy.

### 4:05 – 4:30 · Does deciding later help?
**[SHOW]** *Compare cutoff choices*.
**[SAY]** "We also tested the gate itself. Waiting until the 09:50 N2EX gate improves accuracy by just
**1 %**. The 15:30 half-hourly auction improves it by **8 %**. The big lever isn't timing, it's
correcting the systematic over-forecast."

### 4:30 – 4:45 · Close
**[SAY]** "So in one screen you get tomorrow's wind as it stood at the gate, a firm-wind number you can
plan on, and a buffer sized from evidence. Next we'd extend this to a full year of history and turn the
bias finding into a corrected forecast your desk can trade on."

---

## Part 2 — Tech lead walkthrough (4:45 – 9:30)

### 4:45 – 5:15 · Shape of the system
**[SHOW]** `docs/ARCHITECTURE.md` Mermaid diagram on GitHub.
**[SAY]** "FastAPI backend, React + TypeScript frontend. One offline ingestion step pulls Elexon once,
validates it, and commits a snapshot. At runtime nothing calls Elexon: the API computes from an in-memory
snapshot of about 20k rows, memoised, so responses take milliseconds and are CDN-cacheable. Same app in
Docker, Heroku or Vercel."

### 5:15 – 5:50 · What the data really looks like
**[SHOW]** `docs/DATA_NOTES.md`.
**[SAY]** "I explored the API before writing code. Three findings shaped the design. WINDFOR is
**hourly** while actuals are **half-hourly**, so we score on the hour; the sensitivity check is under 1 %.
There are **eight runs a day**, each covering 21:00 D-1 to 21:00 D+2, so any D-1 cutoff covers the whole
delivery day, but a cutoff before 02:30 leaves the last two hours uncovered, and the app reports that.
And one run on 15 January was **55 minutes late**, which also surfaces in the data-quality panel."

### 5:50 – 6:55 · The core rule
**[SHOW]** `backend/app/core/selection.py` → `cutoff_utc`, then `select_forecasts`.
**[SAY]** "The key rule: for each target hour, the forecast with the latest publish time **at or before**
the cutoff. The cutoff is defined in UK local time and converted with zoneinfo, so it's DST-safe even
though January is GMT. Each row gets the cutoff of its own delivery day, so day boundaries can't leak.
Filter, sort, take the last per target. If the newest run misses an hour we fall back to the newest older
run for that hour. Then we left-join onto the expected grid, so gaps stay visible instead of disappearing."
**[SHOW]** `backend/tests/test_selection.py`, scroll the test names.
**[SAY]** "Tests cover exactly-at-cutoff, one second after, multiple versions, fallback, day boundaries,
BST, 23 and 25 hour days, and a brute-force cross-check on the real data."

### 6:55 – 7:35 · Metrics and insight text
**[SHOW]** `core/metrics.py` → `error_summary`; `core/insights.py`.
**[SAY]** "Metrics are pure numpy. The sign convention is forecast minus actual, so positive means short.
Alongside MAE, RMSE and bias, the buyer-facing numbers are the shortfall percentiles and the 9-in-10
buffer. MAPE is there but flagged; WAPE is the robust relative metric. The insight sentences are generated
from these numbers and never hard-coded. A test asserts the text contains exactly the computed values."
**[SHOW]** `tests/test_api.py` → `independent_scores`.
**[SAY]** "To make sure the UI numbers are right, this test recomputes MAE, bias, RMSE and percentiles
from the raw CSVs using only the standard library, and compares with the API for three cutoffs."

### 7:35 – 8:15 · API and frontend
**[SHOW]** `/api/docs` (Swagger), then `frontend/src` tree, `views/ForecastView.tsx`.
**[SAY]** "Six read-only endpoints with Pydantic response models, input validation and cache headers. The
frontend uses TanStack Query, keeps previous data on refetch so there's no flicker, and stores state in
the URL so any view is shareable. Charts follow one design system: a palette validated for colour-vision
deficiency, a table view for every chart, light and dark themes, and tooltips explaining every metric in
plain language."

### 8:15 – 8:55 · Practices
**[SHOW]** `.github/workflows/ci.yml`, then a terminal running `docker compose up --build`.
**[SAY]** "CI runs ruff, mypy and 92 pytest tests for the backend, plus eslint, prettier, tsc, Vitest and a
build for the frontend, then builds the Docker image and smoke-tests it. Locally it's one command:
`docker compose up`. The Vercel deployment re-exports the same FastAPI app as a Python function next to
the static build, and I verified it with `vercel build` before deploying. Commits are small conventional
commits."

### 8:55 – 9:30 · Trade-offs and next steps
**[SAY]** "Main trade-off: a committed snapshot rather than live data. That's right for a historical pilot,
and the ingestion script is the path to a scheduled refresh. Known limits: national transmission wind
only; we can't yet tell whether the bias is curtailment or coverage; and one month is a small sample for
tails. Next: a year of backfill, curtailment data to explain the bias, a bias-corrected forecast, and
Postgres plus a scheduler for production. Thanks — the README has everything needed to run and review it."

---

## Pre-recording checklist

- [ ] Deployed URL works in an **incognito** window (`/`, `/api/health`, `/api/docs`).
- [ ] Browser at 100–110 % zoom, 1920×1080, bookmarks bar hidden, notifications off, other tabs closed.
- [ ] Tabs ready in order:
  1. `<URL>/?view=forecast&day=2026-01-15&cutoff=09:20`
  2. `<URL>/?view=accuracy&cutoff=09:20`
  3. GitHub repo → `docs/ARCHITECTURE.md` (Mermaid renders on GitHub)
  4. GitHub repo → `docs/DATA_NOTES.md`
  5. `<URL>/api/docs`
- [ ] VS Code open with: `core/selection.py`, `tests/test_selection.py`, `core/metrics.py`,
      `core/insights.py`, `tests/test_api.py`, `frontend/src/views/ForecastView.tsx`, `.github/workflows/ci.yml`.
- [ ] A terminal with `docker compose up --build` already run once (cached), for a quick live start.
- [ ] Do one warm-up click through the deployed app, so the first API call isn't a cold start on camera.
- [ ] Microphone level checked; screen recorder (OBS / Loom) at 1080p, 30 fps.
- [ ] Stopwatch visible: Part 1 must end by **4:50**, the whole video by **9:50**.
- [ ] Upload to YouTube as **Unlisted**; check the link in incognito.
