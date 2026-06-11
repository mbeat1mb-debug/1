import { useState, useEffect, useCallback } from 'react'
import { isConnected, handleOAuthCallback } from './lib/auth'
import { loadDashboardData } from './lib/api'
import {
  parseFitbitData, calculateRecovery, calculateStrain, calculateZoneMinutes,
  calculateStressScore, calculateSleepDebt, calculateOptimalSleepWindow,
} from './lib/calculations'
import { detectAlerts } from './lib/alerts'
import {
  updatePersonalRecords, calculateStreaks, checkAndUnlockAchievements, getPersonalRecords,
  getUnlockedAchievements,
} from './lib/achievements'

import BottomNav from './components/BottomNav'
import AlertBanner from './components/AlertBanner'
import Home from './screens/Home'
import Recovery from './screens/Recovery'
import Strain from './screens/Strain'
import Sleep from './screens/Sleep'
import Stress from './screens/Stress'
import Journal from './screens/Journal'
import Coach from './screens/Coach'
import Healthspan from './screens/Healthspan'
import Records from './screens/Records'
import Settings from './screens/Settings'

// Generate 90-day demo calendar data
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
  const [appData, setAppData] = useState(null)
  const [demo, setDemo] = useState(false)
  const [connected, setConnected] = useState(isConnected())

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
    const sleepScore = parsed.todaySleep
      ? Math.round(Math.min(100, (parsed.todaySleep.minutesAsleep / 480) * 70 + (parsed.todaySleep.efficiency || 85) / 100 * 30))
      : 0
    const sleepDebt = calculateSleepDebt(parsed.sleepHistory)
    const optimalSleepWindow = calculateOptimalSleepWindow(parsed.sleepHistory)

    // Build recovery history from historical data
    const recoveryHistory = parsed.hrvHistory.map((hrv, i) => {
      if (!hrv) return null
      return calculateRecovery({
        hrv, rhr: parsed.rhrHistory[i] || parsed.todayRHR,
        sleep: parsed.sleepHistory[i] ? { minutesAsleep: parsed.sleepHistory[i].minutes, efficiency: parsed.sleepHistory[i].efficiency } : null,
        spo2: parsed.todaySpO2, br: parsed.todayBR,
        hrvHistory: parsed.hrvHistory.slice(0, i), rhrHistory: parsed.rhrHistory.slice(0, i),
      })
    }).filter(Boolean)

    const calendarDays = parsed.sleepHistory.map((s, i) => ({
      date: s.date,
      recovery: recoveryHistory[i] ?? 50,
      sleep: s.minutes,
    }))

    const base = {
      ...parsed, recoveryScore, strainScore, zoneMinutes, stressScore, sleepScore,
      sleepDebt, optimalSleepWindow, recoveryHistory, calendarDays,
      stressHistory: Array(recoveryHistory.length).fill(0),
    }

    // PR tracking + achievements
    const pr = updatePersonalRecords({
      todayHRV: parsed.todayHRV, todayRHR: parsed.todayRHR,
      recoveryScore, strainScore, steps: parsed.steps,
    })
    const streaks = calculateStreaks(recoveryHistory, parsed.sleepHistory)
    const { unlocked } = checkAndUnlockAchievements({
      pr, streaks, recoveryHistory, sleepHistory: parsed.sleepHistory,
    })
    const alerts = detectAlerts({ ...base, recoveryHistory })

    return { ...base, personalRecords: pr, streaks, unlockedAchievements: unlocked, alerts }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code')) {
      setLoading(true)
      handleOAuthCallback(localStorage.getItem('fitbit_client_id')).then(tokens => {
        if (tokens) { setConnected(true); loadAndProcess() }
        else setLoading(false)
      })
      return
    }
    if (isConnected()) loadAndProcess()
  }, [])

  const loadAndProcess = async () => {
    setLoading(true)
    try {
      const raw = await loadDashboardData()
      if (raw) { setAppData(processData(raw)); setDemo(false) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleNav = (id) => {
    if (id === 'demo') { setDemo(true); setTab('home'); return }
    setTab(id)
  }

  if (loading) return <Spinner />
  if (!connected && !demo) return <ConnectScreen onNav={handleNav} />

  const data = demo ? DEMO : (appData || DEMO)
  const showNav = tab !== 'settings' && tab !== 'coach'
  const showAlerts = ['home'].includes(tab) && data.alerts?.length > 0

  return (
    <div className="min-h-screen bg-black">
      {showAlerts && <AlertBanner alerts={data.alerts} onCoach={() => setTab('coach')} />}

      {tab === 'home' && <Home data={data} onNav={handleNav} />}
      {tab === 'recovery' && <Recovery data={data} />}
      {tab === 'strain' && <Strain data={data} />}
      {tab === 'sleep' && <Sleep data={data} />}
      {tab === 'stress' && <Stress data={data} />}
      {tab === 'journal' && <Journal data={data} />}
      {tab === 'coach' && <Coach data={data} />}
      {tab === 'healthspan' && <Healthspan data={data} />}
      {tab === 'records' && <Records data={data} />}
      {tab === 'settings' && <Settings onBack={() => setTab('home')} />}

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
