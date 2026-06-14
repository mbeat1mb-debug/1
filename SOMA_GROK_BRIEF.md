# Soma App — Grok Audit Brief
**Version: 2026-06-14 · Branch: `claude/fitbit-app-ideas-zezgxj`**

This document is a complete technical briefing for an independent LLM audit of the Soma app.
Read everything in this file before examining any code.

---

## 1. What This App Is

**Soma** is a personal longevity-tracking Progressive Web App (PWA) built for **one adult male** (the developer) using his own Fitbit data. It is not a clinical product. It aggregates wearable data + manual health inputs into a unified biological age estimate and daily readiness score. All norm tables are male-only by design. There is no user auth beyond Fitbit OAuth — it is single-user software.

**Stack:**
- React 18, Vite, Tailwind CSS
- Recharts (all charts)
- IndexedDB (raw API) for 90-day daily history
- localStorage for settings, lab results, manual metrics
- Vercel KV (Redis) + Web Push/VAPID for push notifications
- Vercel Cron for scheduled push delivery
- pdfjs-dist v6 for on-device PDF blood lab extraction

**Device:** Google Fitbit Sense/Air (wrist wearable, PPG-based HRV/SpO2)

---

## 2. Data Flow

```
Fitbit Web API (13 parallel endpoints, Promise.all)
  → loadDashboardData()         [src/lib/api.js]
  → parseFitbitData(raw)        [src/lib/calculations.js]
  → processData(parsed) in      [src/App.jsx]
  → doSync()  ←  IndexedDB history pulled here, THEN saveDay() runs
  → appData React state
  → Screen components (read-only props)
```

**Note on timing:** `dbHistory = await getHistory()` runs **before** `saveDay(result)`. This matters: today's IndexedDB row does not exist yet when history is pulled. Code that appends "today" manually to history arrays does so correctly — this is intentional.

### 13 API Endpoints

| Endpoint | Returns |
|---|---|
| `/activities/date/{today}` | Steps, calories, active minutes |
| `/activities/heart/date/{today}/1d/1min` | Intraday HR at 1-min (for strain, zones, daytime stress) |
| `/sleep/date/{today}` | Tonight's sleep: duration, stages, efficiency |
| `/hrv/date/{today}` | Overnight RMSSD (ms) |
| `/spo2/date/{today}` | Blood oxygen % |
| `/br/date/{today}` | Breathing rate (breaths/min) |
| `/hrv/date/{30daysAgo}/{today}` | 30-day HRV history |
| `/activities/heart/date/{7daysAgo}/{today}` | 7-day RHR history |
| `/sleep/date/{30daysAgo}/{today}` | 30-day sleep history |
| `/cardioscore/date/{7daysAgo}/{today}` | VO2 Max estimate (string like `"47-51"`) |
| `/temp/skin/date/{today}` | Nightly skin temp deviation (°C, relative to personal baseline) |
| `/body/log/weight/date/{today}/1m` | 1 month of Fitbit-logged weights (kg) |
| `/body/log/fat/date/{today}/1m` | 1 month of body fat % |

All nulls handled gracefully. Failed calls return `null` and algorithms degrade.

### IndexedDB Schema (one row per day)

```
health_days: { date, recovery, strain, sleep, sleepEfficiency, stressScore,
               hrv, rhr, steps, calories, activeMinutes, vo2Max, zone2Minutes,
               spo2, br, skinTempDev }
snapshot:    { id: 1, data: <full appData object>, savedAt }
```

Snapshot loads immediately on startup (instant display), then background sync replaces it.

---

## 3. Core Algorithms

### 3A. Recovery Score (0–100)
**File:** `src/lib/calculations.js` → `calculateRecovery()`

```
Final = HRV×40% + RHR×25% + Sleep×25% + SpO2×5% + BR×5% + SkinTempMod
```

**HRV component:**
- Baseline = running average of all prior days' HRV (does NOT include current day — avoids self-reference)
- Ratio = `todayHRV / baseline`
- If ratio ≥ 1: score = `clamp(50 + (ratio - 1) × 120, 50, 100)`
- If ratio < 1: score = `clamp(ratio × 50, 0, 50)`

**RHR component:**
- Baseline = average of all prior days' RHR
- Delta = `baseline - todayRHR` (positive = better than average)
- Score = `clamp(50 + delta × 5, 0, 100)`

