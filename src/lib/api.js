import { getTokens, isTokenExpired, refreshAccessToken, disconnect } from './auth'

const BASE = 'https://health.googleapis.com/v4/users/me'

// Diagnostic trail for the most recent loadDashboardData() call — each failed
// ghFetch appends here so the UI can show the real reason instead of a blank screen.
let fetchErrors = []

export function getFetchErrors() {
  return fetchErrors
}

// No request to Google should be allowed to hang forever - without this, one
// stalled request (rare, but seen on paginated follow-up requests) blocks the
// whole sync indefinitely with the spinner stuck on screen.
const FETCH_TIMEOUT_MS = 20000

async function ghFetch(path, { method = 'GET', body } = {}, retried = false) {
  try {
    if (isTokenExpired()) {
      const ok = await refreshAccessToken()
      if (!ok) { disconnect(); window.location.reload(); return null }
    }
    const { access_token } = getTokens()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${access_token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
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

// Local calendar date (not UTC) — toISOString() shifts to UTC, which rolls
// over to "tomorrow" hours before midnight for anyone west of Greenwich,
// making "today" queries look for a date that hasn't started locally yet.
function localDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function today() {
  return localDateString(new Date())
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateString(d)
}

// `date` is a local calendar date (e.g. "2026-06-20"); parsing it as
// "...T00:00:00" with no Z makes JS treat it as local midnight, then
// toISOString() converts that instant to the matching UTC timestamp the API
// needs. Using "...T00:00:00Z" directly (literal UTC midnight) would shift
// every non-UTC user's day boundary by their UTC offset.
function toApiTimestamp(d) {
  return d.toISOString().split('.')[0] + 'Z'
}

function startOfDay(date) {
  return toApiTimestamp(new Date(`${date}T00:00:00`))
}

// Exclusive upper bound (start of the day AFTER endDate) — the API's interval/
// sample/date filters only accept GREATER_THAN_EQUALS and LESS_THAN comparators,
// so an inclusive "<=" end-of-day bound is rejected with INVALID_ARGUMENT.
function startOfNextDay(date) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return toApiTimestamp(d)
}

// Plain civil date one day after `date` (no time/Z suffix) — Daily-category
// types' `.date` filter field rejects full timestamps with INVALID_DATA_POINT_FILTER_CIVIL_DATE_TIME_FORMAT.
function nextDay(date) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

// snake_case version of a kebab-case data type id, for use inside filter expressions
// (the API uses kebab-case in URL paths but snake_case in filter field names).
function snake(dataType) {
  return dataType.replace(/-/g, '_')
}

// civil_start_time fields want a plain civil date-time (no trailing Z) —
// passing a real timestamp fails with INVALID_DATA_POINT_FILTER_CIVIL_DATE_TIME_FORMAT.
function civilStart(date) {
  return `${date}T00:00:00`
}
function civilNextStart(date) {
  return `${nextDay(date)}T00:00:00`
}

// Time-range list query against a dataType's points. `timeField` differs by
// category: Interval types use interval.start_time, Sample types use
// sample_time.physical_time, Daily types use a plain civil date, Session types
// use an interval field.
async function listDataPoints(dataType, startDate, endDate, timeField) {
  const field = snake(dataType)
  const filter = timeField === 'date'
    ? `${field}.date >= "${startDate}" AND ${field}.date < "${nextDay(endDate)}"`
    : timeField.includes('civil')
      ? `${field}.${timeField} >= "${civilStart(startDate)}" AND ${field}.${timeField} < "${civilNextStart(endDate)}"`
      : `${field}.${timeField} >= "${startOfDay(startDate)}" AND ${field}.${timeField} < "${startOfNextDay(endDate)}"`

  let pageToken = ''
  let combined = null
  let pageCount = 0
  // Hard cap so a flaky/looping nextPageToken (server repeats the same or an
  // empty page forever) can't hang the sync indefinitely - bail out with
  // whatever was collected so far instead of spinning forever.
  const MAX_PAGES = 50
  do {
    const params = { filter, ...(pageToken ? { pageToken } : {}) }
    const page = await ghFetch(`/dataTypes/${dataType}/dataPoints?${new URLSearchParams(params).toString()}`)
    if (!page) return combined
    if (!combined) {
      combined = page
    } else if (Array.isArray(page.dataPoints)) {
      combined.dataPoints = [...(combined.dataPoints || []), ...page.dataPoints]
    }
    const nextToken = page.nextPageToken || ''
    pageCount++
    if (nextToken === pageToken || pageCount >= MAX_PAGES) {
      pageToken = ''
    } else {
      pageToken = nextToken
    }
  } while (pageToken)
  delete combined.nextPageToken
  return combined
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

export async function getRestingHeartRate(date = today()) {
  return listDataPoints('daily-resting-heart-rate', date, date, 'date')
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
  return listDataPoints('exercise', afterDate, today(), 'interval.civil_start_time')
}

export async function loadDashboardData() {
  fetchErrors = []
  const date = today()
  const [
    summary,
    hrIntraday,
    sleep,
    hrv,
    rhr,
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
    getRestingHeartRate(date),
    getSpO2(date),
    getRespiratoryRate(date),
    getHRVRange(daysAgo(30), date),
    getHeartRateRange(daysAgo(30), date),
    getSleepRange(daysAgo(30), date),
    getCardioFitness(),
    getSkinTemp(date),
    getBodyWeight(),
    getBodyFat(),
    getSpO2Intraday(date),
    getActivityLogs(daysAgo(30)),
  ])

  return { summary, hrIntraday, sleep, hrv, rhr, spo2, br, hrvRange, hrRange, sleepRange, cardioFitness, skinTemp, bodyWeight, bodyFat, spo2Intraday, activityLogs, date }
}
