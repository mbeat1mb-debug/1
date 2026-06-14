import { useState, useEffect, useRef } from 'react'
import { getAllTags, getEntryForDate, saveJournalEntry, analyzeTagCorrelation, addCustomTag, analyzeEnergyCorrelation, TIMING_SUBSTANCES, getTimingForDate, addTimingEntry, removeTimingEntry } from '../lib/storage'
import { getBPReadings, saveBPReading } from '../lib/calculations'

function today() {
  return new Date().toISOString().split('T')[0]
}

function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function TagButton({ tag, selected, onToggle }) {
  return (
    <button
      onClick={() => onToggle(tag.id)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
      style={{
        background: selected ? '#00c9a720' : '#1a1a1a',
        border: `1px solid ${selected ? '#00c9a7' : '#2a2a2a'}`,
        color: selected ? '#00c9a7' : '#888',
      }}
    >
      <span>{tag.emoji}</span>
      <span>{tag.label}</span>
    </button>
  )
}

function CorrelationBadge({ diff }) {
  if (diff === null || Math.abs(diff) < 5) return <span className="text-gray-600 text-xs">neutral</span>
  const color = diff > 0 ? '#00c9a7' : '#ef4444'
  return (
    <span className="text-xs font-bold" style={{ color }}>
      {diff > 0 ? '+' : ''}{diff}% recovery
    </span>
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

  // calendarDays pairs each date with its own recovery score; sleepHistory and
  // recoveryHistory are not index-aligned (different lengths/date sets), so joining
  // them by index attributes the wrong recovery to each day's correlations.
  const healthHistory = (data.calendarDays || [])
    .filter(d => d.recovery != null)
    .map(d => ({ date: d.date, recovery: d.recovery }))

  const filteredTags = activeCategory === 'all' ? tags : tags.filter(t => t.category === activeCategory)
  const energyCorrelation = analyzeEnergyCorrelation(healthHistory)

  const ENERGY_LABELS = ['', 'Drained', 'Low', 'Okay', 'Good', 'Energized']
  const ENERGY_COLORS = ['', '#ef4444', '#f59e0b', '#888', '#3b82f6', '#00c9a7']

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
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
            <TagButton key={tag.id} tag={tag} selected={selectedTags.includes(tag.id)} onToggle={toggle} />
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

      {/* Vitals — blood pressure */}
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

      {/* Substance & Timing Log */}
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
              const timeDisplay = new Date(`2000-01-01T${entry.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              return (
                <div key={entry.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: '#1a1a1a' }}>
                  <div className="flex items-center gap-2">
                    <span>{sub?.emoji ?? '💊'}</span>
                    <span className="text-sm text-white">{sub?.label ?? entry.substance}</span>
                    <span className="text-sm text-gray-500">{timeDisplay}</span>
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
          <p className="text-xs text-gray-600">Log what you took and when — next-day effects show in Recovery.</p>
        )}
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

      {/* Save button */}
      <button
        onClick={save}
        className="w-full py-4 rounded-2xl font-bold text-sm transition-all"
        style={{ background: saved ? '#00c9a7' : '#00c9a720', color: saved ? '#000' : '#00c9a7', border: `1px solid #00c9a7` }}
      >
        {saved ? '✓ Saved' : 'Save Today\'s Log'}
      </button>

      {/* Behavior correlations */}
      {healthHistory.length >= 10 && (() => {
        const correlations = tags
          .map(tag => ({ tag, corr: analyzeTagCorrelation(tag.id, healthHistory) }))
          .filter(x => x.corr)
          .sort((a, b) => Math.abs(b.corr.diff) - Math.abs(a.corr.diff))
          .slice(0, 8)
        return (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Behavior Insights</p>
              <p className="text-xs text-gray-600 mt-1">How your tags affect recovery (needs 3+ days with and without each tag)</p>
            </div>
            <div className="px-4 pb-4 space-y-3 mt-2">
              {correlations.map(({ tag, corr }) => (
                <div key={tag.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{tag.emoji} {tag.label}</span>
                  <CorrelationBadge diff={corr.diff} />
                </div>
              ))}
              {correlations.length === 0 && (
                <p className="text-sm text-gray-600">Keep logging — insights appear after 3+ days with each tag.</p>
              )}
            </div>
          </div>
        )
      })()}

      {/* Energy vs recovery correlation */}
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
          <p className="text-[11px] text-gray-600 px-4 pb-3">Higher energy ratings correlate with {energyCorrelation[energyCorrelation.length - 1].avgRecovery > energyCorrelation[0].avgRecovery ? 'higher' : 'lower'} recovery scores.</p>
        </div>
      )}
    </div>
  )
}
