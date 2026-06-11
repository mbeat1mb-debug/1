const USER_AGE = 39

// Max heart rate via Gellish non-linear formula
export const MAX_HR = Math.round(192 - 0.007 * USER_AGE * USER_AGE)

export function getHRZone(hr) {
  const pct = hr / MAX_HR
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
  let raw = 0

  for (const p of points) {
    const zone = getHRZone(p.value)
    raw += ZONE_WEIGHTS[zone]
  }

  // Biological base (just being alive) = 5, hard max = 21
  // Normalization: 900 zone-weighted minutes ≈ max exertion
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

  // HRV component (40%): above baseline = better
  let hrvScore = 50
  if (avgHRV > 0 && hrv > 0) {
    const ratio = hrv / avgHRV
    hrvScore = ratio >= 1 ? clamp(50 + (ratio - 1) * 120, 50, 100) : clamp(ratio * 50, 0, 50)
  }

  // RHR component (25%): below baseline = better
  let rhrScore = 50
  if (avgRHR > 0 && rhr > 0) {
    const diff = avgRHR - rhr
    rhrScore = clamp(50 + diff * 5, 0, 100)
  }

  // Sleep component (25%): duration + efficiency
  let sleepScore = 50
  if (sleep) {
    const hours = sleep.totalMinutesAsleep / 60
    const efficiency = sleep.efficiency || 85
    const hourScore = clamp((hours / 8) * 70, 0, 70)
    const effScore = clamp((efficiency / 100) * 30, 0, 30)
    sleepScore = hourScore + effScore
  }

  // SpO2 component (5%)
  const spo2Score = spo2 >= 97 ? 100 : spo2 >= 95 ? 80 : spo2 >= 93 ? 60 : 40

  // Respiratory rate component (5%)
  const brScore = br >= 12 && br <= 18 ? 100 : 70

  const score =
    hrvScore * 0.40 +
    rhrScore * 0.25 +
    sleepScore * 0.25 +
    spo2Score * 0.05 +
    brScore * 0.05

  return Math.round(clamp(score, 0, 100))
}

export function getRecoveryColor(score) {
  if (score >= 67) return '#00c9a7'
  if (score >= 34) return '#f59e0b'
  return '#ef4444'
}

export function getRecoveryLabel(score) {
  if (score >= 67) return 'PEAK'
  if (score >= 34) return 'GOOD'
  return 'REST'
}

export function calculateStressScore({ hrv, rhr, hrvHistory, rhrHistory }) {
  const avgHRV = average(hrvHistory.slice(-14).filter(Boolean))
  const avgRHR = average(rhrHistory.slice(-14).filter(Boolean))

  // HRV below baseline = more stress
  const hrvStress = avgHRV > 0 ? clamp((1 - hrv / avgHRV) * 50 + 50, 0, 100) : 50
  // RHR above baseline = more stress
  const rhrStress = avgRHR > 0 ? clamp(50 + (rhr - avgRHR) * 5, 0, 100) : 50

  const stress = Math.round(clamp(hrvStress * 0.6 + rhrStress * 0.4, 0, 100))
  return stress
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

// Physiological age calculation based on 7 Whoop healthspan inputs
export function calculatePhysiologicalAge({ avgHRV, avgRHR, avgSleep, sleepConsistency, avgSteps, weeklyAZM }) {
  let adj = 0

  // HRV — population norm for 39yo ≈ 45-55ms RMSSD
  if (avgHRV > 70) adj -= 4
  else if (avgHRV > 60) adj -= 3
  else if (avgHRV > 50) adj -= 1
  else if (avgHRV > 40) adj += 1
  else if (avgHRV > 30) adj += 2
  else adj += 4

  // Resting HR
  if (avgRHR < 50) adj -= 4
  else if (avgRHR < 58) adj -= 2
  else if (avgRHR < 68) adj -= 1
  else if (avgRHR > 78) adj += 2
  else adj += 1

  // Sleep duration (hours)
  if (avgSleep >= 7.5 && sleepConsistency >= 0.8) adj -= 3
  else if (avgSleep >= 7.0 && sleepConsistency >= 0.65) adj -= 1
  else if (avgSleep < 5.5 || sleepConsistency < 0.5) adj += 3
  else adj += 1

  // Steps
  if (avgSteps >= 12000) adj -= 2
  else if (avgSteps >= 8000) adj -= 1
  else if (avgSteps < 4000) adj += 2

  // Active zone minutes (weekly)
  if (weeklyAZM >= 300) adj -= 2
  else if (weeklyAZM >= 150) adj -= 1
  else if (weeklyAZM < 50) adj += 2

  return USER_AGE + adj
}

export function calculatePaceOfAging(recentAge, baselineAge) {
  // -1x = aging slower (great), 0 = neutral, 1x+ = aging faster
  const diff = recentAge - baselineAge
  return Math.round(diff * 10) / 10
}

export function parseFitbitData(raw) {
  const { summary, hrIntraday, sleep, hrv, spo2, br, hrvRange, hrRange, sleepRange } = raw

  // Extract today's values
  const todayHRV = hrv?.hrv?.[0]?.value?.dailyRmssd ?? hrv?.hrv?.[0]?.value?.deepRmssd ?? 0
  const todayRHR = summary?.activities?.heart?.[0]?.value?.restingHeartRate ??
    hrRange?.['activities-heart']?.slice(-1)[0]?.value?.restingHeartRate ?? 0
  const todaySleep = sleep?.sleep?.find(s => s.isMainSleep) ?? sleep?.sleep?.[0]
  const todaySpO2 = spo2?.value?.avg ?? spo2?.value ?? 97
  const todayBR = br?.br?.[0]?.value?.breathingRate ?? 14
  const steps = summary?.summary?.steps ?? 0
  const calories = summary?.summary?.caloriesOut ?? 0
  const activeMinutes = (summary?.summary?.fairlyActiveMinutes ?? 0) + (summary?.summary?.veryActiveMinutes ?? 0)

  // Build 30-day history arrays
  const hrvHistory = (hrvRange?.hrv ?? [])
    .map(d => d.value?.dailyRmssd ?? d.value?.deepRmssd ?? 0)
    .filter(Boolean)

  const rhrHistory = (hrRange?.['activities-heart'] ?? [])
    .map(d => d.value?.restingHeartRate ?? 0)
    .filter(Boolean)

  const sleepHistory = (sleepRange?.sleep ?? [])
    .filter(s => s.isMainSleep)
    .map(s => ({ date: s.dateOfSleep, minutes: s.minutesAsleep, efficiency: s.efficiency }))

  return {
    todayHRV,
    todayRHR,
    todaySleep,
    todaySpO2,
    todayBR,
    steps,
    calories,
    activeMinutes,
    hrvHistory,
    rhrHistory,
    sleepHistory,
    hrIntradayData: hrIntraday,
  }
}
