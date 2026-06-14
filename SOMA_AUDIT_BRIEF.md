# Soma — Independent Audit Brief
**For use by an independent LLM or developer reviewer**

This document gives you everything you need to audit the Soma app end-to-end: what it does, how every major algorithm works, what the data flow looks like, what was recently changed, known limitations, and specific questions worth investigating.

---

## 1. What The App Is

**Soma** is a personal longevity-tracking Progressive Web App (PWA) deployed on Vercel. It connects to the Fitbit Web API via OAuth 2.0 and displays health metrics focused on biological aging: recovery, sleep, HRV, VO2 max, body composition, bloodwork, and a 5-domain biological age estimate.

**Tech stack:**
- React 18, Vite, Tailwind CSS
- Recharts for all charts
- IndexedDB (via raw IndexedDB API, no wrapper) for 90-day daily history
- localStorage for user settings, lab results, BP readings, grip/waist history
- Vercel KV (Redis) for push notification state
- Vercel Cron for scheduled push notifications (morning, evening, wind-down)
- Web Push / VAPID for phone notifications
- pdfjs-dist v6.0.227 for on-device PDF blood lab extraction

**Fitbit device:** Google Fitbit Air (wrist wearable)

---

## 2. Data Flow

```
Fitbit Web API (13 parallel calls)
  → loadDashboardData() [src/lib/api.js]
  → parseFitbitData(raw) [src/lib/calculations.js]
  → processData(raw) in App.jsx
  → doSync() in App.jsx (adds IndexedDB history)
  → appData state (React useState)
  → Screen components receive data as props
```

### What each API call returns:
| Endpoint | What it gives us |
|---|---|
| `/activities/date/{today}` | steps, calories, active minutes |
| `/activities/heart/date/{today}/1d/1min` | intraday HR at 1-min resolution (for strain, zone minutes, daytime stress) |
| `/sleep/date/{today}` | tonight's sleep: duration, efficiency, stages |
| `/hrv/date/{today}` | overnight HRV (RMSSD in ms) |
| `/spo2/date/{today}` | blood oxygen % |
| `/br/date/{today}` | breathing rate while sleeping |
| `/hrv/date/{30daysAgo}/{today}` | 30-day HRV history |
| `/activities/heart/date/{7daysAgo}/{today}` | 7-day RHR history |
| `/sleep/date/{30daysAgo}/{today}` | 30-day sleep history |
| `/cardioscore/date/{7daysAgo}/{today}` | VO2 Max estimate (Fitbit range string like "47-51") |
| `/temp/skin/date/{today}` | nightly skin temp deviation from personal baseline (°C) |
| `/body/log/weight/date/{today}/1m` | 1 month of Fitbit-logged weight |
| `/body/log/fat/date/{today}/1m` | 1 month of body fat % |

All 13 calls run in parallel via `Promise.all`. Failed calls return `null` and the app handles nulls gracefully everywhere.

### IndexedDB schema (one row per day):
```
health_days: { date, recovery, strain, sleep, sleepEfficiency, stressScore,
               hrv, rhr, steps, calories, activeMinutes, vo2Max, zone2Minutes,
               spo2, br, skinTempDev }
snapshot: { id: 1, data: <full appData>, savedAt }
```

The snapshot is loaded on startup (instant display), then a background sync refreshes it.

---

## 3. Core Algorithms

### 3A. Recovery Score (0–100)

**File:** `src/lib/calculations.js` → `calculateRecovery()`

Composite of 5 signals, weighted:
```
HRV score (40%) + RHR score (25%) + Sleep score (25%) + SpO2 (5%) + BR (5%) + skin temp mod
```

**HRV scoring:** `hrv / avgHRV` ratio. Ratio ≥ 1.0 → 50–100; < 1.0 → 0–50. Uses running average of all prior days (not current day) as baseline to avoid self-reference.

**RHR scoring:** `avgRHR - rhr` = delta. Score = `50 + delta × 5`. Clamped 0–100.

