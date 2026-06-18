import { getTokens, isTokenExpired, refreshAccessToken, disconnect } from './auth'

const BASE = 'https://health.googleapis.com/v4/users/me'

// Diagnostic trail for the most recent loadDashboardData() call — each failed
// ghFetch appends here so the UI can show the real reason instead of a blank screen.
let fetchErrors = []

export function getFetchErrors() {
  return fetchErrors
}

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
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      fetchErrors.push(`${path} -> ${res.status}: ${text}`)
      return null
    }
    return res.json()
  } catch (e) {
    fetchErrors.push(`${path} -> network error: ${e.message}`)
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

// Exclusive upper bound (start of the day AFTER endDate) — the API's interval/
// sample/date filters only accept GREATER_THAN_EQUALS and LESS_THAN comparators,
// so an inclusive "<=" end-of-day bound is rejected with INVALID_ARGUMENT.
function startOfNextDay(date) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('.')[0] + 'Z'
}

// snake_case version of a kebab-case data type id, for use inside filter expressions
// (the API uses kebab-case in URL paths but snake_case in filter field names).
function snake(dataType) {
  return dataType.replace(/-/g, '_')
}

// Time-range list query against a dataType's points. `timeField` differs by
// category: Interval types use interval.start_time, Sample types use
// sample_time.physical_time, Daily types use date, Session types use interval.end_time.
async function listDataPoints(dataType, startDate, endDate, timeField) {
  const field = snake(dataType)
  const filter = `${field}.${timeField} >= "${startOfDay(startDate)}" AND ${field}.${timeField} < "${startOfNextDay(endDate)}"`
  return ghFetch(`/dataTypes/${dataType}/dataPoints?${new URLSearchParams({ filter }).toString()}`)
}

function civilDateTime(date, hours, minutes, seconds) {
  const [year, month, day] = date.split('-').map(Number)
  return { date: { year, month, day }, time: { hours, minutes, seconds, nanos: 0 } }
}

// Daily aggregate via the dailyRollUp custom method, used for cumulative
// metrics (steps, calories, active minutes).
async function dailyRollUp(dataType, startDate, endDate) {
  const days = Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1
  return ghFetch(`/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: 'POST',
    body: {
      range: {
        start: civilDateTime(startDate, 0, 0, 0),
        end: civilDateTime(endDate, 23, 59, 59),
      },
      windowSizeDays: days,
    },
  })
}

export async function getDailySummary(date = today()) {
  const [steps, calories, activeZoneMinutes] = await Promise.all([
    dailyRollUp('steps', date, date),
    dailyRollUp('total-calories', date, date),
    dailyRollUp('active-zone-minutes', date, date),
  ])
  return { steps, calories, activeZoneMinutes }
}

export async function getHeartRateIntraday(date = today()) {
  return listDataPoints('heart-rate', date, date, 'sample_time.physical_time')
}

export async function getHeartRateRange(startDate, endDate) {
  return listDataPoints('daily-resting-heart-rate', startDate, endDate, 'date')
}

export async function getSleep(date = today()) {
  return listDataPoints('sleep', date, date, 'interval.end_time')
}

export async function getSleepRange(startDate, endDate) {
  return listDataPoints('sleep', startDate, endDate, 'interval.end_time')
}

export async function getHRV(date = today()) {
  return listDataPoints('daily-heart-rate-variability', date, date, 'date')
}

export async function getHRVRange(startDate, endDate) {
  return listDataPoints('daily-heart-rate-variability', startDate, endDate, 'date')
}

export async function getSpO2(date = today()) {
  return listDataPoints('daily-oxygen-saturation', date, date, 'date')
}

export async function getSpO2Intraday(date = today()) {
  return listDataPoints('oxygen-saturation', date, date, 'sample_time.physical_time')
}

export async function getRespiratoryRate(date = today()) {
  return listDataPoints('daily-respiratory-rate', date, date, 'date')
}

export async function getCardioFitness() {
  return listDataPoints('daily-vo2-max', daysAgo(7), today(), 'date')
}

export async function getSkinTemp(date = today()) {
  return listDataPoints('daily-sleep-temperature-derivations', date, date, 'date')
}

export async function getBodyWeight() {
  return listDataPoints('weight', daysAgo(30), today(), 'sample_time.physical_time')
}

export async function getBodyFat() {
  return listDataPoints('body-fat', daysAgo(30), today(), 'sample_time.physical_time')
}

export async function getActivityLogs(afterDate) {
  return listDataPoints('exercise', afterDate, today(), 'interval.end_time')
}

export async function loadDashboardData() {
  fetchErrors = []
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
