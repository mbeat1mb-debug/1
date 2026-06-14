# Soma — Technical Audit Brief v2
**Date:** 2026-06-14  
**Repo:** mbeat1mb-debug/1  
**Branch:** claude/fitbit-app-ideas-zezgxj  
**Scope:** Single-user personal longevity PWA for one adult male. All male-only norms are intentional — ignore gender-neutralization suggestions.

---

## 1. Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18, Vite, Tailwind CSS |
| Charts | Recharts (via LineGraph / DualLineGraph wrappers) |
| Deployment | Vercel (PWA, installable) |
| Device data | Fitbit Web API — OAuth 2.0 PKCE flow |
| Long-term storage | IndexedDB (`health_dashboard` DB) via `src/lib/db.js` |
| User settings / labs / logs | localStorage |
| Auth tokens | localStorage (`fitbit_tokens`) |

---

## 2. Data Flow

```
Fitbit API (14 parallel calls via Promise.all)
    ↓
loadDashboardData() → src/lib/api.js
    ↓
parseFitbitData(raw) → src/lib/calculations.js
    - Produces: todayHRV, todayRHR, todaySleep, todaySpO2, todayBR
    - Produces: hrvHistory[], rhrHistory[], historyDates[], sleepHistory[]
    - Produces: vo2Max (midpoint of Fitbit range string like "47-51")
    - Produces: hrIntradayData (raw intraday 1-min HR dataset)
    - Side-effect: writes Fitbit body weight/fat into localStorage weight_history
    ↓
processData(raw) → App.jsx
    - Per-day recovery/stress history loop (running baseline, not global average)
    - calendarDays[] = {date, recovery, sleep, hrv, rhr, strain}
    - Calls: calculateStrain, calculateZoneMinutes, calculateTrainingEffect
    - Calls: calculateSleepDebt, calculateOptimalSleepWindow
    - Calls: calculateHRR(hrIntradayData) → {peakHR, hrr60, hrr120}
    - Calls: calculateSleepApneaRisk({spo2Intraday, br, todaySleep})
    - Calls: calculateSocialJetLag(sleepHistory)
    - Calls: saveDay() → IndexedDB upsert for today
    - Calls: saveSnapshot(physioAge) → localStorage physio_age_history[]
    ↓
appData{} → passed as `data` prop to each screen
```

**14 Fitbit API calls (all parallel):**
1. `/activities/date/{today}` — daily summary (steps, calories, activeMinutes)
2. `/activities/heart/date/{today}/1d/1min` — intraday HR (1-min resolution)
3. `/1.2/sleep/date/{today}` — today's sleep
4. `/hrv/date/{today}` — today's HRV (RMSSD)
5. `/spo2/date/{today}` — today's SpO2 daily average
6. `/br/date/{today}` — today's breathing rate
7. `/hrv/date/{-30d}/{today}` — HRV 30-day range
8. `/activities/heart/date/{-7d}/{today}` — HR 7-day range (for RHR history)
9. `/1.2/sleep/date/{-30d}/{today}` — Sleep 30-day range
10. `/cardioscore/date/{-7d}/{today}` — VO2 Max (Cardio Fitness Score)
11. `/temp/skin/date/{today}` — Skin temperature (nightly relative deviation)
12. `/body/log/weight/date/{today}/1m` — 1 month body weight log
13. `/body/log/fat/date/{today}/1m` — 1 month body fat log
14. `/spo2/date/{today}/all.json` — SpO2 intraday (5-min intervals, for ODI)

**OAuth scopes required:** `activity`, `heartrate`, `sleep`, `oxygen_saturation`, `respiratory_rate`, `cardio_fitness`, `temperature`, `weight`

---

## 3. Storage

### IndexedDB (`src/lib/db.js`)
- `health_dashboard` DB, `daily_health` object store
- `saveDay(entry)` — `objectStore.put(entry)` (upsert, keyed by `date`)
- `getHistory(n)` — returns last n days sorted ascending
- `saveSnapshot(physioAge, date)` — appended to `physio_age_history` in localStorage (not IndexedDB)