**Sleep scoring:** `(hours / optimalHours) × 70 + (efficiency / 100) × 30`. Optimal hours = top-quartile average from personal history (minimum 7 nights, else 8h default). Deep/REM stage modifiers: ±2–5 points each.

**SpO2:** gradient: 100/75/50/25/0 at 97/95/93/90/below.

**Breathing rate:** 100 if 12–18, 75 if 10–22, 50 if 8–25, else 25.

**Skin temp mod:** +2 if < -0.3°C (good recovery), -5 if > +0.3°C (stress/illness).

Recovery score drives the "PEAK / GOOD / REST" label and ring color on the home screen.

---

### 3B. Strain Score (0–21)

**File:** `src/lib/calculations.js` → `calculateStrain()`

Uses 1-minute intraday HR data. Each HR data point → HR zone (0–5), zone → exponential weight `[0, 1, 2, 4, 8, 16]`. Raw sum divided by 900, scaled to 5–21 range.

Max HR formula: `192 - 0.007 × age²` (Gellish non-linear formula). Upgraded by observed device peak HR stored in localStorage.

HR zones: Zone 0 (<50% maxHR), Zone 1 (50–60%), Zone 2 (60–70%), Zone 3 (70–80%), Zone 4 (80–90%), Zone 5 (>90%).

---

### 3C. Biological Age (5-Domain Model)

**File:** `src/lib/calculations.js` → `calculatePhysiologicalAge()`

**Domains and capping:**
```
Cardiorespiratory Fitness: capped −7 to +9
Body Composition:          capped −5 to +8
Metabolic Health:          capped −5 to +10
Sleep & Recovery:          capped −3 to +5
Activity:                  capped −3 to +5
Lifestyle (smoking/alcohol): uncapped (smoking = up to +7 years)
```

**Synergy penalty** (from Framingham/SCORE2 risk models — risk factors multiply):
- 4+ domains bad (≥3 years each): +5 years
- 3+ domains bad: +3 years
- 2+ domains bad: +1 year
- 3+ domains good (≤−2 each): −2 years
- 2+ domains good: −1 year

**Final age:** `userAge + adj`, clamped to `userAge−15` to `userAge+20`.

#### Domain 1: Cardiorespiratory Fitness

**VO2 Max scoring** (ACSM norms, Mandsager JAMA 2018):
| Age group | Fair | Good | Excellent |
|---|---|---|---|
| 20–29 | 25 | 33 | 42 |
| 30–39 | 23 | 30 | 39 |
| 40–49 | 20 | 27 | 36 |
| 50–59 | 18 | 24 | 33 |
| 60+ | 16 | 22 | 30 |

VO2 ≥ excellent+5 → −5y (Elite). VO2 ≥ excellent → −3y (Superior). VO2 ≥ good → −1y. VO2 ≥ fair → +2y. VO2 ≥ fair×0.8 → +4y. Below → +6y.

**HRV scoring** (Shaffer & Ginsberg 2017, scaled ×1.15 for Fitbit overnight context):
| Age group | Fitbit norm (ms) |
|---|---|
| 20–29 | 69 |
| 30–39 | 53 |
| 40–49 | 40 |
| 50–59 | 33 |
| 60+ | 28 |

Ratio = `avgHRV / norm`. ≥1.5 → −3y, ≥1.2 → −1y, ≥0.85 → 0y, ≥0.65 → +2y, else +4y.

**HRV trend weighting** (added in recent session): if recent 7 days vs prior 7 days shows >6% improvement → shift one tier better (min −3). If >8% decline → shift one tier worse (max +4). Requires 4+ valid readings in each window.

**RHR scoring** (Zhang Heart 2016: each 10bpm above 60 = ~9% higher all-cause mortality):
< 50 → −2y, < 60 → −1y, < 70 → 0y, < 80 → +2y, < 90 → +3y, else +4y.

#### Domain 2: Body Composition

