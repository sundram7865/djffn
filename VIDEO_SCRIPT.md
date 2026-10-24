# Video script (10 minutes maximum)

## What the assignment asks for
- **One video, 10 minutes maximum**, uploaded to YouTube as **Unlisted**.
- **Part 1, up to 5 minutes:** present the app to the **customer** as the result of a pilot project.
  Goal: impress them and show business value.
- **Part 2, up to 5 minutes:** explain the work to a **tech lead**: architecture, design, analysis, code,
  and good practices. Goal: make the review easy and hand over the knowledge.
- **The evaluation starts with the video**, so it is the most important deliverable.

## Plan
Part 1 ≈ **4:45**, Part 2 ≈ **4:45**, about 30 seconds spare.
All numbers below are real results from the app (09:20 cutoff, delivery days 2 Jan – 1 Feb 2026).

**[SHOW]** = what is on screen · **[DO]** = what you click · **[SAY]** = what you say (read it naturally,
you don't need every word).

---

## Part 1: For the customer (0:00 – 4:45)

### 0:00 – 0:25 · The problem
**[SHOW]** The app, *Tomorrow's wind* tab, 15 Jan 2026.
**[SAY]** "Every morning, your team has until 09:20 to buy tomorrow's electricity in the day-ahead
auction. Wind is the biggest unknown. If wind comes in lower than expected, you are short, and you have
to buy the gap later at expensive prices. We built WindDesk to answer two questions: how much wind will I
get tomorrow, and how wrong could that number be?"

### 0:25 – 1:25 · How much wind tomorrow?
**[SHOW]** The top card and the five number tiles.
**[SAY]** "Imagine it's Wednesday morning, 14 January, and you're buying for Thursday. WindDesk shows
exactly what you could see at that moment: the forecast published at 07:30, 1 hour 50 minutes before the
09:20 auction closes. Not a later update, and no hindsight.
For Thursday, wind is expected to give 278.6 GWh. It peaks at 15.8 GW at midnight and drops to about 8.9 GW
by 4 pm."
**[DO]** Move the mouse over the chart around 16:00.
**[SAY]** "The light blue band is the planning range: where real wind ended up 8 times out of 10 on
similar hours. The bottom of the band is the firm wind, 180.6 GWh, the amount you can count on 9 times
out of 10."
**[SHOW]** The *Position guidance* card.
**[SAY]** "So the advice is simple: to be safe 9 hours out of 10, plan for about 4.1 GW less wind than the
forecast says."

### 1:25 – 1:55 · You can trust it: no hindsight
**[SHOW]** *Why this forecast?* (the timeline and the grey/blue lines).
**[SAY]** "The wind forecast is updated eight times a day. Here are all of Wednesday's updates. The three
before the auction closed were available, and we use the newest, from 07:30. The five after the close
didn't exist yet when you had to buy, so WindDesk never uses them. That's why our accuracy numbers are
honest."

### 1:55 – 2:20 · What really happened
**[DO]** Click **Reveal what actually happened**.
**[SAY]** "Looking back: wind delivered 253.6 GWh, 25 GWh less than forecast. But 96% of the hours stayed
inside the planning range. That's exactly what the range is for."

### 2:20 – 3:30 · How wrong can it be?
**[DO]** Click the **Forecast accuracy** tab (full pilot).
**[SHOW]** The findings panel and the number tiles.
**[SAY]** "Across all 31 January decisions, the forecast was usually off by about 2 GW, around 18% of
wind output. The direction matters even more: in 85% of hours the forecast was too high, by 1.75 GW on
average. For a buyer, that means being short again and again.
To be covered 9 hours out of 10, you'd need a 4.15 GW safety buffer. And in 1 hour out of 20, the miss
was more than 5.3 GW."
**[SHOW]** The *Forecast vs actual* chart (red = wind fell short), then *Error by wind level*.
**[SAY]** "And the error grows with the wind. When the forecast is low, under 8 GW, it's too high by only
0.3 GW. When it's high, over 14 GW, it's too high by 2.5 GW, with a safe buffer of 4.7 GW. So the buffer
should depend on how windy the forecast is, not be one fixed number."

### 3:30 – 4:05 · Bad days
**[SHOW]** The *Daily accuracy* calendar. **[DO]** Click **28 Jan** (the darkest square).
**[SAY]** "Some days are very bad. On 28 January the forecast said 267 GWh and wind gave only 138, about
half. The calendar shows these days, and one click opens the exact forecast you would have bought on."
**[DO]** Show the day briefly, then go back to *Forecast accuracy*.

### 4:05 – 4:30 · Does deciding later help?
**[SHOW]** *Compare cutoff choices*.
**[SAY]** "We also checked the timing. Deciding at 09:50 instead of 09:20 improves accuracy by only about
1%. The 15:30 auction improves it by 8%. So the big win is not the timing. It's correcting the forecast's
habit of being too high."

### 4:30 – 4:45 · Close
**[SAY]** "So in one screen you see tomorrow's wind as it was at decision time, a firm amount you can plan
on, and a safety buffer based on evidence. Next, we'd add a full year of history and turn this finding
into a corrected forecast your team can trade on."

---

## Part 2: For the tech lead (4:45 – 9:30)

### 4:45 – 5:15 · The big picture
**[SHOW]** `docs/ARCHITECTURE.md` on GitHub (the diagram).
**[SAY]** "The backend is Python with FastAPI, and the frontend is React with TypeScript. A script
downloads the Elexon data once, checks it, and saves it in the repo. When the app runs, it never calls
Elexon. It works from this saved copy in memory, about 20,000 rows, so answers come back in milliseconds.
The same app runs in Docker or on Vercel."

### 5:15 – 5:50 · What the data really looks like
**[SHOW]** `docs/DATA_NOTES.md`.
**[SAY]** "Before writing code, I called the real API and studied the data. Three things shaped the design.
First, forecasts are hourly but actual wind is half-hourly, so we compare on the hour; I checked that this
changes the result by less than 1%. Second, there are eight forecast updates a day, each covering about
three days, so any cutoff on the day before covers the whole delivery day, except cutoffs before
02:30, which leave the last two hours empty, and the app warns about that. Third, one update on
15 January was 55 minutes late, and the app shows that too."

### 5:50 – 6:55 · The key rule in code
**[SHOW]** `backend/app/core/selection.py`, first `cutoff_utc`, then `select_forecasts`.
**[SAY]** "This is the heart of the system. For every hour, we take the newest forecast published at or
before the cutoff. The cutoff is set in UK time and converted properly, so it still works when the clocks
change. Each hour uses the cutoff of its own day, so nothing leaks across midnight. We filter, sort, and
keep the newest per hour. If the newest update is missing an hour, we fall back to the previous update for
that hour. Missing data stays visible instead of disappearing."
**[SHOW]** `backend/tests/test_selection.py`, scrolling through the test names.
**[SAY]** "The tests cover a forecast published exactly at the cutoff, one second after it, several
versions, missing versions, midnight boundaries, summer time, short and long clock-change days, and a
brute-force check on the real data."

### 6:55 – 7:35 · The numbers and how we check them
**[SHOW]** `backend/app/core/metrics.py`, then `backend/app/core/insights.py`.
**[SAY]** "Error is forecast minus actual, so positive means the buyer is short. Alongside the usual MAE,
RMSE and bias, we show the numbers a buyer actually needs: how often they were short, and the 9-in-10
safety buffer. MAPE is included but marked unreliable at low wind, and WAPE is the safer percentage. The
English sentences are built from the computed numbers, never typed in by hand, and a test checks that."
**[SHOW]** `backend/tests/test_api.py`, the `independent_scores` function.
**[SAY]** "To prove the numbers on screen are right, this test recalculates them from the raw files using
only basic Python, not the app's code, and compares the results for three cutoffs."

### 7:35 – 8:15 · API and website
**[SHOW]** `/api/docs` (the automatic API page), then the `frontend/src` folders and `views/ForecastView.tsx`.
**[SAY]** "There are six read-only API endpoints, each with a typed response, input checks and caching. The
website keeps the old data on screen while new data loads, so nothing flickers, and it saves your choices
in the URL so any view can be shared as a link. All charts follow one design style, with colours checked
for colour-blind users, a table view for every chart, light and dark mode, and a help tooltip on every
number."

### 8:15 – 8:55 · How we work
**[SHOW]** `.github/workflows/ci.yml`, then a terminal running `docker compose up --build`.
**[SAY]** "Every push runs the checks automatically: code style, type checks and 92 backend tests, plus
lint, formatting, 19 tests and a build for the frontend. Then it builds the Docker image and checks that
it actually starts and answers. Running it locally is one command: `docker compose up`. On Vercel, the
same backend runs as a serverless function next to the website. I tested the Vercel build before deploying.
Commits are small and clearly named."

### 8:55 – 9:30 · Trade-offs and next steps
**[SAY]** "The main trade-off is a saved copy of the data instead of live data. That's right for a pilot
about the past, and the download script is the path to automatic daily updates. Limits: national wind
only, we can't yet explain why the forecast runs high, and one month is a small sample. Next steps: a year
of history, curtailment data to explain the bias, a corrected forecast, and a database plus a scheduler
for production. Thank you. The README explains how to run and review everything."

---

## Checklist before you record
- [ ] The Vercel link works in an **incognito** window: `/`, `/api/health`, `/api/docs`.
- [ ] Browser zoom 100–110%, screen 1920×1080, bookmarks bar hidden, notifications off, extra tabs closed.
- [ ] Open these tabs in order:
  1. `<URL>/?view=forecast&day=2026-01-15&cutoff=09:20`
  2. `<URL>/?view=accuracy&cutoff=09:20`
  3. GitHub → `docs/ARCHITECTURE.md`
  4. GitHub → `docs/DATA_NOTES.md`
  5. `<URL>/api/docs`
- [ ] VS Code open with: `core/selection.py`, `tests/test_selection.py`, `core/metrics.py`,
      `core/insights.py`, `tests/test_api.py`, `frontend/src/views/ForecastView.tsx`,
      `.github/workflows/ci.yml`.
- [ ] Run `docker compose up --build` once beforehand, so it starts quickly on camera.
- [ ] Click through the live app once before recording, so the first load isn't slow on camera.
- [ ] Test your microphone; record at 1080p (OBS or Loom).
- [ ] Keep a timer visible: finish Part 1 by **4:50** and the whole video by **9:50**.
- [ ] Upload to YouTube as **Unlisted** and check the link in incognito.
