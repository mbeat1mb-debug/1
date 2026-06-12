import { useState, useCallback } from 'react'
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
import { getRecoveryColor, getRecoveryLabel, getStressColor, getStressLabel } from '../lib/calculations'
import { getHomeLayout, saveHomeLayout, SECTION_META } from '../lib/layout'

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
  const { recoveryScore = 0, todayHRV = 0, todayRHR = 0, todaySleep, todaySpO2 = 0 } = data
  const color = getRecoveryColor(recoveryScore)
  const label = getRecoveryLabel(recoveryScore)
  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recovery</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: color + '22', color }}>{label}</span>
      </div>
      <div className="flex items-center gap-5">
        <ScoreRing score={recoveryScore} color={color} size={120} strokeWidth={10} />
        <div className="flex-1 space-y-3">
          <Pill label="HRV" value={todayHRV} unit="ms" />
          <Pill label="Resting HR" value={todayRHR} unit="bpm" />
          <Pill label="Sleep" value={sleepHours} />
          <Pill label="SpO₂" value={todaySpO2} unit="%" />
        </div>
      </div>
    </>
  )
}

function StrainContent({ data }) {
  const { strainScore = 0, calories = 0, activeMinutes = 0, steps = 0 } = data
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Strain</span>
        <span className="text-xs text-gray-500">0 – 21</span>
      </div>
      <div className="flex items-center gap-5">
        <ScoreRing score={strainScore} max={21} color="#3b82f6" size={100} strokeWidth={9} />
        <div className="flex-1 space-y-3">
          <Pill label="Calories" value={calories.toLocaleString()} unit="kcal" />
          <Pill label="Active" value={activeMinutes} unit="min" />
          <Pill label="Steps" value={steps.toLocaleString()} />
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
  const { stressScore = 0 } = data
  const color = getStressColor(stressScore)
  const label = getStressLabel(stressScore)
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Stress Monitor</span>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-3xl font-bold" style={{ color }}>{stressScore}</span>
          <span className="text-sm font-bold" style={{ color }}>{label}</span>
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

function JournalContent() {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-sm">Log today's behaviors</span>
      <span className="text-xl text-gray-500">＋</span>
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
  journal: JournalContent,
}

// ── Sortable card ────────────────────────────────────────────────────────────

function SortableCard({ id, editing, onNav, data }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const Content = SECTION_CONTENT[id]

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
      <div className="flex items-stretch rounded-2xl overflow-hidden" style={cardStyle}>
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
          className="flex-1 p-4 text-left transition-opacity active:opacity-70"
          style={{ cursor: editing ? 'default' : 'pointer' }}
        >
          <Content data={data} />
        </button>
      </div>
    </div>
  )
}

// ── Home screen ──────────────────────────────────────────────────────────────

export default function Home({ data, onNav, onRefresh, isSyncing, syncFailed, lastSyncedAt }) {
  const [order, setOrder] = useState(getHomeLayout)
  const [editing, setEditing] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const timeOfDay = getTimeOfDay()

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

  const finishEditing = () => setEditing(false)

  const ActiveContent = activeId ? SECTION_CONTENT[activeId] : null

  return (
    <div className="pt-safe pb-28">
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
          <button onClick={() => onNav('settings')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Edit mode hint */}
      {editing && (
        <p className="text-center text-xs text-gray-600 pb-2">Hold the grip handle and drag to reorder</p>
      )}

      {/* Morning / Nightly report — auto-shown by time of day */}
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
              <SortableCard key={id} id={id} editing={editing} onNav={onNav} data={data} />
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay — renders a ghost while dragging */}
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
