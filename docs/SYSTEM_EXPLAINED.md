# WindDesk explained in simple words

This page explains what we built, why a company would want it, and how it works, without jargon.
Read it before recording the video.

---

## 1. In one sentence

WindDesk shows an electricity buyer **how much wind power to expect tomorrow** and **how wrong that
number usually is**, so they can buy the right amount of electricity.

---

## 2. The business story

### Who is the customer?
A **UK energy supplier**: a company that sells electricity to homes and businesses. It does not own
enough power stations, so it **buys electricity on the wholesale market** and sells it on to customers.

### What does the buying team do?
Every day the team buys electricity for **tomorrow** in the **day-ahead market**. Think of it as an
auction that closes the morning before:

- **D** = the delivery day (the day the electricity is used).
- **D-1** = the day before, when the buying decision is made.
- The auction **closes at a fixed time on D-1** (in GB, 09:20 or 09:50 in the morning). After that you
  can't buy in that auction any more. This closing moment is called the **gate closure**, or **cutoff**
  in our app.

### Why does wind matter?
Wind farms produce a lot of the UK's electricity: in January 2026 between about 2 GW and 18 GW,
11 GW on average (for the wind farms counted in this data). That wind power arrives
"for free" on the grid, so the buyer **only needs to buy what wind will not cover**:

```
electricity to buy  ≈  customer demand  −  wind power expected
```

The problem: **nobody knows tomorrow's wind exactly**. The buyer has to rely on a **forecast**.

### What goes wrong without our tool?
- **The forecast is wrong too high** → wind delivers less than expected → the company **bought too
  little** → it must buy the gap at the last minute, often at **expensive** prices. This is called being
  **short**, and it is the **costly mistake**.
- **The forecast is wrong too low** → the company **bought too much** and has to sell the extra back,
  usually at a small loss. Annoying, but cheaper.

So the buyer wants to know two things every morning:

1. *"What does the forecast say for tomorrow, right now, before the auction closes?"*
2. *"How wrong could it be, so how much safety margin should I keep?"*

WindDesk answers exactly these two questions.

---

## 3. Where and when it is used

| Who | When | What they do with it |
|---|---|---|
| **Day-ahead buyer / trader** | Every morning before the 09:20 gate | Opens *Tomorrow's wind*, reads the expected wind and the safety margin, and decides how much to buy |
| **Risk manager** | Weekly or monthly | Opens *Forecast accuracy* to see how big the misses were and whether the safety margin is right |
| **Head of trading** | When setting policy | Uses the cutoff comparison to decide which auction to use and how big the standard buffer should be |
| **Analysts** | Ad hoc | Clicks into bad days (for example 28 Jan) to understand what went wrong |

This version is a **pilot**: it covers buying decisions made in **January 2026** so the customer can
judge whether the idea is useful before a full build.

---

## 4. Simple meaning of the words used in the app

| Word | Simple meaning |
|---|---|
| **MW / GW** | Power at one moment. 1 GW = 1,000 MW. 1 GW is roughly a big power station. |
| **MWh / GWh** | Energy over time. 1 GW for 1 hour = 1 GWh. |
| **Forecast run / publish time** | The wind forecast is updated about **8 times a day**. Each update is a "run", stamped with the time it was published. |
| **Actual** | What wind really produced, measured afterwards. |
| **Cutoff** | The moment the decision is locked in (default 09:20 on D-1). |
| **Error** | Forecast − actual. **Positive = wind came in lower than forecast = buyer is short.** |
| **MAE** | Typical size of a miss, ignoring direction. "Usually off by about 2 GW." |
| **Bias** | Average miss *with* direction. "+1.75 GW" means the forecast is too high on average. |
| **RMSE** | Like MAE, but big misses count more. |
| **MAPE / WAPE** | Miss as a percentage. MAPE becomes misleading when wind is very low, so we also show WAPE, which is more reliable. |
| **P90 / 9-in-10 buffer** | A safety margin that would have covered the shortfall in 9 hours out of 10. |
| **Planning range** | The band where the real wind usually ended up (8 times out of 10). |
| **Firm wind** | Wind you can count on 9 times out of 10 = forecast minus the buffer. |
| **Forecast horizon / age** | How long before the hour the forecast was made. Older forecasts are less accurate. |
| **Shortfall / surplus** | Wind below / above the forecast. |

---

## 5. What the app shows

### Screen 1: "Tomorrow's wind"
Pick a delivery day (for example **Thursday 15 Jan 2026**). The app acts as if it is the morning before,
at the cutoff, and shows:

- **Which forecast you could see**: "Based on the forecast published Wed 14 Jan 07:30, 1 h 50 min
  before the 09:20 gate."
- **The numbers for tomorrow**: total wind energy (278.6 GWh), peak (15.8 GW), minimum (8.9 GW) and
  average (11.6 GW).
- **A chart** of the hourly forecast with a light blue **planning range** around it.
- **Firm wind**: 180.6 GWh you can count on 9 times in 10.
- **Position guidance**: "plan for wind to deliver about 4.1 GW less than forecast".
- **"Why this forecast?"**: every forecast published that day, marked as *used*, *older* or
  *published after the gate (not available)*. This proves we never cheat with later information.
- **"Reveal what actually happened"**: the real wind, shown afterwards (for 15 Jan: 253.6 GWh,
  a 25 GWh shortfall, and 96% of hours inside the planning range).
- **Data quality**: checks that nothing is missing or late.

### Screen 2: "Forecast accuracy"
Looks back over all January decisions and shows:

