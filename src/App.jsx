import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { isConnected, handleOAuthCallback } from './lib/auth'
import { loadDashboardData } from './lib/api'
import {
  parseGoogleHealthData, calculateRecovery, calculateStrain, calculateZoneMinutes,
  calculateStressScore, calculateSleepScore, calculateSleepDebt, calculateOptimalSleepWindow,
  calculateTrainingLoad, calculateWeeklyPattern, getTrendVelocity, computeOptimalSleepHours,
  calculateTrainingEffect, calculateDaytimeStress, calculateHRR, saveLastKnownHRR,
  calculateSleepApneaRisk, calculateSocialJetLag, getHRVNorm, getUserAge,
} from './lib/calculations'
import { detectAlerts } from './lib/alerts'
import { getDataFreshness } from './lib/dataFreshness'
import {
  updatePersonalRecords, calculateStreaks, checkAndUnlockAchievements,
} from './lib/achievements'
import { fireDataNotifications, fireDataEntryReminders } from './lib/notifications'
import { saveDay, saveDaysBatch, getHistory, saveSnapshot, getLatestSnapshot } from './lib/db'
import { createBackup, getLastBackupAt } from './lib/backup'

import BottomNav from './components/BottomNav'
import AlertBanner from './components/AlertBanner'
import PinLock from './components/PinLock'
import Home from './screens/Home'
import { isPinSet } from './lib/pin'

const Recovery = lazy(() => import('./screens/Recovery'))
const Strain = lazy(() => import('./screens/Strain'))
const Sleep = lazy(() => import('./screens/Sleep'))
const Stress = lazy(() => import('./screens/Stress'))
const Journal = lazy(() => import('./screens/Journal'))
const Coach = lazy(() => import('./screens/Coach'))
const Healthspan = lazy(() => import('./screens/Healthspan'))
const Records = lazy(() => import('./screens/Records'))
const Settings = lazy(() => import('./screens/Settings'))
const Trends = lazy(() => import('./screens/Trends'))
const Vitals = lazy(() => import('./screens/Vitals'))

function makeCalendarDays() {
  return Array.from({ length: 90 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (89 - i))
    return {
      date: d.toISOString().split('T')[0],
      recovery: Math.round(30 + Math.random() * 65),
      strain: Math.round(5 + Math.random() * 12),
      sleep: Math.round(360 + Math.random() * 120),
      sleepEfficiency: Math.round(78 + Math.random() * 18),
      hrv: Math.round(42 + Math.random() * 25),
      rhr: Math.round(50 + Math.random() * 12),
      skinTempDev: Math.round((Math.random() - 0.4) * 0.6 * 100) / 100,
      br: 12 + Math.round(Math.random() * 4),
      activeMinutes: Math.round(20 + Math.random() * 60),
    }
  })
}

const DEMO_CALENDAR = makeCalendarDays()

const DEMO_WEEKLY = (() => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const scores = [72, 58, 64, 63, 70, 67, 75]
  return days.map((day, i) => ({ day, avgRecovery: scores[i], count: 4 + (i % 2) }))
})()

