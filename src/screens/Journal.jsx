import { useState, useEffect } from 'react'
import { getAllTags, getEntryForDate, saveJournalEntry, analyzeTagCorrelation, addCustomTag, analyzeEnergyCorrelation } from '../lib/storage'

function today() {
  return new Date().toISOString().split('T')[0]
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

export default function Journal({ data }) {
  const [selectedTags, setSelectedTags] = useState([])
  const [notes, setNotes] = useState('')
  const [energy, setEnergy] = useState(null)
  const [saved, setSaved] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const tags = getAllTags()

  const categories = ['all', 'intake', 'sleep', 'mental', 'activity', 'health', 'recovery', 'custom']

  useEffect(() => {
    const entry = getEntryForDate(today())
    setSelectedTags(entry.tagIds || [])
    setNotes(entry.notes || '')
    setEnergy(entry.energy ?? null)
  }, [])

  const toggle = (id) => {
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
    setSaved(false)
  }

  const save = () => {
    saveJournalEntry(today(), selectedTags, notes, energy)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addTag = () => {
    if (!newTagLabel.trim()) return
    addCustomTag(newTagLabel.trim())
    setNewTagLabel('')
    setShowAdd(false)
  }

  const healthHistory = data.sleepHistory?.map((s, i) => ({
    date: s.date,
    recovery: data.recoveryHistory?.[i] ?? 50,
  })) || []

  const filteredTags = activeCategory === 'all' ? tags : tags.filter(t => t.category === activeCategory)
  const energyCorrelation = analyzeEnergyCorrelation(healthHistory)

  const ENERGY_LABELS = ['', 'Drained', 'Low', 'Okay', 'Good', 'Energized']
  const ENERGY_COLORS = ['', '#ef4444', '#f59e0b', '#888', '#3b82f6', '#00c9a7']

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2">
        <p className="text-gray-500 text-xs uppercase tracking-wider">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>
        <h1 className="text-xl font-bold">Daily Journal</h1>
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
