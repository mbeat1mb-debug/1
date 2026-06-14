# Soma — Full Technical Brief v3
**Date: 2026-06-14 · Branch: `claude/fitbit-app-ideas-zezgxj`**
**For: Independent LLM code audit and improvement suggestions**

This is the complete, current-state technical brief for the Soma app. All previously found bugs are documented and fixed. Your job is to find what's left and suggest what would make this the best personal longevity app for the Google Fitbit Air.

---

## 1. What This App Is

**Soma** is a single-user personal longevity PWA built by and for one adult male using his Google Fitbit Air wearable. It is not a product — it's a precision self-tracking tool. It pulls Fitbit data daily, aggregates it with manually entered lab results and body metrics, and produces:

- A **daily recovery score** (0–100) — did I sleep, recover, and adapt well?
- A **strain score** (5–21) — how hard did I work today?
- A **biological age** (years) — am I aging slower or faster than my calendar?
- A **pace of aging** — how fast is my biological clock ticking?
- Trend charts for all key metrics over 90 days

**Stack:** React 18, Vite, Tailwind CSS, Recharts, IndexedDB (raw API), localStorage, Vercel KV, Web Push/VAPID, Vercel Cron, pdfjs-dist v6, Claude API (for coaching tab).

**Device:** Google Fitbit Air — wrist PPG sensor. Provides HRV (RMSSD), SpO2, breathing rate, skin temperature, intraday HR at 1-minute resolution, sleep stages, steps, VO2 Max estimate.

---

## 2. What Every API Call Returns

13 calls run in parallel via `Promise.all`. Failed calls return null and the app degrades gracefully.

| Endpoint | Returns | Used For |
|---|---|---|
| `/activities/date/{today}` | Steps, calories, active minutes | Activity domain |
| `/activities/heart/date/{today}/1d/1min` | HR every minute | Strain, Zone 2, daytime stress |
| `/sleep/date/{today}` | Duration, stages, efficiency | Sleep domain, recovery |
| `/hrv/date/{today}` | Overnight RMSSD (ms) | Recovery, biological age |
| `/spo2/date/{today}` | Blood oxygen % | Recovery modifier |
| `/br/date/{today}` | Breathing rate (br/min) | Recovery modifier |
| `/hrv/date/{30daysAgo}/{today}` | 30-day HRV history | Baseline, trend adjustment |
| `/activities/heart/date/{7daysAgo}/{today}` | 7-day RHR history | Recovery baseline |
| `/sleep/date/{30daysAgo}/{today}` | 30-day sleep history | Optimal sleep hours |
| `/cardioscore/date/{7daysAgo}/{today}` | VO2 Max as string e.g. `"47-51"` | Cardio domain |
| `/temp/skin/date/{today}` | Nightly skin temp deviation °C | Recovery modifier, illness signal |
| `/body/log/weight/date/{today}/1m` | 1 month of weights (kg) | Body composition |
| `/body/log/fat/date/{today}/1m` | 1 month of body fat % | Body composition |

**Timing note:** `dbHistory = await getHistory()` runs BEFORE `saveDay(result)`. Code that appends today's value to history arrays does so explicitly and correctly.

---

## 3. All Algorithms — Exact Implementation

### Recovery Score (0–100)
`src/lib/calculations.js → calculateRecovery()`

```
Score = HRV×40% + RHR×25% + Sleep×25% + SpO2×5% + BR×5% + SkinTempMod
```

- **HRV:** ratio = today / all-prior-day average. Ratio ≥ 1: score = clamp(50 + (ratio−1)×120, 50, 100). Ratio < 1: score = clamp(ratio×50, 0, 50).
- **RHR:** delta = baseline − today. Score = clamp(50 + delta×5, 0, 100).
- **Sleep:** base = (hours/optimalHours)×70 + (efficiency/100)×30. Deep >20% → +3, <10% → −3. REM >22% → +2, <12% → −2.
- **Optimal hours:** top-quartile of personal history (min 7 nights; else 8h default).
- **SpO2:** 97→100, 95→75, 93→50, 90→25, below→0
- **BR:** 12–18→100, 10–22→75, 8–25→50, outside→25
- **Skin temp:** >+0.3°C → −5 (stress/illness), <−0.3°C → +2 (good recovery)

### Strain Score (5–21)
`src/lib/calculations.js → calculateStrain()`