const DEMO = {
  recoveryScore: 74, strainScore: 11.2, sleepScore: 78, stressScore: 28,
  todayHRV: 58, todayRHR: 54, todaySpO2: 97, todayBR: 14,
  steps: 8340, calories: 2180, activeMinutes: 42, weeklyAZM: 310,
  zoneMinutes: [18, 32, 25, 8, 2],
  vo2Max: 47,
  vo2MaxRange: '47-51',
  weeklyZone2: 180,
  vo2MaxHistory: Array.from({ length: 8 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (7 - i) * 25)
    return { date: d.toISOString().split('T')[0], vo2Max: 44 + i }
  }),
  skinTempDev: 0.10,
  todaySleep: {
    minutesAsleep: 447, timeInBed: 490, efficiency: 91,
    levels: { summary: { deep: { minutes: 72 }, rem: { minutes: 98 }, light: { minutes: 277 }, wake: { minutes: 43 } } },
  },
  hrvHistory: [44, 48, 52, 55, 49, 53, 56, 58, 51, 54, 57, 60, 55, 58],
  rhrHistory: [57, 56, 55, 58, 54, 56, 55, 53, 55, 54, 56, 53, 54, 54],
  sleepHistory: Array.from({ length: 30 }, (_, i) => {
    const mins = 420 + Math.round((Math.random() - 0.4) * 90)
    return {
      date: (() => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().split('T')[0] })(),
      minutes: mins,
      efficiency: 80 + Math.round(Math.random() * 15),
      startTime: null, endTime: null,
      deepMinutes: Math.round(mins * (0.14 + Math.random() * 0.08)),
      remMinutes: Math.round(mins * (0.18 + Math.random() * 0.07)),
    }
  }),
  recoveryHistory: DEMO_CALENDAR.map(d => d.recovery),
  stressHistory: Array.from({ length: 30 }, () => Math.round(20 + Math.random() * 40)),
  calendarDays: DEMO_CALENDAR,
  sleepDebt: 2.5,
  optimalSleepWindow: { bedtime: '10:45 PM', wakeTime: '6:30 AM', consistency: 72 },
  personalRecords: { bestRecovery: 91, bestHRV: 74, lowestRHR: 48, highestStrain: 17.4, mostSteps: 14230 },
  streaks: { recovery: 3, sleep: 2, lowStress: 5 },
  unlockedAchievements: ['first_green', 'step_king'],
  alerts: [],
  activityLogs: (() => {
    const now = new Date()
    return [
      { activityId: 1, name: 'Run', category: 'aerobic', date: now.toISOString().split('T')[0], startTime: new Date(now - 2 * 3600000).toISOString(), durationMins: 42, avgHR: 148, calories: 420, steps: 5800, distance: 6.2, distanceUnit: 'Kilometer', zoneMinutes: [5, 12, 18, 7, 0], epoc: { kcal: 7, durationMins: 62 }, cardiacDrift: 3.2, strainContribution: 8.4 },
      { activityId: 2, name: 'Weights', category: 'strength', date: (() => { const d = new Date(now); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0] })(), startTime: new Date(now - 2 * 86400000).toISOString(), durationMins: 55, avgHR: 122, calories: 310, steps: null, distance: null, distanceUnit: null, zoneMinutes: [10, 20, 18, 7, 0], epoc: { kcal: 6, durationMins: 62 }, cardiacDrift: null, strainContribution: 6.8 },
      { activityId: 3, name: 'Run', category: 'aerobic', date: (() => { const d = new Date(now); d.setDate(d.getDate() - 4); return d.toISOString().split('T')[0] })(), startTime: new Date(now - 4 * 86400000).toISOString(), durationMins: 35, avgHR: 155, calories: 370, steps: 4900, distance: 5.1, distanceUnit: 'Kilometer', zoneMinutes: [3, 8, 14, 10, 0], epoc: { kcal: 9, durationMins: 71 }, cardiacDrift: null, strainContribution: 9.1 },
      { activityId: 4, name: 'Bike', category: 'aerobic', date: (() => { const d = new Date(now); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0] })(), startTime: new Date(now - 6 * 86400000).toISOString(), durationMins: 60, avgHR: 138, calories: 480, steps: null, distance: 22, distanceUnit: 'Kilometer', zoneMinutes: [8, 18, 24, 10, 0], epoc: { kcal: 11, durationMins: 86 }, cardiacDrift: null, strainContribution: 10.2 },
      { activityId: 5, name: 'Walk', category: 'aerobic', date: (() => { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0] })(), startTime: new Date(now - 7 * 86400000).toISOString(), durationMins: 45, avgHR: 105, calories: 210, steps: 5200, distance: 3.8, distanceUnit: 'Kilometer', zoneMinutes: [20, 20, 5, 0, 0], epoc: { kcal: 1, durationMins: 8 }, cardiacDrift: null, strainContribution: 3.2 },
    ]
  })(),
  trainingLoad: { atl: 9.2, ctl: 10.5, tsb: 1.3, form: 'Neutral' },
  trainingEffect: { aerobic: 2.9, anaerobic: 2.3, aerobicLabel: 'Maintaining', anaerobicLabel: 'Maintaining' },
  daytimeStress: { score: 32, avgHR: 72, delta: 4.2 },
  weeklyPattern: DEMO_WEEKLY,
  recoveryVelocity: 5,
  stressVelocity: -3,
  strainVelocity: 1,
  isDemo: true,
}

