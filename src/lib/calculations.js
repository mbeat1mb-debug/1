import { getLabAgeAdjustment, getTyGIndex, getPhenoAgeProgress } from './labs'

// Local calendar date (not UTC) of an ISO timestamp — toISOString()-style
// truncation shifts to UTC, which lands on the wrong day for anyone west of
// Greenwich once local time crosses into evening.
export function localDateOf(isoString) {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  // Persist observed peak HR only if within 20 bpm of formula max (guards artifacts)
  try {
    const formulaMax = Math.round(192 - 0.007 * getUserAge() * getUserAge())
    const stored = parseInt(localStorage.getItem('observed_max_hr') || '0', 10)
    if (sessionMax > stored && sessionMax <= formulaMax + 20) {
      localStorage.setItem('observed_max_hr', String(sessionMax))
    }
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
// Source: ACSM Guidelines for Exercise Testing and Prescription, 11th Edition (2022)
const VO2_NORMS_MEN = [
  [29, [34, 42, 53]],  // age 20-29
  [39, [31, 39, 49]],  // age 30-39
  [49, [27, 35, 45]],  // age 40-49
  [59, [25, 34, 44]],  // age 50-59
  [99, [22, 30, 40]],  // age 60+
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

// Grip strength medians for men (kg) — Leong Lancet 2015 / normative data
const GRIP_NORMS_MEN = [
  [29, 47], [39, 46], [49, 43], [59, 39], [99, 33],
]

function ageNorm(table, age) {
  return (table.find(([maxAge]) => age <= maxAge) ?? table[table.length - 1])[1]
}

export function getHRVNorm(age) {
  return ageNorm(HRV_NORMS_FITBIT_MEN, age)
}

export function getGripHistory() {
  try { return JSON.parse(localStorage.getItem('grip_history') || '[]') } catch { return [] }
}

export function saveGripEntry(date, kg) {
  if (!kg || kg < 5 || kg > 100) return
  try {
    const history = getGripHistory()
    const idx = history.findIndex(e => e.date === date)
    const entry = { date, kg: Math.round(kg * 10) / 10 }
    if (idx >= 0) history[idx] = entry
    else history.push(entry)
    history.sort((a, b) => a.date.localeCompare(b.date))
    localStorage.setItem('grip_history', JSON.stringify(history.slice(-120)))
    localStorage.setItem('user_grip_kg', String(entry.kg))
    localStorage.setItem('user_grip_date', date)
  } catch {}
}

export function getWaistHistory() {
  try { return JSON.parse(localStorage.getItem('waist_history') || '[]') } catch { return [] }
}

export function saveWaistEntry(date, cm) {
  if (!cm || cm < 40 || cm > 200) return
  try {
    const history = getWaistHistory()
    const idx = history.findIndex(e => e.date === date)
    const entry = { date, cm: Math.round(cm * 10) / 10 }
    if (idx >= 0) history[idx] = entry
    else history.push(entry)
    history.sort((a, b) => a.date.localeCompare(b.date))
    localStorage.setItem('waist_history', JSON.stringify(history.slice(-120)))
    localStorage.setItem('user_waist_cm', String(entry.cm))
    localStorage.setItem('user_waist_date', date)
  } catch {}
}

export function getUserWaistCm() {
  try { const v = parseFloat(localStorage.getItem('user_waist_cm') || '0'); return isNaN(v) || v <= 0 ? 0 : v } catch { return 0 }
}

export function getUserGripStrengthKg() {
  try { const v = parseFloat(localStorage.getItem('user_grip_kg') || '0'); return isNaN(v) || v <= 0 ? 0 : v } catch { return 0 }
}

export function getHOMAIR() {
  try {
    const labs = JSON.parse(localStorage.getItem('lab_results') || '{}')
    const g = parseFloat(labs['glucose']?.value), i = parseFloat(labs['insulin']?.value)
    if (isNaN(g) || isNaN(i) || g <= 0 || i <= 0) return 0
    return Math.round((g * i / 405) * 100) / 100
  } catch { return 0 }
}

export function calculatePhysiologicalAge({ avgHRV, avgRHR, avgSleep, sleepConsistency, avgSteps, weeklyAZM, vo2Max = 0, avgDeepPct = 0, avgRemPct = 0, hrvHistory = [], lastKnownHRR = null }) {
  const userAge = getUserAge()
  const heightCm = getUserHeightCm()
  const weightKg = getUserWeightKg()
  const bodyFatPct = getUserBodyFatPct()
  const waistCm = getUserWaistCm()
  const gripKg = getUserGripStrengthKg()
  const homaIR = getHOMAIR()
  const smoking = getUserSmoking()
  const alcohol = getUserAlcohol()
  const bp = getAverageBP()

  // FFMI (Fat-Free Mass Index) — uses Hume lean mass when available, else derived
  const humeData = getLatestHumeData()
  const leanMassKg = (humeData?.leanMassKg) ?? (weightKg > 0 && bodyFatPct ? weightKg * (1 - bodyFatPct / 100) : 0)
  const hM = heightCm > 0 ? heightCm / 100 : 0
  const ffmi = leanMassKg > 0 && hM > 0 ? leanMassKg / (hM * hM) : 0
  const visceralFatIndex = humeData?.visceralFatIndex ?? null
  const skelMuscleKg = humeData?.skelMuscleKg ?? null

  // ── Domain 1: Cardiorespiratory Fitness ──────────────────────────────────
  // Mandsager JAMA 2018: elite fitness = 5x lower all-cause mortality vs sedentary.
  // Most influential single longevity predictor in the dataset.
  let cardio = 0

  if (vo2Max > 0) {
    const [fair, good, excel] = ageNorm(VO2_NORMS_MEN, userAge)
    if (vo2Max >= excel + 5)       cardio -= 5  // Elite
    else if (vo2Max >= excel)      cardio -= 3  // Excellent
    else if (vo2Max >= good)       cardio -= 1  // Good
    else if (vo2Max >= fair)       cardio += 2  // Fair
    else if (vo2Max >= fair * 0.8) cardio += 4  // Poor
    else                           cardio += 6  // Very poor
  }

  if (avgHRV > 0) {
    const norm = ageNorm(HRV_NORMS_FITBIT_MEN, userAge)
    const ratio = avgHRV / norm
    let base = ratio >= 1.5 ? -3 : ratio >= 1.2 ? -1 : ratio >= 0.85 ? 0 : ratio >= 0.65 ? 2 : 4
    // Trend adjustment: if HRV improving/declining meaningfully, shift one tier
    const recent7 = hrvHistory.slice(-7).filter(Boolean)
    const prior7 = hrvHistory.slice(-14, -7).filter(Boolean)
    if (recent7.length >= 4 && prior7.length >= 4) {
      const rAvg = recent7.reduce((a, b) => a + b, 0) / recent7.length
      const pAvg = prior7.reduce((a, b) => a + b, 0) / prior7.length
      const trend = (rAvg - pAvg) / pAvg
      if (trend > 0.10) base = Math.max(base - 1, -3)
      else if (trend < -0.12) base = Math.min(base + 1, 4)
    }
    cardio += base
  }

  // Zhang Heart 2016: each 10 bpm above 60 = ~9% higher all-cause mortality
  if (avgRHR > 0) {
    if (avgRHR < 50)      cardio -= 2
    else if (avgRHR < 60) cardio -= 1
    else if (avgRHR < 70) cardio += 0
    else if (avgRHR < 80) cardio += 2
    else if (avgRHR < 90) cardio += 3
    else                  cardio += 4
  }

  // Cole NEJM 1999: HRR <12 bpm at 1 min post-exercise predicts 2× all-cause mortality.
  // Uses last known value (≤90 days old) — exercise sessions are infrequent so we persist across days.
  if (lastKnownHRR?.hrr60 > 0) {
    if (lastKnownHRR.hrr60 >= 25)      cardio -= 2  // Excellent autonomic recovery
    else if (lastKnownHRR.hrr60 >= 18) cardio -= 1  // Good
    else if (lastKnownHRR.hrr60 >= 12) cardio += 0  // Normal
    else                               cardio += 2  // Poor — independent mortality risk
  }

  const cardioCapped = clamp(cardio, -7, 9)

  // ── Domain 2: Body Composition ────────────────────────────────────────────
  // Fat % (Bhaskaran Lancet 2018) + muscle mass / FFMI (Studenski JAMA 2011)
  // + visceral fat (waist) + grip strength (Leong Lancet 2015)
  let composition = 0

  if (bodyFatPct !== null) {
    if (bodyFatPct < 10)       composition += 0  // Essential fat — not protective
    else if (bodyFatPct < 15)  composition -= 2  // Athletic
    else if (bodyFatPct < 20)  composition -= 1  // Fitness
    else if (bodyFatPct < 27)  composition += 0  // Acceptable
    else if (bodyFatPct < 32)  composition += 3  // Elevated risk
    else                       composition += 5  // High risk
  } else {
    const bmi = calculateBMI(heightCm, weightKg)
    if (bmi !== null) {
      if (bmi < 18.5)     composition += 1
      else if (bmi < 25)  composition -= 1
      else if (bmi < 30)  composition += 1
      else if (bmi < 35)  composition += 3
      else                composition += 5
    }
  }

  // FFMI: men >24 = athletic, 21-24 = above avg, 18-21 = avg, <18 = sarcopenia risk
  if (ffmi > 0) {
    if (ffmi > 24)        composition -= 2
    else if (ffmi > 21)   composition -= 1
    else if (ffmi >= 18)  composition += 0
    else if (ffmi >= 16)  composition += 2
    else                  composition += 3
  }

  // Visceral fat — VFI from Hume bioimpedance preferred over waist (more direct measure)
  // Amato 2010 Diabetes Care: VAI=1 anchors a lean healthy reference; risk increases continuously above normal
  // No evidence of longevity benefit below mid-normal (VFI ≤7 vs ≤12); upper tiers carry compounding risk
  if (visceralFatIndex !== null) {
    if (visceralFatIndex <= 12)       composition += 0
    else if (visceralFatIndex <= 17)  composition += 1
    else if (visceralFatIndex <= 24)  composition += 2
    else                              composition += 3
  } else if (waistCm > 0) {
    if (waistCm < 94)       composition += 0
    else if (waistCm < 102) composition += 2
    else                    composition += 4
  }

  // Skeletal muscle mass % — Janssen JAMA 2000: low muscle mass predicts disability/mortality
  // Direct bioimpedance measurement from Hume scale; % of total body weight
  // Male reference: avg 38–42% age 30–39; >45% = highly trained; <32% = sarcopenia risk
  if (weightKg > 0 && skelMuscleKg !== null) {
    const skelMusclePct = (skelMuscleKg / weightKg) * 100
    if (skelMusclePct > 45)       composition -= 1
    else if (skelMusclePct >= 38) composition += 0
    else if (skelMusclePct >= 32) composition += 1
    else                          composition += 2
  }

  // Grip strength — Leong Lancet 2015: each 5 kg lower = 16% higher mortality
  if (gripKg > 0) {
    const gripNorm = ageNorm(GRIP_NORMS_MEN, userAge)
    const gripRatio = gripKg / gripNorm
    if (gripRatio >= 1.2)       composition -= 2
    else if (gripRatio >= 1.0)  composition -= 1
    else if (gripRatio >= 0.80) composition += 0
    else if (gripRatio >= 0.65) composition += 2
    else                        composition += 3
  }

  const compositionCapped = clamp(composition, -5, 8)

  // ── Domain 3: Metabolic Health ────────────────────────────────────────────
  // BP (Ettehad Lancet 2016) + insulin resistance (HOMA-IR) + bloodwork / PhenoAge
  let metabolic = 0

  if (bp.sys > 0) {
    if (bp.sys >= 160 || bp.dia >= 100)     metabolic += 5
    else if (bp.sys >= 140 || bp.dia >= 90) metabolic += 3
    else if (bp.sys >= 130 || bp.dia >= 80) metabolic += 1
    else if (bp.sys < 120 && bp.dia < 80)   metabolic -= 1
  }

  // HOMA-IR: (glucose mg/dL × insulin µIU/mL) / 405 — Matthews 1985
  // >2.5 = insulin resistant; compounded risk with obesity/CVD
  if (homaIR > 0) {
    if (homaIR < 1.0)      metabolic -= 1
    else if (homaIR < 2.0) metabolic += 0
    else if (homaIR < 3.0) metabolic += 2
    else if (homaIR < 5.0) metabolic += 4
    else                   metabolic += 5
  }

  // TyG Index fallback: validated IR surrogate when HOMA-IR unavailable (no fasting insulin)
  if (homaIR === 0) {
    const tyg = getTyGIndex()
    if (tyg !== null) {
      if (tyg < 4.5)       metabolic -= 1
      else if (tyg < 4.68) metabolic += 0
      else if (tyg < 5.0)  metabolic += 2
      else                 metabolic += 4
    }
  }

  // PhenoAge (Levine 2018) when all 9 markers present; additive scoring otherwise
  metabolic += Math.max(-4, Math.min(6, getLabAgeAdjustment()))

  const metabolicCapped = clamp(metabolic, -5, 10)

  // ── Domain 4: Sleep & Recovery ────────────────────────────────────────────
  // Cappuccio Sleep 2010 U-curve + stage quality + circadian consistency
  let sleepD = 0

  if (avgSleep > 0) {
    if (avgSleep >= 7 && avgSleep <= 9)           sleepD -= 1
    else if (avgSleep >= 6 && avgSleep < 7)       sleepD += 1
    else if (avgSleep > 9)                        sleepD += 1
    else                                          sleepD += 3  // <6h

    if (avgRemPct >= 0.22)                        sleepD -= 1
    else if (avgRemPct > 0 && avgRemPct < 0.15)   sleepD += 1

    if (avgDeepPct >= 0.20)                       sleepD -= 1
    else if (avgDeepPct > 0 && avgDeepPct < 0.10) sleepD += 1
  }

  if (sleepConsistency >= 0.8)      sleepD -= 1
  else if (sleepConsistency < 0.5)  sleepD += 1

  const sleepCapped = clamp(sleepD, -3, 5)

  // ── Domain 5: Activity ────────────────────────────────────────────────────
  // Steps (Paluch JAMA NM 2022) + AZM (Arem JAMA IM 2015)
  let activity = 0

  if (avgSteps > 0) {
    if (avgSteps >= 10000)     activity -= 2
    else if (avgSteps >= 7000) activity -= 1
    else if (avgSteps >= 5000) activity += 0
    else if (avgSteps >= 3000) activity += 1
    else                       activity += 3
  }

  let azmContribution = weeklyAZM >= 500 ? -2 : weeklyAZM >= 300 ? -1 : weeklyAZM >= 150 ? 0 : weeklyAZM >= 75 ? 1 : 2
  // AZM and the Cardio domain both partly reflect cardiovascular fitness; halve AZM's
  // favorable contribution when Cardio is already strongly rewarded to avoid double-counting.
  if (azmContribution < 0 && cardioCapped <= -3) azmContribution = Math.ceil(azmContribution / 2)
  activity += azmContribution

  const activityCapped = clamp(activity, -3, 5)

  // ── Lifestyle — uncapped because smoking is clinically large ──────────────
  let lifestyle = 0
  if (smoking === 'current')     lifestyle += 7
  else if (smoking === 'former') lifestyle += 2
  if (alcohol !== null) {
    if (alcohol >= 14)     lifestyle += 3
    else if (alcohol >= 7) lifestyle += 1
  }

  // ── Synergy: compounding risk when multiple domains are adverse ────────────
  // Framingham / SCORE2 risk models show risk factors multiply, not just add.
  // badDomains = domains where the net contribution is ≥3 years adverse.
  const domains = [cardioCapped, compositionCapped, metabolicCapped, sleepCapped, activityCapped]
  const badDomains = domains.filter(d => d >= 3).length
  const goodDomains = domains.filter(d => d <= -2).length
  let synergy = 0
  if (badDomains >= 4)       synergy += 5
  else if (badDomains >= 3)  synergy += 3
  else if (badDomains >= 2)  synergy += 1
  if (goodDomains >= 3)      synergy -= 2
  else if (goodDomains >= 2) synergy -= 1

  const adj = cardioCapped + compositionCapped + metabolicCapped + sleepCapped + activityCapped + lifestyle + synergy

  return Math.round(Math.max(userAge - 15, Math.min(userAge + 20, userAge + adj)))
}

// How many of the 5 scoring domains are using real user-entered data vs. silently
// defaulting to a 0 contribution — mirrors the existing PhenoAge "X/9 markers" indicator.
export function getPhysiologicalAgeConfidence({ avgHRV, avgRHR, avgSleep, avgSteps, weeklyAZM, vo2Max = 0, lastKnownHRR = null } = {}) {
  const bodyFatPct = getUserBodyFatPct()
  const waistCm = getUserWaistCm()
  const gripKg = getUserGripStrengthKg()
  const homaIR = getHOMAIR()
  const bp = getAverageBP()
  const humeData = getLatestHumeData()
  const tyg = homaIR === 0 ? getTyGIndex() : null
  const labProgress = getPhenoAgeProgress()

  const domains = [
    { label: 'Cardio', present: vo2Max > 0 || avgHRV > 0 || avgRHR > 0 || lastKnownHRR?.hrr60 > 0 },
    { label: 'Body Composition', present: bodyFatPct !== null || waistCm > 0 || gripKg > 0 || !!humeData },
    { label: 'Metabolic', present: bp.sys > 0 || homaIR > 0 || tyg !== null || labProgress.present > 0 },
    { label: 'Sleep & Recovery', present: avgSleep > 0 },
    { label: 'Activity', present: avgSteps > 0 || weeklyAZM > 0 },
  ]
  return {
    present: domains.filter(d => d.present).length,
    total: domains.length,
    missingNames: domains.filter(d => !d.present).map(d => d.label),
  }
}

// Returns rate in biological years per calendar year from longitudinal history.
// rate < 1.0 = aging slower than calendar (favorable)
// rate > 1.0 = aging faster than calendar (unfavorable)
export function calculatePaceOfAging() {
  try {
    const history = JSON.parse(localStorage.getItem('physio_age_history') || '[]')
    if (history.length < 7) return null
    const first = history[0]
    const last = history[history.length - 1]
    const calDays = Math.round((new Date(last.date) - new Date(first.date)) / 86400000)
    if (calDays < 30) return null
    const bioAgeDelta = last.physAge - first.physAge
    const calYears = calDays / 365.25
    const rate = Math.round((bioAgeDelta / calYears) * 100) / 100
    return { rate, bioAgeDelta: Math.round(bioAgeDelta * 10) / 10, calDays }
  } catch { return null }
}

// ── Sleep Architecture ───────────────────────────────────────────────────────
// Ohayon MM et al. (2004) Sleep 27(7):1255-73 — meta-analysis of healthy adults.
// Males only. [maxAge, deepPct, remPct, solMins, wasoMins]
const SLEEP_STAGE_NORMS_MEN = [
  [29, 21, 22, 12, 20],
  [39, 19, 22, 14, 24],
  [49, 16, 21, 15, 30],
  [59, 11, 20, 16, 35],
  [69,  8, 19, 18, 42],
  [99,  5, 19, 22, 52],
]

export function getSleepStageNorms(age) {
  const row = SLEEP_STAGE_NORMS_MEN.find(([mx]) => age <= mx) ?? SLEEP_STAGE_NORMS_MEN[SLEEP_STAGE_NORMS_MEN.length - 1]
  return { deepPct: row[1], remPct: row[2], solMins: row[3], wasoMins: row[4] }
}

// Parse Google Health per-stage sleep segments into clinical architecture metrics.
// Borbely two-process model: deep (SWS) front-loads in first half, REM back-loads.
export function parseSleepArchitecture(todaySleep) {
  if (!todaySleep) return null
  // stageSegments come from normalizeSleepPoint as { startTime, endTime, type } with
  // type one of AWAKE/LIGHT/DEEP/REM — map to the lowercase level names this function uses.
  const STAGE_TYPE_TO_LEVEL = { AWAKE: 'wake', LIGHT: 'light', DEEP: 'deep', REM: 'rem' }
  const segments = todaySleep.stageSegments ?? []

  const sleepLatency  = todaySleep.sleepLatency ?? 0
  const minutesAwake  = todaySleep.minutesAwake ?? 0
  const awakenings    = todaySleep.awakenings ?? 0
  // Google Health doesn't distinguish brief vs full awakenings the way Fitbit's
  // levels.shortData/levels.data split did — classify by segment duration instead.
  const wakeSegs = segments.filter(d => d.type === 'AWAKE')
  const briefAwakenings = wakeSegs.filter(d => (new Date(d.endTime) - new Date(d.startTime)) / 1000 < 90).length
  const fullAwakenings  = wakeSegs.filter(d => (new Date(d.endTime) - new Date(d.startTime)) / 1000 >= 90).length

  // Build hypnogram segments (millisecond-resolution)
  const hypnogram = segments.map(e => ({
    startMs: new Date(e.startTime).getTime(),
    endMs:   new Date(e.endTime).getTime(),
    level:   STAGE_TYPE_TO_LEVEL[e.type] ?? e.type,
    seconds: (new Date(e.endTime) - new Date(e.startTime)) / 1000,
  }))

  // Detect NREM→REM cycles (Borbely: each cycle ~90 min, deep peaks early, REM peaks late)
  const cycles = []
  let cycleStart = null, inREM = false, hasNREM = false
  for (const seg of hypnogram) {
    if (seg.level === 'wake') {
      if (inREM && hasNREM && cycleStart !== null) {
        cycles.push({ startMs: cycleStart, endMs: seg.startMs, durationMins: Math.round((seg.startMs - cycleStart) / 60000) })
        cycleStart = null; inREM = false; hasNREM = false
      }
      continue
    }
    if (cycleStart === null) cycleStart = seg.startMs
    if (seg.level === 'deep' || seg.level === 'light') {
      if (inREM) {
        cycles.push({ startMs: cycleStart, endMs: seg.startMs, durationMins: Math.round((seg.startMs - cycleStart) / 60000) })
        cycleStart = seg.startMs; inREM = false
      }
      hasNREM = true
    }
    if (seg.level === 'rem') inREM = true
  }
  if (cycleStart !== null && hasNREM && inREM && hypnogram.length) {
    const last = hypnogram[hypnogram.length - 1]
    cycles.push({ startMs: cycleStart, endMs: last.endMs, durationMins: Math.round((last.endMs - cycleStart) / 60000) })
  }

  // First vs second half deep/REM split
  const sleepOnsetMs = todaySleep.startTime ? new Date(todaySleep.startTime).getTime() + sleepLatency * 60000 : null
  const sleepEndMs   = todaySleep.endTime   ? new Date(todaySleep.endTime).getTime()   : null
  let firstHalfDeepMins = 0, firstHalfRemMins = 0
  let secondHalfDeepMins = 0, secondHalfRemMins = 0
  if (sleepOnsetMs && sleepEndMs) {
    const midMs = (sleepOnsetMs + sleepEndMs) / 2
    for (const seg of hypnogram) {
      if (seg.level !== 'deep' && seg.level !== 'rem') continue
      const mins = seg.seconds / 60
      const mid  = (seg.startMs + seg.endMs) / 2
      if (mid < midMs) { seg.level === 'deep' ? (firstHalfDeepMins += mins) : (firstHalfRemMins += mins) }
      else              { seg.level === 'deep' ? (secondHalfDeepMins += mins) : (secondHalfRemMins += mins) }
    }
  }

  return {
    sleepLatency, minutesAwake, awakenings, briefAwakenings, fullAwakenings,
    hypnogram, cycles, cycleCount: cycles.length,
    firstHalfDeepMins: Math.round(firstHalfDeepMins),
    firstHalfRemMins:  Math.round(firstHalfRemMins),
    secondHalfDeepMins: Math.round(secondHalfDeepMins),
    secondHalfRemMins:  Math.round(secondHalfRemMins),
    deepFrontLoaded: firstHalfDeepMins >= secondHalfDeepMins,
    remBackLoaded:   secondHalfRemMins >= firstHalfRemMins,
  }
}

// ── EPOC & Workout Analytics ─────────────────────────────────────────────────
// Borsheim E & Bahr R (2003) Sports Med 33(14):1037-60 — EPOC from exercise intensity.
// Fitbit activity logs use 4-zone format: [outOfRange, fatBurn, cardio, peak]
export function calculateEPOC(zoneMinutes, weightKg = 70) {
  // Zone indices for Fitbit 4-zone: [0]=low, [1]=fatBurn, [2]=cardio, [3]=peak
  const z3 = zoneMinutes[2] || 0  // Cardio: ~65-80% HRmax
  const z4 = (zoneMinutes[3] || 0) + (zoneMinutes[4] || 0)  // Peak: >80% HRmax
  // EPOC kcal: empirical rates from Borsheim & Bahr 2003 and Sedlock 1989
  // High-intensity: 0.08-0.15 L O2/min × 5 kcal/L O2
  const kcal = Math.round(z4 * 0.75 + z3 * 0.15)
  // EPOC duration: Z4 elevates metabolism ~5× workout duration; Z3 ~1.5×
  const durationMins = Math.round(z4 * 5 + z3 * 1.5)
  return { kcal, durationMins }
}

const SPORT_MAP = {
  90009: { label: 'Run',       category: 'aerobic' },
  90024: { label: 'Walk',      category: 'aerobic' },
  55001: { label: 'Bike',      category: 'aerobic' },
  91032: { label: 'Bike',      category: 'aerobic' },
  3013:  { label: 'Elliptical', category: 'aerobic' },
  3000:  { label: 'Treadmill', category: 'aerobic' },
  20:    { label: 'Swim',      category: 'aerobic' },
  15000: { label: 'Hike',      category: 'aerobic' },
  90013: { label: 'Weights',   category: 'strength' },
  2071:  { label: 'Yoga',      category: 'recovery' },
  15635: { label: 'HIIT',      category: 'aerobic' },
  63:    { label: 'Row',       category: 'aerobic' },
  110:   { label: 'Jump Rope', category: 'aerobic' },
}

export function classifyWorkoutSport(activityTypeId, activityName) {
  return SPORT_MAP[activityTypeId] ?? { label: activityName ?? 'Workout', category: 'aerobic' }
}

// Parses Google Health activitySession data points + today's intraday HR into
// workout objects. Cardiac drift (Coyle 1992 J Appl Physiol): HR rise at
// constant effort signals dehydration/fatigue.
export function parseActivityLogs(rawActivityLogs, hrIntraday) {
  const activities = rawActivityLogs?.dataPoints ?? []
  const todayStr = new Date().toISOString().split('T')[0]

  // Build minute → HR map for today's cardiac drift computation
  const hrMap = {}
  const hrPoints = hrIntraday?.dataPoints ?? []
  for (const p of hrPoints) {
    const bpm = Number(p.heartRate?.beatsPerMinute)
    const t = p.sampleTime?.physicalTime ?? p.effectiveTime
    if (bpm > 0 && t) hrMap[t] = bpm
  }

  return activities
    .filter(a => a.exercise?.interval?.startTime && a.exercise?.interval?.endTime)
    .map(a => {
      const session = a.exercise
      const startTime = session.interval.startTime
      const startDate = startTime.split('T')[0]
      const isToday   = startDate === todayStr
      const durationMins = Math.round((new Date(session.interval.endTime) - new Date(startTime)) / 60000)
      const sport = classifyWorkoutSport(session.exerciseType, session.displayName)
      const metrics = session.metricsSummary ?? {}

      // Zone durations come as second-strings like "960s"
      const secsToMins = s => s ? Math.round(parseInt(s, 10) / 60) : 0
      let zoneMinutes = null
      if (metrics.heartRateZoneDurations) {
        const z = metrics.heartRateZoneDurations
        zoneMinutes = [0, secsToMins(z.lightTime), secsToMins(z.moderateTime), secsToMins(z.vigorousTime), secsToMins(z.peakTime)]
      }

      const epoc = zoneMinutes ? calculateEPOC(zoneMinutes, getUserWeightKg() || 70) : null

      // Cardiac drift — only computable for today's workouts via intraday HR
      let cardiacDrift = null
      if (isToday && Object.keys(hrMap).length > 0 && durationMins >= 20) {
        const startMs = new Date(startTime).getTime()
        const endMs   = new Date(session.interval.endTime).getTime()
        const pts = []
        for (const [tStr, hr] of Object.entries(hrMap)) {
          const tMs = new Date(tStr).getTime()
          if (tMs >= startMs && tMs <= endMs) pts.push(hr)
        }
        if (pts.length >= 9) {
          const third = Math.floor(pts.length / 3)
          const fAvg  = pts.slice(0, third).reduce((s, v) => s + v, 0) / third
          const lAvg  = pts.slice(-third).reduce((s, v) => s + v, 0) / third
          cardiacDrift = Math.round((lAvg - fAvg) / fAvg * 100 * 10) / 10
        }
      }

      // Strain contribution estimate from zone minutes
      let strainContribution = null
      if (zoneMinutes) {
        const raw = zoneMinutes.reduce((s, m, i) => s + m * ZONE_WEIGHTS[i], 0)
        strainContribution = Math.round((raw / 900) * 16 * 10) / 10
      }

      return {
        activityId: a.name,
        name: sport.label,
        category: sport.category,
        date: startDate,
        startTime,
        durationMins,
        avgHR: metrics.averageHeartRateBeatsPerMinute ? Number(metrics.averageHeartRateBeatsPerMinute) : null,
        calories: metrics.caloriesKcal ?? null,
        steps: metrics.steps ? Number(metrics.steps) : null,
        distance: metrics.distanceMillimeters ? metrics.distanceMillimeters / 1000 : null,
        distanceUnit: metrics.distanceMillimeters ? 'm' : null,
        zoneMinutes,
        epoc,
        cardiacDrift,
        strainContribution,
      }
    })
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
}

// Google Health API dataPoints carry a date on the point itself — either a
// civil {year,month,day} object (Daily-category types), a timestamp string
// (civilStartTime/effectiveTime/sampleTime), or, for session types like
// sleep, on the interval. This pulls whichever is present down to YYYY-MM-DD.
function pointDate(point) {
  if (!point) return null
  // Daily-category types nest the date under the type-specific key
  // (e.g. { dailyRestingHeartRate: { date: {year,month,day} } }), and
  // Sample types nest sampleTime the same way (e.g. { weight: { sampleTime } }),
  // so check the point itself plus every nested sub-object.
  const candidates = [point, ...Object.values(point).filter(v => v && typeof v === 'object')]
  for (const c of candidates) {
    const d = c.date
    if (d?.year) return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  }
  for (const c of candidates) {
    const t = c.civilStartTime ?? c.effectiveTime ?? c.sampleTime?.physicalTime ?? c.interval?.startTime ?? c.startTime
    if (t) return String(t).split('T')[0]
  }
  return null
}

function rollupValue(rollupResponse, dataTypeKey, ...sumKeys) {
  const points = rollupResponse?.rollupDataPoints ?? []
  return points.reduce((sum, p) => {
    for (const key of sumKeys) {
      const val = Number(p?.[dataTypeKey]?.[key])
      if (val) return sum + val
    }
    return sum
  }, 0)
}

// Several Google Health field names below aren't fully confirmed from docs alone
// (the docs don't show a complete JSON example for every data type), so each
// reads a couple of plausible key spellings rather than betting on just one.
function pick(obj, ...paths) {
  for (const path of paths) {
    const val = path.split('.').reduce((o, k) => o?.[k], obj)
    if (val !== undefined && val !== null) return val
  }
  return undefined
}

// calculateStrain/ZoneMinutes/HRR/DaytimeStress and calculateSleepApneaRisk were
// written against the legacy Fitbit Web API's per-minute intraday shape
// ({ 'activities-heart-intraday': { dataset: [{time,value}] } } / { minutes: [{minute,value}] }).
// The Google Health API returns a flat dataPoints list instead, so convert here
// rather than rewriting every consumer.
function toLegacyHRDataset(hrIntraday) {
  const dataset = (hrIntraday?.dataPoints ?? [])
    .map(p => ({ t: p.sampleTime?.physicalTime ?? p.effectiveTime, value: Number(p.heartRate?.beatsPerMinute) }))
    .filter(p => p.t && p.value > 0)
    .sort((a, b) => new Date(a.t) - new Date(b.t))
    .map(p => ({ time: new Date(p.t).toTimeString().slice(0, 8), value: p.value }))
  return { 'activities-heart-intraday': { dataset } }
}

// Google Health's sleep data points nest everything under `.sleep`
// ({ interval: {startTime,endTime}, stages: [...], summary: {minutesAsleep,
// minutesAwake,...} }) — this flattens a point into the shape the rest of the
// app expects (minutesAsleep, efficiency, deepMinutes, remMinutes, etc).
function normalizeSleepPoint(point) {
  const s = point?.sleep
  if (!s?.interval?.startTime || !s?.interval?.endTime) return null
  const stages = s.stages ?? []
  const stageMins = type => stages.filter(st => st.type === type)
    .reduce((sum, st) => sum + (new Date(st.endTime) - new Date(st.startTime)) / 60000, 0)
  const summary = s.summary ?? {}
  const deepMinutes = Math.round(stageMins('DEEP'))
  const remMinutes = Math.round(stageMins('REM'))
  const minutesAwake = summary.minutesAwake != null ? Number(summary.minutesAwake) : Math.round(stageMins('AWAKE'))
  const minutesAsleep = summary.minutesAsleep != null
    ? Number(summary.minutesAsleep)
    : Math.round((new Date(s.interval.endTime) - new Date(s.interval.startTime)) / 60000) - minutesAwake
  const efficiency = summary.efficiency != null
    ? Number(summary.efficiency)
    : (minutesAsleep > 0 ? Math.round((minutesAsleep / (minutesAsleep + minutesAwake)) * 100) : 0)
  const sleepLatency = summary.minutesToFallAsleep != null ? Number(summary.minutesToFallAsleep) : 0
  const awakenings = (summary.stagesSummary ?? []).find(g => g.type === 'AWAKE')?.count
  return {
    // Local calendar date of wake-up time, not a UTC truncation of startTime —
    // a UTC cut would shift sleep that starts late evening local time onto the
    // wrong day for anyone west of Greenwich, scrambling night-to-night ordering.
    date: localDateOf(s.interval.endTime),
    minutes: minutesAsleep,
    minutesAsleep,
    minutesAwake,
    efficiency,
    startTime: s.interval.startTime,
    endTime: s.interval.endTime,
    deepMinutes,
    remMinutes,
    sleepLatency,
    awakenings: awakenings != null ? Number(awakenings) : 0,
    // Raw stage segments, kept for parseSleepArchitecture's hypnogram/cycle detection.
    stageSegments: stages,
  }
}

function toLegacySpo2Minutes(spo2Intraday) {
  // Spot SpO2 readings below 60% are sensor glitches, not real physiology
  // (sustained SpO2 that low is incompatible with consciousness) — drop them
  // so they can't trigger a false "Very High" apnea risk alert.
  const minutes = (spo2Intraday?.dataPoints ?? [])
    .map(p => ({ minute: p.sampleTime?.physicalTime ?? p.effectiveTime, value: Number(p.oxygenSaturation?.percentage) }))
    .filter(p => p.minute && p.value >= 60)
    .sort((a, b) => new Date(a.minute) - new Date(b.minute))
  return { minutes }
}

export function parseGoogleHealthData(raw) {
  const { summary, hrIntraday, sleep, hrv, spo2, br, hrvRange, hrRange, sleepRange, cardioFitness, skinTemp, bodyWeight, bodyFat, spo2Intraday } = raw

  // Date-aligned histories prevent index desync when API returns different date ranges
  const hrvByDate = {}
  for (const d of (hrvRange?.dataPoints ?? [])) {
    const val = pick(d, 'dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds', 'dailyHeartRateVariability.rmssd', 'dailyHeartRateVariability.value')
    const date = pointDate(d)
    if (date && val) hrvByDate[date] = Number(val)
  }
  const rhrByDate = {}
  for (const d of (hrRange?.dataPoints ?? [])) {
    const val = pick(d, 'dailyRestingHeartRate.beatsPerMinute', 'dailyRestingHeartRate.bpm', 'dailyRestingHeartRate.avg')
    const date = pointDate(d)
    if (date && val) rhrByDate[date] = Number(val)
  }
  const historyDates = Object.keys(hrvByDate).sort()
  const hrvHistory = historyDates.map(date => hrvByDate[date])
  const rhrHistory = historyDates.map(date => rhrByDate[date] || 0)

  const todayHRVRaw = pick(hrv?.dataPoints?.[0], 'dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds', 'dailyHeartRateVariability.rmssd', 'dailyHeartRateVariability.value')
  const todayHRV = todayHRVRaw ? Number(todayHRVRaw) : (hrvByDate[historyDates.at(-1)] ?? 0)
  const todayRHR = rhrByDate[historyDates.at(-1)] ?? 0
  const sleepPoints = sleep?.dataPoints ?? []
  // Google Health returns range queries newest-first; sort ascending so
  // "most recent" is always the last element, matching hrvHistory/rhrHistory
  // and what every consumer (streaks, sleep debt, etc.) assumes.
  const sleepHistory = (sleepRange?.dataPoints ?? [])
    .map(s => normalizeSleepPoint(s))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
  const todaySleep = normalizeSleepPoint(sleepPoints[0]) ?? sleepHistory.at(-1) ?? null
  const todaySpO2Raw = pick(spo2?.dataPoints?.[0], 'dailyOxygenSaturation.averagePercentage', 'dailyOxygenSaturation.percentage', 'dailyOxygenSaturation.avg')
  const todaySpO2 = todaySpO2Raw ? Number(todaySpO2Raw) : 97
  const todayBRRaw = pick(br?.dataPoints?.[0], 'dailyRespiratoryRate.breathsPerMinute', 'dailyRespiratoryRate.bpm', 'dailyRespiratoryRate.avg')
  const todayBR = todayBRRaw ? Number(todayBRRaw) : 14
  const steps = rollupValue(summary?.steps, 'steps', 'countSum')
  const calories = rollupValue(summary?.calories, 'totalCalories', 'kilocaloriesSum', 'kcalSum')
  const azmPoints = summary?.activeZoneMinutes?.rollupDataPoints ?? []
  const activeMinutes = azmPoints.reduce((sum, p) => {
    const z = p.activeZoneMinutes
    if (!z) return sum
    return sum + (Number(z.sumInCardioHeartZone) || 0) + (Number(z.sumInPeakHeartZone) || 0) + (Number(z.sumInFatBurnHeartZone) || 0)
  }, 0)

  // VO2 Max from Google Health's daily-vo2-max data type — the API returns
  // these date-ranged lists newest-first (same as hrv/hr/sleep ranges above),
  // so the most recent reading is dataPoints[0], not the last element.
  const vo2MaxRaw = pick(cardioFitness?.dataPoints?.[0], 'dailyVo2Max.vo2Max', 'dailyVo2Max.value')
  const vo2Max = (vo2MaxRaw ? Math.round(vo2MaxRaw) : 0) || getUserVO2Max()
  const vo2MaxRange = vo2MaxRaw ? String(Math.round(vo2MaxRaw)) : null

  // Skin temperature nightly deviation in °C relative to personal baseline
  const skinTempPoint = skinTemp?.dataPoints?.[0]?.dailySleepTemperatureDerivations
  const skinTempDev = (skinTempPoint?.nightlyTemperatureCelsius != null && skinTempPoint?.baselineTemperatureCelsius != null)
    ? skinTempPoint.nightlyTemperatureCelsius - skinTempPoint.baselineTemperatureCelsius
    : null

  // Sleep end hour for daytime stress calculation
  const sleepEndHour = todaySleep?.endTime
    ? new Date(todaySleep.endTime).getHours()
    : null

  // Sync Google Health-logged body weight/fat into local history if available.
  // Sort ascending so the most recent entry is written last and wins as the
  // quick-access user_weight_kg value, regardless of API return order.
  const weightPoints = [...(bodyWeight?.dataPoints ?? [])].sort((a, b) => String(pointDate(a)).localeCompare(String(pointDate(b))))
  const fatByDate = {}
  for (const f of (bodyFat?.dataPoints ?? [])) {
    const date = pointDate(f)
    if (date) fatByDate[date] = pick(f, 'bodyFat.percentage', 'bodyFat.value')
  }
  for (const w of weightPoints) {
    const date = pointDate(w)
    const grams = pick(w, 'weight.weightGrams', 'weight.kilograms', 'weight.value')
    const kg = w.weight?.weightGrams != null ? grams / 1000 : grams
    if (date && kg) saveBodyWeightEntry(date, kg, fatByDate[date] ?? null, 'google_health')
  }

  const activityLogs = parseActivityLogs(raw.activityLogs, hrIntraday)

  return {
    todayHRV, todayRHR, todaySleep, todaySpO2, todayBR,
    steps, calories, activeMinutes,
    hrvHistory, rhrHistory, historyDates, sleepHistory,
    hrvByDate, rhrByDate,
    hrIntradayData: toLegacyHRDataset(hrIntraday),
    spo2IntradayLegacy: toLegacySpo2Minutes(spo2Intraday),
    vo2Max, vo2MaxRange, skinTempDev, sleepEndHour,
    activityLogs,
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
    const history = getBodyWeightHistory()
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].kg != null && history[i].kg > 0) return history[i].kg
    }
    const v = parseFloat(localStorage.getItem('user_weight_kg') || '0')
    return isNaN(v) ? 0 : v
  } catch { return 0 }
}