Body fat % (Bhaskaran Lancet 2018) — male ACE ranges:
< 10% → 0 (essential fat, not protective). < 15% → −2y (athletic). < 20% → −1y. < 27% → 0y. < 32% → +3y. Else → +5y.

FFMI (Fat-Free Mass Index = lean kg / height_m²): > 24 → −2y, > 21 → −1y, ≥ 18 → 0y, ≥ 16 → +2y, else +3y.

Waist circumference (WHO/IDF men): < 90cm → −1y, < 94cm → 0y, < 102cm → +2y, else +4y.

Grip strength (Leong Lancet 2015, each 5kg lower = 16% higher mortality) — uses same age norms as HRV: ratio to norm → −2/−1/0/+2/+3y.

#### Domain 3: Metabolic Health

BP (Ettehad Lancet 2016): optimal (<120/80) → −1y, elevated → +1y, Stage 1 HTN → +3y, Stage 2 → +5y.

HOMA-IR = (glucose × insulin) / 405 (Matthews 1985): < 1.0 → −1y, < 2.0 → 0y, < 3.0 → +2y, < 5.0 → +4y, else +6y. ⚠️ Only valid for fasting values — no warning currently shown in the UI.

PhenoAge (Levine 2018): when all 9 markers present, uses validated formula. When partial, additive scoring from individual lab markers. Clamped ±8 years.

#### Domain 4: Sleep & Recovery

Duration U-curve (Cappuccio Sleep 2010): 7–9h → −1y, 6–7h or >9h → +1y, <6h → +3y.
REM ≥ 22% → −1y, < 15% → +1y.
Deep ≥ 18% → −1y, < 10% → +1y.
Consistency (nightly variation): ≥ 80% consistent → −1y, < 50% → +1y.

#### Domain 5: Activity

Steps (Paluch JAMA NM 2022): ≥10,000 → −2y, ≥7,000 → −1y, ≥5,000 → 0y, ≥3,000 → +1y, else +3y.

Zone 2 AZM (Arem JAMA IM 2015): weekly Zone 2 minutes from true 7-day rolling sum: ≥500 → −2y, ≥300 → −1y, ≥150 → 0y, ≥75 → +1y, else +2y.

---

### 3D. PhenoAge (Levine 2018 Exact Formula)

**File:** `src/lib/labs.js` → `calculatePhenoAge()`

Requires all 9 markers: albumin (g/dL), creatinine (mg/dL), glucose (mg/dL), hs-CRP (mg/L), lymphocyte %, MCV (fL), RDW (%), alkaline phosphatase (U/L), WBC (K/µL).

```
xb = -19.9067
     - 0.0336 × albumin
     + 0.0095 × (creatinine × 88.4)   [converted to µmol/L]
     + 0.1953 × glucose
     + 0.0954 × ln(max(0.01, CRP))
     - 0.0120 × lymphocyte
     + 0.0268 × MCV
     + 0.3306 × RDW
     + 0.00188 × alk_phos
     + 0.0554 × WBC
     + 0.0804 × age

M = 1 - exp(-exp(xb) × 1.51714 / 0.0076927)
PhenoAge = 141.50225 + ln(-0.00553 × ln(1 - M)) / 0.090165
```

Guard: if `M → 1` (extreme values), `PhenoAge` → infinity. The code guards with `if (!isFinite(phenoAge)) return null`.

The 9-marker progress indicator in the UI shows which specific markers are still missing.

---

### 3E. Zone 2 Weekly Minutes

**Important:** "Zone 2" in this app is the *app's own calculation* using 60–70% of the user's computed max HR from intraday HR data. This is **not** the same as Fitbit's native "Fat Burn" zone, which uses 50–69% maxHR. The numbers will differ from what the user sees in the Fitbit app. This is labeled as "60–70% max HR from your intraday data" in the UI.

Weekly total = today's Zone 2 minutes + sum of `zone2Minutes` field from last 6 days in IndexedDB.