function formatSyncTime(ts) {
  if (!ts) return null
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SkeletonScreen() {
  return (
    <div className="pt-safe pb-28 px-4 space-y-4">
      <div className="flex items-center justify-between mt-4">
        <div className="skeleton h-5 w-32" />
        <div className="skeleton h-5 w-16" />
      </div>
      <div className="flex flex-col items-center gap-2 py-6">
        <div className="skeleton rounded-full" style={{ width: 192, height: 192 }} />
      </div>
      {[100, 80, 90].map((w, i) => (
        <div key={i} className="skeleton rounded-2xl" style={{ height: 88 }} />
      ))}
      <div className="skeleton rounded-2xl" style={{ height: 72 }} />
      <div className="skeleton rounded-2xl" style={{ height: 72 }} />
    </div>
  )
}

function ConnectScreen({ onNav }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen px-6 gap-6 text-center">
      <div>
        <div className="flex items-center justify-center w-20 h-20 rounded-full mx-auto mb-2" style={{ background: '#C9A84C18', border: '1px solid #C9A84C33' }}>
          <span className="text-3xl font-bold" style={{ color: '#C9A84C', fontFamily: 'Georgia, serif', letterSpacing: '-1px' }}>Σ</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#C9A84C', fontFamily: 'Georgia, serif' }}>Soma</h1>
        <p className="text-gray-600 text-xs uppercase tracking-widest mt-1">σῶμα · body</p>
      </div>
      <p className="text-gray-500 text-sm">Connect Google Health to begin tracking recovery, strain, sleep, and longevity.</p>
      <button onClick={() => onNav('settings')} className="w-full max-w-xs py-4 rounded-2xl font-bold text-black" style={{ background: '#00c9a7' }}>
        Connect Google Health
      </button>
      <button onClick={() => onNav('demo')} className="text-gray-500 text-sm underline">
        View demo first
      </button>
    </div>
  )
}

const TAB_ORDER = ['home', 'recovery', 'sleep', 'strain', 'stress', 'healthspan', 'journal', 'records', 'coach', 'settings', 'trends']

