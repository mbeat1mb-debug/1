import { getTokens, isTokenExpired, refreshAccessToken, disconnect } from './auth'

const BASE = 'https://health.googleapis.com/v4/users/me'

// Diagnostic trail for the most recent loadDashboardData() call — each failed
// ghFetch appends here so the UI can show the real reason instead of a blank screen.
let fetchErrors = []

export function getFetchErrors() {
  return fetchErrors
}

// Per-call timing for the most recent loadDashboardData() call. Updated live
// (not just at the end) so that if the overall sync watchdog fires while this
// is still running, whatever's in here at that instant shows exactly which of
// the parallel calls were slow and which never finished — instead of just
// knowing "downloading data" was slow with no way to tell which part of it.
let callTimings = []

export function getCallTimings() {
  return callTimings
}

function timed(name, promise) {
  const entry = { name, status: 'pending', startedAt: Date.now() }
  callTimings.push(entry)
  return promise.then(
    (res) => { entry.status = 'done'; entry.ms = Date.now() - entry.startedAt; return res },
    (err) => { entry.status = 'error'; entry.ms = Date.now() - entry.startedAt; throw err },
  )
}

// No request to Google should be allowed to hang forever - without this, one
// stalled request (rare, but seen on paginated follow-up requests) blocks the
// whole sync indefinitely with the spinner stuck on screen.
const FETCH_TIMEOUT_MS = 20000

async function ghFetch(path, { method = 'GET', body } = {}, retried = false, rateLimitRetries = 0) {
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
      if (!retried && await refreshAccessToken()) return ghFetch(path, { method, body }, true, rateLimitRetries)
      disconnect(); window.location.reload(); return null
    }
    if (res.status === 429) {
      // Google's per-user quota (seen in practice: 300 requests/min) was
      // exceeded. Retrying instantly — the old behavior — just adds to the
      // pile-up that caused this and makes the next request fail too; back
      // off and wait (honoring Retry-After if Google sent one) before trying
      // again, capped so a truly stuck quota still gives up instead of
      // silently eating the whole sync budget.
      const MAX_RATE_LIMIT_RETRIES = 3
      if (rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
        const retryAfterSec = Number(res.headers.get('Retry-After'))
        const baseMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 1500 * 2 ** rateLimitRetries
        const waitMs = baseMs * (0.75 + Math.random() * 0.5) // jitter so 16 parallel calls don't retry in lockstep
        await new Promise(r => setTimeout(r, waitMs))
        return ghFetch(path, { method, body }, retried, rateLimitRetries + 1)
      }
      const text = await res.text().catch(() => '')
      fetchErrors.push(`${path} -> 429 (rate limited, gave up after ${MAX_RATE_LIMIT_RETRIES} retries): ${text}`)
      return null
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
  // whatever was collected so far instead of spinning forever. Raised well
  // above what a normal day needs (a high-frequency type like heart-rate can
  // span many pages) so a busy day's later, more active hours don't get
  // silently truncated.
  const MAX_PAGES = 500
  do {
    // Ask for the largest page Google will give us. The API defaults to a
    // small page size if pageSize is omitted, which is fine for low-frequency
    // types but turns a high-frequency one like heart-rate-intraday (a sample
    // every few seconds, thousands a day) into dozens of round trips — each
    // one a chance to hit the per-minute rate limit and a chance to be slow,
    // which is what burned through the entire 90s sync budget on one call.
    const params = { filter, pageSize: '1000', ...(pageToken ? { pageToken } : {}) }
    const path = `/dataTypes/${dataType}/dataPoints?${new URLSearchParams(params).toString()}`
    let page = await ghFetch(path)
    // Pages are returned in chronological order, so a single flaky page fetch
    // (network blip, transient 5xx) mid-pagination would otherwise silently
    // truncate the rest of the day — retry once before giving up on it.
    if (!page) page = await ghFetch(path)
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
      // A small gap between pages of the SAME call. 16 data types page
      // through Google simultaneously with no spacing at all, which is what
      // burns through Google's 300-requests/minute-per-user quota so fast —
      // this trims the burst without adding meaningful wall-clock time.
      await new Promise(r => setTimeout(r, 120))
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
  callTimings = []
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
    timed('summary', getDailySummary(date)),
    timed('hrIntraday', getHeartRateIntraday(date)),
    timed('sleep', getSleep(date)),
    timed('hrv', getHRV(date)),
    timed('rhr', getRestingHeartRate(date)),
    timed('spo2', getSpO2(date)),
    timed('br', getRespiratoryRate(date)),
    timed('hrvRange', getHRVRange(daysAgo(30), date)),
    timed('hrRange', getHeartRateRange(daysAgo(30), date)),
    timed('sleepRange', getSleepRange(daysAgo(30), date)),
    timed('cardioFitness', getCardioFitness()),
    timed('skinTemp', getSkinTemp(date)),
    timed('bodyWeight', getBodyWeight()),
    timed('bodyFat', getBodyFat()),
    timed('spo2Intraday', getSpO2Intraday(date)),
    timed('activityLogs', getActivityLogs(daysAgo(30))),
  ])

  return { summary, hrIntraday, sleep, hrv, rhr, spo2, br, hrvRange, hrRange, sleepRange, cardioFitness, skinTemp, bodyWeight, bodyFat, spo2Intraday, activityLogs, date }
}