---

### 3F. VO2 Max

Fitbit returns VO2 Max as a string range like `"47-51"`. The app parses the lower bound as the numeric score for calculations, but now displays the full range (e.g. "47-51 mL/kg/min (Fitbit range)") in the Healthspan screen.

VO2 Max history is built from IndexedDB rows where `vo2Max > 0`, plus today's reading appended if not already present. Fitbit updates this infrequently (typically weekly based on exercise sessions), so the history chart may be sparse for new users.

---

## 4. Data Persistence Strategy

| Data type | Storage | TTL / retention |
|---|---|---|
| Daily health snapshots | IndexedDB `health_days` | 90 days |
| Full app state | IndexedDB `snapshot` | 1 entry (latest) |
| Tokens (OAuth) | localStorage | Until expiry |
| User settings (age, height, weight, units) | localStorage | Permanent |
| Lab results | localStorage `lab_results` | Permanent |
| BP readings | localStorage `bp_readings` | 90 entries |
| Grip history | localStorage `grip_history` | 120 entries |
| Waist history | localStorage `waist_history` | 120 entries |
| Weight history | localStorage `weight_history` | 365 entries |
| Biological age history | localStorage `physio_age_history` | 365 entries |
| Push subscription | Vercel KV | Until unsubscribe |
| Push prefs | localStorage + Vercel KV | Permanent |

---

## 5. Notification System

**In-app (Notification API):** fires immediately after sync. Three types:
- Red zone recovery (< 34) — once per day
- Sleep debt ≥ 3 hours — once per day  
- High stress > 78 — once per day
- Achievement unlocks — immediate

**Data entry reminders** (BP Mon/Wed/Fri; body metrics monthly; labs quarterly) — also fire once per day via `fireDataEntryReminders()` after sync.

**Push notifications (Web Push / VAPID):** scheduled via Vercel Cron:
- Morning: 7am (or user-configured) — recovery, strain, stress snapshot
- Evening: 9pm — sleep prep score
- Wind-down: 10pm (optional) — sleep window reminder
- Embedded data reminder if relevant for the day

Push state (subscription endpoint, preferences) stored in Vercel KV. All push routes are in `api/` folder (Vercel serverless functions).

---

## 6. Recent Changes Made (This Development Session)

All on branch `claude/fitbit-app-ideas-zezgxj`. Two commits:

### Commit 1: 7 expert longevity improvements
1. **VO2 Max range display:** shows "47-51 mL/kg/min" not just "47"
2. **VO2 Max trend chart:** LineGraph of historical VO2 readings from IndexedDB
3. **Zone 2 weekly minutes:** true 7-day rolling sum; shown as first-class metric card with progress bar toward 150/300 min targets
4. **Grip strength history:** time-series logging via `saveGripEntry(date, kg)`; trend chart in Body Composition section
5. **Waist circumference history:** same pattern via `saveWaistEntry(date, cm)`; trend chart with 94cm risk reference line
6. **BP trend chart:** DualLineGraph (red=systolic, blue=diastolic) with 120/80 reference lines
7. **HRV trend weighting:** biological age now rewards week-over-week HRV improvement by shifting one tier (requires 4+ readings in each 7-day window)
8. **PhenoAge progress bar:** shows X/9 markers with missing marker names listed; replaces blank space when PhenoAge can't be computed
9. **IndexedDB persistence:** `saveDay()` now stores `vo2Max`, `zone2Minutes`, `spo2`, `br`, `skinTempDev` per day

### Commit 2: 4 audit fixes
1. **VO2 history today gap:** dbHistory fetched before `saveDay`, so today was always missing. Fixed by appending today's reading explicitly if not present.
2. **Waist precision:** imperial→cm conversion was `Math.round(inches × 2.54)` (integer). Fixed to `Math.round(inches × 2.54 × 10) / 10` (one decimal).
3. **Zone 2 label:** removed "Fitbit Zone 2" wording since Fitbit uses different zone boundaries. Now says "60–70% max HR from your intraday data."
4. **useMemo performance:** `hrvHistory` array changed reference on every render, causing biological age to recalculate every render. Fixed by tracking `data.hrvHistory?.length` as the dep instead of the array object.