export function getUserBodyFatPct() {
  try {
    const history = getBodyWeightHistory()
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].fatPct != null && history[i].fatPct > 0) return history[i].fatPct
    }
    const v = parseFloat(localStorage.getItem('user_body_fat_pct') || '0')
    return isNaN(v) || v <= 0 ? null : v
  } catch { return null }
}

export function getUserVO2Max() {
  try {
    const v = parseFloat(localStorage.getItem('user_vo2_max') || '0')
    return isNaN(v) || v <= 0 ? 0 : v
  } catch { return 0 }
}

export function getBodyWeightHistory() {
  try { return JSON.parse(localStorage.getItem('weight_history') || '[]') } catch { return [] }
}

export function saveBodyWeightEntry(date, kg, fatPct, source = 'manual', humeExtras = null) {
  const validKg = kg != null && kg >= 20 && kg <= 300
  if (!validKg && !fatPct) return
  try {
    const history = getBodyWeightHistory()
    const idx = history.findIndex(e => e.date === date)
    // Manual entries win over a synced source — don't let a sync overwrite what the user typed
    if (source === 'google_health' && idx >= 0 && history[idx].source === 'manual') return
    const entry = { date, kg: validKg ? Math.round(kg * 10) / 10 : (idx >= 0 ? history[idx].kg : null), fatPct: fatPct || null, source, ...(humeExtras || {}) }
    if (idx >= 0) history[idx] = entry
    else history.push(entry)
    history.sort((a, b) => a.date.localeCompare(b.date))
    localStorage.setItem('weight_history', JSON.stringify(history.slice(-365)))
    // Keep latest as quick-access value
    if (entry.kg != null) localStorage.setItem('user_weight_kg', String(entry.kg))
    if (fatPct) localStorage.setItem('user_body_fat_pct', String(fatPct))
  } catch {}
}