- 1-minute intraday HR data, zone weights `[0, 1, 2, 4, 8, 16]`
- Max HR: `192 − 0.007 × age²` (Gellish), upgraded by highest observed HR in localStorage
- Raw sum / 900, scaled: `min(21, 5 + (raw/900) × 16)`
- Zone 2 (60–70% maxHR): computed separately in `calculateZoneMinutes()` for the weekly rolling total

**Zone 2 note:** NOT the same as Fitbit's native "Fat Burn" zone (50–69% maxHR). App uses 60–70% from intraday data. Weekly total = today + sum of last 6 IndexedDB rows.

### Stress Score (0–100)
`src/lib/calculations.js → calculateStressScore()`

Uses last-14-day window (intentionally shorter than recovery's all-time baseline):
```
HRV stress = clamp((1 − todayHRV / avg14HRV) × 50 + 50, 0, 100) × 60%
RHR stress = clamp(50 + (todayRHR − avg14RHR) × 5, 0, 100) × 40%
```

### Daytime Stress
`src/lib/calculations.js → calculateDaytimeStress()`

Filters intraday HR to post-wakeup + non-exercise minutes (HR < 85% maxHR). Requires ≥30 qualifying minutes. Compares average to personal RHR.

---

### Biological Age — 5-Domain Model
`src/lib/calculations.js → calculatePhysiologicalAge()`

**Five domains, capped, plus lifestyle (uncapped) plus synergy:**

```
Cardiorespiratory  capped −7 to +9
Body Composition   capped −5 to +8
Metabolic Health   capped −5 to +10
Sleep & Recovery   capped −3 to +5
Activity           capped −3 to +5
Lifestyle          uncapped (smoking up to +7y)

Final = userAge + Σ(all domains) + synergy
Clamped: userAge − 15 to userAge + 20
```

#### Domain 1: Cardiorespiratory

**VO2 Max (ACSM 11th Edition 2022, men):**

| Age | Fair | Good | Excellent |
|-----|------|------|-----------|
| 20–29 | 34 | 42 | 53 |
| 30–39 | 31 | 39 | 49 |
| 40–49 | 27 | 35 | 45 |
| 50–59 | 25 | 34 | 44 |
| 60+ | 22 | 30 | 40 |

Scoring: ≥ Excellent+5 → −5y (Elite), ≥ Excellent → −3y, ≥ Good → −1y, ≥ Fair → +2y, ≥ Fair×0.8 → +4y, else → +6y

Fitbit returns a range string (e.g. `"47-51"`). App uses **lower bound** for scoring, shows full range in UI.

**HRV (Shaffer & Ginsberg 2017, ×1.15 overnight Fitbit scaling):**

| Age | Norm (ms) |
|-----|-----------|
| 20–29 | 69 |
| 30–39 | 53 |
| 40–49 | 40 |
| 50–59 | 33 |
| 60+ | 28 |

Ratio = avgHRV / norm: ≥1.5→−3y, ≥1.2→−1y, ≥0.85→0y, ≥0.65→+2y, else→+4y

**HRV Trend Adjustment** (requires 4+ readings per 7-day window):
- recent 7d avg vs prior 7d avg
- If trend > +6%: shift one tier better (min −3)
- If trend < −8%: shift one tier worse (max +4)

**RHR:** <50→−2y, <60→−1y, <70→0y, <80→+2y, <90→+3y, else→+4y

#### Domain 2: Body Composition

| Metric | Thresholds |
|--------|------------|
| Body fat % | <10%→0y, <15%→−2y, <20%→−1y, <27%→0y, <32%→+3y, else→+5y |
| FFMI | >24→−2y, >21→−1y, ≥18→0y, ≥16→+2y, else→+3y |
| Waist (WHO/IDF men) | <90cm→−1y, <94cm→0y, <102cm→+2y, else→+4y |
| Grip (Leong 2015) | ratio to age norm: ≥1.2→−2y, ≥1.0→−1y, ≥0.80→0y, ≥0.65→+2y, else→+3y |

Grip norms (men, kg): ≤29→47, ≤39→46, ≤49→43, ≤59→39, 60+→33

#### Domain 3: Metabolic

| Metric | Thresholds |
|--------|------------|
| BP (Ettehad 2016) | <120/80→−1y, elevated→+1y, Stage 1→+3y, Stage 2→+5y |
| HOMA-IR | <1.0→−1y, <2.0→0y, <3.0→+2y, <5.0→+4y, else→+6y |
| Labs | PhenoAge delta when all 9 present; additive otherwise |

Labs contribution clamped to −4 to +6 before adding to metabolic domain.

HOMA-IR requires fasting glucose + fasting insulin. UI labels say "fasting values only" but doesn't enforce it.

#### Domain 4: Sleep & Recovery

| Metric | Thresholds |
|--------|------------|
| Duration U-curve | 7–9h→−1y, 6–7h or >9h→+1y, <6h→+3y |
| REM | ≥22%→−1y, <15%→+1y |
| Deep | ≥18%→−1y, <10%→+1y |
| Consistency | ≥80%→−1y, <50%→+1y |

#### Domain 5: Activity

| Metric | Thresholds |
|--------|------------|
| Steps (Paluch 2022) | ≥10k→−2y, ≥7k→−1y, ≥5k→0y, ≥3k→+1y, else→+3y |
| Weekly Zone 2 AZM (Arem 2015) | ≥500→−2y, ≥300→−1y, ≥150→0y, ≥75→+1y, else→+2y |

#### Synergy Penalty (Framingham/SCORE2 risk multiplication principle)

```
badDomains  = count of domains ≥ +3y
goodDomains = count of domains ≤ −2y

4+ bad  → +5y | 3+ bad → +3y | 2+ bad → +1y
3+ good → −2y | 2+ good → −1y
```

---

### PhenoAge Formula (Levine 2018, Aging journal)
`src/lib/labs.js → calculatePhenoAge()`

```
Input units: albumin g/dL, creatinine mg/dL, glucose mg/dL (converted to mmol/L internally),
             crp mg/L (floored at 0.01), lymphocyte %, mcv fL, rdw %, alk_phos U/L, wbc K/µL, age years

xb = −19.9067
     − 0.0336 × albumin
     + 0.0095 × creatinine             (mg/dL — no conversion needed)
     + 0.1953 × (glucose / 18.018)     (mmol/L conversion applied here)
     + 0.0954 × ln(max(0.01, crp))
     − 0.0120 × lymphocyte
     + 0.0268 × mcv
     + 0.3306 × rdw
     + 0.00188 × alk_phos
     + 0.0554 × wbc
     + 0.0804 × age

M = 1 − exp(−exp(xb) × 1.51714 / 0.0076927)
PhenoAge = 141.50225 + ln(−0.00553 × ln(1 − M)) / 0.090165
Guard: if !isFinite(PhenoAge) → return null
```

When all 9 markers present: returns PhenoAge. When missing any: returns additive marker scoring. Glucose `score()` = 0 in the additive path — HOMA-IR handles the glucose metabolic signal to avoid double-counting.

---

### Training Load (ATL/CTL/TSB)
`src/lib/calculations.js → calculateTrainingLoad()`

Classic endurance sports science:
- ATL (7-day EWA): k = 2/8 = 0.25
- CTL (42-day EWA): k = 2/43 ≈ 0.0465
- TSB = CTL − ATL
- Fresh ≥+5, Neutral ≥−5, Loaded ≥−15, Overreached below

---

## 4. Data Storage

| Data | Store | Retention |
|------|-------|-----------|
| Daily health rows | IndexedDB `health_days` | 90 days |
| Full app snapshot | IndexedDB `snapshot` | 1 (latest) |
| OAuth tokens | localStorage | Until expiry |
| Age, height, weight, units | localStorage | Permanent |
| Lab results | localStorage `lab_results` | Permanent |
| BP readings | localStorage `bp_readings` | 90 entries max |
| Grip history | localStorage `grip_history` | 120 entries max |
| Waist history | localStorage `waist_history` | 120 entries max |
| Weight history | localStorage `weight_history` | 365 entries max |
| Biological age history | localStorage `physio_age_history` | 365 entries max |
| Push subscription | Vercel KV (Redis) | Until unsubscribe |
| Notification flags | localStorage `notif_*_YYYY-MM-DD` | 7-day prune |

`saveDaysBatch()` now uses a **single IndexedDB transaction** for all rows — atomic, crash-safe.

Biological age history: one entry per day keyed by date (upsert) — multiple syncs on the same day update the same entry.

---

## 5. Notifications

**In-app (Notification API):** once per day per type after sync:
- Recovery < 34 (red zone)
- Sleep debt ≥ 3h
- Stress score > 78
- Achievements (immediate)

**Data entry nudges:**
- BP: Mon/Wed/Fri if last reading >2 days ago
- Body metrics: 1st of month or >55 days overdue
- Labs: if last lab entry >80 days ago

`pruneNotifFlags()` uses two-pass collect-then-delete (fixed — was skipping every other key).

**Web Push (VAPID, Vercel Cron):**
- Morning ~7am: recovery/strain/stress
- Evening ~9pm: sleep prep
- Wind-down ~10pm (optional): bedtime

---

## 6. All Bugs Fixed To Date

Every bug that has been found and fixed, in order:

| Bug | File | Fix |
|-----|------|-----|
| PhenoAge returned null for all real users — glucose in mg/dL instead of mmol/L | labs.js | `glucose / 18.018` |
| Creatinine multiplied ×88.4 (wrong unit conversion) | labs.js | Removed; NHANES uses mg/dL |
| pruneNotifFlags() skipped every other expired key (delete while iterating) | notifications.js | Two-pass |
| VO2 Max norms one category too generous (old thresholds) | calculations.js | ACSM 11th ed |
| Today's VO2 Max missing from history chart (saveDay runs after getHistory) | App.jsx | Explicitly append today |
| Waist imperial→cm lost decimal (Math.round gave integer) | Settings.jsx | ×10 then /10 |
| Zone 2 labeled "Fitbit Zone 2" (different HR zone boundaries) | Healthspan.jsx | Label corrected |
| useMemo for biological age recalculated every render (array dep) | Healthspan.jsx | Dep: `.length` not array ref |
| Glucose double-counted in additive lab fallback (score() + HOMA-IR) | labs.js | glucose.score() → returns 0 |
| Grip norm table off by one full age bracket (display only) | Healthspan.jsx | `<=` boundaries corrected |
| Body fat <10% displayed −2y but formula gives 0y | Healthspan.jsx | Added <10% case |
| Steps 3k–5k showed 0y (should be +1y); <3k showed +2y (should be +3y) | Healthspan.jsx | Corrected |
| Sleep quality REM threshold 20% in display vs 22% in formula | Healthspan.jsx | Changed to 22% |
| HRV contribution in panel didn't reflect trend adjustment | Healthspan.jsx | Added inline trend calc |
| SpO2 and BR shown as biological age contributors (they're not in the formula) | Healthspan.jsx | Removed from panel |
| saveDaysBatch() one transaction per row — partial write on crash | db.js | Single transaction |
| Pace of aging fired with 2 entries 14 days apart (too noisy) | calculations.js | Min 7 entries |

---

## 7. What the "What's Moving the Needle" Panel Shows

The contribution panel in Healthspan.jsx is a **display breakdown** that exactly mirrors `calculatePhysiologicalAge()`. Every displayed contribution now uses the same thresholds and logic as the formula. The panel and the formula are in sync.

Panel entries and their formula counterparts:
- HRV (with trend adjustment) → Domain 1
- Resting Heart Rate → Domain 1
- Sleep Duration → Domain 4
- Sleep Quality (deep/REM %) → Domain 4
- Daily Steps → Domain 5
- Active Zone Minutes → Domain 5
- VO2 Max → Domain 1
- Body Fat % or BMI → Domain 2
- Muscle Mass Index (FFMI) → Domain 2
- Waist Circumference → Domain 2
- Grip Strength → Domain 2
- HOMA-IR → Domain 3
- Smoking → Lifestyle
- Alcohol → Lifestyle
- Blood Pressure → Domain 3
- Lab results (PhenoAge or additive) → Domain 3

---

## 8. Lab Markers Tracked

**PhenoAge Panel (9 required for formula):**
Albumin, Creatinine, Glucose, hs-CRP, Lymphocyte %, MCV, RDW, Alkaline Phosphatase, WBC

**Additional markers with individual scoring:**
- Lipids: LDL, HDL, Total Cholesterol, Triglycerides, ApoB, Lp(a)
- Metabolic: HbA1c, Insulin (for HOMA-IR), Uric Acid
- Inflammation: hs-CRP, Homocysteine
- Vitamins: Vitamin D, B12, Magnesium, Ferritin, Omega-3 Index
- Hormones: Testosterone, DHEA-S, IGF-1, Cortisol (AM)
- Organ Function: ALT, AST, GGT, eGFR, TSH

Labs can be entered manually or extracted from PDF blood reports via on-device pdfjs-dist.

---

## 9. File Map

```
src/
  App.jsx                  — Root, sync orchestration (doSync), DEMO data
  lib/
    api.js                 — 13 Fitbit endpoints, Promise.all
    auth.js                — OAuth 2.0 PKCE, token refresh
    calculations.js        — All algorithms (recovery, strain, zones, biological age, training load)
    labs.js                — Lab definitions, PhenoAge formula, scoring
    db.js                  — IndexedDB (saveDay, saveDaysBatch, getHistory, saveSnapshot)
    notifications.js       — In-app + Web Push management
    achievements.js        — Personal records, streaks, achievements
    alerts.js              — Overtraining / illness detection
    backup.js              — Google Drive backup
    pdfLabExtract.js       — On-device PDF blood lab extraction
    correlations.js        — Cross-metric correlation analysis
    pin.js                 — PIN screen lock
  screens/
    Healthspan.jsx         — Biological age, all domain contributions, trends (most complex)
    Home.jsx               — Main dashboard (recovery ring, strain, HRV, steps)
    Recovery.jsx           — Recovery score detail + HRV trend
    Strain.jsx             — Strain + training load + training effect
    Sleep.jsx              — Sleep detail + debt + optimal window
    Stress.jsx             — Stress score + daytime stress
    Journal.jsx            — BP logging, manual notes, body metrics entry
    Coach.jsx              — Claude API longevity coaching integration
    Records.jsx            — Personal records, weekly pattern chart
    Settings.jsx           — All settings, Fitbit OAuth connect, push notification prefs
  components/
    TrendChart.jsx         — LineGraph, BarGraph, DualLineGraph (Recharts wrappers)
    ScoreRing.jsx          — SVG circular progress ring
    AlertBanner.jsx        — Top-of-screen alert strip
    LabResultsSection.jsx  — Lab marker entry form + PDF import
    CalendarHeatmap.jsx    — 90-day recovery heatmap
api/
  token.js                 — OAuth code exchange (server-side, holds client secret)
  refresh.js               — Token refresh
  push-subscribe.js        — Save subscription to Vercel KV
  push-send.js             — Vercel Cron push delivery
  push-prefs.js            — Preference read/write
  vapid-key.js             — Expose public VAPID key to client
```

---

## 10. Known Remaining Limitations (Not Bugs)

1. **VO2 Max lower bound only.** Fitbit returns `"47-51"` and the app scores from 47. No way to use midpoint or upper bound.

2. **HOMA-IR not enforced as fasting.** UI says "fasting values only" in sublabel but can't validate the values were actually fasting.

3. **HRV ×1.15 scaling is an empirical assumption.** Overnight wrist PPG reads higher than daytime ECG. The 15% scalar is not from a single cited study — it's calibrated from aggregate wearable literature.

4. **Synergy penalty thresholds are heuristic.** The specific "+5y for 4 bad domains" values are not directly from Framingham — they're inspired by the compounding-risk principle and calibrated for plausibility.

5. **OAuth tokens in localStorage.** Single-user local PWA — XSS risk is low but theoretically present. Using httpOnly cookies would be more secure.

6. **IndexedDB is device-local.** No cloud sync for history. Google Drive backup exists but is fire-and-forget.

7. **Pace of aging requires 7+ data points.** New users see a ratio (physAge/chronAge) instead until sufficient history accumulates.

8. **`parseFitbitData()` calls `saveBodyWeightEntry()` as a side effect** — breaks functional purity. Low risk (DEMO mode bypasses it) but worth noting as tech debt.

---

## 11. What the App Does NOT Yet Track

These longevity markers exist in the literature and would add genuine value:

- **Continuous glucose monitor (CGM)** — real-time glucose, time-in-range, glucose variability (CV%)
- **Sleep apnea / AHI** — Fitbit does detect possible apnea events but the app doesn't surface it
- **Epigenetic clocks** — DunedinPACE, GrimAge, Horvath (require specialized lab tests)
- **CAC score / CIMT** — cardiovascular imaging
- **DEXA** — bone density, precise lean/fat mass segmentation
- **HRV coherence** — ratio of LF/HF power (parasympathetic vs sympathetic balance)
- **Resting metabolic rate**
- **Lab-measured VO2 Max** (vs Fitbit estimate) — treadmill test
- **Intraday glucose from Fitbit Sense 3/Air** if the API exposes it
- **Readiness score trending** — 7/14/30-day rolling average readiness
- **Recovery:Strain ratio** — longitudinal balance between stress and recovery

---

*Version 3 — 2026-06-14. All previously found bugs are fixed. Clean build.*