---

## 7. Known Limitations

1. **Male-only norm tables.** All HRV norms, grip norms, VO2 norms, waist thresholds, and body fat labels are calibrated for men. There is no gender input in the app. Female users will get incorrect biological age estimates.

2. **HOMA-IR fasting requirement.** The app calculates HOMA-IR from lab-entered glucose and insulin values, but does not warn the user that both values MUST be fasting. Non-fasting values will produce meaningless results that silently affect biological age.

3. **VO2 Max is a range, not a precise number.** Fitbit uses a proprietary model and returns a range (e.g. "47-51"). The app uses the lower bound for scoring. Users with high fitness may be underscored.

4. **Zone 2 vs Fitbit Fat Burn zone mismatch.** As noted above, the app computes its own Zone 2 from intraday data. The user's Fitbit app will show different Zone 2 numbers.

5. **PhenoAge requires all 9 markers.** If any one of the 9 markers is missing, PhenoAge is `null` and the metabolic domain falls back to additive individual-marker scoring, which is less reliable.

6. **Biological age is an estimate, not a clinical measurement.** The 5-domain model is designed for direction and trend, not absolute accuracy. The UI states "±~3y" but this may understate uncertainty for users with unusual physiological profiles.

7. **IndexedDB is device-local.** No cloud sync of history. If the user clears browser data or switches devices, history is lost. The backup system (`createBackup()`) writes to Google Drive if configured.

8. **VO2 Max history is sparse.** Fitbit only updates cardio fitness score when the user does GPS or workout sessions. New users or low-exercise periods will have very few history points.

9. **Vercel KV for push state is shared.** All users' push subscriptions go into the same KV namespace. There is no isolation or per-user key prefix. If multiple users register, their push prefs could collide. (The app appears to be single-user only based on design.)

10. **Skin temp deviation.** Fitbit only provides the nightly *relative* deviation, not an absolute temperature. The recovery scoring uses this correctly (deviation vs baseline), but the data is only meaningful after Fitbit establishes a personal baseline (~several weeks of wear).

---

## 8. Audit Questions — Suggested Focus Areas

### Algorithm correctness
- Do the VO2 Max norms match ACSM 2022 published tables for the relevant age groups?
- Is the HRV ×1.15 Fitbit scaling factor defensible? The published Shaffer & Ginsberg norms are ECG-based; overnight wrist photoplethysmography HRV reads differently.
- In `calculateRecovery()`, the `preAvgHRV` for historical recovery calculation uses a running sum that includes the current day — is this correct? Check lines 200–230 in App.jsx.
- The PhenoAge formula: verify the exact coefficients against Levine 2018 (Aging journal). The creatinine unit conversion (×88.4 for mg/dL → µmol/L) is critical — verify this is correct.
- Is the synergy penalty system (compounding bad domains) supported by the cited literature, or is it an ad-hoc addition?

### Data flow integrity
- When `doSync()` runs in the background (showSpinner=false) while a snapshot is already displayed, what happens if `processData()` fails partway through? Does the user see stale or partial data?
- The `syncInFlight` ref prevents overlapping syncs. But if the page is closed mid-sync, the ref resets and next load will sync cleanly. Is there any risk of a partial write to IndexedDB?
- `parseFitbitData()` calls `saveBodyWeightEntry()` as a side effect during a pure parsing function. Is this the right place for this, or does it risk executing when `parseFitbitData` is called in test/demo contexts?

