# Soma — Complete Technical Breakdown for Audit

## What It Is
Single-user personal longevity PWA for one adult male using a Fitbit device. React 18 + Vite + Tailwind + Recharts. Hosted on Vercel. No backend, no server — all data stays client-side. OAuth tokens in localStorage.

**Intentional design decisions:** All norm tables are male-only (ACSM, Leong Lancet, Shaffer HRV medians). This is not a bug.

---

## File Structure

```
src/
  App.jsx                  — root: OAuth flow, sync orchestration, tab routing
  lib/
    api.js                 — Fitbit REST calls (14 parallel via Promise.all)
    auth.js                — OAuth 2.0 PKCE, token refresh, disconnect
    calculations.js        — all domain calculations (HRV, strain, sleep, etc.)
    labs.js                — blood panel input, PhenoAge (Levine 2018), TyG Index
    db.js                  — IndexedDB (health_dashboard DB, 90-day daily history)
    alerts.js              — threshold-based alert detection
    achievements.js        — streaks, personal records, badge unlocks
    notifications.js       — PWA push notifications
    backup.js              — JSON export/import of localStorage data
    pin.js                 — optional PIN lock
  screens/
    Home.jsx               — daily dashboard (ring chart, top metrics)
    Recovery.jsx           — recovery score breakdown, HRV/RHR/SpO2/BR trends, R:S ratio
    Strain.jsx             — strain score, zone minutes, training effect, ATL/CTL/TSB
    Sleep.jsx              — sleep score, debt, optimal window, stage breakdown
    Stress.jsx             — stress score, daytime HR elevation
    Healthspan.jsx         — biological age engine, longevity analysis
    Journal.jsx            — manual BP logging, notes
    Coach.jsx              — personalized recommendations
    Records.jsx            — personal records, achievements, badges
    Settings.jsx           — user profile, Fitbit connect/disconnect, lab input
```

---

## Data Flow

**On sync (App.jsx `doSync`):**
1. `loadDashboardData()` fires 14 Fitbit API calls in parallel:
   - `getDailySummary` — steps, calories, activeMinutes
   - `getHeartRateIntraday` — per-minute HR for the day
   - `getSleep(today)` — today's sleep session
   - `getHRV(today)` — RMSSD for today
   - `getSpO2(today)` — average SpO2 for today
   - `getRespiratoryRate(today)` — breathing rate
   - `getHRVRange(30d)` — HRV history for 30 days
   - `getHeartRateRange(7d)` — RHR history for 7 days
   - `getSleepRange(30d)` — 30 days sleep history (startTime/endTime included)
   - `getCardioFitness()` — VO2 Max (Fitbit string like "47-51", lower bound used)
   - `getSkinTemp(today)` — nightly relative skin temp deviation (°C)
   - `getBodyWeight()` — Fitbit-logged weight (last 1 month)
   - `getBodyFat()` — Fitbit-logged body fat %
   - `getSpO2Intraday(today)` — per-5-minute SpO2 during sleep (`/spo2/date/{date}/all.json`)

2. `parseFitbitData(raw)` extracts flat values; syncs Fitbit weight/fat logs into `weight_history` in localStorage

3. Calculations run on parsed data (see below)

4. `saveDay()` persists today's entry to IndexedDB (90-day rolling)

5. `getHistory(90)` fetches all IndexedDB rows for trend computation

6. `rsTrend`, `vo2MaxHistory`, `weeklyAZM`, `weeklyZone2` computed from IndexedDB + today

7. `calculateHRR`, `calculateSleepApneaRisk`, `calculateSocialJetLag` computed and added to `finalResult`

8. `saveSnapshot()` writes the full result to IndexedDB; `setAppData(finalResult)` triggers render

---

## calculations.js — All Functions

### `calculateStrain(hrIntradayData)`
Exponential zone-weighted strain score (0–21). Zones defined by Gellish non-linear formula: `maxHR = 192 - 0.007 × age²`. Zone weights: [0,1,2,4,8,16]. `strain = min(21, 5 + (raw/900)×16)`. Also updates `observed_max_hr` in localStorage if today's peak exceeds prior record.

