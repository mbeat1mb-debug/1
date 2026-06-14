import { getLabAgeAdjustment } from './labs'

// Dynamic user age from settings
export function getUserAge() {
  try {
    const a = parseInt(localStorage.getItem('user_age'), 10)
    return isNaN(a) ? 39 : a
  } catch { return 39 }
}

// Max HR — Gellish non-linear formula, upgraded by observed device peak
export function getMaxHR() {
  const age = getUserAge()
  const formula = Math.round(192 - 0.007 * age * age)
  try {
    const observed = parseInt(localStorage.getItem('observed_max_hr') || '0', 10)
    return observed > formula ? observed : formula
  } catch { return formula }
}

// Kept for backwards compat (Strain.jsx)
export const MAX_HR = Math.round(192 - 0.007 * 39 * 39)

// Internal variant accepts a pre-computed maxHR to avoid repeated localStorage reads
function hrZone(hr, maxHR) {
  const pct = hr / maxHR
  if (pct >= 0.90) return 5
  if (pct >= 0.80) return 4
  if (pct >= 0.70) return 3
  if (pct >= 0.60) return 2
  if (pct >= 0.50) return 1
  return 0
}

export function getHRZone(hr) {
  return hrZone(hr, getMaxHR())
}

// Exponential zone weighting — mirrors Whoop's approach
const ZONE_WEIGHTS = [0, 1, 2, 4, 8, 16]

export function calculateStrain(hrIntradayData) {
  if (!hrIntradayData?.['activities-heart-intraday']?.dataset) return 5.0
  const points = hrIntradayData['activities-heart-intraday'].dataset
  const maxHR = getMaxHR()

  let sessionMax = 0
  let raw = 0
  for (const p of points) {
    if (p.value > sessionMax) sessionMax = p.value
    raw += ZONE_WEIGHTS[hrZone(p.value, maxHR)]
  }
  // Persist observed peak HR to improve zone accuracy on future syncs
  try {
    const stored = parseInt(localStorage.getItem('observed_max_hr') || '0', 10)
    if (sessionMax > stored) localStorage.setItem('observed_max_hr', String(sessionMax))
  } catch {}

  const strain = Math.min(21, 5 + (raw / 900) * 16)
  return Math.round(strain * 10) / 10
}

export function calculateZoneMinutes(hrIntradayData) {
  if (!hrIntradayData?.['activities-heart-intraday']?.dataset) return [0, 0, 0, 0, 0]
  const maxHR = getMaxHR()
  const counts = [0, 0, 0, 0, 0]
  for (const p of hrIntradayData['activities-heart-intraday'].dataset) {
    const z = hrZone(p.value, maxHR)
    if (z >= 1) counts[z - 1]++
  }
  return counts
}

function average(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

export function computeOptimalSleepHours(sleepHistory) {
  if (sleepHistory.length >= 7) {
    const sorted = [...sleepHistory].sort((a, b) => (b.minutes || b.minutesAsleep || 0) - (a.minutes || a.minutesAsleep || 0))
    const topQ = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.25)))
    const personalMins = topQ.reduce((a, s) => a + (s.minutes || s.minutesAsleep || 0), 0) / topQ.length
    return Math.min(9.5, Math.max(6.5, personalMins / 60))
  }
  return 8
}

