import { getTokens, isTokenExpired, refreshAccessToken, disconnect } from './auth'

const BASE = 'https://api.fitbit.com'

async function fitbitFetch(path, retried = false) {
  try {
    if (isTokenExpired()) {
      const ok = await refreshAccessToken()
      if (!ok) { disconnect(); window.location.reload(); return null }
    }
    const { access_token } = getTokens()
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (res.status === 401) {
      // Token rejected despite looking valid locally (clock skew / early revoke).
      // Refresh once and retry before tearing down the session.
      if (!retried && await refreshAccessToken()) return fitbitFetch(path, true)
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

export async function getProfile() {
  return fitbitFetch('/1/user/-/profile.json')
}

export async function getDailySummary(date = today()) {
  return fitbitFetch(`/1/user/-/activities/date/${date}.json`)
}

export async function getHeartRateIntraday(date = today()) {
  return fitbitFetch(`/1/user/-/activities/heart/date/${date}/1d/1min.json`)
}

export async function getHeartRateRange(startDate, endDate) {
  return fitbitFetch(`/1/user/-/activities/heart/date/${startDate}/${endDate}.json`)
}

export async function getSleep(date = today()) {
  return fitbitFetch(`/1.2/user/-/sleep/date/${date}.json`)
}

export async function getSleepRange(startDate, endDate) {
  return fitbitFetch(`/1.2/user/-/sleep/date/${startDate}/${endDate}.json`)
}

export async function getHRV(date = today()) {
  return fitbitFetch(`/1/user/-/hrv/date/${date}.json`)
}

export async function getHRVRange(startDate, endDate) {
  return fitbitFetch(`/1/user/-/hrv/date/${startDate}/${endDate}.json`)
}

export async function getSpO2(date = today()) {
  return fitbitFetch(`/1/user/-/spo2/date/${date}.json`)
}

export async function getSpO2Intraday(date = today()) {
  return fitbitFetch(`/1/user/-/spo2/date/${date}/all.json`)
}

export async function getRespiratoryRate(date = today()) {
  return fitbitFetch(`/1/user/-/br/date/${date}.json`)
}

export async function getCardioFitness() {
  return fitbitFetch(`/1/user/-/cardioscore/date/${daysAgo(7)}/${today()}.json`)
}

export async function getSkinTemp(date = today()) {
  return fitbitFetch(`/1/user/-/temp/skin/date/${date}.json`)
}

export async function getBodyWeight() {
  return fitbitFetch(`/1/user/-/body/log/weight/date/${today()}/1m.json`)
}

export async function getBodyFat() {
  return fitbitFetch(`/1/user/-/body/log/fat/date/${today()}/1m.json`)
}

export async function getActivityLogs(afterDate) {
  return fitbitFetch(`/1/user/-/activities/list.json?afterDate=${afterDate}&sort=asc&limit=100&offset=0`)
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