### `calculateZoneMinutes(hrIntradayData)`
Returns `[z1, z2, z3, z4, z5]` minute counts. HR zone thresholds: 50/60/70/80/90% of maxHR.

### `calculateRecovery({ hrv, rhr, sleep, spo2, br, skinTempDev, hrvHistory, rhrHistory, ... })`
Whoop-style composite score 0–100:
- HRV score (40%): `hrv/avgHRV` ratio → clamp 0–100. Above ratio=1 scales to 100; below scales to 0.
- RHR score (25%): `50 + (avgRHR - rhr) × 5`, clamped 0–100.
- Sleep score (25%): `(hours/optimalHours)×70 + (efficiency/100)×30` + deep/REM stage modifiers (±2–3 pts each).
- SpO2 score (5%): gradient — ≥97=100, ≥95=75, ≥93=50, ≥90=25, else 0.
- BR score (5%): 12–18 br/min = 100, graduated down.
- Skin temp modifier: +0.3°C = -5 pts; <-0.3°C = +2 pts.

### `calculateSleepScore(sleep)`
`min(100, (minutesAsleep/480)×70 + (efficiency/100)×30)`. Duration normalized to 8h target.

### `calculateStressScore({ hrv, rhr, hrvHistory, rhrHistory })`
`hrvStress×0.6 + rhrStress×0.4`. HRV stress = `clamp((1 - hrv/avgHRV)×50 + 50, 0, 100)`.

### `calculatePhysiologicalAge({ avgHRV, avgRHR, avgSleep, sleepConsistency, avgSteps, weeklyAZM, vo2Max, avgDeepPct, avgRemPct, hrvHistory })`
5-domain biological age model. Reads additional data from localStorage directly.

**Domain 1: Cardiorespiratory (cardio)**
- VO2 Max vs. ACSM male norms (age-bracketed fair/good/excellent): -5 to +6
- HRV vs. Fitbit-adjusted RMSSD norms (Shaffer 2017 × 1.15): -3 to +4, with 7-day trend adjustment ±1
- RHR (<50 = -2, <60 = -1, <70 = 0, <80 = +2, <90 = +3, else +4)
- Capped: [-7, +9]

**Domain 2: Body Composition (composition)**
- Body fat % (ACE male ranges): 10–14% = -2, 15–19% = -1, 20–26% = 0, 27–31% = +3, ≥32% = +5. Falls back to BMI if no fat %.
- FFMI (lean mass / height²): >24 = -2, >21 = -1, ≥18 = 0, ≥16 = +2, else +3
- Waist circumference (cm): <90 = -1, <94 = 0, <102 = +2, ≥102 = +4
- Grip strength vs. Leong Lancet norms by age bracket: ratio ≥1.2 = -2, ≥1.0 = -1, ≥0.8 = 0, ≥0.65 = +2, else +3
- Capped: [-5, +8]

**Domain 3: Metabolic (metabolic)**
- BP: <120/80 = -1, <130/80 = 0, <140/90 = +1, <160/100 = +3, else +5
- HOMA-IR (glucose × insulin / 405): <1.0 = -1, <2.0 = 0, <3.0 = +2, <5.0 = +4, else +6
- TyG Index fallback (when HOMA-IR = 0, i.e. no fasting insulin): ln(trig × glucose / 2). <4.5 = -1, <4.68 = 0, <5.0 = +2, else +4
- Lab/PhenoAge adjustment from `getLabAgeAdjustment()`: capped [-4, +6]
- Capped: [-5, +10]

**Domain 4: Sleep (sleepD)**
- Duration: 7–9h = -1, 6–7h or >9h = +1, <6h = +3
- REM %: ≥22% = -1, <15% = +1
- Deep %: ≥18% = -1, <10% = +1
- Consistency (SRI or duration variance): ≥0.8 = -1, <0.5 = +1
- Capped: [-3, +5]