### localStorage keys
| Key | Content |
|-----|---------|
| `journal_entries` | Daily tag + notes + energy logs |
| `custom_tags` | User-created journal tags |
| `substance_timing_log` | Timed substance intake entries |
| `bp_readings` | Blood pressure time-series (last 90) |
| `grip_history` | Grip strength entries (last 120) |
| `waist_history` | Waist circumference entries (last 120) |
| `weight_history` | Body weight + fat% entries (last 365) |
| `lab_results` | Lab marker values (JSON object, ~30 markers) |
| `physio_age_history` | [{date, physAge}] for pace-of-aging |
| `user_age`, `user_height_cm`, `user_weight_kg` | Quick-access user profile |
| `user_body_fat_pct`, `user_waist_cm`, `user_grip_kg` | Manual body composition |
| `user_smoking`, `user_alcohol_week` | Lifestyle factors |
| `user_bp_systolic`, `user_bp_diastolic` | Static BP fallback |
| `observed_max_hr` | Device-observed peak HR (guarded by formula+20 cap) |
| `fitbit_tokens` | OAuth access + refresh tokens |
| `last_synced_at` | Unix ms timestamp of last successful sync |

---

## 4. Screens

### Home (`src/screens/Home.jsx`)
- Main score ring (recovery %)
- Quad stats: HRV, RHR, sleep, SpO2
- Calendar heatmap: 90-day recovery × strain dots
- RS Trend chart: last 14 calendar days of recovery/strain ratio
- Alert banners (detectAlerts in `src/lib/alerts.js`)
- Achievement badges
- Training Load card (ATL/CTL/TSB)
- Weekly pattern bar chart (average recovery by day of week)

### Recovery (`src/screens/Recovery.jsx`)
- Recovery score ring + weight breakdown (HRV 40%, RHR 25%, Sleep 25%, SpO₂+BR 10%)
- Recovery Stability card: 30-day average + volatility (σ)
- HRV and RHR 14-day trend charts
- SpO₂ and breathing rate 14-day trend (loaded from IndexedDB, not appData)
- Skin temperature deviation
- Blood pressure (rolling avg of last 10 logged readings)
- Yesterday's substance log (from timing log)
- Timing correlation insights (guarded by `!data.isDemo`)
- Recovery guidance (narrative recommendation)

### Strain (`src/screens/Strain.jsx`)
- Daily strain score (0–21 scale, exponential zone weighting)
- Zone minutes breakdown (Z1–Z5)
- Training Effect (aerobic + anaerobic, scored 0–5)
- HRR (post-exercise heart rate recovery): peakHR, HRR-60, HRR-120
- Daytime stress score (sympathetic load from waking-hour intraday HR)
- ATL/CTL/TSB training load chart

### Sleep (`src/screens/Sleep.jsx`)
- Sleep score ring
- Sleep debt (vs personal optimal = top-quartile of last 30 nights)
- Optimal sleep window (median bedtime/wake from last 30 nights)
- Deep% and REM% history
- Sleep Regularity Index (SRI, Phillips 2017) — probability of same state 24h apart
- Social Jet Lag — SD of sleep midpoints, Roenneberg Curr Biol 2012
- Sleep apnea risk panel (see Section 5)

### Stress (`src/screens/Stress.jsx`)
- Stress score: HRV (60%) + RHR (40%) vs 14-day baseline
- Daytime HR stress (above-RHR elevation during waking hours)
- 30-day stress trend chart
- Stress guidance narrative

### Healthspan (`src/screens/Healthspan.jsx`)
- Biological Age meter: physioAge vs chronoAge
- PhenoAge overlay (Levine 2018) when all 9 markers entered
- "What's Moving the Needle" — per-domain contributions
- Healthspan Delta Engine — ranked list of modifiable factors (biggest bio-age gain first)
- VO2 Max trend (midpoint of Fitbit range)
- Pace of Aging — longitudinal bio-age rate (bio years / calendar year)
- SRI-based sleep consistency used when startTime/endTime available
- Lab markers panel (30+ markers, graded, with PhenoAge and TyG)
- Body composition panel: weight, body fat %, lean mass, FFMI, waist, grip
- BP log and trend

