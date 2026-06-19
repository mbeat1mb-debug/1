import { useState, useEffect, useRef, useMemo } from 'react'
import { getAllTags, getEntryForDate, saveJournalEntry, analyzeTagCorrelation, addCustomTag, analyzeEnergyCorrelation, TIMING_SUBSTANCES, getTimingForDate, addTimingEntry, removeTimingEntry, getTagStreak, getRecentTagActivity, getDailyTimings, saveDailyTiming, getJournalEntries } from '../lib/storage'
import { getIllnessAlertAccuracy } from '../lib/alerts'
import { getBPReadings, saveBPReading, localToday } from '../lib/calculations'
import { haptic } from '../lib/haptics'

function today() {
  return localToday()
}

function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtTime(t) {
  return new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function minsToTime(mins) {
  return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function timeToMins(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const TIMED_ITEMS = [
  { id: 'sunlight',  label: 'First Sunlight', emoji: '☀️', minMins: 300,  maxMins: 720,  defaultMins: 420,  warnAfter: null,    warnMsg: null },
  { id: 'caffeine',  label: 'Last Caffeine',  emoji: '☕', minMins: 360,  maxMins: 1320, defaultMins: 480,  warnAfter: '14:00', warnMsg: 'Late caffeine delays sleep onset and reduces REM' },
  { id: 'sauna',     label: 'Sauna',          emoji: '🧖', minMins: 360,  maxMins: 1380, defaultMins: 1080, warnAfter: null,    warnMsg: null },
  { id: 'last_meal', label: 'Last Meal',      emoji: '🍽️', minMins: 600,  maxMins: 1380, defaultMins: 1140, warnAfter: '20:00', warnMsg: 'Late meals can reduce overnight HRV and recovery' },
]

function TimeSlider({ item, value, onToggle, onChange }) {
  const active = value !== null
  const mins = active ? timeToMins(value) : item.defaultMins
  const timeStr = fmtTime(minsToTime(mins))
  const isLate = active && item.warnAfter && value >= item.warnAfter

  return (
    <div className="py-2.5" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onToggle(item.id)}
            className="w-10 h-[22px] rounded-full flex items-center transition-colors duration-200 flex-shrink-0 px-0.5"
            style={{ background: active ? '#00c9a7' : '#2a2a2a', justifyContent: active ? 'flex-end' : 'flex-start' }}
          >
            <div className="w-[18px] h-[18px] rounded-full bg-white shadow" />
          </button>
          <span className="text-sm" style={{ color: active ? '#e5e5e5' : '#555' }}>{item.emoji} {item.label}</span>
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color: isLate ? '#f59e0b' : active ? '#00c9a7' : '#444' }}>
          {active ? timeStr : '--'}
        </span>
      </div>
      {active && (
        <>
          <input
            type="range"
            min={item.minMins}
            max={item.maxMins}
            step={15}
            value={mins}
            onChange={e => onChange(item.id, minsToTime(parseInt(e.target.value)))}
            className="w-full"
            style={{ accentColor: isLate ? '#f59e0b' : '#00c9a7', height: '4px' }}
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-gray-700">{fmtTime(minsToTime(item.minMins))}</span>
            <span className="text-[9px] text-gray-700">{fmtTime(minsToTime(item.maxMins))}</span>
          </div>
          {isLate && (
            <p className="text-[10px] mt-1 px-2 py-1 rounded-lg" style={{ color: '#f59e0b', background: '#f59e0b10' }}>
              ⚠️ {item.warnMsg}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function fmtSleep(mins) {
  if (!mins) return null
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  const sign = mins > 0 ? '+' : '-'
  return h > 0 ? `${sign}${h}h${m > 0 ? m + 'm' : ''}` : `${sign}${m}m`
}

function CategoryInsightCard({ category, filteredTags, correlations, healthHistory }) {
  const catCorrs = filteredTags.map(tag => ({
    tag,
    corr: correlations.find(c => c.tag.id === tag.id)?.corr ?? null,
  }))
  const withData = catCorrs.filter(x => x.corr)
  const building = catCorrs.filter(x => !x.corr)
  if (withData.length === 0 && healthHistory.length < 10) return null

  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #0d1218, #0a0f14)', border: '1px solid #1e2a38' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#4a9fd4' }}>
        {category.charAt(0).toUpperCase() + category.slice(1)} Insights
      </p>
      {withData.length > 0 ? (
        <div className="space-y-3">
          {withData.map(({ tag, corr }) => {
            const color = corr.diff > 0 ? '#00c9a7' : '#ef4444'
            const dir = corr.diff > 0 ? 'higher' : 'lower'
            return (
              <div key={tag.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-gray-300 flex-1">
                    When you log <span className="font-semibold text-white">{tag.emoji} {tag.label}</span>, recovery averages{' '}
                    <span className="font-bold" style={{ color }}>{Math.abs(corr.diff)}% {dir}</span>
                    <span className="text-gray-600"> ({corr.withAvg} vs {corr.withoutAvg})</span>
                  </p>
                  <span className="text-[10px] text-gray-600 flex-shrink-0 mt-0.5">{corr.sampleSize}d</span>
                </div>
                {(corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1) || (corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5) || (corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10) ? (
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1 && `HRV ${corr.hrvDiff > 0 ? '+' : ''}${corr.hrvDiff}ms`}
                    {corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5 && ` · RHR ${corr.rhrDiff > 0 ? '+' : ''}${corr.rhrDiff}bpm`}
                    {corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10 && ` · Sleep ${fmtSleep(corr.sleepDiff)}`}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-600">{10 - healthHistory.length} more days needed to unlock insights for this category.</p>
      )}
      {building.length > 0 && withData.length > 0 && (
        <p className="text-[10px] text-gray-700 mt-3 pt-3" style={{ borderTop: '1px solid #1a1a1a' }}>
          Still building: {building.map(x => `${x.tag.emoji} ${x.tag.label}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function ImpactBar({ diff, maxDiff = 30 }) {
  const pct = Math.min(100, (Math.abs(diff) / maxDiff) * 100)
  const color = diff > 0 ? '#00c9a7' : '#ef4444'
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-10 text-right" style={{ color }}>
        {diff > 0 ? '+' : ''}{diff}%
      </span>
    </div>
  )
}

function MetricChip({ label, value, unit, positive }) {
  if (value === null || value === undefined) return null
  const color = positive ? '#00c9a7' : '#ef4444'
  const sign = value > 0 ? '+' : ''
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: color + '15', color }}>
      {label} {sign}{value}{unit}
    </span>
  )
}

const CATEGORY_META = {
  all:       { emoji: '✦',  label: 'All' },
  longevity: { emoji: '🧬', label: 'Longevity' },
  intake:    { emoji: '🥩', label: 'Intake' },
  sleep:     { emoji: '😴', label: 'Sleep' },
  mental:    { emoji: '🧠', label: 'Mental' },
  activity:  { emoji: '🏃', label: 'Activity' },
  health:    { emoji: '❤️', label: 'Health' },
  recovery:  { emoji: '⚡', label: 'Recovery' },
  custom:    { emoji: '✨', label: 'Custom' },
}

function TagCard({ tag, selected, streak, onToggle }) {
  return (
    <button
      onClick={() => onToggle(tag.id)}
      className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl transition-all duration-200 relative"
      style={{
        background: selected
          ? 'linear-gradient(145deg, #00c9a714, #00c9a708)'
          : 'linear-gradient(145deg, #1c1c1c, #161616)',
        border: `1px solid ${selected ? '#00c9a745' : '#242424'}`,
        boxShadow: selected ? '0 0 18px #00c9a71a, inset 0 0 14px #00c9a706' : 'none',
        minHeight: 76,
      }}
    >
      <span className="text-2xl leading-none">{tag.emoji}</span>
      <span className="text-[10px] font-medium text-center leading-tight mt-0.5" style={{ color: selected ? '#00c9a7' : '#777' }}>
        {tag.label}
      </span>
      {streak >= 2 && (
        <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[18px] text-center leading-none" style={{ background: '#f59e0b', color: '#000' }}>
          {streak}
        </span>
      )}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#00c9a7' }}>
          <svg viewBox="0 0 10 10" fill="none" stroke="black" strokeWidth={2.5} className="w-2 h-2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 5l2.5 2.5 3.5-4" />
          </svg>
        </div>
      )}
    </button>
  )
}

const ENERGY_OPTIONS = [
  { n: 1, emoji: '😴', label: 'Drained',   color: '#ef4444' },
  { n: 2, emoji: '😕', label: 'Low',        color: '#f59e0b' },
  { n: 3, emoji: '😐', label: 'Okay',       color: '#888888' },
  { n: 4, emoji: '🙂', label: 'Good',       color: '#3b82f6' },
  { n: 5, emoji: '⚡', label: 'Energized',  color: '#00c9a7' },
]

export default function Journal({ data, onNav }) {
  const [selectedTags, setSelectedTags] = useState([])
  const [notes, setNotes] = useState('')
  const [energy, setEnergy] = useState(null)
  const [bpSys, setBpSys] = useState('')
  const [bpDia, setBpDia] = useState('')
  const [saved, setSaved] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [timingSubstance, setTimingSubstance] = useState('caffeine')
  const [timingTime, setTimingTime] = useState(nowTime)
  const [timingEntries, setTimingEntries] = useState([])
  const [sliderTimes, setSliderTimes] = useState(() => {
    const saved = getDailyTimings(today())
    const init = {}
    for (const item of TIMED_ITEMS) init[item.id] = saved[item.id] ?? null
    return init
  })
  const savedTimerRef = useRef(null)
  const tags = getAllTags()

  const categories = ['all', 'longevity', 'intake', 'sleep', 'mental', 'activity', 'health', 'recovery', 'custom']

  useEffect(() => {
    const entry = getEntryForDate(today())
    setSelectedTags(entry.tagIds || [])
    setNotes(entry.notes || '')
    setEnergy(entry.energy ?? null)
    const existing = getBPReadings().find(r => r.date === today())
    if (existing) { setBpSys(String(existing.sys)); setBpDia(String(existing.dia)) }
    setTimingEntries(getTimingForDate(today()))
  }, [])

  useEffect(() => () => clearTimeout(savedTimerRef.current), [])

  const toggle = (id) => {
    haptic('light')
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
    setSaved(false)
  }

  const save = () => {
    saveJournalEntry(today(), selectedTags, notes, energy)
    const sys = parseInt(bpSys, 10), dia = parseInt(bpDia, 10)
    if (sys >= 50 && sys <= 300 && dia >= 30 && dia <= 200) saveBPReading(today(), sys, dia)
    setSaved(true)
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  const handleAddTiming = () => {
    haptic('light')
    if (!timingTime) return
    addTimingEntry(today(), timingSubstance, timingTime)
    setTimingEntries(getTimingForDate(today()))
    setTimingTime(nowTime())
  }

  const handleSliderToggle = (id) => {
    haptic('light')
    const item = TIMED_ITEMS.find(i => i.id === id)
    if (sliderTimes[id] !== null) {
      saveDailyTiming(today(), id, null)
      setSliderTimes(prev => ({ ...prev, [id]: null }))
    } else {
      const defaultTime = minsToTime(item.defaultMins)
      saveDailyTiming(today(), id, defaultTime)
      setSliderTimes(prev => ({ ...prev, [id]: defaultTime }))
    }
  }

  const handleSliderChange = (id, time) => {
    saveDailyTiming(today(), id, time)
    setSliderTimes(prev => ({ ...prev, [id]: time }))
  }

  const handleRemoveTiming = (id) => {
    removeTimingEntry(id)
    setTimingEntries(getTimingForDate(today()))
  }

  const addTag = () => {
    if (!newTagLabel.trim()) return
    addCustomTag(newTagLabel.trim())
    setNewTagLabel('')
    setShowAdd(false)
  }

  // healthHistory includes hrv, rhr, sleep for multi-metric correlations
  const healthHistory = useMemo(() => (data.calendarDays || [])
    .filter(d => d.recovery != null)
    .map(d => ({
      date: d.date,
      recovery: d.recovery,
      hrv: d.hrv ?? null,
      rhr: d.rhr ?? null,
      sleep: d.sleep ?? null,
    })), [data.calendarDays])

  const filteredTags = activeCategory === 'all' ? tags : tags.filter(t => t.category === activeCategory)
  const energyCorrelation = analyzeEnergyCorrelation(healthHistory)
  const illnessAlertAccuracy = useMemo(() => getIllnessAlertAccuracy(getJournalEntries()), [saved])

  // Streaks — only compute for tags with >= 2 streak to avoid spam
  const streaks = useMemo(() => {
    const result = {}
    for (const tag of tags) {
      const s = getTagStreak(tag.id)
      if (s >= 2) result[tag.id] = s
    }
    return result
  }, [tags])

  // All tag correlations sorted by absolute impact
  const correlations = useMemo(() => {
    if (healthHistory.length < 10) return []
    return tags
      .map(tag => ({ tag, corr: analyzeTagCorrelation(tag.id, healthHistory) }))
      .filter(x => x.corr && Math.abs(x.corr.diff) >= 3)
      .sort((a, b) => Math.abs(b.corr.diff) - Math.abs(a.corr.diff))
      .slice(0, 12)
  }, [tags, healthHistory])

  const maxAbsDiff = useMemo(() => Math.max(15, ...correlations.map(x => Math.abs(x.corr.diff))), [correlations])

  // Per-selected-tag correlations (single compute shared by prediction + warning)
  const selectedTagCorrs = useMemo(() => {
    if (healthHistory.length < 7 || selectedTags.length === 0) return []
    return selectedTags.map(id => ({ id, corr: analyzeTagCorrelation(id, healthHistory) }))
  }, [selectedTags, healthHistory])

  // Predictive tomorrow: baseline avg + sum of today's tag impacts
  const predictedRecovery = useMemo(() => {
    if (selectedTagCorrs.length === 0) return null
    const recent = healthHistory.slice(-14)
    const baseline = Math.round(recent.reduce((a, b) => a + b.recovery, 0) / recent.length)
    const tagCorrs = selectedTagCorrs.map(x => x.corr).filter(c => c && Math.abs(c.diff) >= 5)
    if (tagCorrs.length === 0) return null
    const totalDiff = tagCorrs.reduce((sum, c) => sum + c.diff, 0)
    return { baseline, totalDiff, predicted: Math.max(0, Math.min(100, baseline + totalDiff)), tagCorrs }
  }, [selectedTagCorrs, healthHistory])

  // Compound warning: 2+ negative-correlation tags selected
  const negativeStackWarning = useMemo(() => {
    if (healthHistory.length < 10 || selectedTagCorrs.length === 0) return null
    const negCorrs = selectedTagCorrs.filter(x => x.corr && x.corr.diff <= -8)
    return negCorrs.length >= 2 ? negCorrs : null
  }, [selectedTagCorrs, healthHistory])

  // Selected tags with no correlation yet (logged <3 days)
  const buildingTagsToday = useMemo(() => {
    return selectedTagCorrs
      .filter(x => !x.corr)
      .map(x => tags.find(t => t.id === x.id))
      .filter(Boolean)
  }, [selectedTagCorrs, tags])

  // Recent 7-day behavior grid
  const recentActivity = useMemo(() => getRecentTagActivity(7), [])
  const recentRecovery = useMemo(() => {
    const map = {}
    for (const d of healthHistory) map[d.date] = d.recovery
    return map
  }, [healthHistory])

  // Top positive + negative tags for weekly grid legend
  const topTagsForGrid = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const day of recentActivity) {
      for (const id of day.tagIds) {
        if (!seen.has(id)) { seen.add(id); result.push(id) }
        if (result.length >= 8) break
      }
      if (result.length >= 8) break
    }
    return result
  }, [recentActivity])

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      {/* Header */}
      <div className="pt-2 flex items-center gap-3">
        {onNav && (
          <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="text-xl font-bold">Daily Journal</h1>
        </div>
      </div>

      {/* Predictive Tomorrow */}
      {predictedRecovery && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: `1px solid ${predictedRecovery.totalDiff >= 0 ? '#00c9a733' : '#ef444433'}` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#00c9a7' }}>Tomorrow's Outlook</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold" style={{ color: predictedRecovery.predicted >= 67 ? '#00c9a7' : predictedRecovery.predicted >= 34 ? '#f59e0b' : '#ef4444' }}>
                {predictedRecovery.predicted}%
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                baseline {predictedRecovery.baseline}% {predictedRecovery.totalDiff > 0 ? `+${predictedRecovery.totalDiff}` : predictedRecovery.totalDiff}% from today's log
              </p>
            </div>
            <div className="space-y-1">
              {predictedRecovery.tagCorrs.slice(0, 3).map(c => {
                const tag = tags.find(t => t.id === c.tagId)
                return tag ? (
                  <div key={c.tagId} className="flex items-center gap-1.5 justify-end">
                    <span className="text-[11px] text-gray-400">{tag.emoji} {tag.label}</span>
                    <span className="text-[11px] font-bold" style={{ color: c.diff > 0 ? '#00c9a7' : '#ef4444' }}>
                      {c.diff > 0 ? '+' : ''}{c.diff}%
                    </span>
                  </div>
                ) : null
              })}
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">Based on your last 14 days · personal data only</p>
        </div>
      )}

      {/* Compound stacking warning */}
      {negativeStackWarning && (
        <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{ background: '#ef444410', border: '1px solid #ef444433' }}>
          <span className="text-base mt-0.5">⚠️</span>
          <div>
            <p className="text-xs font-semibold text-red-400">Stacking effect detected</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {negativeStackWarning.map(x => tags.find(t => t.id === x.id)?.label).filter(Boolean).join(' + ')} together typically compound recovery impact. Expect lower HRV tomorrow.
            </p>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
        {categories.map(cat => {
          const meta = CATEGORY_META[cat] || { emoji: '', label: cat }
          const active = activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0"
              style={{
                background: active ? '#00c9a7' : 'linear-gradient(145deg, #1c1c1c, #161616)',
                color: active ? '#000' : '#666',
                border: `1px solid ${active ? '#00c9a7' : '#242424'}`,
                boxShadow: active ? '0 0 12px #00c9a740' : 'none',
              }}
            >
              <span className="text-sm leading-none">{meta.emoji}</span>
              <span>{meta.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tag grid */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#00c9a7' }}>What happened today?</p>

        {activeCategory === 'longevity' && (
          <div className="mb-3 p-3 rounded-xl space-y-1.5" style={{ background: '#0d1a14', border: '1px solid #00c9a722' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#00c9a7' }}>Evidence-backed longevity behaviors</p>
            {[
              ['🏋️', 'Strength 2×/wk',        '23% lower all-cause mortality',                            'Liu et al., BJSM 2019'],
              ['🚴', 'Zone 2 cardio',           '3–5× lower mortality: high vs low fitness',                'Mandsager et al., JAMA 2018'],
              ['🧖', 'Sauna 4×/wk',             '40% lower all-cause, 57% lower CVD mortality',            'Laukkanen et al., JAMA 2018'],
              ['🧊', 'Cold exposure',            'Reduces inflammation, improves autonomic tone',           'Tipton et al., 2017'],
              ['🥩', 'Protein ≥1.6 g/kg',       'Preserves muscle mass and prevents sarcopenia',           'Morton et al., BJSM 2018'],
              ['⏱️', 'Time-restricted eating',   'Improves metabolic markers and circadian alignment',      'Wilkinson et al., Cell Metab 2020'],
              ['☀️', 'Morning sunlight',         'Anchors circadian rhythm, improves sleep and mood',       'Panda, 2022'],
            ].map(([emoji, label, effect, source]) => (
              <div key={label} className="flex items-start gap-1.5">
                <span className="text-xs mt-0.5 flex-shrink-0">{emoji}</span>
                <p className="text-[10px] leading-relaxed">
                  <span className="text-gray-200 font-medium">{label} </span>
                  <span className="text-gray-500">— {effect} · <em>{source}</em></span>
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {filteredTags.map(tag => (
            <TagCard
              key={tag.id}
              tag={tag}
              selected={selectedTags.includes(tag.id)}
              streak={streaks[tag.id] || 0}
              onToggle={toggle}
            />
          ))}
          <button
            onClick={() => setShowAdd(true)}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl transition-all"
            style={{ background: 'linear-gradient(145deg, #1a1a1a, #141414)', border: '1px dashed #333', minHeight: 76 }}
          >
            <span className="text-2xl leading-none text-gray-600">+</span>
            <span className="text-[10px] text-gray-600 font-medium">Custom</span>
          </button>
        </div>
      </div>

      {/* Add custom tag */}
      {showAdd && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #00c9a733' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#00c9a7' }}>New Tag</p>
          <input
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00c9a7]"
            placeholder="Tag name (e.g. Cold plunge)"
            value={newTagLabel}
            onChange={e => setNewTagLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
          />
          <div className="flex gap-2">
            <button onClick={addTag} className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: '#00c9a7', color: '#000' }}>Add</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: '#1a1a1a', color: '#888', border: '1px solid #333' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Category insights — inline, sentence-style, WHOOP-phrasing */}
      {activeCategory !== 'all' && (
        <CategoryInsightCard
          category={activeCategory}
          filteredTags={filteredTags}
          correlations={correlations}
          healthHistory={healthHistory}
        />
      )}

      {/* Daily Timing */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#00c9a7' }}>Daily Timing</p>
        <p className="text-[10px] text-gray-600 mb-3">Toggle on, then drag to set time</p>
        {TIMED_ITEMS.map(item => (
          <TimeSlider
            key={item.id}
            item={item}
            value={sliderTimes[item.id]}
            onToggle={handleSliderToggle}
            onChange={handleSliderChange}
          />
        ))}
      </div>

      {/* Substance Log */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#00c9a7' }}>Substance Log</p>
        <div className="flex gap-2 mb-3">
          <select
            value={timingSubstance}
            onChange={e => setTimingSubstance(e.target.value)}
            className="flex-1 appearance-none bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7]"
            style={{ colorScheme: 'dark' }}
          >
            {TIMING_SUBSTANCES.map(s => (
              <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
            ))}
          </select>
          <input
            type="time"
            value={timingTime}
            onChange={e => setTimingTime(e.target.value)}
            className="w-28 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7]"
            style={{ colorScheme: 'dark' }}
          />
          <button
            onClick={handleAddTiming}
            className="px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a733' }}
          >
            Add
          </button>
        </div>
        {timingEntries.length > 0 ? (
          <div className="space-y-1.5">
            {timingEntries.map(entry => {
              const sub = TIMING_SUBSTANCES.find(s => s.id === entry.substance)
              const lateStim = ['caffeine', 'preworkout'].includes(entry.substance) && entry.time >= '14:00'
              const lateAlc = entry.substance === 'alcohol' && entry.time >= '19:00'
              return (
                <div key={entry.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
                  <div className="flex items-center gap-2">
                    <span>{sub?.emoji ?? '💊'}</span>
                    <span className="text-sm text-white">{sub?.label ?? entry.substance}</span>
                    <span className="text-sm text-gray-500">{fmtTime(entry.time)}</span>
                    {(lateStim || lateAlc) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#f59e0b20', color: '#f59e0b' }}>late</span>
                    )}
                  </div>
                  <button onClick={() => handleRemoveTiming(entry.id)} className="text-gray-600 pl-2 text-xl leading-none">×</button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Log what you took and when — timing effects show in Recovery insights.</p>
        )}
      </div>

      {/* Energy level */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#00c9a7' }}>Energy Level</p>
        <div className="flex gap-2">
          {ENERGY_OPTIONS.map(({ n, emoji, label, color }) => {
            const sel = energy === n
            return (
              <button
                key={n}
                onClick={() => { setEnergy(sel ? null : n); setSaved(false) }}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all duration-200"
                style={{
                  background: sel ? color + '18' : 'linear-gradient(145deg, #1c1c1c, #161616)',
                  border: `1px solid ${sel ? color + '55' : '#242424'}`,
                  boxShadow: sel ? `0 0 14px ${color}25` : 'none',
                }}
              >
                <span className="text-xl leading-none">{emoji}</span>
                <span className="text-[9px] font-semibold" style={{ color: sel ? color : '#444' }}>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Blood Pressure */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#00c9a7' }}>Blood Pressure <span className="normal-case font-normal" style={{ color: '#444' }}>(optional)</span></p>
        <div className="flex items-center gap-3">
          <input
            type="number" min={70} max={220}
            className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
            placeholder="120"
            value={bpSys}
            onChange={e => { setBpSys(e.target.value); setSaved(false) }}
          />
          <span className="text-gray-600 text-sm">/</span>
          <input
            type="number" min={40} max={140}
            className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
            placeholder="80"
            value={bpDia}
            onChange={e => { setBpDia(e.target.value); setSaved(false) }}
          />
          <span className="text-xs text-gray-600">mmHg</span>
          {bpSys && bpDia && (
            <span className="text-xs font-semibold" style={{
              color: parseInt(bpSys) >= 160 ? '#ef4444' : parseInt(bpSys) >= 140 ? '#f97316' : parseInt(bpSys) >= 130 ? '#f59e0b' : '#00c9a7'
            }}>
              {parseInt(bpSys) >= 160 ? 'Stage 2 HTN' : parseInt(bpSys) >= 140 ? 'Stage 1 HTN' : parseInt(bpSys) >= 130 ? 'Elevated' : parseInt(bpSys) < 120 ? 'Optimal' : 'Normal'}
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-600 mt-2">Saved readings build a rolling average used in your biological age.</p>
      </div>

      {/* Notes */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#00c9a7' }}>Notes</p>
        <textarea
          className="w-full bg-transparent text-sm text-white placeholder-gray-600 outline-none resize-none"
          rows={3}
          placeholder="Anything else to note about today..."
          value={notes}
          onChange={e => { setNotes(e.target.value); setSaved(false) }}
        />
      </div>

      {/* Save */}
      <button
        onClick={save}
        className="w-full py-4 rounded-2xl font-bold text-sm transition-all"
        style={{ background: saved ? '#00c9a7' : '#00c9a720', color: saved ? '#000' : '#00c9a7', border: '1px solid #00c9a7' }}
      >
        {saved ? '✓ Saved' : "Save Today's Log"}
      </button>

      {/* All-behavior insights — sentence format, ranked by impact */}
      {correlations.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#00c9a7' }}>What Moves Your Recovery</p>
          <p className="text-[10px] text-gray-600 mb-4">Ranked by impact · your data only · {healthHistory.length} days tracked</p>
          <div className="space-y-4">
            {correlations.map(({ tag, corr }) => {
              const color = corr.diff > 0 ? '#00c9a7' : '#ef4444'
              const dir = corr.diff > 0 ? 'higher' : 'lower'
              return (
                <div key={tag.id}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-xs text-gray-300 flex-1">
                      When you log <span className="font-semibold text-white">{tag.emoji} {tag.label}</span>, recovery averages{' '}
                      <span className="font-bold" style={{ color }}>{Math.abs(corr.diff)}% {dir}</span>
                      <span className="text-gray-600"> ({corr.withAvg} vs {corr.withoutAvg})</span>
                    </p>
                    <span className="text-[10px] text-gray-600 flex-shrink-0 mt-0.5">{corr.sampleSize}d</span>
                  </div>
                  <ImpactBar diff={corr.diff} maxDiff={maxAbsDiff} />
                  {((corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1) || (corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5) || (corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10)) && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1 && <MetricChip label="HRV" value={corr.hrvDiff} unit="ms" positive={corr.hrvDiff > 0} />}
                      {corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5 && <MetricChip label="RHR" value={corr.rhrDiff} unit="bpm" positive={corr.rhrDiff < 0} />}
                      {corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10 && <MetricChip label="Sleep" value={fmtSleep(corr.sleepDiff)} unit="" positive={corr.sleepDiff > 0} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-700 mt-4">Correlation, not causation · based on your personal history</p>
        </div>
      )}

      {/* Illness alert calibration — personal hit-rate of the proactive alert engine */}
      {illnessAlertAccuracy && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#00c9a7' }}>Alert Accuracy</p>
          <p className="text-[10px] text-gray-600 mb-3">Illness-signal alerts followed by a 🤒 Feeling Sick log within 3 days</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: illnessAlertAccuracy.rate >= 50 ? '#00c9a7' : '#f59e0b' }}>
              {illnessAlertAccuracy.rate}%
            </span>
            <span className="text-xs text-gray-600">{illnessAlertAccuracy.hits} of {illnessAlertAccuracy.total} alerts</span>
          </div>
        </div>
      )}

      {healthHistory.length < 30 && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#00c9a7' }}>Insights Calibrating</p>
            <span className="text-xs font-bold text-gray-400">{healthHistory.length}/30 days</span>
          </div>
          <div className="w-full h-1.5 rounded-full mb-2" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (healthHistory.length / 30) * 100)}%`, background: healthHistory.length >= 10 ? '#00c9a7' : '#f59e0b' }} />
          </div>
          <p className="text-xs text-gray-600">
            {healthHistory.length < 10
              ? `${10 - healthHistory.length} more days until first insights unlock`
              : healthHistory.length < 30
              ? `Insights active — reliability improves until 30 days`
              : null}
          </p>
        </div>
      )}

      {/* Building data — selected tags that don't have enough history yet */}
      {buildingTagsToday.length > 0 && healthHistory.length >= 10 && (
        <div className="rounded-2xl p-3" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Building data</p>
          <p className="text-xs text-gray-600">
            {buildingTagsToday.map(t => `${t.emoji} ${t.label}`).join(' · ')} — log a few more days to unlock impact
          </p>
        </div>
      )}

      {/* Your Week — 7-day behavior grid */}
      {recentActivity.some(d => d.tagIds.length > 0) && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#00c9a7' }}>Your Week</p>
          <div className="grid grid-cols-7 gap-1">
            {recentActivity.map((day, i) => {
              const rec = recentRecovery[day.date]
              const isToday = day.date === today()
              const dayLabel = i === 6 ? 'Today' : new Date(day.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
              return (
                <div key={day.date} className="flex flex-col items-center gap-1">
                  <p className="text-[9px] text-gray-600">{dayLabel}</p>
                  <div
                    className="w-full aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 overflow-hidden"
                    style={{ background: isToday ? '#00c9a710' : '#1a1a1a', border: `1px solid ${isToday ? '#00c9a733' : '#222'}` }}
                  >
                    {day.tagIds.slice(0, 3).map(id => {
                      const tag = tags.find(t => t.id === id)
                      return tag ? <span key={id} className="text-[10px] leading-none">{tag.emoji}</span> : null
                    })}
                    {day.tagIds.length === 0 && <span className="text-[10px] text-gray-700">—</span>}
                  </div>
                  {rec != null && (
                    <div
                      className="w-full h-1 rounded-full"
                      style={{ background: rec >= 67 ? '#00c9a7' : rec >= 34 ? '#f59e0b' : '#ef4444' }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">Bottom bar = recovery score · up to 3 behaviors shown per day</p>
        </div>
      )}

      {/* Energy vs Recovery */}
      {energyCorrelation && energyCorrelation.length >= 3 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#00c9a7' }}>Energy vs Recovery</p>
            <p className="text-xs text-gray-600 mt-1">How your self-rated energy relates to physiological recovery</p>
          </div>
          <div className="px-4 pb-4 flex items-end gap-2 mt-3 h-16">
            {energyCorrelation.map(e => {
              const h = Math.max(8, (e.avgRecovery / 100) * 48)
              const color = e.avgRecovery >= 67 ? '#00c9a7' : e.avgRecovery >= 34 ? '#f59e0b' : '#ef4444'
              return (
                <div key={e.energy} className="flex flex-col items-center flex-1">
                  <span className="text-[9px] text-gray-500 mb-1">{e.avgRecovery}%</span>
                  <div className="w-full rounded-sm" style={{ height: `${h}px`, background: color }} />
                  <span className="text-[10px] text-gray-600 mt-1">{e.energy}</span>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-600 px-4 pb-3">
            {energyCorrelation.length >= 2
              ? `Energy ${energyCorrelation[energyCorrelation.length - 1].avgRecovery > energyCorrelation[0].avgRecovery ? 'strongly tracks' : 'inversely tracks'} recovery in your data.`
              : 'Keep logging energy levels to see the pattern.'}
          </p>
        </div>
      )}
    </div>
  )
}