**Domain 5: Activity (activity)**
- Steps: ≥10k = -2, ≥7k = -1, ≥5k = 0, ≥3k = +1, else +3
- Weekly AZM: ≥500 = -2, ≥300 = -1, ≥150 = 0, ≥75 = +1, else +2
- Capped: [-3, +5]

**Lifestyle (uncapped):**
- Smoking: current = +7, former = +2, never = 0
- Alcohol: ≥14 drinks/wk = +3, ≥7 = +1

**Synergy bonus/penalty:**
Domains with ≥3 adverse years: 4+ domains = +5, 3 = +3, 2 = +1. Domains with ≤-2 years: 3+ = -2, 2 = -1.

**Final:** `userAge + adj`, clamped to [userAge-15, userAge+20], rounded.

### `calculateSRI(sleepHistory)`
Sleep Regularity Index (Phillips 2017). Compares sleep/wake state at every 5-minute mark from -360 to +1080 minutes across midnight, between consecutive nights. Returns fraction of matching states (0.0–1.0), or null if <2 nights available. Requires `startTime`/`endTime` in sleep history.

### `calculateHRR(hrIntradayData)`
Post-exercise Heart Rate Recovery (Cole NEJM 1999). Finds bouts where HR ≥ 70% maxHR for ≥5 consecutive minutes. Uses the last such bout. `peakHR = Math.max(all samples during bout)`. `hrr60 = peakHR - HR[boutEnd+1]`. Returns null if `hrr60 ≤ 0` (guards motion artifact). Returns `{ peakHR, hrr60, hrr120 }` or null.

### `calculateSocialJetLag(sleepHistory)`
SD of sleep midpoints in minutes across last 30 nights with startTime/endTime. Returns minutes as integer, or null if <5 nights. Reference: Roenneberg Curr Biol 2012.

### `calculateSleepApneaRisk({ spo2Intraday, br, todaySleep })`
Uses per-5-minute SpO2 readings filtered to sleep window (startTime→endTime). Computes: `minSpo2`, `avgSpo2`, `ODI` (oxygen desaturation events/hour, each 5-min interval below 94% = proxy event), `brElevated` (BR > 18). Risk tiers: Low / Moderate (<93% min or ODI>5 or BR elevated) / High (<88% or ODI>10) / Very High (<85% or ODI>15 or >2 readings below 90%). Returns object or null if no SpO2 data.

### `calculateSleepDebt(sleepHistory)`
Personal optimal sleep = top-25th percentile of sleep history, clamped 6.5–9.5h. Debt = sum of shortfalls over last 7 nights. Falls back to 8h target if <7 nights.

### `calculateOptimalSleepWindow(sleepHistory)`
Requires ≥7 nights with startTime/endTime. Computes median bedtime and wake time in minutes-from-midnight, handles midnight wrap. Also computes timing consistency = `max(0, 100 - stdDev(startMins)/1.5)`.

### `calculateTrainingLoad(strainHistory)`
7-day ATL and 42-day CTL using EWM. TSB = CTL - ATL. Form labels: Fresh (≥5), Neutral (-5 to 5), Loaded (-15 to -5), Overreached (<-15).

### `calculateTrainingEffect(zoneMinutes)`
Aerobic TE from Z2+Z3 minutes; anaerobic TE from Z4+Z5 minutes. Scores 0.0–5.0 using stepped thresholds. Labels: None / Minor Effect / Maintaining / Improving / Highly Improving / Overreaching.

### `calculateDaytimeStress(hrIntradayData, wakeHour, rhr)`
Filters to waking hours (wakeHour–22), non-exercise minutes (HR < 85% maxHR). Delta = avgDaytimeHR - RHR. Score: delta 0-5 bpm → 0-25, delta 5-15 → 25-75, delta 15+ → 75-100.

