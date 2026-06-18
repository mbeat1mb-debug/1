import { useState, useCallback, useEffect, useRef } from 'react'
import { haptic } from '../lib/haptics'
import {
  DndContext, closestCenter, TouchSensor, MouseSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import ScoreRing from '../components/ScoreRing'
import DailyReport, { getTimeOfDay } from '../components/DailyReport'
import {
  getRecoveryColor, getRecoveryLabel, getStressColor, getStressLabel,
  getTrainingLoadColor, getUserHeightCm, getUserUnits, calculateDistance,
  calculatePhysiologicalAge, getUserAge, calculateReadiness,
} from '../lib/calculations'
import { getHomeLayout, saveHomeLayout, SECTION_META } from '../lib/layout'
import { getTopCorrelations } from '../lib/correlations'
import { getEntryForDate, getAllTags } from '../lib/storage'

function Pill({ label, value, unit = '' }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: '#4a4a4a' }}>{label}</span>
      <span className="font-bold leading-tight tabular" style={{ fontSize: 15, color: '#e8e8e8' }}>
        {value}{unit && <span className="font-normal ml-0.5" style={{ fontSize: 11, color: '#444' }}>{unit}</span>}
      </span>
    </div>
  )
}

function VelocityBadge({ value }) {
  if (value === null || value === undefined) return null
  const color = value > 0 ? '#00c9a7' : value < 0 ? '#ef4444' : '#888'
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→'
  return (
    <span className="text-xs font-bold ml-1" style={{ color }}>
      {arrow}{Math.abs(value)}
    </span>
  )
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      {[6, 10, 14].map(y => (
        <g key={y}>
          <circle cx={8} cy={y} r={1.2} fill="#555" />
          <circle cx={16} cy={y} r={1.2} fill="#555" />
        </g>
      ))}
    </svg>
  )
}

// ── Section content renderers ────────────────────────────────────────────────

function RecoveryContent({ data }) {
  const { recoveryScore = 0, todayHRV = 0, todayRHR = 0, todaySleep, todaySpO2 = 0, vo2Max = 0, recoveryVelocity } = data
  const color = getRecoveryColor(recoveryScore)
  const label = getRecoveryLabel(recoveryScore)
  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recovery</span>
        <div className="flex items-center gap-1">
          <VelocityBadge value={recoveryVelocity} />
          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: color + '22', color }}>{label}</span>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <ScoreRing score={recoveryScore} color={color} size={120} strokeWidth={10} />
        <div className="flex-1 space-y-3">
          <Pill label="HRV" value={todayHRV} unit="ms" />
          <Pill label="Resting HR" value={todayRHR} unit="bpm" />
          <Pill label="Sleep" value={sleepHours} />
          <Pill label="SpO₂" value={todaySpO2} unit="%" />
          {vo2Max > 0 && <Pill label="VO₂ Max" value={`~${vo2Max}`} unit="ml/kg" />}
        </div>
      </div>
    </>
  )
}

