import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { isConnected, handleOAuthCallback } from './lib/auth'
import { loadDashboardData } from './lib/api'
import {
  parseFitbitData, calculateRecovery, calculateStrain, calculateZoneMinutes,
  calculateStressScore, calculateSleepScore, calculateSleepDebt, calculateOptimalSleepWindow,
} from './lib/calculations'
import { detectAlerts } from './lib/alerts'
import {
  updatePersonalRecords, calculateStreaks, checkAndUnlockAchievements,
} from './lib/achievements'
import { fireDataNotifications } from './lib/notifications'
import { saveDay, getHistory, saveSnapshot, getLatestSnapshot } from './lib/db'

import BottomNav from './components/BottomNav'
import AlertBanner from './components/AlertBanner'
import Home from './screens/Home'

const Recovery = lazy(() => import('./screens/Recovery'))
const Strain = lazy(() => import('./screens/Strain'))
const Sleep = lazy(() => import('./screens/Sleep'))
const Stress = lazy(() => import('./screens/Stress'))
const Journal = lazy(() => import('./screens/Journal'))
const Coach = lazy(() => import('./screens/Coach'))
const Healthspan = lazy(() => import('./screens/Healthspan'))
const Records = lazy(() => import('./screens/Records'))
const Settings = lazy(() => import('./screens/Settings'))

function makeCalendarDays() {
  return Array.from({ length: 90 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (89 - i))
    return {
      date: d.toISOString().split('T')[0],
      recovery: Math.round(30 + Math.random() * 65),
      strain: Math.round(5 + Math.random() * 12),
      sleep: Math.round(360 + Math.random() * 120),
    }
  })
}

const DEMO_CALENDAR = makeCalendarDays()

const DEMO = {
  recoveryScore: 74, strainScore: 11.2, sleepScore: 78, stressScore: 28,
  todayHRV: 58, todayRHR: 54, todaySpO2: 97, todayBR: 14,
  steps: 8340, calories: 2180, activeMinutes: 42,
  zoneMinutes: [18, 32, 25, 8, 2],
  todaySleep: {
    minutesAsleep: 447, timeInBed: 490, efficiency: 91,
    levels: { summary: { deep: { minutes: 72 }, rem: { minutes: 98 }, light: { minutes: 277 }, wake: { minutes: 43 } } },
  },
  hrvHistory: [44, 48, 52, 55, 49, 53, 56, 58, 51, 54, 57, 60, 55, 58],
  rhrHistory: [57, 56, 55, 58, 54, 56, 55, 53, 55, 54, 56, 53, 54, 54],
  sleepHistory: Array.from({ length: 30 }, (_, i) => ({
    date: (() => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().split('T')[0] })(),
    minutes: 420 + Math.round((Math.random() - 0.4) * 90),
    efficiency: 80 + Math.round(Math.random() * 15),
    startTime: null, endTime: null,
  })),
  recoveryHistory: DEMO_CALENDAR.map(d => d.recovery),
  stressHistory: Array.from({ length: 30 }, () => Math.round(20 + Math.random() * 40)),
  calendarDays: DEMO_CALENDAR,
  sleepDebt: 2.5,
  optimalSleepWindow: { bedtime: '10:45 PM', wakeTime: '6:30 AM', consistency: 72 },
  personalRecords: { bestRecovery: 91, bestHRV: 74, lowestRHR: 48, highestStrain: 17.4, mostSteps: 14230 },
  streaks: { recovery: 3, sleep: 2, lowStress: 5 },
  unlockedAchievements: ['first_green', 'step_king'],
  alerts: [],
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

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <div className="w-12 h-12 rounded-full border-2 border-[#222] border-t-[#00c9a7] animate-spin" />
      <p className="text-gray-500 text-sm">Syncing Fitbit Air…</p>
    </div>
  )
}

