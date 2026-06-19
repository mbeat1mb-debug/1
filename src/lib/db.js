import { localToday, localDateOf } from './calculations'

const DB_NAME = 'health_dashboard'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains('health_days')) {
        db.createObjectStore('health_days', { keyPath: 'date' })
      }
      if (!db.objectStoreNames.contains('snapshot')) {
        db.createObjectStore('snapshot', { keyPath: 'id' })
      }
    }
    req.onsuccess = ({ target: { result } }) => resolve(result)
    req.onerror = ({ target: { error } }) => reject(error)
  })
}

function dbPut(db, store, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value)
    req.onsuccess = () => resolve()
    req.onerror = ({ target: { error } }) => reject(error)
  })
}

function dbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key)
    req.onsuccess = ({ target: { result } }) => resolve(result ?? null)
    req.onerror = ({ target: { error } }) => reject(error)
  })
}

function dbGetAll(db, store, range) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll(range)
    req.onsuccess = ({ target: { result } }) => resolve(result)
    req.onerror = ({ target: { error } }) => reject(error)
  })
}

export async function saveDay(result) {
  try {
    const db = await openDB()
    await dbPut(db, 'health_days', {
      date: result.date || localToday(),
      recovery: result.recoveryScore,
      strain: result.strainScore,
      sleep: result.todaySleep?.minutesAsleep ?? 0,
      sleepEfficiency: result.todaySleep?.efficiency ?? 0,
      stressScore: result.stressScore,
      hrv: result.todayHRV,
      rhr: result.todayRHR,
      steps: result.steps,
      calories: result.calories,
      activeMinutes: result.activeMinutes ?? 0,
      vo2Max: result.vo2Max ?? 0,
      zone2Minutes: result.zoneMinutes?.[1] ?? 0,
      spo2: result.todaySpO2 ?? null,
      br: result.todayBR ?? null,
      skinTempDev: result.skinTempDev ?? null,
    })
  } catch {
    // IndexedDB write failures are non-fatal; history reconstructs from the Google Health API on next sync
  }
}

export async function saveDaysBatch(rows) {
  if (!rows?.length) return
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction('health_days', 'readwrite')
      const store = tx.objectStore('health_days')
      tx.oncomplete = () => resolve()
      tx.onerror = ({ target: { error } }) => reject(error)
      tx.onabort = ({ target: { error } }) => reject(error)
      for (const row of rows) store.put(row)
    })
  } catch {}
}

export async function getHistory(days = 90) {
  try {
    const db = await openDB()
    const cutoff = (() => {
      const d = new Date()
      d.setDate(d.getDate() - days)
      return localDateOf(d)
    })()
    const rows = await dbGetAll(db, 'health_days', IDBKeyRange.lowerBound(cutoff))
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

export async function saveSnapshot(data) {
  try {
    const db = await openDB()
    await dbPut(db, 'snapshot', { id: 1, data, savedAt: Date.now() })
  } catch {}
}

export async function getLatestSnapshot() {
  try {
    const db = await openDB()
    return dbGet(db, 'snapshot', 1)
  } catch {
    return null
  }
}
