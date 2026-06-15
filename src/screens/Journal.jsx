import { useState, useEffect, useRef, useMemo } from 'react'
import { getAllTags, getEntryForDate, saveJournalEntry, analyzeTagCorrelation, addCustomTag, analyzeEnergyCorrelation, TIMING_SUBSTANCES, getTimingForDate, addTimingEntry, removeTimingEntry, getTagStreak, getRecentTagActivity } from '../lib/storage'
import { getBPReadings, saveBPReading } from '../lib/calculations'

function today() {
  return new Date().toISOString().split('T')[0]
}

function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtTime(t) {
  return new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtSleep(mins) {
  if (!mins) return null
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  const sign = mins > 0 ? '+' : '-'
  return h > 0 ? `${sign}${h}h${m > 0 ? m + 'm' : ''}` : `${sign}${m}m`
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

function TagButton({ tag, selected, streak, onToggle }) {
  return (
    <button
      onClick={() => onToggle(tag.id)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 relative"
      style={{
        background: selected ? '#00c9a720' : '#1a1a1a',
        border: `1px solid ${selected ? '#00c9a7' : '#2a2a2a'}`,
        color: selected ? '#00c9a7' : '#888',
      }}
    >
      <span>{tag.emoji}</span>
      <span>{tag.label}</span>
      {streak >= 2 && (
        <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[18px] text-center leading-none" style={{ background: '#f59e0b', color: '#000' }}>
          {streak}
        </span>
      )}
    </button>
  )
}

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
  const savedTimerRef = useRef(null)
  const tags = getAllTags()

  const categories = ['all', 'intake', 'sleep', 'mental', 'activity', 'health', 'recovery', 'custom']

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
    if (!timingTime) return
    addTimingEntry(today(), timingSubstance, timingTime)
    setTimingEntries(getTimingForDate(today()))
    setTimingTime(nowTime())
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

  const ENERGY_LABELS = ['', 'Drained', 'Low', 'Okay', 'Good', 'Energized']
  const ENERGY_COLORS = ['', '#ef4444', '#f59e0b', '#888', '#3b82f6', '#00c9a7']

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
        <div className="rounded-2xl p-4" style={{ background: '#111', border: `1px solid ${predictedRecovery.totalDiff >= 0 ? '#00c9a733' : '#ef444433'}` }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Tomorrow's Outlook</p>
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
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
            style={{
              background: activeCategory === cat ? '#00c9a7' : '#1a1a1a',
              color: activeCategory === cat ? '#000' : '#888',
              border: '1px solid',
              borderColor: activeCategory === cat ? '#00c9a7' : '#2a2a2a',
            }}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Tag grid */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">What happened today?</p>
        <div className="flex flex-wrap gap-2">
          {filteredTags.map(tag => (
            <TagButton
              key={tag.id}
              tag={tag}
              selected={selectedTags.includes(tag.id)}
              streak={streaks[tag.id] || 0}
              onToggle={toggle}
            />
          ))}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-gray-600 transition-all"
            style={{ background: '#1a1a1a', border: '1px dashed #333' }}
          >
            <span>+</span> Custom
          </button>
        </div>
      </div>

      {/* Add custom tag */}
      {showAdd && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #00c9a733' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">New Tag</p>
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

      {/* Substance Log */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Substance Log</p>
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
                <div key={entry.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: '#1a1a1a' }}>
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
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Energy Level</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => { setEnergy(energy === n ? null : n); setSaved(false) }}
              className="flex-1 py-3 rounded-xl text-base font-bold transition-all"
              style={{
                background: energy === n ? ENERGY_COLORS[n] + '20' : '#1a1a1a',
                border: `1px solid ${energy === n ? ENERGY_COLORS[n] : '#2a2a2a'}`,
                color: energy === n ? ENERGY_COLORS[n] : '#555',
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1.5 px-1">
          <span>Drained</span>
          {energy !== null && <span style={{ color: ENERGY_COLORS[energy] }}>{ENERGY_LABELS[energy]}</span>}
          <span>Energized</span>
        </div>
      </div>

      {/* Blood Pressure */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Blood Pressure <span className="normal-case font-normal text-gray-600">(optional)</span></p>
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
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
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

      {/* Behavior Insights — enhanced visual correlations */}
      {correlations.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="px-4 pt-4 pb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Behavior Impact</p>
            <p className="text-xs text-gray-600 mt-1">Your personal data — how each behavior affects next-day recovery, HRV, and sleep</p>
          </div>
          <div className="px-4 pb-4 space-y-4">
            {correlations.map(({ tag, corr }) => (
              <div key={tag.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm">{tag.emoji}</span>
                  <span className="text-sm text-gray-200 flex-1">{tag.label}</span>
                  <span className="text-[10px] text-gray-600">{corr.sampleSize} days</span>
                </div>
                <ImpactBar diff={corr.diff} maxDiff={maxAbsDiff} />
                {(corr.hrvDiff !== null || corr.rhrDiff !== null || corr.sleepDiff !== null) && (
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1 && (
                      <MetricChip label="HRV" value={corr.hrvDiff} unit="ms" positive={corr.hrvDiff > 0} />
                    )}
                    {corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5 && (
                      <MetricChip label="RHR" value={corr.rhrDiff} unit="bpm" positive={corr.rhrDiff < 0} />
                    )}
                    {corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10 && (
                      <MetricChip label="Sleep" value={fmtSleep(corr.sleepDiff)} unit="" positive={corr.sleepDiff > 0} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 px-4 pb-3">Correlations from your history only · not medical advice · needs 10+ logged days</p>
        </div>
      )}

      {healthHistory.length >= 3 && healthHistory.length < 10 && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Behavior Impact</p>
          <p className="text-sm text-gray-600">{10 - healthHistory.length} more days of data needed to unlock behavior correlations.</p>
        </div>
      )}

      {/* Your Week — 7-day behavior grid */}
      {recentActivity.some(d => d.tagIds.length > 0) && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Your Week</p>
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
        <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Energy vs Recovery</p>
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