### Security
- OAuth tokens are stored in localStorage. This is accessible to any JavaScript on the page (XSS risk). Is there a plan to use httpOnly cookies or memory-only storage?
- The `/api/token` endpoint exchanges the OAuth code for tokens. Is the client secret stored only on the server (Vercel env var), never in client code?
- The Vercel KV push subscription endpoint (`/api/push-subscribe`) uses `Authorization: Bearer {access_token}`. Does the API route validate this token before writing to KV?

### Performance
- `loadDashboardData()` fires 13 parallel Fitbit API calls. Fitbit has a rate limit (150 requests per hour per user). On initial load after a long gap, does the app hit this limit?
- `getLabContributions()` and `getLabAgeAdjustment()` both call `getLabResults()` independently (two localStorage reads on each render of Healthspan). Could be memoized.
- The `calculatePhysiologicalAge()` function reads 8 localStorage values on every call. If called frequently, this could add up, though it's protected by `useMemo`.

### Reliability
- `getBPReadings()`, `getGripHistory()`, `getWaistHistory()` all parse localStorage JSON inline in the component render path. What happens if localStorage contains corrupted JSON? (They return `[]` on catch, which is correct, but verify.)
- The `pruneNotifFlags()` function iterates `localStorage` by index while potentially deleting items. Deleting items while iterating by index can cause items to be skipped. Review this pattern.
- `saveDaysBatch()` in `db.js` writes rows sequentially in a for-loop, not in a single transaction. This means a crash mid-batch leaves partial data without rollback.

---

## 9. File Map

```
src/
  App.jsx                  — root component, sync orchestration, DEMO data
  lib/
    api.js                 — Fitbit API calls (13 endpoints, Promise.all)
    auth.js                — OAuth 2.0 PKCE flow, token storage/refresh
    calculations.js        — ALL health algorithms (biological age, recovery, strain, etc.)
    labs.js                — Lab marker definitions, PhenoAge formula, contribution scoring
    db.js                  — IndexedDB read/write (saveDay, getHistory, snapshot)
    notifications.js       — In-app + Web Push subscription management
    achievements.js        — Personal records, streaks, unlock logic
    alerts.js              — Alert detection (overtraining, illness signals)
    backup.js              — Google Drive backup (fire-and-forget after sync)
    pdfLabExtract.js       — On-device PDF text extraction for blood labs
    correlations.js        — Cross-metric correlation analysis
  screens/
    Healthspan.jsx         — Biological age UI (the most complex screen)
    Home.jsx               — Dashboard home
    Recovery.jsx / Strain.jsx / Sleep.jsx / Stress.jsx — metric screens
    Journal.jsx            — BP logging, body metrics, notes
    Coach.jsx              — Claude API integration for longevity coaching
    Settings.jsx           — All user settings, Fitbit connect, push prefs
    Records.jsx            — Personal records and weekly pattern
  components/
    TrendChart.jsx         — LineGraph, BarGraph, DualLineGraph (Recharts wrappers)
    ScoreRing.jsx          — SVG circular progress ring
    AlertBanner.jsx        — Top-of-screen alert strip
    LabResultsSection.jsx  — Lab entry form
    CalendarHeatmap.jsx    — 90-day calendar grid
api/
  token.js                 — OAuth token exchange (server-side, has client secret)
  refresh.js               — Token refresh endpoint
  push-*.js                — Web Push subscribe/send/prefs
  vapid-key.js             — Returns public VAPID key to client
```

---

## 10. Data The App Does NOT Currently Collect

For completeness, these longevity markers exist in the scientific literature but are not yet in this app:
- Continuous Glucose Monitor (CGM) data
- Sleep apnea / AHI score
- Resting metabolic rate
- Bone density (DEXA)
- Gut microbiome markers
- Epigenetic clocks (Horvath, DunedinPACE) — require specialized lab tests
- Telomere length
- Cardiovascular imaging (CAC score, CIMT)
- Exercise ECG / VO2 Max from treadmill test (vs wrist-estimated)

---

*Last updated: 2026-06-14. Branch: `claude/fitbit-app-ideas-zezgxj`. Build: clean (Vite, zero errors).*