function ConnectScreen({ onNav }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen px-6 gap-6 text-center">
      <div className="w-20 h-20 rounded-full bg-[#00c9a710] flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="#00c9a7" strokeWidth={1.5} className="w-10 h-10">
          <path strokeLinecap="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Health Dashboard</h1>
        <p className="text-gray-500 text-sm mt-2">Your personal Fitbit Air dashboard with Whoop-style analytics</p>
      </div>
      <button onClick={() => onNav('settings')} className="w-full max-w-xs py-4 rounded-2xl font-bold text-black" style={{ background: '#00c9a7' }}>
        Connect Fitbit Air
      </button>
      <button onClick={() => onNav('demo')} className="text-gray-500 text-sm underline">
        View demo first
      </button>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('home')
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

  const processData = useCallback((raw) => {
    const parsed = parseFitbitData(raw)

    const recoveryScore = calculateRecovery({
      hrv: parsed.todayHRV, rhr: parsed.todayRHR, sleep: parsed.todaySleep,
      spo2: parsed.todaySpO2, br: parsed.todayBR,
      hrvHistory: parsed.hrvHistory, rhrHistory: parsed.rhrHistory,
    })
    const strainScore = calculateStrain(parsed.hrIntradayData)
    const zoneMinutes = calculateZoneMinutes(parsed.hrIntradayData)
    const stressScore = calculateStressScore({
      hrv: parsed.todayHRV, rhr: parsed.todayRHR,
      hrvHistory: parsed.hrvHistory, rhrHistory: parsed.rhrHistory,
    })
    const sleepScore = calculateSleepScore(parsed.todaySleep)
    const sleepDebt = calculateSleepDebt(parsed.sleepHistory)
    const optimalSleepWindow = calculateOptimalSleepWindow(parsed.sleepHistory)

    const recoveryHistory = []
    const stressHistory = []
    parsed.hrvHistory.forEach((hrv, i) => {
      if (!hrv) return
      recoveryHistory.push(calculateRecovery({
        hrv, rhr: parsed.rhrHistory[i] || parsed.todayRHR,
        sleep: parsed.sleepHistory[i] ? { minutesAsleep: parsed.sleepHistory[i].minutes, efficiency: parsed.sleepHistory[i].efficiency } : null,
        spo2: parsed.todaySpO2, br: parsed.todayBR,
        hrvHistory: parsed.hrvHistory.slice(0, i), rhrHistory: parsed.rhrHistory.slice(0, i),
      }))
      stressHistory.push(calculateStressScore({
        hrv, rhr: parsed.rhrHistory[i] || parsed.todayRHR,
        hrvHistory: parsed.hrvHistory.slice(0, i),
        rhrHistory: parsed.rhrHistory.slice(0, i),
      }))
    })

    const offset = recoveryHistory.length - parsed.sleepHistory.length
    const calendarDays = parsed.sleepHistory.map((s, i) => ({
      date: s.date,
      recovery: recoveryHistory[i + offset] ?? null,
      sleep: s.minutes,
    }))

    const base = {
      ...parsed, recoveryScore, strainScore, zoneMinutes, stressScore, sleepScore,
      sleepDebt, optimalSleepWindow, recoveryHistory, calendarDays, stressHistory,
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

    return result
  }, [])

  const doSync = useCallback(async (showSpinner) => {
    if (showSpinner) setLoading(true)
    else setIsSyncing(true)
    setSyncFailed(false)

    try {
      const raw = await loadDashboardData()
      if (!raw) { setSyncFailed(true); return }

      const result = { ...processData(raw), date: raw.date }

      // Extend calendar with older IndexedDB history beyond the 30-day Fitbit window
      await saveDay(result)
      const dbHistory = await getHistory(90)
      const fitbitDates = new Set(result.calendarDays.map(d => d.date))
      const olderDays = dbHistory
        .filter(d => !fitbitDates.has(d.date))
        .map(d => ({ date: d.date, recovery: d.recovery, strain: d.strain, sleep: d.sleep }))
      const mergedCalendar = [...olderDays, ...result.calendarDays]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-90)

      const finalResult = { ...result, calendarDays: mergedCalendar }
      await saveSnapshot(finalResult)
      setAppData(finalResult)
      setDemo(false)

      const now = Date.now()
      setLastSyncedAt(now)
      localStorage.setItem('last_synced_at', String(now))
    } catch (e) {
      console.error(e)
      setSyncFailed(true)
    } finally {
      setLoading(false)
      setIsSyncing(false)
    }
  }, [processData])

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search)
      if (params.get('code')) {
        setLoading(true)
        const tokens = await handleOAuthCallback(localStorage.getItem('fitbit_client_id'))
        if (tokens) { setConnected(true); doSync(true) }
        else setLoading(false)
        return
      }
      if (!isConnected()) return

      // Instant-open: show cached snapshot immediately, refresh in background
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

  const handleNav = (id) => {
    if (id === 'demo') { setDemo(true); setTab('home'); return }
    setTab(id)
  }

  if (loading) return <Spinner />
  if (!connected && !demo) return <ConnectScreen onNav={handleNav} />

  const data = demo ? DEMO : (appData || DEMO)
  const showNav = tab !== 'settings' && tab !== 'coach'
  const showAlerts = tab === 'home' && data.alerts?.length > 0

  return (
    <div className="min-h-screen bg-black">
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
      <Suspense fallback={<Spinner />}>
        {tab === 'recovery' && <Recovery data={data} />}
        {tab === 'strain' && <Strain data={data} />}
        {tab === 'sleep' && <Sleep data={data} />}
        {tab === 'stress' && <Stress data={data} />}
        {tab === 'journal' && <Journal data={data} />}
        {tab === 'coach' && <Coach data={data} onNav={handleNav} />}
        {tab === 'healthspan' && <Healthspan data={data} />}
        {tab === 'records' && <Records data={data} />}
        {tab === 'settings' && <Settings onBack={() => setTab('home')} />}
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
