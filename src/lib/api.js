import { getTokens, isTokenExpired, refreshAccessToken, disconnect } from './auth'

const BASE = 'https://health.googleapis.com/v4/users/me'

async function ghFetch(path, { method = 'GET', body } = {}, retried = false) {
  try {
    if (isTokenExpired()) {
      const ok = await refreshAccessToken()
      if (!ok) { disconnect(); window.location.reload(); return null }
    }
    const { access_token } = getTokens()
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (res.status === 401) {
      // Token rejected despite looking valid locally (clock skew / early revoke).
      // Refresh once and retry before tearing down the session.
      if (!retried && await refreshAccessToken()) return ghFetch(path, { method, body }, true)
      disconnect(); window.location.reload(); return null
    }
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function startOfDay(date) {
  return `${date}T00:00:00Z`
}

function endOfDay(date) {
  return `${date}T23:59:59Z`
}

// Time-range list query against a dataType's points. `timeField` differs by
// data type: interval-based types (sleep) filter on interval.end_time,
// instantaneous samples (heartRate, hrv, etc.) filter on effective_time.
async function listDataPoints(dataType, startDate, endDate, timeField = 'effective_time') {
  const filter = `${dataType}.${timeField} >= "${startOfDay(startDate)}" AND ${dataType}.${timeField} <= "${endOfDay(endDate)}"`
  return ghFetch(`/dataTypes/${dataType}/dataPoints?${new URLSearchParams({ filter }).toString()}`)
}

// Daily aggregate via the dailyRollUp custom method, used for cumulative
// metrics (steps, calories, active minutes, body weight/fat).
async function dailyRollUp(dataType, startDate, endDate) {
  return ghFetch(`/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: 'POST',
    body: { range: { startTime: startOfDay(startDate), endTime: endOfDay(endDate) } },
  })
}

export async function getDailySummary(date = today()) {
  const [steps, calories, activeZoneMinutes] = await Promise.all([
    dailyRollUp('steps', date, date),
    dailyRollUp('caloriesBurned', date, date),
    dailyRollUp('activeZoneMinutes', date, date),
  ])
  return { steps, calories, activeZoneMinutes }
}

export async function getHeartRateIntraday(date = today()) {
  return listDataPoints('heartRate', date, date, 'effective_time')
}

export async function getHeartRateRange(startDate, endDate) {
  return dailyRollUp('dailyRestingHeartRate', startDate, endDate)
}

export async function getSleep(date = today()) {
  return listDataPoints('sleep', date, date, 'interval.end_time')
}

export async function getSleepRange(startDate, endDate) {
  return listDataPoints('sleep', startDate, endDate, 'interval.end_time')
}

export async function getHRV(date = today()) {
  return listDataPoints('dailyHeartRateVariability', date, date, 'effective_time')
}

export async function getHRVRange(startDate, endDate) {
  return listDataPoints('dailyHeartRateVariability', startDate, endDate, 'effective_time')
}

export async function getSpO2(date = today()) {
  return listDataPoints('oxygenSaturation', date, date, 'effective_time')
}

export async function getSpO2Intraday(date = today()) {
  return listDataPoints('oxygenSaturation', date, date, 'effective_time')
}

export async function getRespiratoryRate(date = today()) {
  return listDataPoints('respiratoryRate', date, date, 'effective_time')
}

export async function getCardioFitness() {
  return listDataPoints('vo2Max', daysAgo(7), today(), 'effective_time')
}

export async function getSkinTemp(date = today()) {
  return listDataPoints('skinTemperature', date, date, 'effective_time')
}

export async function getBodyWeight() {
  return dailyRollUp('weight', daysAgo(30), today())
}

export async function getBodyFat() {
  return dailyRollUp('bodyFatPercentage', daysAgo(30), today())
}

export async function getActivityLogs(afterDate) {
  return listDataPoints('activitySession', afterDate, today(), 'interval.end_time')
}

export async function loadDashboardData() {
  const date = today()
  const [
    summary,
    hrIntraday,
    sleep,
    hrv,
    spo2,
    br,
    hrvRange,
    hrRange,
    sleepRange,
    cardioFitness,
    skinTemp,
    bodyWeight,
    bodyFat,
    spo2Intraday,
    activityLogs,
  ] = await Promise.all([
    getDailySummary(date),
    getHeartRateIntraday(date),
    getSleep(date),
    getHRV(date),
    getSpO2(date),
    getRespiratoryRate(date),
    getHRVRange(daysAgo(30), date),
    getHeartRateRange(daysAgo(7), date),
    getSleepRange(daysAgo(30), date),
    getCardioFitness(),
    getSkinTemp(date),
    getBodyWeight(),
    getBodyFat(),
    getSpO2Intraday(date),
    getActivityLogs(daysAgo(30)),
  ])

  return { summary, hrIntraday, sleep, hrv, spo2, br, hrvRange, hrRange, sleepRange, cardioFitness, skinTemp, bodyWeight, bodyFat, spo2Intraday, activityLogs, date }
}
