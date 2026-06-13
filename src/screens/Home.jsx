import { useState, useCallback, useEffect, useRef } from 'react'
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
} from '../lib/calculations'
import { getHomeLayout, saveHomeLayout, SECTION_META } from '../lib/layout'
import { getTopCorrelations } from '../lib/correlations'

function Pill({ label, value, unit = '' }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-white">
        {value}<span className="text-gray-500 text-xs ml-0.5">{unit}</span>
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

function HealthspanContent() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Healthspan</span>
        <p className="text-gray-300 text-sm mt-1">Biological age & pace of aging</p>
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
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-sm">Log today's behaviors</span>
      <span className="text-xl text-gray-500">＋</span>
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

const SECTION_CONTENT = {
  recovery: RecoveryContent,
  strain: StrainContent,
  sleep: SleepContent,
  stress: StressContent,
  records: RecordsContent,
  healthspan: HealthspanContent,
  weeklypattern: WeeklyPatternContent,
  journal: JournalContent,
  insights: InsightsContent,
}

// ── Sortable card ────────────────────────────────────────────────────────────

function SortableCard({ id, editing, onNav, data, minimized, onToggleMinimized }) {
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

  const cardStyle = { background: '#111', border: '1px solid #222', borderStyle: id === 'journal' ? 'dashed' : 'solid' }

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
            onClick={() => !editing && onNav(id)}
            className="flex-1 p-4 text-left transition-opacity active:opacity-70 min-w-0"
            style={{ cursor: editing ? 'default' : 'pointer' }}
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
  const timeOfDay = getTimeOfDay()
  const daysOfData = data.hrvHistory?.filter(Boolean).length || 0

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
      setPullY(prev => {
        if (prev >= PULL_THRESHOLD && onRefresh && !isSyncing) onRefresh()
        return 0
      })
    }
    isPullingRef.current = false
  }, [onRefresh, isSyncing])

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

  return (
    <div
      className="pt-safe pb-28"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: pullY > 0 ? `translateY(${pullY}px)` : undefined, transition: pullY === 0 ? 'transform 0.2s ease' : undefined }}
    >
      {pullY > 0 && (
        <div className="flex justify-center items-center pb-2" style={{ opacity: pullY / PULL_THRESHOLD }}>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="#00c9a7" strokeWidth={2}
            className="w-5 h-5"
            style={{ transform: `rotate(${pullY / PULL_THRESHOLD * 180}deg)` }}
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
          <h1 className="text-xl font-bold text-white">Daily Report</h1>
          {!editing && (
            <p className="text-[10px] mt-0.5" style={{ color: syncFailed ? '#f59e0b' : '#444' }}>
              {isSyncing
                ? 'Syncing…'
                : syncFailed
                  ? 'Sync failed — tap ↺ to retry'
                  : lastSyncedAt
                    ? `Synced ${lastSyncedAt}`
                    : ''}
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

      {editing && (
        <p className="text-center text-xs text-gray-600 pb-2">Hold grip to reorder · Chevron to minimize</p>
      )}

      {/* Morning / Nightly report */}
      {!editing && timeOfDay && (
        <div className="mb-1 mt-2">
          <DailyReport data={data} type={timeOfDay === 'morning' ? 'morning' : 'evening'} />
        </div>
      )}

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
            {order.map(id => (
              <SortableCard
                key={id}
                id={id}
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