function StrainContent({ data }) {
  const { strainScore = 0, calories = 0, activeMinutes = 0, steps = 0, trainingLoad, strainVelocity } = data
  const tsbColor = trainingLoad ? getTrainingLoadColor(trainingLoad.tsb) : '#3b82f6'
  const heightCm = getUserHeightCm()
  const units = getUserUnits()
  const distanceKm = calculateDistance(steps, heightCm)
  const distanceDisplay = distanceKm
    ? units === 'imperial' ? `${Math.round(distanceKm * 0.6214 * 10) / 10} mi` : `${distanceKm} km`
    : null
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Strain</span>
        <div className="flex items-center gap-1">
          <VelocityBadge value={strainVelocity} />
          <span className="text-xs text-gray-500">0 – 21</span>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <ScoreRing score={strainScore} max={21} color="#3b82f6" size={100} strokeWidth={9} />
        <div className="flex-1 space-y-3">
          <Pill label="Calories" value={calories.toLocaleString()} unit="kcal" />
          <Pill label="Active" value={activeMinutes} unit="min" />
          {distanceDisplay
            ? <Pill label="Distance" value={distanceDisplay} />
            : <Pill label="Steps" value={steps.toLocaleString()} />}
          {trainingLoad && (
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Form</span>
              <span className="text-sm font-semibold" style={{ color: tsbColor }}>{trainingLoad.form}</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SleepContent({ data }) {
  const { sleepScore = 0, todaySleep, todayBR = 0 } = data
  const sleepColor = sleepScore >= 75 ? '#8b5cf6' : sleepScore >= 50 ? '#f59e0b' : '#ef4444'
  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'
  return (
    <>
      <div className="mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Sleep</span>
      </div>
      <div className="flex items-center gap-5">
        <ScoreRing score={sleepScore} color={sleepColor} size={100} strokeWidth={9} unit="%" />
        <div className="flex-1 space-y-3">
          <Pill label="Duration" value={sleepHours} />
          <Pill label="Efficiency" value={todaySleep?.efficiency ?? '--'} unit="%" />
          <Pill label="Resp Rate" value={todayBR} unit="br/m" />
        </div>
      </div>
    </>
  )
}

function StressContent({ data }) {
  const { stressScore = 0, stressVelocity } = data
  const color = getStressColor(stressScore)
  const label = getStressLabel(stressScore)
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Stress Monitor</span>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-3xl font-bold" style={{ color }}>{stressScore}</span>
          <span className="text-sm font-bold" style={{ color }}>{label}</span>
          <VelocityBadge value={stressVelocity !== undefined ? -stressVelocity : null} />
        </div>
        <span className="text-xs text-gray-600 mt-1 block">HRV vs 14-day baseline</span>
      </div>
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: color + '15' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} className="w-8 h-8">
          <path strokeLinecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
    </div>
  )
}

function RecordsContent() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Records & History</span>
        <p className="text-gray-300 text-sm mt-1">PRs, streaks, 90-day calendar</p>
      </div>
      <span className="text-2xl">🏆</span>
    </div>
  )
}

function ChronosContent({ data }) {
  const { hrvHistory = [], rhrHistory = [], sleepHistory = [], steps = 0, vo2Max = 0, weeklyZone2 = 0 } = data
  const userAge = getUserAge()
  const physAge = userAge > 0 ? calculatePhysiologicalAge({
    avgHRV: hrvHistory.filter(Boolean).reduce((a, b) => a + b, 0) / (hrvHistory.filter(Boolean).length || 1),
    avgRHR: rhrHistory.filter(Boolean).reduce((a, b) => a + b, 0) / (rhrHistory.filter(Boolean).length || 1),
    avgSleep: sleepHistory.length ? sleepHistory.reduce((a, s) => a + s.minutes, 0) / sleepHistory.length / 60 : 7,
    sleepConsistency: 0.8,
    avgSteps: steps,
    weeklyAZM: weeklyZone2,
    vo2Max,
    hrvHistory,
  }) : null
  const diff = physAge !== null ? physAge - userAge : null
  const color = diff === null ? '#888' : diff <= -3 ? '#00c9a7' : diff <= 0 ? '#3b82f6' : diff <= 3 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Chronos</span>
        {physAge !== null ? (
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold" style={{ color }}>{physAge}</span>
            <span className="text-sm text-gray-400">body age</span>
            {diff !== null && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: color + '20', color }}>
                {diff < 0 ? `${Math.abs(diff)}y younger` : diff > 0 ? `${diff}y older` : 'On track'}
              </span>
            )}
          </div>
        ) : (
          <p className="text-gray-300 text-sm mt-1">Biological age & pace of aging</p>
        )}
      </div>
      <span className="text-2xl">⏳</span>
    </div>
  )
}