export function calculateRecovery({ hrv, rhr, sleep, spo2, br, skinTempDev, hrvHistory = [], rhrHistory = [], sleepHistory = [], preAvgHRV, preAvgRHR, preOptimalSleepHours }) {
  const avgHRV = preAvgHRV ?? average(hrvHistory.filter(Boolean))
  const avgRHR = preAvgRHR ?? average(rhrHistory.filter(Boolean))

  let hrvScore = 50
  if (avgHRV > 0 && hrv > 0) {
    const ratio = hrv / avgHRV
    hrvScore = ratio >= 1 ? clamp(50 + (ratio - 1) * 120, 50, 100) : clamp(ratio * 50, 0, 50)
  }

  let rhrScore = 50
  if (avgRHR > 0 && rhr > 0) {
    const diff = avgRHR - rhr
    rhrScore = clamp(50 + diff * 5, 0, 100)
  }

  let sleepScore = 50
  if (sleep) {
    const hours = sleep.minutesAsleep / 60
    const efficiency = sleep.efficiency || 85
    const optimalHours = preOptimalSleepHours ?? computeOptimalSleepHours(sleepHistory)
    const base = clamp((hours / optimalHours) * 70, 0, 70) + clamp((efficiency / 100) * 30, 0, 30)
    // Deep sleep = physical repair; REM = cognitive restoration.
    // Guard with > 0 so devices without stage data don't get penalized.
    const deepMins = sleep.deepMinutes ?? sleep.levels?.summary?.deep?.minutes ?? 0
    const remMins = sleep.remMinutes ?? sleep.levels?.summary?.rem?.minutes ?? 0
    let stageMod = 0
    if (sleep.minutesAsleep > 0 && (deepMins > 0 || remMins > 0)) {
      const deepPct = deepMins / sleep.minutesAsleep
      const remPct = remMins / sleep.minutesAsleep
      if (deepPct > 0.20) stageMod += 3
      else if (deepPct < 0.10) stageMod -= 3
      if (remPct > 0.22) stageMod += 2
      else if (remPct < 0.12) stageMod -= 2
    }
    sleepScore = clamp(base + stageMod, 0, 100)
  }

  // SpO2: gradient penalties; each 2% drop below 97 is clinically significant
  const spo2Score = spo2 >= 97 ? 100 : spo2 >= 95 ? 75 : spo2 >= 93 ? 50 : spo2 >= 90 ? 25 : 0
  // BR: graduated penalty reflects that 20 br/min is a mild signal; 25+ is an acute concern
  const brScore = br >= 12 && br <= 18 ? 100 : br >= 10 && br <= 22 ? 75 : br >= 8 && br <= 25 ? 50 : 25

  // Skin temp: >0.3°C elevation signals stress/illness; slight drop indicates good recovery
  let skinTempMod = 0
  if (skinTempDev != null) {
    if (skinTempDev > 0.3) skinTempMod = -5
    else if (skinTempDev < -0.3) skinTempMod = 2
  }

  const score = hrvScore * 0.40 + rhrScore * 0.25 + sleepScore * 0.25 + spo2Score * 0.05 + brScore * 0.05 + skinTempMod
  return Math.round(clamp(score, 0, 100))
}

export function getRecoveryColor(score) {
  if (score >= 67) return '#00c9a7'
  if (score >= 34) return '#f59e0b'
  return '#ef4444'
}

// Duration (70%) + efficiency (30%), normalized to an 8h target
export function calculateSleepScore(sleep) {
  if (!sleep) return 0
  return Math.round(Math.min(100, (sleep.minutesAsleep / 480) * 70 + (sleep.efficiency || 85) / 100 * 30))
}

export function getRecoveryLabel(score) {
  if (score >= 67) return 'PEAK'
  if (score >= 34) return 'GOOD'
  return 'REST'
}

export function calculateStressScore({ hrv, rhr, hrvHistory, rhrHistory }) {
  const avgHRV = average(hrvHistory.slice(-14).filter(Boolean))
  const avgRHR = average(rhrHistory.slice(-14).filter(Boolean))
  const hrvStress = avgHRV > 0 ? clamp((1 - hrv / avgHRV) * 50 + 50, 0, 100) : 50
  const rhrStress = avgRHR > 0 ? clamp(50 + (rhr - avgRHR) * 5, 0, 100) : 50
  return Math.round(clamp(hrvStress * 0.6 + rhrStress * 0.4, 0, 100))
}

export function getStressLabel(score) {
  if (score <= 30) return 'LOW'
  if (score <= 60) return 'MODERATE'
  if (score <= 80) return 'HIGH'
  return 'VERY HIGH'
}

export function getStressColor(score) {
  if (score <= 30) return '#00c9a7'
  if (score <= 60) return '#f59e0b'
  return '#ef4444'
}

// ACSM VO2 Max normative thresholds for men (ml/kg/min)
// Columns: [Fair, Good, Excellent] — below Fair = Poor, above Excellent = Superior
// Source: ACSM Guidelines for Exercise Testing and Prescription
const VO2_NORMS_MEN = [
  [29, [25, 33, 42]],  // age 20-29
  [39, [23, 30, 39]],  // age 30-39
  [49, [20, 27, 36]],  // age 40-49
  [59, [18, 24, 33]],  // age 50-59
  [99, [16, 22, 30]],  // age 60+
]