**Sleep component:**
- Base = `clamp((hours / optimalHours) × 70, 0, 70) + clamp((efficiency / 100) × 30, 0, 30)`
- Optimal hours = top-quartile average of personal history (min 7 nights, else 8h default)
- Deep sleep modifier: >20% of sleep → +3, <10% → −3
- REM modifier: >22% → +2, <12% → −2
- Stage mods only apply if the device reports stages

**SpO2:** 97→100, 95→75, 93→50, 90→25, below→0
**Breathing rate:** 12–18→100, 10–22→75, 8–25→50, outside→25
**Skin temp:** deviation >+0.3°C → −5 points, <−0.3°C → +2 points

---

### 3B. Strain Score (5–21)
**File:** `src/lib/calculations.js` → `calculateStrain()`

- Source: 1-minute intraday HR data
- Max HR formula: `192 - 0.007 × age²` (Gellish non-linear), upgraded by highest observed HR stored in localStorage
- HR zones: Z0 (<50%), Z1 (50–60%), Z2 (60–70%), Z3 (70–80%), Z4 (80–90%), Z5 (>90%) of maxHR
- Zone weights (exponential): `[0, 1, 2, 4, 8, 16]`
- Raw sum divided by 900, scaled: `min(21, 5 + (raw/900) × 16)`

---

### 3C. Zone 2 Minutes (Weekly Rolling)
**File:** `src/lib/calculations.js` → `calculateZoneMinutes()`

**IMPORTANT: This is NOT the same as Fitbit's native "Fat Burn" zone.**
- This app: Zone 2 = 60–70% of computed maxHR from intraday data
- Fitbit native: Fat Burn = 50–69% maxHR (different lower bound, different upper)
- The UI label says "60–70% max HR from your intraday data" to reflect this

Weekly total = today's Zone 2 minutes + `zone2Minutes` field from last 6 IndexedDB rows.

---

### 3D. Stress Score (0–100)
**File:** `src/lib/calculations.js` → `calculateStressScore()`

Uses last-14-day averages (not all-time):
```
HRV stress = clamp((1 - todayHRV / avg14HRV) × 50 + 50, 0, 100) × 60%
RHR stress = clamp(50 + (todayRHR - avg14RHR) × 5, 0, 100) × 40%
```

Note: `calculateRecovery()` uses all-time baseline; `calculateStressScore()` uses 14-day window. This asymmetry is intentional — stress tracks current trajectory while recovery tracks deviation from personal norm.

---

### 3E. Biological Age (5-Domain Model)
**File:** `src/lib/calculations.js` → `calculatePhysiologicalAge()`

Five capped domains + lifestyle (uncapped) + synergy penalty:

```
Domain caps:
  Cardiorespiratory  −7 to +9
  Body Composition   −5 to +8
  Metabolic          −5 to +10
  Sleep & Recovery   −3 to +5
  Activity           −3 to +5
  Lifestyle          uncapped (smoking = up to +7)

Final = userAge + sum(all domains) + synergy
Clamped to: userAge−15 to userAge+20
```

#### Domain 1: Cardiorespiratory Fitness

**VO2 Max (ACSM 11th Edition, 2022) — men, mL/kg/min:**

| Age | Poor | Fair | Good | Excellent |
|-----|------|------|------|-----------|
| 20–29 | <34 | 34 | 42 | 53 |
| 30–39 | <31 | 31 | 39 | 49 |
| 40–49 | <27 | 27 | 35 | 45 |
| 50–59 | <25 | 25 | 34 | 44 |
| 60+ | <22 | 22 | 30 | 40 |

Scoring: ≥ Excellent+5 → −5y (Elite), ≥ Excellent → −3y, ≥ Good → −1y, ≥ Fair → +2y, ≥ Fair×0.8 → +4y, below → +6y

Fitbit returns VO2 Max as a range string (e.g. `"47-51"`). The app parses the **lower bound** for scoring. The full range is displayed in the UI.

**HRV (Shaffer & Ginsberg 2017, scaled ×1.15 for Fitbit overnight context):**

| Age | Fitbit norm (ms) | ECG source value |
|-----|-----------------|-----------------|
| 20–29 | 69 | ~60 |
| 30–39 | 53 | ~46 |
| 40–49 | 40 | ~35 |
| 50–59 | 33 | ~29 |
| 60+ | 28 | ~24 |