function WeeklyPatternContent({ data }) {
  const { weeklyPattern = [] } = data
  if (!weeklyPattern.length || weeklyPattern.every(d => d.count === 0)) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Weekly Pattern</span>
          <p className="text-gray-600 text-sm mt-1">Needs 4+ weeks of synced data</p>
        </div>
        <span className="text-2xl">📊</span>
      </div>
    )
  }
  const validDays = weeklyPattern.filter(d => d.avgRecovery != null)
  const best = validDays.length ? validDays.reduce((a, b) => a.avgRecovery > b.avgRecovery ? a : b) : null
  const worst = validDays.length ? validDays.reduce((a, b) => a.avgRecovery < b.avgRecovery ? a : b) : null
  const maxVal = Math.max(...validDays.map(d => d.avgRecovery))

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Weekly Pattern</span>
        <span className="text-xs text-gray-600">Avg Recovery</span>
      </div>
      <div className="flex items-end gap-1 h-12">
        {weeklyPattern.map(d => {
          const color = d.avgRecovery != null ? getRecoveryColor(d.avgRecovery) : '#333'
          const height = d.avgRecovery != null ? Math.max(16, (d.avgRecovery / maxVal) * 44) : 6
          return (
            <div key={d.day} className="flex flex-col items-center flex-1 gap-1">
              <div
                className="w-full rounded-sm transition-all"
                style={{ height: `${height}px`, background: color + (d.count ? 'cc' : '44') }}
              />
              <span className="text-[9px] text-gray-600">{d.day}</span>
            </div>
          )
        })}
      </div>
      {best && worst && best.day !== worst.day && (
        <p className="text-xs text-gray-600 mt-2">
          Best: <span className="text-white">{best.day} ({best.avgRecovery}%)</span>
          {' · '}
          Worst: <span className="text-white">{worst.day} ({worst.avgRecovery}%)</span>
        </p>
      )}
    </>
  )
}

function JournalContent() {
  const todayStr = new Date().toISOString().split('T')[0]
  const entry = getEntryForDate(todayStr)
  const loggedIds = entry.tagIds || []
  const allTags = getAllTags()
  const topEmojis = loggedIds.slice(0, 5).map(id => allTags.find(t => t.id === id)?.emoji).filter(Boolean)
  const hasEnergy = entry.energy != null

  if (loggedIds.length > 0 || hasEnergy) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Journal</span>
          <div className="flex items-center gap-2 mt-1">
            {topEmojis.length > 0 && <span className="text-base leading-none">{topEmojis.join('')}</span>}
            <span className="text-xs text-gray-500">
              {loggedIds.length > 0 ? `${loggedIds.length} logged` : ''}
              {loggedIds.length > 0 && hasEnergy ? ' · ' : ''}
              {hasEnergy ? `energy ${entry.energy}/5` : ''}
            </span>
          </div>
        </div>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#00c9a720' }}>
          <span className="text-sm" style={{ color: '#00c9a7' }}>✓</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Journal</span>
        <p className="text-gray-500 text-sm mt-1">Nothing logged today</p>
      </div>
      <span className="text-sm font-medium flex-shrink-0" style={{ color: '#00c9a7' }}>+</span>
    </div>
  )
}