### Journal (`src/screens/Journal.jsx`)
- Daily tag selection (16 default tags + custom tags)
- Categories: intake, sleep, mental, activity, health, recovery, custom
- Energy level 1–5 self-rating
- Blood pressure entry (time-series, saved per-date)
- **Substance Timing Log** — time-stamped intake of 8 substances
- Tag correlation analysis (vs recovery score, min n=3 each group)
- Energy correlation analysis (min n=5 pairs)

### Coach (`src/screens/Coach.jsx`)
- Narrative AI-style recommendations based on all data
- Training readiness, sleep debt warnings, HRV trend alerts

### Records (`src/screens/Records.jsx`)
- Personal records: best recovery, best HRV, lowest RHR, highest strain, most steps
- Achievement badges system (unlocked from `src/lib/achievements.js`)
- Streak tracking: consecutive recovery, sleep, low-stress days

### Settings (`src/screens/Settings.jsx`)
- Fitbit OAuth connect/disconnect
- Age, height, weight, body fat %, waist, grip strength manual entry
- Smoking status, alcohol drinks/week
- Lab values entry (30+ markers)
- Units (imperial/metric)
- PIN lock
- Data export (JSON backup)
- Notification permissions

---

## 5. Core Algorithms

### 5.1 Recovery Score (`calculateRecovery`)
Weighted sum, 0–100:
- **HRV (40%):** ratio of today vs rolling mean. Above mean → ramps 50→100; below → ramps 0→50
- **RHR (25%):** `50 + (avgRHR - todayRHR) × 5`, clamped 0–100
- **Sleep (25%):** duration/optimal × 70 + efficiency/100 × 30, ±3–5 points for deep/REM%
- **SpO₂ (5%):** 100/75/50/25/0 at 97/95/93/90%+
- **BR (5%):** 100 at 12–18 br/min, graduated penalties beyond
- **Skin temp modifier:** ±2–5 pts if deviation >0.3°C

Per-day historical recovery uses a running pre-average baseline (not global), preventing look-ahead bias.

### 5.2 Strain Score (`calculateStrain`)
Zone weighting: Z0=0, Z1=1, Z2=2, Z3=4, Z4=8, Z5=16 (per minute)  
`strain = min(21, 5 + (raw/900) × 16)`  
maxHR: Gellish non-linear formula `192 − 0.007 × age²`; upgrades via observed device peak, guarded by formula+20 bpm cap.

### 5.3 Biological Age (`calculatePhysiologicalAge`)
5 domains + lifestyle + synergy. Each domain clipped before summing:

| Domain | Cap | Key inputs |
|--------|-----|-----------|
| Cardio | [−7, +9] | VO2 Max (ACSM norms), HRV (Shaffer norms × 1.15 for Fitbit overnight), RHR |
| Composition | [−5, +8] | Body fat %, FFMI, waist cm, grip kg (Leong Lancet 2015) |
| Metabolic | [−5, +10] | BP, HOMA-IR, TyG index, lab age adjustment (PhenoAge) |
| Sleep | [−3, +5] | Avg sleep hours (Cappuccio U-curve), deep%, REM%, SRI |
| Activity | [−3, +5] | Avg steps (Paluch JAMA 2022), weekly AZM (Arem JAMA 2015) |
| Lifestyle | uncapped | Smoking (+7 current / +2 former), alcohol (drinks/week) |
| Synergy | [−2, +5] | Compounding risk: +1/3/5 when 2/3/4+ domains ≥3 years adverse |

Output clamped to `[userAge−15, userAge+20]`.

### 5.4 PhenoAge (Levine 2018, `src/lib/labs.js`)
Exact NHANES coefficients. Inputs and required units:
- albumin (g/dL), creatinine (mg/dL), glucose (mg/dL → converted to mmol/L ÷18.018 internally)
- CRP stored as `hscrp` (mg/L), floored at 0.01 for ln()
- lymphocyte (%), MCV (fL), RDW (%), ALP (U/L), WBC (×10³/µL), age (years)

Requires all 9 markers; returns null otherwise.