Ratio = `avgHRV / norm`:
- ≥1.5 → −3y, ≥1.2 → −1y, ≥0.85 → 0y, ≥0.65 → +2y, else +4y

**HRV Trend Adjustment** (requires 4+ readings in each 7-day window):
- Recent 7 days vs prior 7 days trend
- If trend > +6%: shift one tier better (min −3)
- If trend < −8%: shift one tier worse (max +4)
- No citation for these specific thresholds — they are calibrated heuristics

**RHR (Zhang et al. Heart 2016):**
- <50 → −2y, <60 → −1y, <70 → 0y, <80 → +2y, <90 → +3y, else +4y

#### Domain 2: Body Composition

**Body fat % (ACE male ranges, Bhaskaran Lancet 2018):**
- <10% → 0y (essential fat — not protective)
- <15% → −2y (athletic)
- <20% → −1y (fitness)
- <27% → 0y (acceptable)
- <32% → +3y
- else → +5y

**FFMI** = lean mass (kg) / height (m)²:
- >24 → −2y, >21 → −1y, ≥18 → 0y, ≥16 → +2y, else +3y

**Waist circumference (WHO/IDF men):**
- <90cm → −1y, <94cm → 0y, <102cm → +2y, else +4y

**Grip strength** (Leong Lancet 2015 norms, kg):
- Ratio to age norm: ≥1.2 → −2y, ≥1.0 → −1y, ≥0.80 → 0y, ≥0.65 → +2y, else +3y

Grip norms (men): 20s=47kg, 30s=46kg, 40s=43kg, 50s=39kg, 60+=33kg

#### Domain 3: Metabolic Health

**Blood Pressure** (Ettehad Lancet 2016):
- <120/80 → −1y (optimal)
- 120–129/80 → +1y (elevated)
- 130–139/80–89 → +3y (Stage 1 HTN)
- ≥140/≥90 → +5y (Stage 2 HTN)

BP used = rolling average of last 10 Journal entries (falls back to static setting if no entries).

**HOMA-IR** (Matthews 1985): `(glucose mg/dL × insulin µIU/mL) / 405`
- <1.0 → −1y, <2.0 → 0y, <3.0 → +2y, <5.0 → +4y, else +6y
- ⚠️ Only valid with **fasting** glucose and insulin. UI sublabel now says "fasting values only"
- There is NO validation that the entered values are actually fasting — this is a trust-based input

**PhenoAge / Lab Scoring:**
- If all 9 PhenoAge markers present: uses Levine formula → `clamp(PhenoAge − chronologicalAge, −8, +8)`
- Applied as: `Math.max(-4, Math.min(6, getLabAgeAdjustment()))` in the metabolic domain
- Otherwise: additive individual marker scoring (each marker has a `score()` function)
- PhenoAge panel markers score 0 individually — they only contribute via the full formula

#### Domain 4: Sleep & Recovery

**Duration U-curve** (Cappuccio Sleep 2010): 7–9h → −1y, 6–7h or >9h → +1y, <6h → +3y
**REM:** ≥22% → −1y, <15% → +1y
**Deep:** ≥18% → −1y, <10% → +1y
**Consistency** (stdDev of bed times): ≥80% consistent → −1y, <50% → +1y

#### Domain 5: Activity

**Steps** (Paluch JAMA NM 2022): ≥10k → −2y, ≥7k → −1y, ≥5k → 0y, ≥3k → +1y, else +3y
**Weekly Zone 2 AZM** (Arem JAMA IM 2015): ≥500 → −2y, ≥300 → −1y, ≥150 → 0y, ≥75 → +1y, else +2y

#### Lifestyle (uncapped)

**Smoking:** current → +7y, former → +2y, never → 0y
**Alcohol** (weekly drinks): ≥14 → +3y, ≥7 → +1y, else 0y

#### Synergy Penalty (Framingham / SCORE2 principle: risk factors multiply)

```
badDomains = count of domains where net ≥ +3y
goodDomains = count of domains where net ≤ −2y

badDomains ≥ 4 → +5y synergy
badDomains ≥ 3 → +3y
badDomains ≥ 2 → +1y
goodDomains ≥ 3 → −2y synergy
goodDomains ≥ 2 → −1y
```

---

### 3F. PhenoAge Formula (Levine 2018, Aging journal)
**File:** `src/lib/labs.js` → `calculatePhenoAge()`