### `getHealthspanDeltas({ vo2Max, steps, weeklyAZM, avgHRV, avgSleepHours, bodyFatPct, waistCm, gripKg, bp })`
For each modifiable factor: computes current tier's bio age score, then next tier's score. Emits `{ label, gain, action }` for each factor where gain > 0. Sorted by highest gain.

### `calculatePaceOfAging()`
Reads `physio_age_history` from localStorage (daily snapshots of `physAge`). Returns `{ rate, bioAgeDelta, calDays }`. Rate < 1.0 = aging slower than calendar. Requires ≥7 days of history, ≥14-day span.

---

## labs.js — Key Functions

### `getPhenoAgeResult()`
Levine 2018 formula. Requires all 9 markers: albumin (g/dL), creatinine (mg/dL), glucose (mg/dL), CRP (mg/L), lymphocyte %, MCV (fL), RDW %, alkaline phosphatase (U/L), WBC (×10³/μL).

Unit conventions (DO NOT FLAG AS BUGS):
- Albumin stored and used in **g/dL** (reference range ~3.5–5.0)
- CRP stored in **mg/L** (not mg/dL)
- Glucose divided by 18.018 exactly once inside the formula (mg/dL → mmol/L conversion)

### `calculateTyGIndex(trig, glucose)`
`Math.round(Math.log(trig * glucose / 2) * 100) / 100`. Both inputs in mg/dL. Guards: both > 0.

### `getLabAgeAdjustment()`
Scores individual lab markers against reference ranges. Returns net year-equivalent adjustment capped to [-4, +6] before being applied in Domain 3.

---

## Storage Architecture

**localStorage keys:**
- `fitbit_access_token`, `fitbit_refresh_token`, `fitbit_token_expiry` — OAuth tokens
- `user_age`, `user_height_cm`, `user_weight_kg`, `user_body_fat_pct`, `user_units` (imperial/metric)
- `user_smoking` (never/former/current), `user_alcohol_week` (drinks/wk or null)
- `user_bp_systolic`, `user_bp_diastolic` — fallback static BP if no readings logged
- `bp_readings` — array of `{date, sys, dia}`, last 90 readings
- `weight_history` — array of `{date, kg, fatPct}`, last 365 entries (also synced from Fitbit)
- `grip_history` — array of `{date, kg}`, last 120 entries
- `waist_history` — array of `{date, cm}`, last 120 entries
- `lab_results` — `{[marker]: {value, date}}`
- `physio_age_history` — array of `{date, physAge}`, last 365 days (for pace-of-aging)
- `observed_max_hr` — device-observed peak HR (upgrades formula-based maxHR)
- `last_synced_at` — timestamp of last successful sync

**IndexedDB (`health_dashboard`):**
90-day daily snapshots with fields: `date`, `recovery`, `strain`, `sleep`, `hrv`, `rhr`, `spo2`, `br`, `steps`, `activeMinutes`, `zoneMinutes`, `vo2Max`, `zone2Minutes`, `skinTempDev`, etc.

---

## Screen Summaries

**Home.jsx** — Today's recovery ring + quick stats (strain, sleep, stress). Alert banner. Sync button.

**Recovery.jsx** — Recovery score with weight breakdown. Recovery Stability card (30-day avg + σ volatility). HRV/RHR/SpO2/BR trend charts (14 days). Skin temp deviation. Recovery:Strain ratio chart (last 14 calendar days). Recommendation card.

**Strain.jsx** — Strain score. Zone minutes bar chart. Training Effect (aerobic/anaerobic). ATL/CTL/TSB training load. Weekly pattern chart.

**Sleep.jsx** — Sleep score. Duration, efficiency, deep/REM stages. Sleep debt. Optimal sleep window (median bedtime/wake). 30-day sleep trend.

**Stress.jsx** — HRV-based stress score. Daytime HR elevation. 30-day trend.