// HRV (RMSSD) norms for men, adjusted to Fitbit overnight context.
// Published ECG-equivalent medians (Shaffer & Ginsberg 2017) scaled ×1.15
// because Fitbit overnight RMSSD reads ~15% higher than daytime ECG reference values.
const HRV_NORMS_FITBIT_MEN = [
  [29, 69], // 20s: ECG ~60ms
  [39, 53], // 30s: ECG ~46ms
  [49, 40], // 40s: ECG ~35ms
  [59, 33], // 50s: ECG ~29ms
  [99, 28], // 60+: ECG ~24ms
]

function ageNorm(table, age) {
  return (table.find(([maxAge]) => age <= maxAge) ?? table[table.length - 1])[1]
}

export function calculatePhysiologicalAge({ avgHRV, avgRHR, avgSleep, sleepConsistency, avgSteps, weeklyAZM, vo2Max = 0, avgDeepPct = 0, avgRemPct = 0 }) {
  const userAge = getUserAge()
  let adj = 0

  // ── VO2 Max — strongest single longevity predictor ─────────────────────────
  // Mandsager (JAMA 2018): each fitness quintile = ~4-5y mortality equivalence.
  // Fitbit Cardio Fitness Score has ±3.5 ml/kg/min uncertainty — scored conservatively.
  if (vo2Max > 0) {
    const [fair, good, excel] = ageNorm(VO2_NORMS_MEN, userAge)
    if (vo2Max >= excel)      adj -= 5  // Superior — top 15%
    else if (vo2Max >= good)  adj -= 3  // Excellent
    else if (vo2Max >= fair)  adj -= 1  // Good
    else if (vo2Max >= fair * 0.75) adj += 2  // Fair
    else                      adj += 5  // Poor — strong mortality signal
  }

  // ── HRV — autonomic nervous system age ────────────────────────────────────
  // Age-normed ratio vs Fitbit-calibrated population median.
  // Ratio >1.4 = well above average for age; <0.6 = well below.
  if (avgHRV > 0) {
    const norm = ageNorm(HRV_NORMS_FITBIT_MEN, userAge)
    const ratio = avgHRV / norm
    if (ratio >= 1.4)       adj -= 3
    else if (ratio >= 1.15) adj -= 1
    else if (ratio >= 0.85) adj += 0  // Within normal range for age
    else if (ratio >= 0.65) adj += 2
    else                    adj += 4
  }

  // ── Resting HR — Zhang meta-analysis dose-response ───────────────────────
  // Zhang (Heart 2016): each 10 bpm above 60 = ~9% higher all-cause mortality.
  // Translated to ~1.5y biological age equivalent per 10 bpm step.
  if (avgRHR > 0) {
    if (avgRHR < 50)       adj -= 3  // Elite / highly trained
    else if (avgRHR < 60)  adj -= 1  // Excellent
    else if (avgRHR < 70)  adj += 0  // Good (reference band)
    else if (avgRHR < 80)  adj += 2  // Elevated (~9% risk increase)
    else if (avgRHR < 90)  adj += 3  // High (~18% risk increase)
    else                   adj += 4  // Very high (>27% risk increase)
  }

  // ── Sleep — Cappuccio U-curve + stage quality ─────────────────────────────
  // Cappuccio (Sleep 2010): <6h or >9h both associate with elevated mortality.
  // REM: Backhaus (2018) — each 5% reduction below 15% = HR 1.13 per year.
  if (avgSleep > 0) {
    if (avgSleep >= 7 && avgSleep <= 9)         adj -= 1
    else if (avgSleep >= 6 && avgSleep < 7)     adj += 1
    else if (avgSleep > 9)                      adj += 1  // often symptom of poor health
    else                                        adj += 3  // <6h — strong mortality signal

    if (avgRemPct >= 0.22)                      adj -= 1
    else if (avgRemPct > 0 && avgRemPct < 0.15) adj += 1

    if (avgDeepPct >= 0.18)                     adj -= 1
    else if (avgDeepPct > 0 && avgDeepPct < 0.10) adj += 1
  }

  // ── Sleep consistency ─────────────────────────────────────────────────────
  // Irregular sleep timing disrupts circadian rhythm independent of duration.
  if (sleepConsistency >= 0.8)      adj -= 1
  else if (sleepConsistency < 0.5)  adj += 1

  // ── Blood pressure — Ettehad linear dose-response ─────────────────────────
  // Ettehad (Lancet 2016): each 10mmHg SBP reduction → 10-13% CVD event reduction.
  // Evaluated highest-severity-first so OR conditions don't misclassify mixed readings.
  // e.g. sys=145, dia=85 → Stage 2 by systolic despite diastolic being Stage 1.
  const bp = getAverageBP()
  if (bp.sys > 0) {
    if (bp.sys >= 160 || bp.dia >= 100)      adj += 5  // Severe HTN
    else if (bp.sys >= 140 || bp.dia >= 90)  adj += 3  // Stage 2 HTN
    else if (bp.sys >= 130 || bp.dia >= 80)  adj += 1  // Stage 1 / Elevated
    else if (bp.sys < 120 && bp.dia < 80)    adj -= 1  // Optimal
    // else Normal (120-129 / <80) → adj += 0
  }

  // ── Body composition — fat % primary, BMI as fallback ────────────────────
  // Bhaskaran (Lancet 2018): ≥27% body fat in men = HR 1.78 vs 20-24% reference.
  // BMI is a weaker independent predictor after adjusting for fat %.
  const bodyFatPct = getUserBodyFatPct()
  if (bodyFatPct !== null) {
    if (bodyFatPct < 10)       adj += 0  // Essential — not necessarily protective
    else if (bodyFatPct < 18)  adj -= 1  // Athletic/fit
    else if (bodyFatPct < 27)  adj += 0  // Acceptable range
    else if (bodyFatPct < 32)  adj += 3  // Elevated risk (HR ~1.78)
    else                       adj += 5  // High risk
  } else {
    // BMI fallback when body fat % unavailable
    const bmi = calculateBMI(getUserHeightCm(), getUserWeightKg())
    if (bmi !== null) {
      if (bmi < 18.5)     adj += 1  // Underweight
      else if (bmi < 25)  adj -= 1  // Healthy
      else if (bmi < 30)  adj += 1  // Overweight
      else if (bmi < 35)  adj += 2  // Obese I
      else                adj += 4  // Obese II+
    }
  }

  // ── Steps — Paluch 2022 dose-response curve ───────────────────────────────
  // Paluch (JAMA NM 2022): 7k-10k steps saturates most mortality benefit.
  if (avgSteps > 0) {
    if (avgSteps >= 10000)     adj -= 2
    else if (avgSteps >= 7000) adj -= 1
    else if (avgSteps >= 5000) adj += 0
    else if (avgSteps >= 3000) adj += 1
    else                       adj += 3
  }

  // ── Active Zone Minutes — Arem 2015 dose-response ────────────────────────
  // Arem (JAMA IM 2015): 3-5× WHO recommendation (300-500 min/wk) = 35-39% mortality reduction.
  if (weeklyAZM >= 500)        adj -= 2  // 3×+ WHO guideline
  else if (weeklyAZM >= 300)   adj -= 1  // 2× WHO
  else if (weeklyAZM >= 150)   adj += 0  // Meets WHO
  else if (weeklyAZM >= 75)    adj += 1  // Below guideline
  else                         adj += 2  // Sedentary

  // ── Lifestyle factors ──────────────────────────────────────────────────────
  const smoking = getUserSmoking()
  if (smoking === 'current')      adj += 7
  else if (smoking === 'former')  adj += 2

  const alcohol = getUserAlcohol()
  if (alcohol !== null) {
    if (alcohol >= 14)      adj += 3
    else if (alcohol >= 7)  adj += 1
  }

  // ── Bloodwork ──────────────────────────────────────────────────────────────
  // Uses PhenoAge Levine formula when all 9 required markers are present.
  // Falls back to additive marker scoring otherwise. Clamped to ±8y.
  adj += Math.max(-8, Math.min(8, getLabAgeAdjustment()))

  return Math.round(Math.max(userAge - 15, Math.min(userAge + 20, userAge + adj)))
}

