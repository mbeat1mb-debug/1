import { useState, useEffect, useCallback } from 'react'
import { isConnected, handleOAuthCallback } from './lib/auth'
import { loadDashboardData } from './lib/api'
import {
  parseFitbitData, calculateRecovery, calculateStrain, calculateZoneMinutes,
  calculateStressScore, getRecoveryColor,
} from './lib/calculations'

import BottomNav from './components/BottomNav'
import Home from './screens/Home'
import Recovery from './screens/Recovery'
import Strain from './screens/Strain'
import Sleep from './screens/Sleep'
import Stress from './screens/Stress'
import Journal from './screens/Journal'
import Coach from './screens/Coach'
import Healthspan from './screens/Healthspan'
import Settings from './screens/Settings'

// Demo data shown before Fitbit is connected
const DEMO = {
  recoveryScore: 74, strainScore: 11.2, sleepScore: 78, stressScore: 28,
  todayHRV: 58, todayRHR: 54, todaySpO2: 97, todayBR: 14,
  steps: 8340, calories: 2180, activeMinutes: 42,
  zoneMinutes: [18, 32, 25, 8, 2],
  todaySleep: { minutesAsleep: 447, timeInBed: 490, efficiency: 91, levels: { summary: { deep: { minutes: 72 }, rem: { minutes: 98 }, light: { minutes: 277 }, wake: { minutes: 43 } } } },
  hrvHistory: [44, 48, 52, 55, 49, 53, 56, 58, 51, 54, 57, 60, 55, 58],
  rhrHistory: [57, 56, 55, 58, 54, 56, 55, 53, 55, 54, 56, 53, 54, 54],
  sleepHistory: Array.from({ length: 14 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, minutes: 420 + Math.round((Math.random() - 0.5) * 60) })),
  recoveryHistory: Array.from({ length: 14 }, () => Math.round(55 + Math.random() * 30)),
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
      <button
        onClick={() => onNav('settings')}
        className="w-full max-w-xs py-4 rounded-2xl font-bold text-black"
        style={{ background: '#00c9a7' }}
      >
        Connect Fitbit Air
      </button>
      <button
        onClick={() => onNav('demo')}
        className="text-gray-500 text-sm underline"
      >
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
      hrv: parsed.todayHRV,
      rhr: parsed.todayRHR,
      sleep: parsed.todaySleep,
      spo2: parsed.todaySpO2,
      br: parsed.todayBR,
      hrvHistory: parsed.hrvHistory,
      rhrHistory: parsed.rhrHistory,
    })
    const strainScore = calculateStrain(parsed.hrIntradayData)
    const zoneMinutes = calculateZoneMinutes(parsed.hrIntradayData)
    const stressScore = calculateStressScore({
      hrv: parsed.todayHRV,
      rhr: parsed.todayRHR,
      hrvHistory: parsed.hrvHistory,
      rhrHistory: parsed.rhrHistory,
    })
    const sleepScore = parsed.todaySleep
      ? Math.round(Math.min(100, (parsed.todaySleep.minutesAsleep / 480) * 70 + (parsed.todaySleep.efficiency || 85) / 100 * 30))
      : 0

    return { ...parsed, recoveryScore, strainScore, zoneMinutes, stressScore, sleepScore }
  }, [])

  useEffect(() => {
    // Handle OAuth callback
    const params = new URLSearchParams(window.location.search)
    if (params.get('code')) {
      setLoading(true)
      handleOAuthCallback(localStorage.getItem('fitbit_client_id')).then(tokens => {
        if (tokens) {
          setConnected(true)
          loadAndProcess()
        } else {
          setLoading(false)
        }
      })
      return
    }

    if (isConnected()) {
      loadAndProcess()
    }
  }, [])

  const loadAndProcess = async () => {
    setLoading(true)
    try {
      const raw = await loadDashboardData()
      if (raw) {
        setAppData(processData(raw))
        setDemo(false)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleNav = (id) => {
    if (id === 'demo') { setDemo(true); setTab('home'); return }
    setTab(id)
  }

  if (loading) return <Spinner />

  if (!connected && !demo) return <ConnectScreen onNav={handleNav} />

  const data = demo ? DEMO : (appData || DEMO)

  const showNav = tab !== 'settings' && tab !== 'coach'

  return (
    <div className="min-h-screen bg-black">
      {tab === 'home' && <Home data={data} onNav={handleNav} />}
      {tab === 'recovery' && <Recovery data={data} />}
      {tab === 'strain' && <Strain data={data} />}
      {tab === 'sleep' && <Sleep data={data} />}
      {tab === 'stress' && <Stress data={data} />}
      {tab === 'journal' && <Journal data={data} />}
      {tab === 'coach' && <Coach data={data} />}
      {tab === 'healthspan' && <Healthspan data={data} />}
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