**Healthspan.jsx** — Biological age (physiological vs chronological). PhenoAge progress/result. Body composition (weight, fat %, BMI, lean mass, FFMI). Weight/grip/waist/VO2 trend charts. BP trend (dual-line). Zone 2 weekly summary. Sleep Regularity Index. Heart Rate Recovery (HRR-60 and HRR-120). "What's Moving the Needle" — all contributions. "Longevity Profile" — top 3 assets vs top 3 liabilities. "Potential Years to Reclaim" — Healthspan Delta Engine. Circadian Alignment (social jet lag). Sleep Apnea Risk. Pace of Aging. Bloodwork Impact.

**Journal.jsx** — Manual BP entry. Daily notes.

**Coach.jsx** — Personalized protocol recommendations.

**Records.jsx** — Personal records (best recovery, best HRV, lowest RHR, etc.). Achievement badges.

**Settings.jsx** — Age, height, weight, body fat %, units, smoking, alcohol, grip, waist, BP. Fitbit OAuth connect/disconnect. Lab values entry. PIN lock. Backup/restore.

---

## Norm Tables (All Male-Only — Intentional)

```
VO2_NORMS_MEN (ACSM 2022):
  20-29: [34, 42, 53]
  30-39: [31, 39, 49]
  40-49: [27, 35, 45]
  50-59: [25, 34, 44]
  60+:   [22, 30, 40]
  Columns: [Fair, Good, Excellent] — below Fair = Poor, above Excellent+5 = Elite

HRV_NORMS_FITBIT_MEN (Shaffer 2017 ECG medians × 1.15 Fitbit correction):
  20s=69ms, 30s=53ms, 40s=40ms, 50s=33ms, 60+=28ms

GRIP_NORMS_MEN (Leong Lancet 2015):
  20s=47kg, 30s=46kg, 40s=43kg, 50s=39kg, 60+=33kg
```

---

## Recently Fixed Bugs (commit 50cff98)

1. **sri TDZ crash** — `const sri = calculateSRI(sleepHistory)` was declared after `const sleepConsistency = sri !== null ? ...` in Healthspan.jsx — threw `ReferenceError: Cannot access 'sri' before initialization` on every render. Fixed by reordering declarations.

2. **peakHR understatement in calculateHRR** — was using `pts[lastBout.end].value` (last above-threshold sample) instead of `Math.max(...pts.slice(lastBout.start, lastBout.end+1).map(p => p.value))`. Fixed.

3. **hrr60 negative display** — no guard against motion artifact elevating HR after bout end. Added `if (hrr60 <= 0) return null` in `calculateHRR`. The JSX renders `‐{data.hrr.hrr60}` with a hardcoded minus sign — since calculateHRR now guarantees hrr60 > 0 before returning, the display is always correct.

4. **rsTrend date scope mismatch** — `.slice(-14)` could span all 90 calendar days of sparse history while UI labeled chart "14 Days". Fixed with `d.date >= rsTrendCutoffStr` calendar-date filter (last 14 calendar days from `result.date`).

---

## Known Constraints / Not Bugs

- **HRR uses 1-minute post-bout samples**: Fitbit intraday HR is 1-sample-per-minute. HRR-60 is the drop from `peakHR` to the reading at `boutEnd + 1 minute`. This is the standard Cole 1999 protocol.
- **SpO2 intraday uses `oxygen_saturation` scope** — same scope as daily SpO2 summary. No additional OAuth permission needed.
- **VO2 Max is a Fitbit range string** — parsed as lower bound (`parseInt(String(raw).split('-')[0])`). Displayed as the full range string in UI.
- **HRV norms scaled ×1.15 from ECG reference** — compensates for Fitbit overnight RMSSD reading higher than daytime ECG reference values.
- **PhenoAge albumin in g/dL** — Levine formula coefficient `−0.0336` assumes g/dL input. Do not flag as a unit error.
- **BP delta `cur + 1` in Healthspan Delta Engine** — optimal BP tier is `-1` (bio years); adverse tier is `cur`; gain = `cur - (-1) = cur + 1`. Mathematically correct.
- **Single-user male only** — all female-specific norms absent by design.