```
Input units:
  albumin      g/dL
  creatinine   mg/dL    ← no unit conversion; NHANES model uses mg/dL directly
  glucose      mg/dL    ← converted to mmol/L internally (÷ 18.018)
  crp          mg/L     ← floored at 0.01 to prevent ln(0)
  lymphocyte   %
  mcv          fL
  rdw          %
  alk_phos     U/L
  wbc          K/µL (thousands of cells per µL)
  age          years

xb = -19.9067
     - 0.0336  × albumin
     + 0.0095  × creatinine              (mg/dL, no conversion)
     + 0.1953  × (glucose / 18.018)      (mmol/L conversion applied here)
     + 0.0954  × ln(max(0.01, crp))
     - 0.0120  × lymphocyte
     + 0.0268  × mcv
     + 0.3306  × rdw
     + 0.00188 × alk_phos
     + 0.0554  × wbc
     + 0.0804  × age

M = 1 − exp(−exp(xb) × 1.51714 / 0.0076927)
PhenoAge = 141.50225 + ln(−0.00553 × ln(1 − M)) / 0.090165
Guard: if !isFinite(PhenoAge) → return null
```

**Critical notes:**
- Glucose MUST be converted to mmol/L before applying coefficient 0.1953. At 85 mg/dL (typical healthy), glucose = 4.72 mmol/L. Without conversion, xb would be ~7.08 → M → 1 → PhenoAge is undefined. This was a prior bug; it is now fixed.
- Creatinine does NOT need unit conversion. The Levine NHANES source data used mg/dL. A prior version applied ×88.4 (mg/dL → µmol/L conversion) erroneously; this was also fixed.
- For a healthy 40-year-old male (albumin=4.5, creatinine=0.95, glucose=85, CRP=0.4, lymphocyte=32, MCV=88, RDW=13.2, alk_phos=60, WBC=5.5): PhenoAge ≈ 35–38 years (biological age younger than chronological).

---

### 3G. Training Load (ATL/CTL/TSB)
**File:** `src/lib/calculations.js` → `calculateTrainingLoad()`

Classic exponentially weighted averages from endurance sports science:
- ATL (Acute Training Load) = 7-day EWA: `k = 2/(7+1) = 0.25`
- CTL (Chronic Training Load) = 42-day EWA: `k = 2/(42+1) = 0.0465`
- TSB (Training Stress Balance) = CTL − ATL
- Form labels: ≥+5 "Fresh", ≥−5 "Neutral", ≥−15 "Loaded", below "Overreached"

---

### 3H. Daytime Stress
**File:** `src/lib/calculations.js` → `calculateDaytimeStress()`

- Filters intraday HR to waking hours (post-sleep-end) and non-exercise minutes (HR < 85% maxHR)
- Requires ≥30 qualifying minutes
- Averages qualifying HR, computes delta above personal RHR
- Score: delta 0–5 bpm = 0–25, delta 5–15 = 25–75, delta 15+ = 75–100

---

## 4. Data Persistence

| Data | Store | Retention |
|------|-------|-----------|
| Daily health rows | IndexedDB `health_days` | 90 days |
| Full app snapshot | IndexedDB `snapshot` | 1 (latest) |
| OAuth tokens | localStorage | Until expiry |
| User settings | localStorage | Permanent |
| Lab results | localStorage `lab_results` | Permanent |
| BP readings | localStorage `bp_readings` | 90 entries |
| Grip history | localStorage `grip_history` | 120 entries |
| Waist history | localStorage `waist_history` | 120 entries |
| Weight history | localStorage `weight_history` | 365 entries |
| Biological age history | localStorage `physio_age_history` | 365 entries |
| Push subscription | Vercel KV | Until unsubscribe |
| Push preferences | localStorage + Vercel KV | Permanent |

---

## 5. Notification System

**In-app (Notification API)** — fires immediately after sync, once per day per type:
- Recovery < 34 ("Red Zone")
- Sleep debt ≥ 3h
- Stress score > 78
- Achievement unlocks (immediate, not rate-limited)

**Data entry reminders:**
- BP: Mon/Wed/Fri if last reading >2 days ago
- Body metrics: 1st of month or if >55 days overdue
- Labs: if last lab entry >80 days ago

**Web Push (VAPID, Vercel Cron):**
- Morning (~7am, configurable): recovery/strain/stress snapshot
- Evening (~9pm): sleep prep
- Wind-down (~10pm, optional): bedtime reminder
- Embedded data nudge if relevant for that day