// Returns rate in biological years per calendar year from longitudinal history.
// rate < 1.0 = aging slower than calendar (favorable)
// rate > 1.0 = aging faster than calendar (unfavorable)
export function calculatePaceOfAging() {
  try {
    const history = JSON.parse(localStorage.getItem('physio_age_history') || '[]')
    if (history.length < 2) return null
    const first = history[0]
    const last = history[history.length - 1]
    const calDays = Math.round((new Date(last.date) - new Date(first.date)) / 86400000)
    if (calDays < 14) return null
    const bioAgeDelta = last.physAge - first.physAge
    const calYears = calDays / 365.25
    const rate = Math.round((bioAgeDelta / calYears) * 100) / 100
    return { rate, bioAgeDelta: Math.round(bioAgeDelta * 10) / 10, calDays }
  } catch { return null }
}

export function parseFitbitData(raw) {
  const { summary, hrIntraday, sleep, hrv, spo2, br, hrvRange, hrRange, sleepRange, cardioFitness, skinTemp, bodyWeight, bodyFat } = raw

  // Date-aligned histories prevent index desync when API returns different date ranges
  const hrvByDate = {}
  for (const d of (hrvRange?.hrv ?? [])) {
    const val = d.value?.dailyRmssd ?? d.value?.deepRmssd
    if (d.dateTime && val) hrvByDate[d.dateTime] = val
  }
  const rhrByDate = {}
  for (const d of (hrRange?.['activities-heart'] ?? [])) {
    if (d.dateTime && d.value?.restingHeartRate) rhrByDate[d.dateTime] = d.value.restingHeartRate
  }
  const historyDates = Object.keys(hrvByDate).sort()
  const hrvHistory = historyDates.map(date => hrvByDate[date])
  const rhrHistory = historyDates.map(date => rhrByDate[date] || 0)

  const todayHRV = hrv?.hrv?.[0]?.value?.dailyRmssd ?? hrv?.hrv?.[0]?.value?.deepRmssd ?? 0
  const todayRHR = hrIntraday?.['activities-heart']?.[0]?.value?.restingHeartRate ??
    hrRange?.['activities-heart']?.slice(-1)[0]?.value?.restingHeartRate ?? 0
  const todaySleep = sleep?.sleep?.find(s => s.isMainSleep) ?? sleep?.sleep?.[0]
  const todaySpO2 = spo2?.value?.avg ?? spo2?.value ?? 97
  const todayBR = br?.br?.[0]?.value?.breathingRate ?? 14
  const steps = summary?.summary?.steps ?? 0
  const calories = summary?.summary?.caloriesOut ?? 0
  const activeMinutes = (summary?.summary?.fairlyActiveMinutes ?? 0) + (summary?.summary?.veryActiveMinutes ?? 0)

  // VO2 Max from Fitbit Cardio Fitness Score (value is string like "47-51" — take lower bound)
  const vo2MaxRaw = cardioFitness?.cardioScore?.[0]?.value?.vo2Max ?? null
  const vo2Max = vo2MaxRaw ? parseInt(String(vo2MaxRaw).split('-')[0], 10) || 0 : 0

  // Skin temperature nightly deviation in °C relative to personal baseline
  const skinTempDev = skinTemp?.tempSkin?.[0]?.value?.nightlyRelative ?? null

  const sleepHistory = (sleepRange?.sleep ?? [])
    .filter(s => s.isMainSleep)
    .map(s => ({
      date: s.dateOfSleep,
      minutes: s.minutesAsleep,
      efficiency: s.efficiency,
      startTime: s.startTime,
      endTime: s.endTime,
      deepMinutes: s.levels?.summary?.deep?.minutes ?? 0,
      remMinutes: s.levels?.summary?.rem?.minutes ?? 0,
    }))

  // Sleep end hour for daytime stress calculation
  const sleepEndHour = todaySleep?.endTime
    ? new Date(todaySleep.endTime).getHours()
    : null

  // Sync Fitbit-logged body weight/fat into local history if available.
  // Sort ascending so the most recent entry is written last and wins as the
  // quick-access user_weight_kg value, regardless of API return order.
  // Fitbit returns metric (kg / %) when no Accept-Language header is sent.
  const weightLogs = [...(bodyWeight?.weight ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const fatLogs = bodyFat?.fat ?? []
  const fatByDate = {}
  for (const f of fatLogs) fatByDate[f.date] = f.fat
  for (const w of weightLogs) {
    if (w.date && w.weight) saveBodyWeightEntry(w.date, w.weight, fatByDate[w.date] ?? null)
  }

  return {
    todayHRV, todayRHR, todaySleep, todaySpO2, todayBR,
    steps, calories, activeMinutes,
    hrvHistory, rhrHistory, historyDates, sleepHistory,
    hrvByDate, rhrByDate,
    hrIntradayData: hrIntraday,
    vo2Max, skinTempDev, sleepEndHour,
  }
}

// ── Sleep Debt ──────────────────────────────────────────────────────────────

export function calculateSleepDebt(sleepHistory) {
  // Use average of top-quartile sleep nights as personal optimum (not a hardcoded 8h target).
  // If less than 7 nights of data, fall back to 8h.
  let optimalMins = 480
  if (sleepHistory.length >= 7) {
    const sorted = [...sleepHistory].sort((a, b) => b.minutes - a.minutes)
    const topQuartile = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.25)))
    const personalOptimal = topQuartile.reduce((a, s) => a + s.minutes, 0) / topQuartile.length
    // Clamp to sane range (6.5h – 9.5h)
    optimalMins = Math.min(570, Math.max(390, personalOptimal))
  }
  const last7 = sleepHistory.slice(-7)
  const debt = last7.reduce((acc, s) => acc + Math.max(0, optimalMins - (s.minutes || 0)), 0)
  return Math.round(debt / 60 * 10) / 10
}