function TrendsContent({ data }) {
  const { recoveryHistory = [], calendarDays = [] } = data
  const last7Rec = recoveryHistory.filter(Boolean).slice(-7)
  const avgRec7 = last7Rec.length
    ? Math.round(last7Rec.reduce((a, b) => a + b, 0) / last7Rec.length)
    : null
  const scatterCount = calendarDays.filter(d => d.recovery != null && d.strain > 0).slice(-30).length
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Trends</span>
        <div className="flex items-center gap-3 mt-2">
          {avgRec7 != null && (
            <div>
              <span className="text-[10px] text-gray-600 uppercase tracking-wider block">7d Avg Recovery</span>
              <span className="text-xl font-bold" style={{ color: getRecoveryColor(avgRec7) }}>{avgRec7}%</span>
            </div>
          )}
          {scatterCount > 0 && (
            <div>
              <span className="text-[10px] text-gray-600 uppercase tracking-wider block">Days Tracked</span>
              <span className="text-xl font-bold text-white">{scatterCount}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-1">HRV, RHR, VO₂, Recovery × Strain</p>
      </div>
      <span className="text-2xl">📈</span>
    </div>
  )
}

function InsightsContent() {
  const [correlations, setCorrelations] = useState(null)

  useEffect(() => {
    getTopCorrelations().then(setCorrelations).catch(() => setCorrelations([]))
  }, [])

  if (correlations === null) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Insights</span>
          <p className="text-gray-600 text-sm mt-1">Analyzing patterns…</p>
        </div>
        <span className="text-2xl">🔬</span>
      </div>
    )
  }

  if (correlations.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Insights</span>
          <p className="text-gray-600 text-sm mt-1">Log 14+ days to see patterns</p>
        </div>
        <span className="text-2xl">🔬</span>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Insights</span>
        <span className="text-xs text-gray-600">vs avg recovery</span>
      </div>
      <div className="space-y-2">
        {correlations.slice(0, 3).map(c => {
          const isPositive = c.diff > 0
          const color = isPositive ? '#00c9a7' : '#ef4444'
          return (
            <div key={c.tagId} className="flex items-center justify-between">
              <span className="text-sm text-gray-300">{c.emoji} {c.label}</span>
              <span className="text-sm font-bold" style={{ color }}>
                {isPositive ? '+' : ''}{c.diff}%
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

function WeeklySummary({ data }) {
  const { calendarDays = [], weeklyAZM } = data
  const today = new Date()
  const dow = today.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
  weekStart.setHours(0, 0, 0, 0)

  const thisWeek = calendarDays.filter(d => {
    const dt = new Date(d.date + 'T12:00:00')
    return dt >= weekStart && dt <= today && d.recovery != null
  })
  if (thisWeek.length < 3) return null

  const avgRecovery = Math.round(thisWeek.reduce((a, d) => a + d.recovery, 0) / thisWeek.length)
  const best = thisWeek.reduce((a, b) => a.recovery > b.recovery ? a : b)
  const bestDay = new Date(best.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
  const avgSleepH = Math.round(
    thisWeek.filter(d => d.sleep > 0).reduce((a, d) => a + d.sleep, 0) /
    (thisWeek.filter(d => d.sleep > 0).length || 1) / 60 * 10
  ) / 10
  const totalStrain = thisWeek.filter(d => d.strain > 0).reduce((a, d) => a + d.strain, 0)
  const color = getRecoveryColor(avgRecovery)
  const azmColor = weeklyAZM >= 300 ? '#00c9a7' : weeklyAZM >= 150 ? '#f59e0b' : '#ef4444'

  return (
    <div className="mx-4 mb-1 rounded-2xl p-4" style={{ background: color + '08', border: `1px solid ${color}25` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color }}>This Week</span>
        <span className="text-xs text-gray-600">{thisWeek.length} days</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <span className="text-[10px] text-gray-600 uppercase tracking-wider block">Avg Recovery</span>
          <span className="text-xl font-bold" style={{ color }}>{avgRecovery}%</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-600 uppercase tracking-wider block">Best Day</span>
          <span className="text-xl font-bold text-white">{bestDay}</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-600 uppercase tracking-wider block">Avg Sleep</span>
          <span className="text-xl font-bold text-white">{avgSleepH > 0 ? `${avgSleepH}h` : '--'}</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-600 uppercase tracking-wider block">AZM</span>
          <span className="text-xl font-bold" style={{ color: weeklyAZM > 0 ? azmColor : '#555' }}>
            {weeklyAZM > 0 ? weeklyAZM : '--'}
          </span>
        </div>
      </div>
    </div>
  )
}

function CalibrationBanner({ daysOfData }) {
  if (daysOfData >= 14) return null
  const pct = Math.round((daysOfData / 14) * 100)
  const msg = daysOfData < 3
    ? 'Scores are estimates — your baseline is still being established.'
    : daysOfData < 7
    ? `${14 - daysOfData} more days of data will significantly improve accuracy.`
    : 'Scores are reliable — fine-tuning with each new day.'

  return (
    <div className="mx-4 mb-1 rounded-xl px-4 py-3" style={{ background: '#1a1600', border: '1px solid #f59e0b33' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">Calibrating</span>
        <span className="text-xs text-gray-600">{daysOfData} / 14 days</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#222] overflow-hidden mb-2">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: '#f59e0b' }} />
      </div>
      <p className="text-xs text-gray-500">{msg}</p>
    </div>
  )
}

const SETUP_ROWS = [
  { keys: ['user_age'],          label: 'Age' },
  { keys: ['user_height_cm'],    label: 'Height' },
  { keys: ['user_weight_kg', 'user_body_fat_pct'], label: 'Weight & Body Fat (Hume or manual)' },
  { keys: ['user_vo2_max'],      label: 'VO2 Max' },
]

function SetupCard({ onNav }) {
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem('setup_dismissed')
  )

  const [missing] = useState(() =>
    SETUP_ROWS.filter(row => row.keys.every(k => !localStorage.getItem(k)))
  )

  if (dismissed || missing.length === 0) return null

  const handleDismiss = () => {
    localStorage.setItem('setup_dismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="mx-4 mb-3 rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Finish Setup</span>
        <button
          onClick={handleDismiss}
          className="text-gray-600 text-lg leading-none px-1 transition-opacity active:opacity-50"
          aria-label="Dismiss setup card"
          style={{ lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div className="space-y-2 mb-3">
        {SETUP_ROWS.map(row => {
          const present = row.keys.every(k => !!localStorage.getItem(k))
          return (
            <div key={row.label} className="flex items-center gap-2">
              <span
                className="text-sm font-bold w-4 text-center flex-shrink-0"
                style={{ color: present ? '#00c9a7' : '#444' }}
              >
                {present ? '✓' : '○'}
              </span>
              <span
                className="text-sm"
                style={{ color: present ? '#555' : '#ccc' }}
              >
                {row.label}
              </span>
            </div>
          )
        })}
      </div>
      <button
        onClick={() => onNav('settings')}
        className="text-xs font-semibold transition-opacity active:opacity-60"
        style={{ color: '#00c9a7' }}
      >
        Open Settings →
      </button>
    </div>
  )
}

const SECTION_CONTENT = {
  recovery: RecoveryContent,
  strain: StrainContent,
  sleep: SleepContent,
  stress: StressContent,
  records: RecordsContent,
  chronos: ChronosContent,
  weeklypattern: WeeklyPatternContent,
  journal: JournalContent,
  insights: InsightsContent,
  trends: TrendsContent,
}

function ReadinessCard({ data }) {
  const { headline, color, reasons } = calculateReadiness({
    recoveryScore: data.recoveryScore,
    recoveryVelocity: data.recoveryVelocity,
    sleepDebt: data.sleepDebt,
    trainingLoad: data.trainingLoad,
    todayHRV: data.todayHRV,
    hrvHistory: data.hrvHistory ?? [],
    stressScore: data.stressScore,
  })
  return (
    <div className="mx-4 rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: color + '10', border: `1px solid ${color}28` }}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: color + 'aa' }}>Readiness</p>
        <p className="text-2xl font-bold" style={{ color }}>{headline}</p>
      </div>
      {reasons.length > 0 && (
        <div className="flex flex-col items-end gap-1">
          {reasons.map(r => (
            <span key={r} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: color + '18', color: color + 'cc' }}>{r}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sortable card ────────────────────────────────────────────────────────────

function getCardGlowColor(id, data) {
  switch (id) {
    case 'recovery':   return data.recoveryScore != null ? getRecoveryColor(data.recoveryScore) : null
    case 'strain':     return '#3b82f6'
    case 'sleep': {
      const s = data.sleepScore
      if (s == null) return null
      return s >= 75 ? '#8b5cf6' : s >= 50 ? '#f59e0b' : '#ef4444'
    }
    case 'stress':     return data.stressScore != null ? getStressColor(data.stressScore) : null
    case 'journal':    return '#C9A84C'
    case 'chronos':    return '#00c9a7'
    case 'records':    return '#C9A84C'
    case 'trends':     return '#3b82f6'
    default:           return null
  }
}

function SortableCard({ id, idx, editing, onNav, data, minimized, onToggleMinimized }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const Content = SECTION_CONTENT[id]
  const meta = SECTION_META[id]

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : 'auto',
  }

  const glowColor = !editing ? getCardGlowColor(id, data) : null
  const cardStyle = {
    background: 'linear-gradient(160deg, #141414, #0f0f0f)',
    border: glowColor ? `1px solid ${glowColor}28` : '1px solid #1e1e1e',
    borderStyle: id === 'journal' ? 'dashed' : 'solid',
    boxShadow: glowColor ? `0 0 24px ${glowColor}0e, 0 1px 0 ${glowColor}18 inset` : undefined,
    animation: !editing ? `cardIn 0.38s cubic-bezier(0.33, 1, 0.68, 1) ${(idx ?? 0) * 50}ms both` : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="flex items-stretch">
          {editing && (
            <div
              className="flex items-center justify-center px-3 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
              style={{ background: '#1a1a1a', borderRight: '1px solid #222' }}
              {...attributes}
              {...listeners}
            >
              <GripIcon />
            </div>
          )}
          <button
            onClick={() => !editing && !meta?.noNav && onNav(id)}
            className={`flex-1 p-4 text-left min-w-0 ${!editing && !meta?.noNav ? 'card-tap' : ''}`}
            style={{ cursor: editing || meta?.noNav ? 'default' : 'pointer', WebkitUserSelect: 'none' }}
          >
            {minimized ? (
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-base">{meta?.emoji}</span>
                <span className="text-sm font-semibold text-gray-400">{meta?.label}</span>
              </div>
            ) : (
              <Content data={data} />
            )}
          </button>
          {!editing && (
            <button
              onClick={e => { e.stopPropagation(); onToggleMinimized(id) }}
              className="flex items-center justify-center px-3 flex-shrink-0 transition-opacity active:opacity-60"
              style={{ borderLeft: '1px solid #1a1a1a' }}
              aria-label={minimized ? 'Expand' : 'Minimize'}
            >
              <svg
                viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={2.5}
                className="w-4 h-4 transition-transform duration-200"
                style={{ transform: minimized ? 'rotate(0deg)' : 'rotate(180deg)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Home screen ──────────────────────────────────────────────────────────────

export default function Home({ data, onNav, onRefresh, isSyncing, syncFailed, lastSyncedAt }) {
  const [order, setOrder] = useState(getHomeLayout)
  const [editing, setEditing] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [minimized, setMinimized] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cards_minimized') || '{}') } catch { return {} }
  })
  const [showCompactHeader, setShowCompactHeader] = useState(false)
  const timeOfDay = getTimeOfDay()
  const daysOfData = data.hrvHistory?.filter(Boolean).length || 0

  // Compact sticky header — appears once the main header scrolls out of view
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    const onScroll = () => setShowCompactHeader(root.scrollTop > 90)
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [])

  const [pullY, setPullY] = useState(0)
  const isPullingRef = useRef(false)
  const touchStartY = useRef(0)
  const PULL_THRESHOLD = 70

  const handleTouchStart = useCallback((e) => {
    if (window.scrollY > 0) return
    touchStartY.current = e.touches[0].clientY
    isPullingRef.current = true
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!isPullingRef.current) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) setPullY(Math.min(delta * 0.4, PULL_THRESHOLD))
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (isPullingRef.current) {
      if (pullY >= PULL_THRESHOLD && onRefresh && !isSyncing) {
        haptic('medium')
        onRefresh()
      }
      setPullY(0)
    }
    isPullingRef.current = false
  }, [pullY, onRefresh, isSyncing])

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
  )

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    setOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id))
      saveHomeLayout(next)
      return next
    })
  }, [])

  const toggleMinimized = useCallback((id) => {
    setMinimized(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem('cards_minimized', JSON.stringify(next))
      return next
    })
  }, [])

  const finishEditing = () => setEditing(false)
  const ActiveContent = activeId ? SECTION_CONTENT[activeId] : null

  const recoveryColor = getRecoveryColor(data.recoveryScore || 0)

  // Apply ambient tint to #root so it stays fixed during pull-to-refresh
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    root.style.background = `radial-gradient(ellipse 80% 25% at 50% 0%, ${recoveryColor}07 0%, transparent 70%)`
    return () => { root.style.background = '' }
  }, [recoveryColor])

  return (
    <div
      className="pt-safe pb-28"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: pullY > 0 ? `translateY(${pullY}px)` : undefined,
        transition: pullY === 0 ? 'transform 0.2s ease' : undefined,
      }}
    >
      {/* Compact sticky header — slides in when main header scrolls away */}
      {showCompactHeader && (
        <div
          className="fixed left-0 right-0 z-40 flex items-center justify-between px-4 screen-fade"
          style={{
            top: 0,
            paddingTop: 'max(10px, env(safe-area-inset-top))',
            paddingBottom: 10,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid #1a1a1a',
          }}
        >
          <span style={{ fontFamily: 'Georgia, serif', color: '#C9A84C', fontWeight: 700, fontSize: 18 }}>Σ</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: recoveryColor }} />
            <span className="text-sm font-bold text-white tabular">{data.recoveryScore || '--'}%</span>
            <span className="text-xs text-gray-500">Recovery</span>
          </div>
          <span className="text-[10px] text-gray-600">{lastSyncedAt || ''}</span>
        </div>
      )}
      {(pullY > 0 || isSyncing) && (
        <div
          className="flex justify-center items-center pb-2"
          style={{ opacity: isSyncing ? 1 : pullY / PULL_THRESHOLD, transition: 'opacity 0.15s ease' }}
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="#00c9a7" strokeWidth={2}
            className={`w-5 h-5 ${isSyncing ? 'spin' : ''}`}
            style={!isSyncing ? { transform: `rotate(${(pullY / PULL_THRESHOLD) * 180}deg)` } : undefined}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between pt-2 pb-1 px-4">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-xl font-bold" style={{ color: '#C9A84C', fontFamily: 'Georgia, serif' }}>Soma</h1>
          {!editing && (
            <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: syncFailed ? '#f59e0b' : '#444' }}>
              {isSyncing && (
                <span
                  className="animate-pulse-ring inline-block rounded-full flex-shrink-0"
                  style={{ width: 6, height: 6, background: '#00c9a7' }}
                />
              )}
              {isSyncing
                ? 'Syncing…'
                : syncFailed
                  ? 'Sync failed — tap ↺ to retry'
                  : lastSyncedAt
                    ? `Synced ${lastSyncedAt}`
                    : ''}
            </p>
          )}
          {!editing && localStorage.getItem('sync_debug_error') && (
            <p className="text-[10px] mt-0.5 max-w-[220px] break-words" style={{ color: '#f59e0b' }}>
              {localStorage.getItem('sync_debug_error')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && !editing && (
            <button
              onClick={onRefresh}
              disabled={isSyncing}
              className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center"
              aria-label="Refresh data"
            >
              <svg
                viewBox="0 0 24 24" fill="none" stroke={syncFailed ? '#f59e0b' : '#888'} strokeWidth={2}
                className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                style={isSyncing ? { animationDirection: 'reverse' } : {}}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button
            onClick={() => editing ? finishEditing() : setEditing(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: editing ? '#00c9a7' : '#1a1a1a',
              color: editing ? '#000' : '#888',
              border: editing ? 'none' : '1px solid #2a2a2a',
            }}
          >
            {editing ? 'Done' : 'Edit Layout'}
          </button>
          <button onClick={() => onNav('coach')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center" aria-label="AI Coach">
            <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          <button onClick={() => onNav('settings')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center" aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {!editing && <CalibrationBanner daysOfData={daysOfData} />}
      {!editing && <SetupCard onNav={onNav} />}

      {editing && (
        <p className="text-center text-xs text-gray-600 pb-2">Hold grip to reorder · Chevron to minimize</p>
      )}

      {/* Readiness headline */}
      {!editing && (
        <div className="mb-2 mt-2">
          <ReadinessCard data={data} />
        </div>
      )}

      {/* Morning / Nightly report */}
      {!editing && timeOfDay && (
        <div className="mb-1 mt-2">
          <DailyReport data={data} type={timeOfDay === 'morning' ? 'morning' : 'evening'} />
        </div>
      )}
      {!editing && <WeeklySummary data={data} />}

      {/* Sortable sections */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 px-4 mt-2">
            {order.map((id, idx) => (
              <SortableCard
                key={id}
                id={id}
                idx={idx}
                editing={editing}
                onNav={onNav}
                data={data}
                minimized={!!minimized[id]}
                onToggleMinimized={toggleMinimized}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId && ActiveContent ? (
            <div className="rounded-2xl p-4 opacity-90 shadow-2xl" style={{ background: '#1a1a1a', border: '1px solid #00c9a755' }}>
              <ActiveContent data={data} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