**pruneNotifFlags():** Uses two-pass approach (collect keys → delete) to avoid index-shifting bug when iterating localStorage by index while deleting. This was a prior bug; it is now fixed.

---

## 6. Known Issues and Edge Cases

These are real issues worth scrutinizing — not hypotheticals:

1. **VO2 Max uses lower bound of Fitbit range.** Fitbit returns `"47-51"` and the app uses `47` for scoring. A user at the high end of their range is scored conservatively. No mechanism to use midpoint or upper bound.

2. **HOMA-IR input not validated as fasting.** The app trusts the user to enter fasting glucose and insulin. Non-fasting values produce wrong HOMA-IR and silently affect biological age. The UI now shows "fasting values only" in the sublabel but does not block non-fasting entry.

3. **saveDaysBatch() writes sequentially, not in a transaction.** If the browser crashes mid-batch (e.g. during the initial 90-day history backfill), partial data is written with no rollback. Subsequent syncs would partially overwrite, but gaps could persist.

4. **calculatePaceOfAging() is meaningful only after sustained use.** It computes a biological aging rate from the first and last entries in localStorage `physio_age_history`. With only 2 entries 14 days apart, the rate estimate is extremely noisy and should not be interpreted as reliable.

5. **parseFitbitData() calls saveBodyWeightEntry() as a side effect.** This is a pure data-parsing function that writes to localStorage, which breaks the function's semantic contract. In DEMO mode, this means Fitbit's demo weight data would be persisted if the function were called in that context (it is currently not — DEMO bypasses parseFitbitData entirely).

6. **HRV trend thresholds (6%, 8%) have no cited source.** These are heuristic values chosen for the tier-shift logic. They affect biological age calculation but are not drawn from a published paper.

7. **Sleep consistency score uses stdDev of bed times with a linear formula.** `100 - stdDev / 1.5` can go below 0 for high variance (no clamp before `Math.max(0, ...)`). Verify the clamp is present.

8. **Biological age history stores entries after every sync.** Multiple syncs per day append multiple entries to `physio_age_history`. The pace-of-aging rate would then be computed from intra-day readings that are near-identical, inflating the appearance of data density.

9. **The ×1.15 Fitbit scaling for HRV norms is not empirically validated in the codebase.** Shaffer & Ginsberg 2017 ECG norms are scaled up by 15% to approximate Fitbit overnight PPG readings. This value is cited as an assumption in comments but no reference study for the exact 15% figure is provided.

10. **Lp(a) score returns 0 for >10 hs-CRP** (marked as "often acute, not chronic" — returns 1 for 3–10 range and 1 for >10 range). This is defensible but counterintuitive: a score of 1 is the same for moderate and very high CRP.

---

## 7. Recently Fixed Bugs

For your reference — these bugs existed and were fixed during the most recent development session:

| Bug | File | Fix |
|-----|------|-----|
| PhenoAge returned null for all real users (glucose in mg/dL instead of mmol/L) | labs.js | `glucose / 18.018` applied before coefficient |
| Creatinine incorrectly converted ×88.4 to µmol/L | labs.js | Removed conversion; NHANES uses mg/dL |
| pruneNotifFlags() skipped every other expired key (delete-while-iterating by index) | notifications.js | Two-pass (collect then delete) |
| VO2 Max norms were one tier too generous (old values, not ACSM 11th ed) | calculations.js | Updated to 2022 ACSM table |
| Today's VO2 Max missing from history chart (saveDay runs after getHistory) | App.jsx | Today's value explicitly appended |
| Waist imperial→cm precision lost (Math.round gave integers) | Settings.jsx | Fixed to ×10 then /10 |
| Zone 2 labeled "Fitbit Zone 2" but uses different HR boundaries | Healthspan.jsx | Label now says "60–70% max HR" |
| useMemo for biological age recalculated every render (array reference dep) | Healthspan.jsx | Changed dep to `data.hrvHistory?.length` |

---

## 8. File Map