// ── Optimal Sleep Window ────────────────────────────────────────────────────

function medianOf(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function stdDev(arr) {
  if (arr.length < 2) return 0
  const m = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((sq, v) => sq + Math.pow(v - m, 2), 0) / arr.length)
}

function formatMins(totalMins) {
  const m = ((totalMins % 1440) + 1440) % 1440
  const h = Math.floor(m / 60) % 24
  const min = m % 60
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${period}`
}

export function calculateOptimalSleepWindow(sleepHistory) {
  const entries = sleepHistory.filter(s => s.startTime && s.endTime)
  if (entries.length < 7) return null

  const toMins = isoStr => {
    const d = new Date(isoStr)
    let m = d.getHours() * 60 + d.getMinutes()
    if (m < 300) m += 1440
    return m
  }

  const startMins = entries.map(s => toMins(s.startTime))
  const endMins = entries.map(s => toMins(s.endTime))

  const consistency = Math.round(Math.max(0, Math.min(100, 100 - stdDev(startMins) / 1.5)))
  return {
    bedtime: formatMins(medianOf(startMins)),
    wakeTime: formatMins(medianOf(endMins)),
    consistency,
  }
}

// ── ATL / CTL / TSB Training Load ──────────────────────────────────────────

export function calculateTrainingLoad(strainHistory) {
  if (!strainHistory || strainHistory.length < 7) return null
  const kATL = 2 / (7 + 1)   // 7-day exponential weighted average
  const kCTL = 2 / (42 + 1)  // 42-day exponential weighted average

  let atl = strainHistory[0] || 5
  let ctl = strainHistory[0] || 5
  for (let i = 1; i < strainHistory.length; i++) {
    const s = strainHistory[i] || 0
    atl = s * kATL + atl * (1 - kATL)
    ctl = s * kCTL + ctl * (1 - kCTL)
  }
  const tsb = Math.round((ctl - atl) * 10) / 10
  return {
    atl: Math.round(atl * 10) / 10,
    ctl: Math.round(ctl * 10) / 10,
    tsb,
    form: tsb >= 5 ? 'Fresh' : tsb >= -5 ? 'Neutral' : tsb >= -15 ? 'Loaded' : 'Overreached',
  }
}

export function getTrainingLoadColor(tsb) {
  if (tsb >= 5) return '#00c9a7'
  if (tsb >= -5) return '#3b82f6'
  if (tsb >= -15) return '#f59e0b'
  return '#ef4444'
}

// ── Trend Velocity ─────────────────────────────────────────────────────────

export function getTrendVelocity(history) {
  if (!history || history.length < 6) return null
  const recent = history.slice(-3).filter(Boolean)
  const prior = history.slice(-6, -3).filter(Boolean)
  if (!recent.length || !prior.length) return null
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length
  return Math.round(recentAvg - priorAvg)
}

// ── Height / Weight / BMI ──────────────────────────────────────────────────

export function getUserHeightCm() {
  try {
    const v = parseFloat(localStorage.getItem('user_height_cm') || '0')
    return isNaN(v) ? 0 : v
  } catch { return 0 }
}

export function getUserWeightKg() {
  try {
    const v = parseFloat(localStorage.getItem('user_weight_kg') || '0')
    return isNaN(v) ? 0 : v
  } catch { return 0 }
}

export function getUserBodyFatPct() {
  try {
    const v = parseFloat(localStorage.getItem('user_body_fat_pct') || '0')
    return isNaN(v) || v <= 0 ? null : v
  } catch { return null }
}

export function getBodyWeightHistory() {
  try { return JSON.parse(localStorage.getItem('weight_history') || '[]') } catch { return [] }
}

export function saveBodyWeightEntry(date, kg, fatPct) {
  if (!kg || kg < 20 || kg > 300) return
  try {
    const history = getBodyWeightHistory()
    const idx = history.findIndex(e => e.date === date)
    const entry = { date, kg: Math.round(kg * 10) / 10, fatPct: fatPct || null }
    if (idx >= 0) history[idx] = entry
    else history.push(entry)
    history.sort((a, b) => a.date.localeCompare(b.date))
    localStorage.setItem('weight_history', JSON.stringify(history.slice(-365)))
    // Keep latest as quick-access value
    localStorage.setItem('user_weight_kg', String(entry.kg))
    if (fatPct) localStorage.setItem('user_body_fat_pct', String(fatPct))
  } catch {}
}

export function calculateLeanMass(weightKg, fatPct) {
  if (!weightKg || !fatPct) return null
  return Math.round((weightKg * (1 - fatPct / 100)) * 10) / 10
}

export function calculateFatMass(weightKg, fatPct) {
  if (!weightKg || !fatPct) return null
  return Math.round((weightKg * (fatPct / 100)) * 10) / 10
}

export function getUserUnits() {
  try { return localStorage.getItem('user_units') || 'imperial' } catch { return 'imperial' }
}

export function calculateBMI(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null
  const hm = heightCm / 100
  return Math.round((weightKg / (hm * hm)) * 10) / 10
}

export function getBMILabel(bmi) {
  if (bmi < 18.5) return 'Underweight'
  if (bmi < 25) return 'Healthy'
  if (bmi < 30) return 'Overweight'
  return 'Obese'
}

export function getBMIColor(bmi) {
  if (bmi < 18.5) return '#f59e0b'
  if (bmi < 25) return '#00c9a7'
  if (bmi < 30) return '#f59e0b'
  return '#ef4444'
}

// ── Lifestyle factors ──────────────────────────────────────────────────────────

export function getUserSmoking() {
  try { return localStorage.getItem('user_smoking') || 'never' } catch { return 'never' }
}

export function getUserAlcohol() {
  try {
    const raw = localStorage.getItem('user_alcohol_week')
    if (raw === null) return null
    const v = parseInt(raw, 10)
    return isNaN(v) ? null : v
  } catch { return null }
}

export function getUserBP() {
  try {
    const sys = parseInt(localStorage.getItem('user_bp_systolic') || '0', 10)
    const dia = parseInt(localStorage.getItem('user_bp_diastolic') || '0', 10)
    return { sys: isNaN(sys) ? 0 : sys, dia: isNaN(dia) ? 0 : dia }
  } catch { return { sys: 0, dia: 0 } }
}

// ── Blood Pressure time-series (logged a few times/week in Journal) ────────────

export function getBPReadings() {
  try { return JSON.parse(localStorage.getItem('bp_readings') || '[]') } catch { return [] }
}

export function saveBPReading(date, sys, dia) {
  if (!sys || !dia || sys < 50 || sys > 300 || dia < 30 || dia > 200) return
  try {
    const readings = getBPReadings()
    const idx = readings.findIndex(r => r.date === date)
    if (idx >= 0) readings[idx] = { date, sys, dia }
    else readings.push({ date, sys, dia })
    readings.sort((a, b) => a.date.localeCompare(b.date))
    localStorage.setItem('bp_readings', JSON.stringify(readings.slice(-90)))
  } catch {}
}

// Rolling average of last n readings; falls back to static setting if no readings exist
export function getAverageBP(n = 10) {
  const readings = getBPReadings().slice(-n).filter(r => r.sys > 0)
  if (!readings.length) return getUserBP()
  return {
    sys: Math.round(readings.reduce((a, r) => a + r.sys, 0) / readings.length),
    dia: Math.round(readings.reduce((a, r) => a + r.dia, 0) / readings.length),
  }
}

// Steps → distance using height-based stride estimate
export function calculateDistance(steps, heightCm) {
  if (!steps || !heightCm) return null
  const strideLengthM = heightCm * 0.00414
  return Math.round(steps * strideLengthM / 100) / 10
}

// ── Weekly Pattern ─────────────────────────────────────────────────────────

export function calculateWeeklyPattern(calendarDays) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const byDay = Array.from({ length: 7 }, () => [])
  for (const day of calendarDays) {
    if (!day?.date || day.recovery == null) continue
    const dow = new Date(day.date + 'T12:00:00').getDay()
    byDay[dow].push(day.recovery)
  }
  return dayNames.map((name, i) => ({
    day: name,
    avgRecovery: byDay[i].length
      ? Math.round(byDay[i].reduce((a, b) => a + b, 0) / byDay[i].length)
      : null,
    count: byDay[i].length,
  }))
}

// ── Training Effect ─────────────────────────────────────────────────────────
// zoneMinutes = [z1, z2, z3, z4, z5] matching HR zones 1-5
// Aerobic TE from Z2+Z3 (60-80% max HR); Anaerobic TE from Z4+Z5 (80%+ max HR)

const TE_LABELS = ['None', 'Minor Effect', 'Maintaining', 'Improving', 'Highly Improving', 'Overreaching']

// thresholds[i] = minutes required to reach integer score (i + 1).
// Below thresholds[0], the effect ramps linearly from 0 → ~0.9 (label "None").
function teScore(mins, thresholds) {
  if (mins <= 0) return 0
  if (mins < thresholds[0]) {
    return Math.round(Math.min(0.9, mins / thresholds[0]) * 10) / 10
  }
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (mins >= thresholds[i]) {
      const base = i + 1
      const next = thresholds[i + 1] ?? thresholds[i] * 1.5
      const frac = (mins - thresholds[i]) / (next - thresholds[i])
      return Math.round(Math.min(5, base + Math.min(0.9, frac)) * 10) / 10
    }
  }
  return 0
}

export function calculateTrainingEffect(zoneMinutes) {
  const [, z2, z3, z4, z5] = zoneMinutes ?? [0, 0, 0, 0, 0]
  const aerobicMins = (z2 || 0) + (z3 || 0)
  const anaerobicMins = (z4 || 0) + (z5 || 0)
  // Aerobic: meaningful base-building starts at 10 min in Z2/Z3
  const aerobic = teScore(aerobicMins, [10, 30, 60, 90, 120])
  // Anaerobic: intensity work; fewer minutes needed for effect
  const anaerobic = teScore(anaerobicMins, [3, 8, 15, 25, 40])
  return {
    aerobic,
    anaerobic,
    aerobicLabel: TE_LABELS[Math.min(5, Math.floor(aerobic))],
    anaerobicLabel: TE_LABELS[Math.min(5, Math.floor(anaerobic))],
  }
}

// ── Body Fat % classification (shared across Settings + Healthspan) ───────────
// Male-oriented ACE ranges. Colors follow the app's 3-tier semantic palette
// (teal = optimal, amber = caution, red = high) — no one-off colors.
export function getBodyFatLabel(pct) {
  if (pct < 6) return 'Essential'
  if (pct < 14) return 'Athletic'
  if (pct < 18) return 'Fitness'
  if (pct < 25) return 'Acceptable'
  return 'High'
}

export function getBodyFatColor(pct) {
  if (pct < 6) return '#f59e0b'   // very lean — below healthy floor
  if (pct < 18) return '#00c9a7'  // athletic / fitness — optimal
  if (pct < 25) return '#f59e0b'  // acceptable
  return '#ef4444'                // high
}

// ── Daytime Stress ──────────────────────────────────────────────────────────
// Measures sympathetic nervous system activation during waking hours using
// intraday HR. Elevated resting HR above personal RHR = autonomic stress load.

export function calculateDaytimeStress(hrIntradayData, wakeHour, rhr) {
  const points = hrIntradayData?.['activities-heart-intraday']?.dataset
  if (!points?.length || !rhr) return null

  const maxHR = getMaxHR()
  const start = wakeHour ?? 7
  // Only non-exercise minutes after waking (HR below 85% of max = not exercising)
  const restingDaytime = points.filter(p => {
    const h = parseInt(p.time, 10)
    return h >= start && h < 22 && p.value >= 40 && p.value < maxHR * 0.85
  })
  if (restingDaytime.length < 30) return null

  const avgHR = restingDaytime.reduce((a, p) => a + p.value, 0) / restingDaytime.length
  const delta = Math.max(0, avgHR - rhr)
  // delta 0→5 bpm = score 0→25 (relaxed), 5→15 = 25→75 (moderate), 15+ = 75→100 (high)
  const score = Math.min(100, Math.round(delta < 5 ? delta * 5 : 25 + (delta - 5) * 5))
  return { score, avgHR: Math.round(avgHR), delta: Math.round(delta * 10) / 10 }
}
