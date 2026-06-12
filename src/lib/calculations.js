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

export function getHRZone(hr) {
  const maxHR = getMaxHR()
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

  let sessionMax = 0
  let raw = 0
  for (const p of points) {
    if (p.value > sessionMax) sessionMax = p.value
    raw += ZONE_WEIGHTS[getHRZone(p.value)]
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
  const counts = [0, 0, 0, 0, 0]
  for (const p of hrIntradayData['activities-heart-intraday'].dataset) {
    const z = getHRZone(p.value)
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

export function calculateRecovery({ hrv, rhr, sleep, spo2, br, hrvHistory, rhrHistory }) {
  const avgHRV = average(hrvHistory.filter(Boolean))
  const avgRHR = average(rhrHistory.filter(Boolean))

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
    sleepScore = clamp((hours / 8) * 70, 0, 70) + clamp((efficiency / 100) * 30, 0, 30)
  }

  const spo2Score = spo2 >= 97 ? 100 : spo2 >= 95 ? 80 : spo2 >= 93 ? 60 : 40
  const brScore = br >= 12 && br <= 18 ? 100 : 70

  const score = hrvScore * 0.40 + rhrScore * 0.25 + sleepScore * 0.25 + spo2Score * 0.05 + brScore * 0.05
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

export function calculatePhysiologicalAge({ avgHRV, avgRHR, avgSleep, sleepConsistency, avgSteps, weeklyAZM }) {
  const userAge = getUserAge()
  let adj = 0

  // BMI adjustment when height/weight are set
  const bmi = calculateBMI(getUserHeightCm(), getUserWeightKg())
  if (bmi !== null) {
    if (bmi < 18.5) adj += 1
    else if (bmi < 25) adj -= 1
    else if (bmi < 30) adj += 1
    else if (bmi < 35) adj += 2
    else adj += 4
  }

  if (avgHRV > 70) adj -= 4
  else if (avgHRV > 60) adj -= 3
  else if (avgHRV > 50) adj -= 1
  else if (avgHRV > 40) adj += 1
  else if (avgHRV > 30) adj += 2
  else adj += 4

  if (avgRHR < 50) adj -= 4
  else if (avgRHR < 58) adj -= 2
  else if (avgRHR < 68) adj -= 1
  else if (avgRHR > 78) adj += 2
  else adj += 1

  if (avgSleep >= 7.5 && sleepConsistency >= 0.8) adj -= 3
  else if (avgSleep >= 7.0 && sleepConsistency >= 0.65) adj -= 1
  else if (avgSleep < 5.5 || sleepConsistency < 0.5) adj += 3
  else adj += 1

  if (avgSteps >= 12000) adj -= 2
  else if (avgSteps >= 8000) adj -= 1
  else if (avgSteps < 4000) adj += 2

  if (weeklyAZM >= 300) adj -= 2
  else if (weeklyAZM >= 150) adj -= 1
  else if (weeklyAZM < 50) adj += 2

  return userAge + adj
}

export function calculatePaceOfAging(recentAge, baselineAge) {
  const diff = recentAge - baselineAge
  return Math.round(diff * 10) / 10
}

export function parseFitbitData(raw) {
  const { summary, hrIntraday, sleep, hrv, spo2, br, hrvRange, hrRange, sleepRange, cardioFitness, skinTemp } = raw

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
    }))

  return {
    todayHRV, todayRHR, todaySleep, todaySpO2, todayBR,
    steps, calories, activeMinutes,
    hrvHistory, rhrHistory, sleepHistory,
    hrIntradayData: hrIntraday,
    vo2Max, skinTempDev,
  }
}

// ── Sleep Debt ──────────────────────────────────────────────────────────────

export function calculateSleepDebt(sleepHistory, optimalHours = 8) {
  const optimalMins = optimalHours * 60
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
  const endMins = entries.map(s => {
    const d = new Date(s.endTime)
    return d.getHours() * 60 + d.getMinutes()
  })

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
