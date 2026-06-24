import { describe, it, expect, beforeEach } from 'vitest'
import { calculateDistance, calculateBMI, parseActivityLogs, localToday, parseGoogleHealthData, getBodyWeightHistory } from './calculations'

function dayPoint(y, m, d, value, key, field) {
  return { date: { year: y, month: m, day: d }, [key]: { [field]: value } }
}

describe('calculateDistance (steps -> km via stride length)', () => {
  it('returns a sane distance for a normal day of steps', () => {
    // ~175cm height, ~8500 steps should land around 6km, not 6000km or 0.006km
    const km = calculateDistance(8500, 175)
    expect(km).toBeGreaterThan(4)
    expect(km).toBeLessThan(9)
  })

  it('returns null when inputs are missing', () => {
    expect(calculateDistance(0, 175)).toBeNull()
    expect(calculateDistance(8500, 0)).toBeNull()
  })
})

describe('calculateBMI', () => {
  it('matches the standard kg / m^2 formula', () => {
    // 80kg at 180cm -> 80 / 1.8^2 = 24.7
    expect(calculateBMI(180, 80)).toBeCloseTo(24.7, 1)
  })

  it('returns null when inputs are missing', () => {
    expect(calculateBMI(0, 80)).toBeNull()
    expect(calculateBMI(180, 0)).toBeNull()
  })
})

describe('parseGoogleHealthData body fat sync (regression: a fat reading with no same-day weight was silently dropped)', () => {
  beforeEach(() => localStorage.clear())

  it('still saves a body fat reading on a day with no weight reading', () => {
    const raw = {
      bodyWeight: { dataPoints: [
        dayPoint(2026, 6, 20, 80000, 'weight', 'weightGrams'),
      ] },
      bodyFat: { dataPoints: [
        dayPoint(2026, 6, 21, 18.5, 'bodyFat', 'percentage'),
      ] },
    }
    parseGoogleHealthData(raw)
    const history = getBodyWeightHistory()
    const fatOnlyDay = history.find(e => e.date === '2026-06-21')
    expect(fatOnlyDay).toBeTruthy()
    expect(fatOnlyDay.fatPct).toBeCloseTo(18.5, 1)
  })
})

describe('parseGoogleHealthData historyDates (regression: RHR-only days were dropped entirely)', () => {
  it('keeps a day that has RHR but no HRV reading as its own null-HRV slot', () => {
    const raw = {
      hrvRange: { dataPoints: [
        dayPoint(2026, 6, 20, 45, 'dailyHeartRateVariability', 'rmssd'),
      ] },
      hrRange: { dataPoints: [
        dayPoint(2026, 6, 20, 60, 'dailyRestingHeartRate', 'beatsPerMinute'),
        dayPoint(2026, 6, 21, 62, 'dailyRestingHeartRate', 'beatsPerMinute'),
      ] },
    }
    const parsed = parseGoogleHealthData(raw)
    expect(parsed.historyDates).toEqual(['2026-06-20', '2026-06-21'])
    expect(parsed.hrvHistory).toEqual([45, null])
    expect(parsed.rhrHistory).toEqual([60, 62])
  })
})

describe('parseActivityLogs workout distance (regression: was reporting 1000x too far)', () => {
  it('converts distanceMillimeters down to a realistic kilometer figure', () => {
    // A 16-minute, ~1km walk: Google Health reports this as ~967,400mm.
    // The bug divided by 1,000 (giving meters, ~967.4) and then treated that
    // number as kilometers everywhere downstream, displaying ~601 miles.
    const startTime = new Date(Date.now() - 16 * 60000).toISOString()
    const endTime = new Date().toISOString()
    const rawActivityLogs = {
      dataPoints: [{
        exercise: {
          interval: { startTime, endTime },
          exerciseType: 90024,
          displayName: 'Walk',
          metricsSummary: { distanceMillimeters: 967400 },
        },
      }],
    }
    const [workout] = parseActivityLogs(rawActivityLogs, null)
    expect(workout.distance).toBeGreaterThan(0.5)
    expect(workout.distance).toBeLessThan(2)
    expect(workout.distanceUnit).toBe('Kilometer')
  })

  it('leaves distance null when the source has none', () => {
    const startTime = new Date(Date.now() - 30 * 60000).toISOString()
    const endTime = new Date().toISOString()
    const rawActivityLogs = {
      dataPoints: [{
        exercise: {
          interval: { startTime, endTime },
          exerciseType: 90013,
          displayName: 'Weights',
          metricsSummary: {},
        },
      }],
    }
    const [workout] = parseActivityLogs(rawActivityLogs, null)
    expect(workout.distance).toBeNull()
  })
})