### 5.5 Post-Exercise HRR (`calculateHRR`)
Detects last vigorous bout: ≥5 consecutive minutes at ≥70% maxHR.  
`peakHR` = `Math.max()` over entire bout (not just final point).  
`hrr60` = peakHR − HR at `lastBout.end + 1` index.  
`hrr120` = peakHR − HR at `lastBout.end + 2` index; null if ≤0.  
Both nulled if ≤0 (motion artifact guard). Ref: Cole NEJM 1999 (<12 bpm = mortality signal).

**Known limitation:** `pts[lastBout.end + 1]` is the first sample after the last in-bout index, not literally 60 seconds post-peak. On tapered efforts where true peak is mid-bout, `hrr60` is computed from peak to first sub-threshold sample — slightly inflated vs. strict Cole protocol. Accurate when HR stays near peak until bout ends (typical steady-state efforts).

### 5.6 Sleep Regularity Index (`calculateSRI`)
Phillips et al. 2017. Pairwise 5-minute sampling of consecutive nights (−360 to +1080 min relative to date midnight). `SRI = matchMinutes / totalMinutes`.  
Used in biological age domain 4 as sleep consistency metric (preferred over duration variance when startTime/endTime available).

### 5.7 Social Jet Lag (`calculateSocialJetLag`)
Roenneberg Curr Biol 2012. SD of sleep midpoints across last 30 nights.  
**Normalization fix:** If `s0 > 1200 min` (Fitbit `dateOfSleep` is wake date, so startTime appears "20+ hours after midnight"), subtract 1440 to normalize to previous evening. Prevents variance inflation from mixed conventions.  
Returns SD in minutes. Thresholds: <30 min = Low, 30–60 = Moderate, >60 = High.

### 5.8 Sleep Apnea Risk (`calculateSleepApneaRisk`)
Inputs: `spo2Intraday.minutes[]` (5-min SpO₂ readings), `br`, `todaySleep`.  
Filters readings to sleep window (startTime–endTime) when available.

**ODI algorithm (current):**
1. Sort readings ascending; `baseline = min(97, vals[floor((n-1) × 0.9)])` — 90th percentile, correctly indexed
2. `dropThreshold = baseline − 3`
3. State machine: enter event when `v ≤ dropThreshold`; exit when `v > dropThreshold`; count events
4. `ODI = eventCount / sleepHours`

**Risk tiers:**
- Very High: `minSpO₂ < 85` OR `ODI > 15` OR `below90 > 2` (>10 min below 90%)
- High: `minSpO₂ < 88` OR `ODI > 10`
- Moderate: `minSpO₂ < 93` OR `ODI > 5` OR `brElevated` (BR > 18)
- Low: otherwise

**Note:** `below90 > 2` uses interval count (5-min samples), while ODI is event count — these are separate clinical signals. A sustained 30-min plateau at 88% shows `ODI ≈ 0.1/hr` but triggers Very High via `below90`. This is clinically valid (time-below-90 is an independent severity marker) but the ODI display will look low alongside a Very High label.

### 5.9 Training Load (ATL/CTL/TSB)
Exponential weighted moving averages:  
`ATL`: 7-day EWM (`k = 2/8`)  
`CTL`: 42-day EWM (`k = 2/43`)  
`TSB = CTL − ATL` → Fresh (≥5), Neutral (≥−5), Loaded (≥−15), Overreached (<−15)

### 5.10 TyG Index (`getTyGIndex`, `src/lib/labs.js`)
`TyG = ln(triglycerides_mg/dL × glucose_mg/dL / 2)`  
Used as HOMA-IR surrogate when fasting insulin unavailable. Thresholds: <4.5 optimal, 4.5–4.68 normal, 4.68–5.0 elevated, >5.0 high.

### 5.11 Substance Timing Correlation (`analyzeTimingCorrelation`, `src/lib/storage.js`)
Substance taken on day D → compares next-day (D+1) recovery.  
Splits: `earlyOnly` (all intake <14:00), `lateDay` (any intake ≥14:00) — **a day with both early and late intake now appears in both arrays.**  
`timingDiff` = earlyAvg − lateAvg (requires n≥2 each).  
`diff` = withAvg − withoutAvg ("without" = user logged any substance that day but not this one).  
Shown in Recovery screen when `|diff| ≥ 5` or `|timingDiff| ≥ 5`. Guarded against demo data.