```
src/
  App.jsx                  — Root: sync orchestration, DEMO data, doSync()
  lib/
    api.js                 — 13 Fitbit API endpoints, Promise.all fetch
    auth.js                — OAuth 2.0 PKCE, token storage/refresh
    calculations.js        — ALL algorithms: recovery, strain, zones, biological age, etc.
    labs.js                — Lab definitions, PhenoAge formula, contribution scoring
    db.js                  — IndexedDB: saveDay, getHistory, saveSnapshot, getLatestSnapshot
    notifications.js       — In-app + Web Push subscription management
    achievements.js        — Personal records, streaks, achievement unlocks
    alerts.js              — Overtraining / illness alert detection
    backup.js              — Google Drive backup (fire-and-forget)
    pdfLabExtract.js       — On-device PDF blood lab extraction (pdfjs-dist)
    correlations.js        — Cross-metric correlation analysis
    pin.js                 — PIN lock for screen privacy
  screens/
    Healthspan.jsx         — Biological age UI (most complex screen)
    Home.jsx               — Main dashboard
    Recovery.jsx           — Recovery detail
    Strain.jsx             — Strain / training load detail
    Sleep.jsx              — Sleep detail
    Stress.jsx             — Stress detail
    Journal.jsx            — BP entry, notes, manual metrics
    Coach.jsx              — Claude API integration (longevity coaching)
    Records.jsx            — PRs, weekly pattern
    Settings.jsx           — All user settings, Fitbit connect, push prefs
  components/
    TrendChart.jsx         — LineGraph, BarGraph, DualLineGraph (Recharts wrappers)
    ScoreRing.jsx          — SVG circular progress ring
    AlertBanner.jsx        — Top-of-screen alert strip
    LabResultsSection.jsx  — Lab entry form with PDF extraction
    CalendarHeatmap.jsx    — 90-day recovery calendar
api/
  token.js                 — OAuth code → token exchange (server-side only)
  refresh.js               — Token refresh
  push-subscribe.js        — Save Web Push subscription to Vercel KV
  push-send.js             — Send push from Vercel Cron
  push-prefs.js            — Save/read push preferences
  vapid-key.js             — Return public VAPID key to client
```

---

## 9. What the App Does NOT Do

Longevity markers tracked in the literature but absent from this app:
- Continuous glucose monitor (CGM) real-time glucose
- Sleep apnea / AHI
- Epigenetic clocks (Horvath, DunedinPACE, GrimAge)
- CIMT / CAC score (vascular imaging)
- DEXA bone density
- Resting metabolic rate
- Lab treadmill VO2 Max (vs Fitbit wrist estimate)
- Telomere length

---

## 10. Audit Priorities for Grok

### Algorithmic accuracy (highest value)
- Verify the PhenoAge formula coefficients against Levine 2018 (Aging journal, Table 2). Confirm all 10 coefficients and the two-step `M` and `PhenoAge` formulas are exact.
- Verify the ACSM 11th Edition VO2 Max thresholds in the table at Section 3E against the published 2022 ACSM Guidelines for Exercise Testing and Prescription.
- Assess whether the ×1.15 HRV scaling factor (Fitbit vs ECG) is reasonable. The published literature suggests overnight wrist PPG RMSSD can read higher than daytime ECG-derived values, but the exact scalar is not established in one study.
- Evaluate the synergy penalty design: is a +5-year synergy for 4+ bad domains clinically defensible, or is it ad hoc?

### Logic and data integrity
- Trace the biological age history storage: is it possible to accumulate multiple near-identical entries per day? If so, how does that affect `calculatePaceOfAging()`?
- Is the `getLabAgeAdjustment()` return value correctly bounded before being added to the metabolic domain? Trace the exact clamp chain.
- In `calculateRecovery()`, the `preAvgHRV` baseline uses historical data excluding today. Verify this is correctly passed from `doSync()` and that no circular dependency exists.
- Does `parseFitbitData()`'s side effect of calling `saveBodyWeightEntry()` ever execute in DEMO mode? What prevents it?

### Security
- OAuth tokens in localStorage are readable by any page-origin JavaScript (XSS risk). Is there anything in the app that mitigates this, or is it an accepted risk for a single-user local app?
- The `/api/push-subscribe` route saves a Web Push subscription to Vercel KV. Does it validate the Authorization Bearer token before writing? Is there a risk of subscription hijacking?

### Reliability
- `saveDaysBatch()` writes rows without a transaction. What is the worst-case outcome of a partial batch write, and is the next sync likely to recover cleanly?
- The `calculatePaceOfAging()` function is called on every render of the biological age screen. It parses localStorage JSON and runs calculations on every call. Is this memoized anywhere?

---

*Brief prepared: 2026-06-14. App branch: `claude/fitbit-app-ideas-zezgxj`. Build: clean, zero Vite errors.*