export function getLatestHumeData() {
  try {
    const history = getBodyWeightHistory()
    const entries = history.filter(e => e.source === 'hume' && (e.visceralFatIndex != null || e.skelMuscleKg != null))
    return entries.length ? entries[entries.length - 1] : null
  } catch { return null }
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

// ── Body Fat % classification (shared across Settings + Chronos) ───────────
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

// ── Sleep Regularity Index ──────────────────────────────────────────────────
// Phillips et al. 2017: probability of same sleep/wake state 24h apart.
// Requires startTime/endTime per sleep entry; 5-min resolution sampling.
export function calculateSRI(sleepHistory) {
  const valid = sleepHistory
    .filter(s => s.startTime && s.endTime && s.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
  if (valid.length < 2) return null
  const STEP = 5
  let matchMins = 0, totalMins = 0
  for (let i = 0; i < valid.length - 1; i++) {
    const n1 = valid[i], n2 = valid[i + 1]
    const expectedNext = (() => { const d = new Date(n1.date + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()
    if (n2.date !== expectedNext) continue
    const m1 = new Date(n1.date + 'T00:00:00')
    const m2 = new Date(n2.date + 'T00:00:00')
    const s1s = Math.round((new Date(n1.startTime) - m1) / 60000)
    const s1e = Math.round((new Date(n1.endTime)   - m1) / 60000)
    const s2s = Math.round((new Date(n2.startTime) - m2) / 60000)
    const s2e = Math.round((new Date(n2.endTime)   - m2) / 60000)
    for (let t = -360; t < 1080; t += STEP) {
      const a1 = t >= s1s && t < s1e
      const a2 = t >= s2s && t < s2e
      if (a1 === a2) matchMins += STEP
      totalMins += STEP
    }
  }
  if (totalMins === 0) return null
  return Math.round((matchMins / totalMins) * 100) / 100
}

export function saveLastKnownHRR(hrr) {
  if (!hrr) return
  try { localStorage.setItem('last_known_hrr', JSON.stringify({ ...hrr, date: new Date().toISOString().split('T')[0] })) } catch {}
}

export function getLastKnownHRR() {
  try {
    const v = JSON.parse(localStorage.getItem('last_known_hrr') || 'null')
    if (!v) return null
    // Discard readings older than 90 days — HRR changes meaningfully with training
    const ageDays = (Date.now() - new Date(v.date + 'T00:00:00').getTime()) / 86400000
    return ageDays <= 90 ? v : null
  } catch { return null }
}

// ── Post-exercise Heart Rate Recovery ──────────────────────────────────────
// Cole et al. NEJM 1999: HRR < 12 bpm at 1 min predicts mortality.
// Detects last vigorous bout (≥70% maxHR for ≥5 min) and measures HR drop.
export function calculateHRR(hrIntradayData) {
  const pts = hrIntradayData?.['activities-heart-intraday']?.dataset
  if (!pts?.length) return null
  const maxHR = getMaxHR()
  const threshold = maxHR * 0.70
  const bouts = []
  let boutStart = null
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].value >= threshold) {
      if (boutStart === null) boutStart = i
    } else if (boutStart !== null) {
      if (i - boutStart >= 5) bouts.push({ start: boutStart, end: i - 1 })
      boutStart = null
    }
  }
  if (boutStart !== null && pts.length - boutStart >= 5) bouts.push({ start: boutStart, end: pts.length - 1 })
  if (!bouts.length) return null
  const lastBout = bouts[bouts.length - 1]
  if (lastBout.end + 1 >= pts.length) return null
  const peakHR = Math.max(...pts.slice(lastBout.start, lastBout.end + 1).map(p => p.value))
  const hrr60 = peakHR - pts[lastBout.end + 1].value
  if (hrr60 <= 0) return null
  const hrr120Raw = lastBout.end + 2 < pts.length ? peakHR - pts[lastBout.end + 2].value : null
  const hrr120 = hrr120Raw !== null && hrr120Raw > 0 ? hrr120Raw : null
  return { peakHR, hrr60, hrr120 }
}

// ── Social Jet Lag ──────────────────────────────────────────────────────────
// Standard deviation of sleep midpoints (minutes from midnight) over last 30 nights.
// Lower = more consistent circadian timing. Reference: Roenneberg Curr Biol 2012.
export function calculateSocialJetLag(sleepHistory) {
  const entries = sleepHistory.filter(s => s.startTime && s.endTime).slice(-30)
  if (entries.length < 5) return null
  const midpoints = entries.map(s => {
    const midnight = new Date(s.date + 'T00:00:00')
    let s0 = Math.round((new Date(s.startTime) - midnight) / 60000)
    // Fitbit's dateOfSleep is sometimes the wake date; a start > 20h after midnight
    // means the record date is the wake date and sleep actually started the prior evening.
    if (s0 > 1200) s0 -= 1440
    const e0 = Math.round((new Date(s.endTime) - midnight) / 60000)
    return (s0 + e0) / 2
  })
  const mean = midpoints.reduce((a, b) => a + b, 0) / midpoints.length
  const variance = midpoints.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / midpoints.length
  return Math.round(Math.sqrt(variance))  // minutes
}

// ── Sleep Apnea Risk Engine ─────────────────────────────────────────────────
// Uses per-5-minute SpO2 intraday readings during sleep to estimate desaturation
// burden. Supplemented by elevated BR. ODI = desaturation events per hour.
export function calculateSleepApneaRisk({ spo2Intraday, br, todaySleep }) {
  const readings = spo2Intraday?.minutes
  if (!readings?.length) return null

  const sleepStart = todaySleep?.startTime ? new Date(todaySleep.startTime) : null
  const sleepEnd   = todaySleep?.endTime   ? new Date(todaySleep.endTime)   : null
  const sleepReads = sleepStart && sleepEnd
    ? readings.filter(r => { const t = new Date(r.minute); return t >= sleepStart && t <= sleepEnd })
    : readings
  if (!sleepReads.length) return null

  const vals = sleepReads.map(r => r.value)
  const minSpo2 = Math.min(...vals)
  const avgSpo2 = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  const below90 = vals.filter(v => v < 90).length
  const sleepHours = todaySleep ? (todaySleep.minutesAsleep || 420) / 60 : 7

  // ODI: count discrete desaturation events (≥3% drop from baseline, then recovery).
  // Baseline = 90th-percentile SpO2 (resistant to being dragged down by sustained desaturations),
  // capped at 97 since overnight SpO2 rarely exceeds that even in healthy sleepers.
  const sorted = [...vals].sort((a, b) => a - b)
  const baseline = Math.min(97, sorted[Math.floor((vals.length - 1) * 0.9)] ?? 97)
  const dropThreshold = baseline - 3
  let eventCount = 0
  let inEvent = false
  for (const v of vals) {
    if (!inEvent && v <= dropThreshold) { inEvent = true; eventCount++ }
    else if (inEvent && v > dropThreshold) { inEvent = false }
  }
  const odi = Math.round((eventCount / sleepHours) * 10) / 10
  const brElevated = br != null && br > 18

  let risk = 'Low', riskLevel = 0
  if (minSpo2 < 85 || odi > 15 || below90 > 2) { risk = 'Very High'; riskLevel = 3 }
  else if (minSpo2 < 88 || odi > 10)            { risk = 'High';      riskLevel = 2 }
  else if (minSpo2 < 93 || odi > 5 || brElevated) { risk = 'Moderate'; riskLevel = 1 }

  return { risk, riskLevel, minSpo2, avgSpo2, odi, brElevated }
}

// ── Chronos Delta Engine ─────────────────────────────────────────────────
// For each modifiable factor, computes how many biological years you'd gain
// by reaching the next better tier. Sorted by highest gain first.
export function getChronosDeltas({ vo2Max, steps, weeklyAZM, avgHRV, avgSleepHours, bodyFatPct, waistCm, gripKg, bp }) {
  const userAge = getUserAge()
  const deltas = []

  if (vo2Max > 0) {
    const [fair, good, excel] = ageNorm(VO2_NORMS_MEN, userAge)
    const cur = vo2Max >= excel + 5 ? -5 : vo2Max >= excel ? -3 : vo2Max >= good ? -1 : vo2Max >= fair ? 2 : vo2Max >= fair * 0.8 ? 4 : 6
    if (cur > -3) {
      const tgt = vo2Max < fair * 0.8 ? Math.ceil(fair * 0.8) : vo2Max < fair ? fair : vo2Max < good ? good : excel
      const nxt = tgt >= excel ? -3 : tgt >= good ? -1 : tgt >= fair ? 2 : 4
      if (cur > nxt) deltas.push({ label: 'VO₂ Max', gain: cur - nxt, action: `Raise to ${tgt}+ mL/kg/min with zone 2 training` })
    }
  }

  if (steps > 0 && steps < 10000) {
    const cur = steps >= 7000 ? -1 : steps >= 5000 ? 0 : steps >= 3000 ? 1 : 3
    const [nxt, lbl] = steps < 3000 ? [1, '3,000'] : steps < 5000 ? [0, '5,000'] : steps < 7000 ? [-1, '7,000'] : [-2, '10,000']
    if (cur > nxt) deltas.push({ label: 'Daily Steps', gain: cur - nxt, action: `Reach ${lbl}+ steps/day` })
  }

  if (weeklyAZM < 500) {
    const cur = weeklyAZM >= 300 ? -1 : weeklyAZM >= 150 ? 0 : weeklyAZM >= 75 ? 1 : 2
    const [nxt, lbl] = weeklyAZM < 75 ? [1, '75'] : weeklyAZM < 150 ? [0, '150'] : weeklyAZM < 300 ? [-1, '300'] : [-2, '500']
    if (cur > nxt) deltas.push({ label: 'Active Zone Minutes', gain: cur - nxt, action: `Reach ${lbl}+ min/week of elevated HR` })
  }

  if (bodyFatPct !== null && bodyFatPct >= 15) {
    const cur = bodyFatPct < 15 ? -2 : bodyFatPct < 20 ? -1 : bodyFatPct < 27 ? 0 : bodyFatPct < 32 ? 3 : 5
    const [nxt, lbl] = bodyFatPct >= 32 ? [3, '<32%'] : bodyFatPct >= 27 ? [0, '<27%'] : bodyFatPct >= 20 ? [-1, '15–20%'] : [-2, '10–15%']
    if (cur > nxt) deltas.push({ label: 'Body Fat %', gain: cur - nxt, action: `Reduce to ${lbl}` })
  }

  if (bp?.sys > 0 && (bp.sys >= 130 || bp.dia >= 80)) {
    const cur = bp.sys >= 160 || bp.dia >= 100 ? 5 : bp.sys >= 140 || bp.dia >= 90 ? 3 : 1
    deltas.push({ label: 'Blood Pressure', gain: cur + 1, action: 'Normalize to <120/80 mmHg' })
  }

  if (avgHRV > 0) {
    const norm = ageNorm(HRV_NORMS_FITBIT_MEN, userAge)
    const ratio = avgHRV / norm
    if (ratio < 0.85) {
      const cur = ratio >= 0.65 ? 2 : 4
      deltas.push({ label: 'HRV', gain: cur - 0, action: `Raise baseline toward ${Math.round(norm * 0.85)} ms (sleep, stress, training)` })
    } else if (ratio < 1.2) {
      deltas.push({ label: 'HRV', gain: 1, action: `Raise baseline from ${Math.round(avgHRV)} toward ${Math.round(norm * 1.2)}+ ms` })
    }
  }

  if (avgSleepHours > 0 && (avgSleepHours < 7 || avgSleepHours > 9)) {
    const cur = avgSleepHours < 6 ? 3 : 1
    deltas.push({ label: 'Sleep Duration', gain: cur + 1, action: 'Target 7–9 hours nightly' })
  }

  if (waistCm > 0 && waistCm >= 94) {
    const cur = waistCm >= 102 ? 4 : 2
    const [nxt, lbl] = waistCm >= 102 ? [2, '<102 cm'] : [-1, '<90 cm']
    deltas.push({ label: 'Waist Circumference', gain: cur - nxt, action: `Reduce to ${lbl}` })
  }

  if (gripKg > 0) {
    const norm = ageNorm(GRIP_NORMS_MEN, userAge)
    const ratio = gripKg / norm
    if (ratio < 1.0) {
      const cur = ratio >= 0.8 ? 0 : ratio >= 0.65 ? 2 : 3
      const nxt = ratio >= 0.8 ? -1 : 0
      if (cur > nxt) deltas.push({ label: 'Grip Strength', gain: cur - nxt, action: `Reach ≥${Math.round(norm)} kg with resistance training` })
    }
  }

  return deltas.sort((a, b) => b.gain - a.gain)
}

// Training Status — Garmin-style from ATL/CTL/TSB + load direction
// Banister 1991 impulse-response model; Coggan/Allen TSB performance zones
export function getTrainingStatus(trainingLoad, strainVelocity) {
  if (!trainingLoad) return null
  const { tsb, atl, ctl } = trainingLoad
  const trending = strainVelocity ?? 0
  if (tsb < -25) return { status: 'Overreaching', color: '#ef4444', desc: 'Excessive fatigue — reduce load now.' }
  if (tsb < -10 && trending > 0) return { status: 'Productive', color: '#3b82f6', desc: 'Adapting to load — fitness building.' }
  if (tsb >= 5 && atl < ctl && trending < 0) return { status: 'Detraining', color: '#f59e0b', desc: 'Load too low — fitness may decline.' }
  if (tsb >= 5 && trending > 0) return { status: 'Peaking', color: '#00c9a7', desc: 'Fresh and building — peak performance window.' }
  if (tsb >= 5) return { status: 'Recovery', color: '#00c9a7', desc: 'Well rested — ready to train hard.' }
  return { status: 'Maintaining', color: '#8b5cf6', desc: 'Balanced — sustaining current fitness.' }
}

// Chronotype from average sleep midpoint — Roenneberg MCTQ 2004
export function calculateChronotype(sleepHistory) {
  const valid = sleepHistory.filter(s => s.startTime && s.endTime).slice(-30)
  if (valid.length < 7) return null
  const midpoints = valid.map(s => {
    const midnight = new Date(s.date + 'T00:00:00')
    let startM = Math.round((new Date(s.startTime) - midnight) / 60000)
    if (startM > 1200) startM -= 1440
    const endM = Math.round((new Date(s.endTime) - midnight) / 60000)
    return (startM + endM) / 2
  })
  const avg = midpoints.reduce((a, b) => a + b, 0) / midpoints.length
  const absMin = ((avg % 1440) + 1440) % 1440
  const h = Math.floor(absMin / 60) % 24
  const m = Math.floor(absMin) % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
  const type = avg < 150 ? 'Morning' : avg < 270 ? 'Neutral' : 'Evening'
  return { midpointMins: Math.round(avg), timeStr, type }
}

// Sleep debt payback projection — days to clear current debt at current nightly surplus
export function calculateSleepDebtPayback(sleepDebt, sleepHistory) {
  if (!sleepDebt || sleepDebt <= 0 || !sleepHistory.length) return null
  const optimalMins = computeOptimalSleepHours(sleepHistory) * 60
  const last7 = sleepHistory.slice(-7).filter(s => s.minutes > 0)
  if (last7.length < 3) return null
  const avgMins = last7.reduce((a, s) => a + s.minutes, 0) / last7.length
  const surplusPerNight = avgMins - optimalMins
  if (surplusPerNight <= 0) return null
  return Math.ceil((sleepDebt * 60) / surplusPerNight)
}

// VO2 Max fitness category + all-cause mortality context
// Threshold values are approximate age/sex-specific percentile cutoffs for males
// Source: Mandsager et al. JAMA Network Open 2018
export function getVO2MortalityContext(vo2max, age) {
  if (!vo2max || vo2max <= 0 || !age || age <= 0) return null
  const [l, ba, aa, h] =
    age <= 29 ? [33, 40, 47, 53] :
    age <= 39 ? [29, 36, 43, 51] :
    age <= 49 ? [25, 32, 39, 46] :
    age <= 59 ? [21, 27, 34, 42] :
    age <= 69 ? [17, 23, 30, 37] :
               [15, 20, 26, 33]
  if (vo2max <= l)  return { category: 'Low Fitness',    note: 'Highest all-cause mortality risk',                color: '#ef4444', mult: null }
  if (vo2max <= ba) return { category: 'Below Average',  note: '~2× lower all-cause mortality vs Low fitness',   color: '#f59e0b', mult: 2   }
  if (vo2max <= aa) return { category: 'Above Average',  note: '~3× lower all-cause mortality vs Low fitness',   color: '#3b82f6', mult: 3   }
  if (vo2max <= h)  return { category: 'High Fitness',   note: '~3.7× lower all-cause mortality vs Low fitness', color: '#00c9a7', mult: 3.7 }
  return              { category: 'Elite Fitness',     note: '~5× lower all-cause mortality vs Low fitness',   color: '#00c9a7', mult: 5   }
}

// RHR mortality risk context
// Source: HUNT study (Woodward et al.) and multiple large cohort meta-analyses
export function getRHRMortalityContext(rhr) {
  if (!rhr || rhr <= 0) return null
  if (rhr < 60) return { label: 'Athletic', detail: 'Lowest all-cause mortality risk',                        color: '#00c9a7' }
  if (rhr < 70) return { label: 'Optimal',  detail: 'Low mortality risk',                                     color: '#00c9a7' }
  if (rhr < 80) return { label: 'Normal',   detail: 'Average mortality risk',                                 color: '#3b82f6' }
  if (rhr < 90) return { label: 'Elevated', detail: '~1.5× higher all-cause mortality vs <60 bpm (HUNT)',     color: '#f59e0b' }
  return              { label: 'High',      detail: '~2.8× higher all-cause mortality vs <60 bpm (HUNT)',     color: '#ef4444' }
}

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

export function calculateReadiness({ recoveryScore = 0, recoveryVelocity = 0, sleepDebt = 0, trainingLoad = null, todayHRV = 0, hrvHistory = [], stressScore = 0 }) {
  const tsb = trainingLoad?.tsb ?? 0
  const hrv14 = hrvHistory.slice(-14).filter(Boolean)
  const avgHRV14 = hrv14.length ? hrv14.reduce((a, b) => a + b, 0) / hrv14.length : 0
  const hrvDelta = todayHRV > 0 && avgHRV14 > 0 ? Math.round(todayHRV - avgHRV14) : 0

  // Tier assignment — Primed requires all signals green
  let headline, color
  if (recoveryScore >= 67 && sleepDebt < 1 && tsb > -15 && stressScore < 60 && recoveryVelocity >= -2) {
    headline = 'Primed'; color = '#00c9a7'
  } else if (recoveryScore >= 34 || (recoveryScore >= 50 && sleepDebt < 2)) {
    headline = 'Balanced'; color = '#3b82f6'
  } else if (recoveryScore >= 15) {
    headline = 'Strained'; color = '#f59e0b'
  } else {
    headline = 'Run Down'; color = '#ef4444'
  }

  // Build reason tags (max 3, most informative first)
  const reasons = []
  if (hrvDelta >= 6) reasons.push(`HRV +${hrvDelta}ms`)
  else if (hrvDelta <= -6) reasons.push(`HRV ${hrvDelta}ms`)
  if (sleepDebt >= 1) reasons.push(`${sleepDebt}h sleep debt`)
  if (tsb > 10) reasons.push('Low training load')
  else if (tsb < -20) reasons.push('High training load')
  if (stressScore >= 65) reasons.push('Elevated stress')
  if (recoveryVelocity <= -4) reasons.push('Recovery dropping')
  else if (recoveryVelocity >= 5) reasons.push('Recovery rising')

  return { headline, color, reasons: reasons.slice(0, 3) }
}