---

## 6. Lab Markers (`src/lib/labs.js`)

30+ markers organized in groups. Each marker has: `key`, `label`, `unit`, `group`, `ref`, `score(v)`, `grade(v)`, `color(v)`.

**Groups:**
- PhenoAge Panel (9 markers): albumin, creatinine, lymphocyte, MCV, RDW, ALP, WBC, glucose, hscrp
- Lipids: total cholesterol, LDL, HDL, triglycerides, ApoB, Lp(a)
- Metabolic: glucose (standalone), HbA1c, insulin, HOMA-IR, TyG
- Kidney: creatinine (standalone), eGFR, uric acid, BUN
- Liver: ALT, AST, GGT, albumin (standalone)
- Hormones: testosterone (total), free testosterone, DHEA-S, cortisol, TSH
- Inflammation: hsCRP (standalone), homocysteine, ferritin
- CBC: hemoglobin, hematocrit

**`getLabAgeAdjustment()`** — sums `score(v)` across all entered markers (except PhenoAge-handled ones when PhenoAge is available); returns integer years adjustment clamped to [−4, +6] for biological age domain 3.

**`getPhenoAgeResult()`** — calls `calculatePhenoAge` with lab values from localStorage; returns `{phenoAge, chronAge, diff, status}`.

---

## 7. Bug Fix History

### Session 1 fixes (commit 50cff98)
| Bug | Root cause | Fix |
|-----|-----------|-----|
| SRI TDZ crash in Healthspan.jsx | `sleepConsistency` referenced `sri` before `const sri =` declaration | Moved `sri` declaration above `sleepConsistency` |
| peakHR understated | Used `pts[lastBout.end].value` (last sample, not max) | `Math.max(...pts.slice(start, end+1).map(p => p.value))` |
| hrr60 could display as negative | No guard against motion artifact producing negative drop | `if (hrr60 <= 0) return null` |
| rsTrend date scope wrong | `.slice(-14)` on sparse data could span 90 days | Calendar date filter: `d.date >= rsTrendCutoffStr` |

### Session 2 fixes (commit 226adc1)
| Bug | Root cause | Fix |
|-----|-----------|-----|
| ODI counted intervals, not events | Loop incremented eventCount on every sample below threshold | State machine: enter/exit event tracking |
| maxHR artifact from single spike | No cap on `observed_max_hr` writes | Guard: `sessionMax <= formulaMax + 20` |
| VO2 systematic pessimism | Lower bound of Fitbit range string used | Midpoint: `(lo + hi) / 2` |

### Session 3 fixes (commit 73d6804)
| Bug | Root cause | Fix |
|-----|-----------|-----|
| hrr120 rendered `−−N bpm` | No positivity guard like hrr60 had | `hrr120Raw !== null && hrr120Raw > 0 ? hrr120Raw : null` |
| ODI 90th-percentile off-by-one | `floor(n × 0.9)` overshoots by 1 index at exact multiples | `floor((n-1) × 0.9)` |
| Social jet lag inflated by convention mismatch | Fitbit sometimes uses wake date as `dateOfSleep`; start appears 20+ hrs after midnight | `if (s0 > 1200) s0 -= 1440` |
| Early/late timing split exclusive | Days with both early+late caffeine only counted in lateDay | Changed `else if` to independent `if` |
| Timing entry ID collision on double-tap | `t_${Date.now()}` — same ms = same ID, delete-one deletes both | `t_${Date.now()}_${Math.random().toString(36).slice(2,7)}` |
| timingTime stale at submit | `useState(nowTime)` set at mount, not at log time | `setTimingTime(nowTime())` after each submit |
| VO2 chart label stale | Said "Lower bound shown" after switching to midpoint | Updated to "Midpoint of reported range shown" |
| Timing insights used demo data | `data.isDemo` not checked before computing correlations | `if (data.isDemo) return []` guard |

---

## 8. Known Remaining Issues / Open Questions for Audit