export default function App() {
  const [pinUnlocked, setPinUnlocked] = useState(() => !isPinSet())
  const [tab, setTab] = useState('home')
  const [transDir, setTransDir] = useState(1)
  const prevTabRef = useRef('home')
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [appData, setAppData] = useState(null)
  const [demo, setDemo] = useState(false)
  const [connected, setConnected] = useState(isConnected())
  const [lastSyncedAt, setLastSyncedAt] = useState(() => {
    const ts = localStorage.getItem('last_synced_at')
    return ts ? Number(ts) : null
  })
  const syncInFlight = useRef(false)

  const processData = useCallback((raw) => {
    const parsed = parseGoogleHealthData(raw)

    const optimalSleepHours = computeOptimalSleepHours(parsed.sleepHistory)

    const recoveryScore = calculateRecovery({
      hrv: parsed.todayHRV, rhr: parsed.todayRHR, sleep: parsed.todaySleep,
      spo2: parsed.todaySpO2, br: parsed.todayBR, skinTempDev: parsed.skinTempDev,
      hrvHistory: parsed.hrvHistory, rhrHistory: parsed.rhrHistory,
      preOptimalSleepHours: optimalSleepHours,
    })
    const strainScore = calculateStrain(parsed.hrIntradayData)
    const zoneMinutes = calculateZoneMinutes(parsed.hrIntradayData)
    const trainingEffect = calculateTrainingEffect(zoneMinutes)
    const daytimeStress = calculateDaytimeStress(parsed.hrIntradayData, parsed.sleepEndHour, parsed.todayRHR)
    const stressScore = calculateStressScore({
      hrv: parsed.todayHRV, rhr: parsed.todayRHR,
      hrvHistory: parsed.hrvHistory, rhrHistory: parsed.rhrHistory,
    })
    const sleepScore = calculateSleepScore(parsed.todaySleep)
    const sleepDebt = calculateSleepDebt(parsed.sleepHistory)
    const optimalSleepWindow = calculateOptimalSleepWindow(parsed.sleepHistory)

    const sleepByDate = {}
    for (const s of parsed.sleepHistory) sleepByDate[s.date] = s

    const recoveryHistory = []
    const stressHistory = []
    const recoveryByDate = {}
    // Use age-norm HRV as bootstrap prior so day-1 scores reflect actual HRV quality,
    // not a neutral 50% that comes from a zero baseline.
    const hrvBootstrapPrior = getHRVNorm(getUserAge())
    let hrvRunSum = 0, hrvRunCount = 0, rhrRunSum = 0, rhrRunCount = 0
    parsed.hrvHistory.forEach((hrv, i) => {
      if (!hrv) return
      const date = parsed.historyDates[i]
      const sleepEntry = sleepByDate[date]
      const rhr = parsed.rhrHistory[i]
      // Use running average of all PRIOR entries (not the current one) as baseline.
      // Fall back to age-norm prior on first day so initial score is meaningful.
      const preAvgHRV = hrvRunCount > 0 ? hrvRunSum / hrvRunCount : hrvBootstrapPrior
      const preAvgRHR = rhrRunCount > 0 ? rhrRunSum / rhrRunCount : 0
      const recovery = calculateRecovery({
        hrv, rhr,
        sleep: sleepEntry ? {
          minutesAsleep: sleepEntry.minutes,
          efficiency: sleepEntry.efficiency,
          deepMinutes: sleepEntry.deepMinutes,
          remMinutes: sleepEntry.remMinutes,
        } : null,
        spo2: 97, br: 14,
        preAvgHRV,
        preAvgRHR: preAvgRHR || undefined,
        preOptimalSleepHours: optimalSleepHours,
      })
      recoveryHistory.push(recovery)
      if (date) recoveryByDate[date] = recovery
      stressHistory.push(calculateStressScore({
        hrv, rhr,
        hrvHistory: parsed.hrvHistory.slice(0, i),
        rhrHistory: parsed.rhrHistory.slice(0, i),
      }))
      // Update running sums AFTER using them (so current day is included in next iteration's baseline)
      hrvRunSum += hrv; hrvRunCount++
      if (rhr) { rhrRunSum += rhr; rhrRunCount++ }
    })

    const recoveryVelocity = getTrendVelocity(recoveryHistory)
    const stressVelocity = getTrendVelocity(stressHistory)

    const calendarDays = parsed.sleepHistory.map(s => ({
      date: s.date,
      recovery: recoveryByDate[s.date] ?? null,
      sleep: s.minutes,
      sleepEfficiency: s.efficiency ?? 0,
      hrv: parsed.hrvByDate[s.date] ?? null,
      rhr: parsed.rhrByDate[s.date] ?? null,
    }))

    const hrr = calculateHRR(parsed.hrIntradayData)
    if (hrr) saveLastKnownHRR(hrr)
    const sleepApneaRisk = calculateSleepApneaRisk({
      spo2Intraday: raw.spo2Intraday,
      br: parsed.todayBR,
      todaySleep: parsed.todaySleep,
    })
    const socialJetLag = calculateSocialJetLag(parsed.sleepHistory)

    const base = {
      ...parsed, recoveryScore, strainScore, zoneMinutes, trainingEffect, daytimeStress,
      stressScore, sleepScore, sleepDebt, optimalSleepWindow, recoveryHistory, calendarDays,
      stressHistory, recoveryVelocity, stressVelocity, hrr, sleepApneaRisk, socialJetLag,
    }

    const pr = updatePersonalRecords({
      todayHRV: parsed.todayHRV, todayRHR: parsed.todayRHR,
      recoveryScore, strainScore, steps: parsed.steps,
    })
    const streaks = calculateStreaks(recoveryHistory, parsed.sleepHistory, stressHistory)
    const { unlocked, newUnlocks } = checkAndUnlockAchievements({
      pr, streaks, recoveryHistory, sleepHistory: parsed.sleepHistory,
    })
    const alerts = detectAlerts({ ...base, recoveryHistory })
    const result = { ...base, personalRecords: pr, streaks, unlockedAchievements: unlocked, alerts }

    fireDataNotifications(result, newUnlocks)
    fireDataEntryReminders()
    return result
  }, [])

  const doSync = useCallback(async (showSpinner) => {
    // Prevent overlapping syncs (e.g. init's background sync racing a manual refresh),
    // where the slower one resolves last and clobbers the newer snapshot/state.
    if (syncInFlight.current) return
    syncInFlight.current = true
    if (showSpinner) setLoading(true)
    else setIsSyncing(true)
    setSyncFailed(false)

    try {
      const raw = await loadDashboardData()
      if (!raw) { setSyncFailed(true); return }

      const result = { ...processData(raw), date: raw.date }

      // Persist today and extend calendar with IndexedDB history.
      // Read existing dates BEFORE writing so we can skip dates that already
      // have richer data — calendarDays entries only carry {date,recovery,sleep}
      // and a full put() would overwrite previously stored hrv/rhr/strain/etc.
      const dbHistory = await getHistory(90)
      const existingDates = new Set(dbHistory.map(r => r.date))
      await saveDay(result)
      if (result.calendarDays?.length) {
        const newRows = result.calendarDays
          .filter(d => d.date && !existingDates.has(d.date))
          .map(d => ({
            date: d.date,
            recovery: d.recovery ?? null,
            strain: d.strain ?? null,
            sleep: d.sleep ?? 0,
            sleepEfficiency: d.sleepEfficiency ?? 0,
            stressScore: d.stressScore ?? null,
            hrv: d.hrv ?? null,
            rhr: d.rhr ?? null,
            steps: d.steps ?? 0,
            calories: d.calories ?? 0,
            spo2: d.spo2 ?? null,
            br: d.br ?? null,
            skinTempDev: d.skinTempDev ?? null,
          }))
        if (newRows.length) await saveDaysBatch(newRows)
      }
      const syncedDates = new Set(result.calendarDays.map(d => d.date))
      const olderDays = dbHistory
        .filter(d => !syncedDates.has(d.date))
        .map(d => ({ date: d.date, recovery: d.recovery, strain: d.strain, sleep: d.sleep }))
      const mergedCalendar = [...olderDays, ...result.calendarDays]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-90)

      // Training load from full strain history in DB
      const strainHistory = dbHistory.map(d => d.strain).filter(Boolean)
      const trainingLoad = calculateTrainingLoad(strainHistory)
      const strainVelocity = getTrendVelocity(strainHistory)

      // Weekly pattern from merged 90-day calendar
      const weeklyPattern = calculateWeeklyPattern(mergedCalendar)

      // True 7-day Active Zone Minutes and Zone 2: today + prior 6 calendar days
      // Use date-based filter so a gap in syncing doesn't silently shift the window
      const sixDaysAgo = new Date(result.date)
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
      const sixDaysAgoStr = sixDaysAgo.toISOString().split('T')[0]
      const prior6Days = dbHistory.filter(d => d.date >= sixDaysAgoStr && d.date < result.date)
      const weeklyAZM = (result.activeMinutes || 0) + prior6Days.reduce((a, b) => a + (b.activeMinutes || 0), 0)
      const weeklyZone2 = (result.zoneMinutes?.[1] || 0) + prior6Days.reduce((a, b) => a + (b.zone2Minutes || 0), 0)

      // Recovery:Strain ratio — last 14 calendar days with valid data
      const rsTrendCutoff = new Date(result.date)
      rsTrendCutoff.setDate(rsTrendCutoff.getDate() - 13)
      const rsTrendCutoffStr = rsTrendCutoff.toISOString().split('T')[0]
      const rsTrend = dbHistory
        .filter(d => d.recovery > 0 && d.strain > 0 && d.date >= rsTrendCutoffStr)
        .map(d => ({ label: d.date.slice(5), ratio: Math.round(d.recovery / d.strain * 10) / 10 }))

      // VO2 Max longitudinal history from IndexedDB (updates infrequently)
      // dbHistory is fetched before saveDay, so today's entry may not be present yet — append it
      const vo2MaxHistory = dbHistory.filter(d => d.vo2Max > 0).map(d => ({ date: d.date, vo2Max: d.vo2Max }))
      if (result.vo2Max > 0 && (vo2MaxHistory.length === 0 || vo2MaxHistory[vo2MaxHistory.length - 1].date !== result.date)) {
        vo2MaxHistory.push({ date: result.date, vo2Max: result.vo2Max })
      }

      const finalResult = { ...result, calendarDays: mergedCalendar, trainingLoad, weeklyPattern, strainVelocity, weeklyAZM, weeklyZone2, vo2MaxHistory, rsTrend }
      await saveSnapshot(finalResult)
      setAppData(finalResult)
      setDemo(false)

      const now = Date.now()
      setLastSyncedAt(now)
      localStorage.setItem('last_synced_at', String(now))

      // Store latest scores in KV for rich push notifications (fire-and-forget)
      fetch('/api/push-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recovery: result.recoveryScore,
          strain: result.strainScore,
          stress: result.stressScore,
          hrv: result.todayHRV,
          rhr: result.todayRHR,
        }),
      }).catch(() => {})

      // Sync manual data freshness to KV so weekly push can report what's overdue
      try {
        const freshItems = getDataFreshness()
        const overdue = freshItems.filter(m => m.status === 'overdue' || m.status === 'never').map(m => m.label)
        const due = freshItems.filter(m => m.status === 'due').map(m => m.label)
        fetch('/api/push-freshness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overdue, due }),
        }).catch(() => {})
      } catch (_) {}

      // Auto-backup once per day after a successful sync (fire-and-forget)
      const lastBackup = getLastBackupAt()
      const today = new Date().toISOString().split('T')[0]
      if (!lastBackup || !lastBackup.startsWith(today)) {
        createBackup().catch(() => {})
      }
    } catch (e) {
      console.error(e)
      setSyncFailed(true)
    } finally {
      syncInFlight.current = false
      setLoading(false)
      setIsSyncing(false)
    }
  }, [processData])

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search)
      if (params.get('code')) {
        setLoading(true)
        const tokens = await handleOAuthCallback()
        if (tokens) { setConnected(true); doSync(true) }
        else setLoading(false)
        return
      }
      if (!isConnected()) return

      const snapshot = await getLatestSnapshot()
      if (snapshot?.data) {
        setAppData(snapshot.data)
        doSync(false)
      } else {
        doSync(true)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync: fire when tab regains focus (Page Visibility API) and every 15 min while open.
  // Google Health cloud refresh cadence is ~15 min, so polling faster has no benefit.
  useEffect(() => {
    if (!connected || demo) return
    const STALE_MS = 5 * 60 * 1000  // don't re-sync within 5 min of last sync
    const maybeSync = () => {
      const last = Number(localStorage.getItem('last_synced_at') || '0')
      if (Date.now() - last > STALE_MS) doSync(false)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') maybeSync() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => { if (document.visibilityState === 'visible') maybeSync() }, 15 * 60 * 1000)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(interval) }
  }, [connected, demo, doSync])

  const handleNav = (id) => {
    if (id === 'demo') { setDemo(true); setTab('home'); return }
    if (id === 'weeklypattern') { setTab('records'); id = 'records' }
    if (id === 'insights') return
    const oldIdx = TAB_ORDER.indexOf(prevTabRef.current)
    const newIdx = TAB_ORDER.indexOf(id)
    if (oldIdx !== -1 && newIdx !== -1) setTransDir(newIdx >= oldIdx ? 1 : -1)
    prevTabRef.current = id
    setTab(id)
  }

  if (!pinUnlocked) return <PinLock onUnlock={() => setPinUnlocked(true)} />
  if (loading) return <SkeletonScreen />
  if (!connected && !demo) return <ConnectScreen onNav={handleNav} />

  const data = demo ? DEMO : (appData || DEMO)
  const showNav = tab !== 'settings' && tab !== 'coach' && tab !== 'vitals'
  const showAlerts = tab === 'home' && data.alerts?.length > 0

  const screenCls = transDir >= 0 ? 'screen-fwd' : 'screen-back'

  return (
    <div className="bg-black" style={{ minHeight: '100dvh' }}>
      {showAlerts && <AlertBanner alerts={data.alerts} onCoach={() => setTab('coach')} />}

      {tab === 'home' && (
        <Home
          data={data}
          onNav={handleNav}
          onRefresh={connected && !demo ? () => doSync(false) : undefined}
          isSyncing={isSyncing}
          syncFailed={syncFailed && !demo}
          lastSyncedAt={!demo ? formatSyncTime(lastSyncedAt) : null}
        />
      )}
      <Suspense fallback={<SkeletonScreen />}>
        {tab === 'recovery'   && <div key="recovery"   className={screenCls}><Recovery   data={data} onNav={handleNav} /></div>}
        {tab === 'strain'     && <div key="strain"     className={screenCls}><Strain     data={data} onNav={handleNav} /></div>}
        {tab === 'sleep'      && <div key="sleep"      className={screenCls}><Sleep      data={data} onNav={handleNav} /></div>}
        {tab === 'stress'     && <div key="stress"     className={screenCls}><Stress     data={data} onNav={handleNav} /></div>}
        {tab === 'journal'    && <div key="journal"    className={screenCls}><Journal    data={data} onNav={handleNav} /></div>}
        {tab === 'coach'      && <div key="coach"      className={screenCls}><Coach      data={data} onNav={handleNav} /></div>}
        {tab === 'healthspan' && <div key="healthspan" className={screenCls}><Healthspan data={data} onNav={handleNav} /></div>}
        {tab === 'records'    && <div key="records"    className={screenCls}><Records    data={data} onNav={handleNav} /></div>}
        {tab === 'settings'   && <div key="settings"   className="screen-fade"><Settings onBack={() => handleNav('home')} /></div>}
        {tab === 'trends'     && <div key="trends"     className={screenCls}><Trends     data={data} onNav={handleNav} /></div>}
        {tab === 'vitals'     && <div key="vitals"     className={screenCls}><Vitals     data={data} onNav={handleNav} /></div>}
      </Suspense>

      {demo && tab !== 'settings' && tab !== 'coach' && (
        <div className="fixed top-safe left-0 right-0 flex justify-center pt-2 pointer-events-none" style={{ zIndex: 60 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b33' }}>
            Demo Mode
          </span>
        </div>
      )}

      {showNav && <BottomNav active={tab} onChange={handleNav} />}
    </div>
  )
}