- **Plain-English findings** at the top (written by the app from the numbers).
- **Key numbers**: typical miss, bias, how often the buyer was short, and the safety buffer.
- **Forecast vs actual chart** for the whole month, with red areas where wind fell short.
- **How big are the misses?** (a histogram).
- **Error by hour of day**, **by wind level**, and **by forecast age**.
- **Compare cutoff choices**: what if we decided at 09:50 or 15:30 instead?
- **Daily calendar**: darker days = bigger misses. Click a day to open it in Screen 1.

Every chart has a **Table** button, and every number has a **?** that explains it.

---

## 6. The most important rule (the heart of the system)

The wind forecast for one hour is **published many times** (8 runs per day). Later runs are usually
better, but **the buyer can only use what existed before the cutoff**.

Example for delivery on Thursday 15 Jan, cutoff Wednesday 09:20:

| Forecast published (Wed 14 Jan) | Available at 09:20? | Used? |
|---|---|---|
| 02:30 | yes | no, older |
| 04:30 | yes | no, older |
| **07:30** | **yes** | **YES: the latest one before the cutoff** |
| 09:30 | no (after the gate) | never |
| 11:30, 15:30, 18:30, 22:30 | no | never |

So the rule is: **for each hour, take the newest forecast published at or before the cutoff.**

If we "cheated" and used the newest forecast in the data, the app would look more accurate than reality
and the buyer would be fooled. This rule is tested many ways in the code.

---

## 7. What we found (January 2026, deciding at 09:20)

1. **The forecast is usually off by about 2 GW** (about 18% of wind output).
2. **It is too high most of the time**: in **85% of hours** wind came in lower than forecast, by
   **1.75 GW on average**. So a buyer who trusts it blindly is **regularly short**.
3. **Safety buffer**: keeping **4.15 GW** in reserve would have covered the shortfall 9 hours out of 10.
4. **Windy days are riskier**: when the forecast is high (14 GW or more), it is too high by about
   **2.5 GW**. When it is low (below 8 GW), only by about **0.3 GW**. So the buffer should depend on how
   windy the forecast is.
5. **Deciding later helps only a little**: at 09:50 the miss shrinks by 1%; at 15:30 by 8%.
   **Fixing the "too high" habit matters more than the timing.**
6. **Some days are very bad**: on **28 Jan** the forecast said 267 GWh and wind gave only 138 GWh,
   about half.
7. We **cannot tell why** the forecast runs high from these two datasets alone. Possible reasons include
   wind farms being switched down when the grid is full (curtailment), or the two datasets counting
   slightly different wind farms. We say this honestly instead of guessing.

### How a buyer would use this, in one example
> Tomorrow's forecast for 18:00 is **15 GW** (a windy hour). History says windy hours come in about
> **2.5 GW lower**, and to be safe 9 times in 10 you should assume **4.7 GW lower**.
> So the buyer plans on about **10.3 GW** of wind, not 15 GW, and buys the rest.

---

## 8. How it works inside (simple version)

```
 Elexon website (official UK electricity data)
        │  1. download once: forecasts (WINDFOR) + actual wind (FUELHH)
        ▼
 Clean data files saved in the project (backend/data)
        │  2. check for missing, duplicate or late data
        ▼
 Backend (Python + FastAPI)
        │  3. pick the right forecast for each hour (the rule above)
        │  4. compare with actual wind, calculate the errors
        │  5. write the plain-English findings
        ▼
 Frontend (React website)
        6. draws the charts, numbers and explanations
```

Why we download the data once instead of asking Elexon every time:
January 2026 is in the past, so the data will not change. Keeping a saved copy makes the app **fast**,
**always the same** for reviewers, and **safe** even if Elexon's website is down during a demo.

---

## 9. The technology (one line each)

| Part | Tool | Why |
|---|---|---|
| Website | React + TypeScript | Modern, typed, the brief asked for React |
| Charts | Recharts | Clean, interactive charts |
| Styling | Tailwind CSS | Consistent design, light and dark mode |
| Backend | Python + FastAPI | The brief asked for Python; fast and self-documenting |
| Maths | pandas + numpy | Standard tools for data work |
| Tests | pytest (92 tests) + Vitest (19 tests) | Prove the rule and the numbers are right |
| Packaging | Docker | One command runs everything: `docker compose up` |
| Checks | GitHub Actions | Every push runs all tests automatically |
| Hosting | Vercel | Free, public link; website + Python API together |

---

## 10. What it does not do (yet)

- Only **national wind**, not solar or other sources, and no electricity **prices**.
- Only **one month** of history, so the "1 in 20" numbers are rough.
- It **explains** the error but does not yet **correct** the forecast. A next version could subtract the
  known bias automatically.
- No logins or saved settings; it is a pilot.

---

## 11. Questions you might be asked (with short answers)

**Why 09:20?**
It is the earliest GB day-ahead auction close (EPEX). If the team bids in either auction, they must
decide by then. You can switch to 09:50 (N2EX), 15:30 or any time.

**Why not just use the newest forecast?**
Because the buyer did not have it at decision time. Using it would make the forecast look better than
it really was.

**Why are forecasts hourly but actuals half-hourly?**
That is how Elexon publishes them. We compare on the hour. We checked that comparing against the
average of both half-hours changes the result by less than 1%.

**Why is the forecast always too high?**
We see it clearly in the data but cannot prove the cause with these two datasets. Curtailment (wind
farms told to slow down) is a likely reason. It is a next step to investigate.

**Why not call Elexon live?**
The data is historical and fixed. A saved copy is faster and more reliable, and a script is included
to refresh it.

**How do you know the numbers are right?**
A test recalculates the main numbers from the raw files using plain Python, without the app's own
code, and checks they match exactly.

**Was AI used?**
Yes. Claude (an AI assistant) helped build it, and the README says so, as the assignment asks.