### 8.1 HRR semantic precision
`hrr60` measures the drop from intra-bout peak to `pts[lastBout.end + 1]` — the first sample below the vigorous threshold, not literally 60 seconds post-peak. On tapered efforts (HR builds then coasts down before finishing), the "recovery" sample is already partway through recovery. **Question:** Is this meaningful enough to display, or should the display include a caveat? Alternatively, should we scan forward from `lastBout.end` looking for the minimum HR 10–14 samples later (approximating 60-second post-peak)?

### 8.2 Timing correlation "without" group is empty for habitual daily users
If a user logs caffeine every day, `allLoggedDates === substanceDays`, so `withoutNextDay` is always empty and `diff = null`. The `timingDiff` (early vs late split) still surfaces if enough data. **Question:** Should we fall back to comparing against all health history days (not just logged days) when the logged-without-this-substance group is empty?

### 8.3 Pace-of-aging needs minimum window
`calculatePaceOfAging()` requires ≥7 snapshots AND ≥14 calendar days between first/last. Snapshots are written once per sync. A user who syncs daily for 7 days gets rate = 7 days. **Question:** Should there be a minimum meaningful window (e.g., 30 days) before displaying pace-of-aging?

### 8.4 HRV history uses dailyRmssd (not deepRmssd) when both exist
`parseFitbitData` takes `d.value?.dailyRmssd ?? d.value?.deepRmssd`. Fitbit Sense 2 provides both; dailyRmssd includes waking periods and is noisier. **Question:** Should deepRmssd be preferred (it's purely during deep sleep, more stable)?

### 8.5 Recovery history baseline look-ahead on first sync
The first sync processes 30 days of history with a running pre-average. Day 0 uses `preAvgHRV = 0` (effectively treats all HRV as above-baseline → inflated early recovery scores). **Question:** Is there a smarter prior (e.g., population median for the user's age) for the first 1–2 days before enough data accumulates?

### 8.6 SRI consecutive-day requirement
`calculateSRI` skips pairs where `new Date(n2.date) - new Date(n1.date) ≠ 86400000 ms`. DST transitions cause some midnight-to-midnight spans to be 82800000 or 90000000 ms. **Question:** Should the check use date-string arithmetic instead of ms comparison?

### 8.7 Below90 display vs ODI label inconsistency
Very High risk can be triggered by `below90 > 2` (>10 minutes below 90%) while ODI shows 0.1/hr. The displayed ODI number will look like a mismatch to anyone reading both together. **Question:** Should the UI note when Very High is triggered by sustained hypoxia (below90) rather than event frequency (ODI)?

### 8.8 Substance log entries not sorted by substance on submit
`getTimingForDate` sorts by time (ascending). If a user adds multiple entries in the wrong order, they display in chronological order, which is correct. No issue here — confirming for completeness.

### 8.9 VO2 Midpoint vs Tier boundaries
Biological age VO2 norms use discrete thresholds (e.g., 31/39/49 for age 30–39). Using the midpoint instead of the lower bound means a user with Fitbit range "30-34" now gets vo2Max=32 instead of 30, potentially crossing from Fair (adj +2) to a different tier. **Question:** Is this an acceptable trade-off (more accurate central estimate vs. prior conservative guarantee)?

### 8.10 Weight / fat sync from Fitbit overwrites manual entries
`parseFitbitData` calls `saveBodyWeightEntry(w.date, w.weight, fatPct)` for every Fitbit-logged weight in the last month. If the user entered a different (more accurate) weight manually in Settings, the next sync overwrites it with Fitbit's scale reading. **Question:** Should we only write Fitbit weight if no manual entry exists for that date?

---

## 9. Feature Completeness Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Recovery score | Complete | Calibrates over 14 days |
| Strain scoring | Complete | Exponential zone weighting |
| Sleep analysis | Complete | SRI, social jet lag, debt, optimal window |
| Sleep apnea risk | Complete | ODI event-based, supplemented by BR + below90 |
| HRR mortality signal | Complete | Cole 1999; both 1-min and 2-min |
| VO2 Max tracking | Complete | Midpoint of Fitbit range, ACSM norms |
| Biological age | Complete | 5-domain engine + lifestyle + synergy |
| PhenoAge (Levine) | Complete | All 9 markers, exact coefficients |
| TyG Index | Complete | Fallback when no insulin |
| Training Load | Complete | ATL/CTL/TSB 7/42-day EWM |
| Training Effect | Complete | Aerobic + anaerobic 0–5 scale |
| Pace of Aging | Complete | Longitudinal bio-age rate |
| Healthspan Deltas | Complete | Ranked modifiable factors |
| Daytime stress | Complete | Sympathetic load from intraday HR |
| Blood pressure log | Complete | Rolling average, time-series |
| Grip strength log | Complete | Leong Lancet norms |
| Waist circumference | Complete | WHO/IDF visceral fat thresholds |
| FFMI | Complete | Hume lean mass estimate |
| Lab markers (30+) | Complete | ApoB, HbA1c, eGFR all present |
| Journal tags | Complete | 16 default + custom |
| Tag correlations | Complete | Min n=3, ≥5-point threshold |
| Energy self-rating | Complete | 1–5 scale, correlated with recovery |
| Substance timing log | Complete | 8 substances, early/late split |
| Timing correlations | Complete | Next-day recovery, guarded against demo |
| Coach screen | Complete | Narrative recommendations |
| Personal records | Complete | Best recovery, HRV, RHR, strain, steps |
| Achievements | Complete | Badge system |
| Streaks | Complete | Recovery, sleep, low-stress |
| Alerts | Complete | Threshold-triggered banners |
| PIN lock | Complete | Optional app lock |
| Data backup | Complete | JSON export |
| Notifications | Complete | Data entry reminders |
| Weekly pattern | Complete | Average recovery by day of week |

---

## 10. Specific Audit Questions for ChatGPT

Please evaluate and flag any issues in these specific areas:

1. **HRV norm table** (`HRV_NORMS_FITBIT_MEN`): ECG medians × 1.15 for Fitbit overnight. Are the base ECG values (60/46/35/29/24 ms for decades 20s/30s/40s/50s/60s) consistent with Shaffer & Ginsberg 2017? Is a 15% overnight uplift for Fitbit appropriate?

2. **ACSM VO2 norms** (`VO2_NORMS_MEN`): [34/42/53, 31/39/49, 27/35/45, 25/34/44, 22/30/40] for Fair/Good/Excellent across age 20–29/30–39/40–49/50–59/60+. Are these values accurate per ACSM 11th ed. 2022 for men?

3. **Grip strength norms** (`GRIP_NORMS_MEN`): [47, 46, 43, 39, 33 kg] for decades 20–29 through 60+. Consistent with Leong Lancet 2015?

4. **PhenoAge coefficients**: Are the xb coefficients in `calculatePhenoAge` correct per Levine Aging Cell 2018? Specifically: is creatinine in mg/dL (not µmol/L), albumin in g/dL (not g/L), glucose in mmol/L?

5. **Strain formula**: Is `strain = 5 + (raw/900) × 16` with exponential zone weights [0,1,2,4,8,16] physiologically reasonable as an approximation of Whoop-style strain? What's the expected strain for 60 minutes of Zone 2 running?

6. **ODI threshold calibration**: With 5-minute sampling resolution, is `ODI > 15` for Very High clinically appropriate? Given Fitbit's SpO₂ can drift ±2%, is a 3% drop threshold too sensitive or just right?

7. **Biological age domain scoring**: Review the point assignments — particularly: does `homaIR > 5.0 → +6 years` and `smoking current → +7 years` align with published risk literature (Framingham, SCORE2)?

8. **TyG index thresholds**: Confirm <4.5 / 4.5–4.68 / 4.68–5.0 / >5.0 against published TyG-IR cutoff literature.

9. **Social jet lag thresholds**: Roenneberg defines SJL in hours; Soma uses SD of midpoints in minutes. Is <30 min / 30–60 min / >60 min reasonable as Low/Moderate/High?

10. **Training Effect scoring**: Aerobic thresholds [10, 30, 60, 90, 120] zone-minutes and anaerobic [3, 8, 15, 25, 40] — do these match published TE models (Firstbeat methodology)?
