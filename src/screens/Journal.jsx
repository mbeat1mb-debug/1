import { useState, useEffect, useRef, useMemo } from 'react'
import { getAllTags, getEntryForDate, saveJournalEntry, analyzeTagCorrelation, addCustomTag, analyzeEnergyCorrelation, TIMING_SUBSTANCES, getTimingForDate, addTimingEntry, removeTimingEntry, getTagStreak, getRecentTagActivity, getDailyTimings, saveDailyTiming, getJournalEntries } from '../lib/storage'
import { getIllnessAlertAccuracy } from '../lib/alerts'
import { getBPReadings, saveBPReading, localToday } from '../lib/calculations'
import { haptic } from '../lib/haptics'
import { C, SERIF, Label, BackLink, SectionLabel, Note } from '../lib/almanacTheme'

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
  { id: 'sunlight',  label: 'First Sunlight', minMins: 300,  maxMins: 720,  defaultMins: 420,  warnAfter: null,    warnMsg: null },
  { id: 'caffeine',  label: 'Last Caffeine',  minMins: 360,  maxMins: 1320, defaultMins: 480,  warnAfter: '14:00', warnMsg: 'Late caffeine delays sleep onset and reduces REM' },
  { id: 'sauna',     label: 'Sauna',          minMins: 360,  maxMins: 1380, defaultMins: 1080, warnAfter: null,    warnMsg: null },
  { id: 'last_meal', label: 'Last Meal',      minMins: 600,  maxMins: 1380, defaultMins: 1140, warnAfter: '20:00', warnMsg: 'Late meals can reduce overnight HRV and recovery' },
]

function TimeSlider({ item, value, onToggle, onChange }) {
  const active = value !== null
  const mins = active ? timeToMins(value) : item.defaultMins
  const timeStr = fmtTime(minsToTime(mins))
  const isLate = active && item.warnAfter && value >= item.warnAfter

  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onToggle(item.id)}
            className="w-9 h-5 flex items-center transition-colors duration-200 flex-shrink-0 px-0.5"
            style={{ border: `1px solid ${active ? C.ink : C.rule}`, background: active ? C.ink : 'transparent', justifyContent: active ? 'flex-end' : 'flex-start' }}
          >
            <div className="w-3 h-3" style={{ background: active ? C.paper : C.faint }} />
          </button>
          <span style={{ fontFamily: SERIF, fontSize: 15, color: active ? C.ink : C.faint }}>{item.label}</span>
        </div>
        <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: isLate ? C.gold : active ? C.ink : C.faint }} className="tabular">
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
            style={{ accentColor: isLate ? C.gold : C.ink, height: '4px' }}
          />
          <div className="flex justify-between mt-0.5">
            <span style={{ fontFamily: SERIF, fontSize: 10, color: C.faint }}>{fmtTime(minsToTime(item.minMins))}</span>
            <span style={{ fontFamily: SERIF, fontSize: 10, color: C.faint }}>{fmtTime(minsToTime(item.maxMins))}</span>
          </div>
          {isLate && (
            <p style={{ fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: C.gold, marginTop: 6 }}>
              {item.warnMsg}
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
    <div className="pt-5">
      <Label style={{ color: C.inkSoft }}>{category.charAt(0).toUpperCase() + category.slice(1)} Insights</Label>
      {withData.length > 0 ? (
        <div className="mt-3 space-y-4">
          {withData.map(({ tag, corr }) => {
            const color = corr.diff > 0 ? C.ink : C.gold
            const dir = corr.diff > 0 ? 'higher' : 'lower'
            return (
              <div key={tag.id}>
                <div className="flex items-start justify-between gap-2">
                  <p style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft, flex: 1 }}>
                    When you log <span style={{ color: C.ink, fontWeight: 600 }}>{tag.emoji} {tag.label}</span>, recovery averages{' '}
                    <span style={{ color, fontWeight: 700 }}>{Math.abs(corr.diff)}% {dir}</span>
                    <span style={{ color: C.faint }}> ({corr.withAvg} vs {corr.withoutAvg})</span>
                  </p>
                  <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, flexShrink: 0, marginTop: 2 }}>{corr.sampleSize}d</span>
                </div>
                {(corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1) || (corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5) || (corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10) ? (
                  <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 2 }}>
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
        <p style={{ fontFamily: SERIF, fontSize: 13, color: C.faint, marginTop: 8 }}>{10 - healthHistory.length} more days needed to unlock insights for this category.</p>
      )}
      {building.length > 0 && withData.length > 0 && (
        <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.ruleSoft}` }}>
          Still building: {building.map(x => `${x.tag.emoji} ${x.tag.label}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function ImpactBar({ diff, maxDiff = 30 }) {
  const pct = Math.min(100, (Math.abs(diff) / maxDiff) * 100)
  const color = diff > 0 ? C.ink : C.gold
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1" style={{ height: 3, background: C.ruleSoft }}>
        <div style={{ height: 3, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 700, color, width: 40, textAlign: 'right' }}>
        {diff > 0 ? '+' : ''}{diff}%
      </span>
    </div>
  )
}

function MetricChip({ label, value, unit, positive }) {
  if (value === null || value === undefined) return null
  const color = positive ? C.ink : C.gold
  const sign = value > 0 ? '+' : ''
  return (
    <span style={{ fontFamily: SERIF, fontSize: 11, color, borderBottom: `1px solid ${color}55` }}>
      {label} {sign}{value}{unit}
    </span>
  )
}

const CATEGORY_META = {
  all:       { label: 'All' },
  longevity: { label: 'Longevity' },
  intake:    { label: 'Intake' },
  sleep:     { label: 'Sleep' },
  mental:    { label: 'Mental' },
  activity:  { label: 'Activity' },
  health:    { label: 'Health' },
  recovery:  { label: 'Recovery' },
  custom:    { label: 'Custom' },
}

function TagCard({ tag, selected, streak, onToggle }) {
  return (
    <button
      onClick={() => onToggle(tag.id)}
      className="flex flex-col items-center justify-center gap-1 py-3 relative transition-colors"
      style={{
        border: `1px solid ${selected ? C.ink : C.ruleSoft}`,
        background: selected ? `${C.ink}08` : 'transparent',
        minHeight: 72,
      }}
    >
      <span className="text-xl leading-none">{tag.emoji}</span>
      <span style={{ fontFamily: SERIF, fontSize: 11, color: selected ? C.ink : C.inkSoft, textAlign: 'center', lineHeight: 1.2, marginTop: 2 }}>
        {tag.label}
      </span>
      {streak >= 2 && (
        <span className="absolute -top-2 -right-2 flex items-center justify-center" style={{
          fontFamily: SERIF, fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, padding: '0 4px',
          color: C.paper, background: C.gold, borderRadius: '50%',
        }}>
          {streak}
        </span>
      )}
      {selected && (
        <span style={{ position: 'absolute', top: 4, right: 6, fontFamily: SERIF, fontSize: 12, color: C.ink }}>✓</span>
      )}
    </button>
  )
}

const ENERGY_OPTIONS = [
  { n: 1, label: 'Drained' },
  { n: 2, label: 'Low' },
  { n: 3, label: 'Okay' },
  { n: 4, label: 'Good' },
  { n: 5, label: 'Energized' },
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

  const inputStyle = {
    fontFamily: SERIF, fontSize: 15, color: C.ink, background: 'transparent',
    border: 'none', borderBottom: `1px solid ${C.rule}`, outline: 'none', borderRadius: 0,
  }

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <div className="flex items-baseline justify-between">
          <Label style={{ color: C.inkSoft }}>JOURNAL</Label>
          <Label style={{ fontSize: 11 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Label>
        </div>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Today's log</h1>

      {/* Predictive Tomorrow */}
      {predictedRecovery && (
        <div className="mt-9">
          <SectionLabel>Tomorrow's Outlook</SectionLabel>
          <div className="flex items-center justify-between mt-3">
            <div>
              <p style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: C.ink }} className="tabular">
                {predictedRecovery.predicted}%
              </p>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 2 }}>
                baseline {predictedRecovery.baseline}% {predictedRecovery.totalDiff > 0 ? `+${predictedRecovery.totalDiff}` : predictedRecovery.totalDiff}% from today's log
              </p>
            </div>
            <div className="space-y-1">
              {predictedRecovery.tagCorrs.slice(0, 3).map(c => {
                const tag = tags.find(t => t.id === c.tagId)
                return tag ? (
                  <div key={c.tagId} className="flex items-center gap-1.5 justify-end">
                    <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{tag.emoji} {tag.label}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 700, color: c.diff > 0 ? C.ink : C.gold }}>
                      {c.diff > 0 ? '+' : ''}{c.diff}%
                    </span>
                  </div>
                ) : null
              })}
            </div>
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Based on your last 14 days · personal data only</p>
        </div>
      )}

      {/* Compound stacking warning */}
      {negativeStackWarning && (
        <div className="mt-7">
          <Note accent={C.gold}>
            <span style={{ fontWeight: 700, color: C.ink }}>Stacking effect detected.</span>{' '}
            {negativeStackWarning.map(x => tags.find(t => t.id === x.id)?.label).filter(Boolean).join(' + ')} together typically compound recovery impact. Expect lower HRV tomorrow.
          </Note>
        </div>
      )}

      {/* Category filter */}
      <div className="mt-7 flex gap-4 overflow-x-auto pb-1" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
        {categories.map(cat => {
          const meta = CATEGORY_META[cat] || { label: cat }
          const active = activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="whitespace-nowrap pb-2 flex-shrink-0"
              style={{ borderBottom: active ? `2px solid ${C.ink}` : '2px solid transparent', marginBottom: -1 }}
            >
              <Label style={{ color: active ? C.ink : C.faint }}>{meta.label}</Label>
            </button>
          )
        })}
      </div>

      {/* Tag grid */}
      <div className="mt-7">
        <SectionLabel>What happened today?</SectionLabel>

        {activeCategory === 'longevity' && (
          <div className="mt-3 mb-4" style={{ borderLeft: `2px solid ${C.gold}`, paddingLeft: 14 }}>
            <Label style={{ color: C.faint }}>Evidence-backed longevity behaviors</Label>
            <div className="mt-2 space-y-1.5">
              {[
                ['Strength 2×/wk',        '23% lower all-cause mortality',                            'Liu et al., BJSM 2019'],
                ['Zone 2 cardio',           '3–5× lower mortality: high vs low fitness',                'Mandsager et al., JAMA 2018'],
                ['Sauna 4×/wk',             '40% lower all-cause, 57% lower CVD mortality',            'Laukkanen et al., JAMA 2018'],
                ['Cold exposure',            'Reduces inflammation, improves autonomic tone',           'Tipton et al., 2017'],
                ['Protein ≥1.6 g/kg',       'Preserves muscle mass and prevents sarcopenia',           'Morton et al., BJSM 2018'],
                ['Time-restricted eating',   'Improves metabolic markers and circadian alignment',      'Wilkinson et al., Cell Metab 2020'],
                ['Morning sunlight',         'Anchors circadian rhythm, improves sleep and mood',       'Panda, 2022'],
              ].map(([label, effect, source]) => (
                <p key={label} style={{ fontFamily: SERIF, fontSize: 12, lineHeight: 1.5, color: C.inkSoft }}>
                  <span style={{ color: C.ink, fontWeight: 600 }}>{label} </span>
                  <span style={{ color: C.faint }}>— {effect} · <em>{source}</em></span>
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mt-3">
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
            className="flex flex-col items-center justify-center gap-1 py-3"
            style={{ border: `1px dashed ${C.rule}`, minHeight: 72 }}
          >
            <span style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1, color: C.faint }}>+</span>
            <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>Custom</span>
          </button>
        </div>
      </div>

      {/* Add custom tag */}
      {showAdd && (
        <div className="mt-5" style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
          <Label style={{ color: C.inkSoft }}>New Tag</Label>
          <input
            className="w-full mt-3 py-2"
            style={inputStyle}
            placeholder="Tag name (e.g. Cold plunge)"
            value={newTagLabel}
            onChange={e => setNewTagLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
          />
          <div className="flex gap-4 mt-3">
            <button onClick={addTag} style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 600, color: C.ink, borderBottom: `1px solid ${C.ink}` }}>Add</button>
            <button onClick={() => setShowAdd(false)} style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Category insights — inline, sentence-style */}
      {activeCategory !== 'all' && (
        <CategoryInsightCard
          category={activeCategory}
          filteredTags={filteredTags}
          correlations={correlations}
          healthHistory={healthHistory}
        />
      )}

      {/* Daily Timing */}
      <div className="mt-9">
        <SectionLabel right="toggle, then drag">Daily Timing</SectionLabel>
        <div className="mt-1">
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
      </div>

      {/* Substance Log */}
      <div className="mt-9">
        <SectionLabel>Substance Log</SectionLabel>
        <div className="flex gap-2 mt-4 items-end">
          <select
            value={timingSubstance}
            onChange={e => setTimingSubstance(e.target.value)}
            className="flex-1 py-2"
            style={{ ...inputStyle, colorScheme: 'light' }}
          >
            {TIMING_SUBSTANCES.map(s => (
              <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
            ))}
          </select>
          <input
            type="time"
            value={timingTime}
            onChange={e => setTimingTime(e.target.value)}
            className="w-28 py-2"
            style={{ ...inputStyle, colorScheme: 'light' }}
          />
          <button
            onClick={handleAddTiming}
            style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 600, color: C.ink, borderBottom: `1px solid ${C.ink}`, paddingBottom: 9 }}
          >
            Add
          </button>
        </div>
        {timingEntries.length > 0 ? (
          <div className="mt-4">
            {timingEntries.map(entry => {
              const sub = TIMING_SUBSTANCES.find(s => s.id === entry.substance)
              const lateStim = ['caffeine', 'preworkout'].includes(entry.substance) && entry.time >= '14:00'
              const lateAlc = entry.substance === 'alcohol' && entry.time >= '19:00'
              return (
                <div key={entry.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
                  <div className="flex items-center gap-2">
                    <span>{sub?.emoji ?? '·'}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 14, color: C.ink }}>{sub?.label ?? entry.substance}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{fmtTime(entry.time)}</span>
                    {(lateStim || lateAlc) && (
                      <span style={{ fontFamily: SERIF, fontSize: 11, color: C.gold, fontStyle: 'italic' }}>late</span>
                    )}
                  </div>
                  <button onClick={() => handleRemoveTiming(entry.id)} style={{ color: C.faint, fontSize: 18, lineHeight: 1, paddingLeft: 8 }}>×</button>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={{ fontFamily: SERIF, fontSize: 13, color: C.faint, marginTop: 12 }}>Log what you took and when — timing effects show in Recovery insights.</p>
        )}
      </div>

      {/* Energy level */}
      <div className="mt-9">
        <SectionLabel>Energy Level</SectionLabel>
        <div className="flex gap-2 mt-4">
          {ENERGY_OPTIONS.map(({ n, label }) => {
            const sel = energy === n
            return (
              <button
                key={n}
                onClick={() => { setEnergy(sel ? null : n); setSaved(false) }}
                className="flex-1 flex flex-col items-center gap-1 py-3"
                style={{ border: `1px solid ${sel ? C.ink : C.ruleSoft}`, background: sel ? `${C.ink}08` : 'transparent' }}
              >
                <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: sel ? C.ink : C.faint }}>{n}</span>
                <span style={{ fontFamily: SERIF, fontSize: 10, color: sel ? C.ink : C.faint }}>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Blood Pressure */}
      <div className="mt-9">
        <SectionLabel right="optional">Blood Pressure</SectionLabel>
        <div className="flex items-center gap-3 mt-4">
          <input
            type="number" min={70} max={220}
            className="w-20 py-2 text-center"
            style={inputStyle}
            placeholder="120"
            value={bpSys}
            onChange={e => { setBpSys(e.target.value); setSaved(false) }}
          />
          <span style={{ fontFamily: SERIF, fontSize: 15, color: C.faint }}>/</span>
          <input
            type="number" min={40} max={140}
            className="w-20 py-2 text-center"
            style={inputStyle}
            placeholder="80"
            value={bpDia}
            onChange={e => { setBpDia(e.target.value); setSaved(false) }}
          />
          <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>mmHg</span>
          {bpSys && bpDia && (
            <span style={{
              fontFamily: SERIF, fontSize: 12, fontWeight: 600,
              color: parseInt(bpSys) >= 160 ? '#B5482E' : parseInt(bpSys) >= 140 ? '#C07A2E' : parseInt(bpSys) >= 130 ? C.gold : C.ink
            }}>
              {parseInt(bpSys) >= 160 ? 'Stage 2 HTN' : parseInt(bpSys) >= 140 ? 'Stage 1 HTN' : parseInt(bpSys) >= 130 ? 'Elevated' : parseInt(bpSys) < 120 ? 'Optimal' : 'Normal'}
            </span>
          )}
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Saved readings build a rolling average used in your biological age.</p>
      </div>

      {/* Notes */}
      <div className="mt-9">
        <SectionLabel>Notes</SectionLabel>
        <textarea
          className="w-full mt-4 bg-transparent resize-none outline-none"
          style={{ fontFamily: SERIF, fontSize: 15, color: C.ink, border: 'none' }}
          rows={3}
          placeholder="Anything else to note about today..."
          value={notes}
          onChange={e => { setNotes(e.target.value); setSaved(false) }}
        />
      </div>

      {/* Save */}
      <button
        onClick={save}
        className="w-full mt-9 py-4"
        style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 700, color: saved ? C.paper : C.ink, background: saved ? C.ink : 'transparent', border: `1px solid ${C.ink}` }}
      >
        {saved ? 'Saved' : "Save Today's Log"}
      </button>

      {/* All-behavior insights — sentence format, ranked by impact */}
      {correlations.length > 0 && (
        <div className="mt-9">
          <SectionLabel right={`${healthHistory.length}d tracked`}>What Moves Your Recovery</SectionLabel>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Ranked by impact · your data only</p>
          <div className="mt-4 space-y-4">
            {correlations.map(({ tag, corr }) => {
              const color = corr.diff > 0 ? C.ink : C.gold
              const dir = corr.diff > 0 ? 'higher' : 'lower'
              return (
                <div key={tag.id}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft, flex: 1 }}>
                      When you log <span style={{ color: C.ink, fontWeight: 600 }}>{tag.emoji} {tag.label}</span>, recovery averages{' '}
                      <span style={{ color, fontWeight: 700 }}>{Math.abs(corr.diff)}% {dir}</span>
                      <span style={{ color: C.faint }}> ({corr.withAvg} vs {corr.withoutAvg})</span>
                    </p>
                    <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, flexShrink: 0, marginTop: 2 }}>{corr.sampleSize}d</span>
                  </div>
                  <ImpactBar diff={corr.diff} maxDiff={maxAbsDiff} />
                  {((corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1) || (corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5) || (corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10)) && (
                    <div className="flex gap-3 mt-1.5 flex-wrap">
                      {corr.hrvDiff !== null && Math.abs(corr.hrvDiff) >= 1 && <MetricChip label="HRV" value={corr.hrvDiff} unit="ms" positive={corr.hrvDiff > 0} />}
                      {corr.rhrDiff !== null && Math.abs(corr.rhrDiff) >= 0.5 && <MetricChip label="RHR" value={corr.rhrDiff} unit="bpm" positive={corr.rhrDiff < 0} />}
                      {corr.sleepDiff !== null && Math.abs(corr.sleepDiff) >= 10 && <MetricChip label="Sleep" value={fmtSleep(corr.sleepDiff)} unit="" positive={corr.sleepDiff > 0} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 16, fontStyle: 'italic' }}>Correlation, not causation · based on your personal history</p>
        </div>
      )}

      {/* Illness alert calibration — personal hit-rate of the proactive alert engine */}
      {illnessAlertAccuracy && (
        <div className="mt-9">
          <SectionLabel>Alert Accuracy</SectionLabel>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Illness-signal alerts followed by a Feeling Sick log within 3 days</p>
          <div className="flex items-baseline gap-2 mt-3">
            <span style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: illnessAlertAccuracy.rate >= 50 ? C.ink : C.gold }}>
              {illnessAlertAccuracy.rate}%
            </span>
            <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{illnessAlertAccuracy.hits} of {illnessAlertAccuracy.total} alerts</span>
          </div>
        </div>
      )}

      {healthHistory.length < 30 && (
        <div className="mt-9">
          <div className="flex items-center justify-between">
            <SectionLabel style={{ flex: 1, marginRight: 12 }}>Insights Calibrating</SectionLabel>
          </div>
          <div className="flex items-baseline justify-between mt-3">
            <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{healthHistory.length}/30 days</span>
          </div>
          <div style={{ height: 3, marginTop: 6, background: C.ruleSoft }}>
            <div style={{ height: 3, width: `${Math.min(100, (healthHistory.length / 30) * 100)}%`, background: healthHistory.length >= 10 ? C.ink : C.gold }} />
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 8 }}>
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
        <div className="mt-7" style={{ borderLeft: `2px solid ${C.rule}`, paddingLeft: 14 }}>
          <Label style={{ color: C.faint }}>Building data</Label>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 4 }}>
            {buildingTagsToday.map(t => `${t.emoji} ${t.label}`).join(' · ')} — log a few more days to unlock impact
          </p>
        </div>
      )}

      {/* Your Week — 7-day behavior grid */}
      {recentActivity.some(d => d.tagIds.length > 0) && (
        <div className="mt-9">
          <SectionLabel>Your Week</SectionLabel>
          <div className="grid grid-cols-7 gap-1 mt-4">
            {recentActivity.map((day, i) => {
              const rec = recentRecovery[day.date]
              const isToday = day.date === today()
              const dayLabel = i === 6 ? 'Today' : new Date(day.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
              return (
                <div key={day.date} className="flex flex-col items-center gap-1">
                  <p style={{ fontFamily: SERIF, fontSize: 10, color: C.faint }}>{dayLabel}</p>
                  <div
                    className="w-full aspect-square flex flex-col items-center justify-center gap-0.5 overflow-hidden"
                    style={{ border: `1px solid ${isToday ? C.ink : C.ruleSoft}` }}
                  >
                    {day.tagIds.slice(0, 3).map(id => {
                      const tag = tags.find(t => t.id === id)
                      return tag ? <span key={id} className="text-[10px] leading-none">{tag.emoji}</span> : null
                    })}
                    {day.tagIds.length === 0 && <span style={{ fontFamily: SERIF, fontSize: 10, color: C.faint }}>—</span>}
                  </div>
                  {rec != null && (
                    <div
                      className="w-full"
                      style={{ height: 2, background: rec >= 67 ? C.ink : rec >= 34 ? C.gold : '#B5482E' }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Bottom bar = recovery score · up to 3 behaviors shown per day</p>
        </div>
      )}

      {/* Energy vs Recovery */}
      {energyCorrelation && energyCorrelation.length >= 3 && (
        <div className="mt-9 mb-4">
          <SectionLabel>Energy vs Recovery</SectionLabel>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 8 }}>How your self-rated energy relates to physiological recovery</p>
          <div className="flex items-end gap-2 mt-4 h-16">
            {energyCorrelation.map(e => {
              const h = Math.max(8, (e.avgRecovery / 100) * 48)
              const color = e.avgRecovery >= 67 ? C.ink : e.avgRecovery >= 34 ? C.gold : '#B5482E'
              return (
                <div key={e.energy} className="flex flex-col items-center flex-1">
                  <span style={{ fontFamily: SERIF, fontSize: 10, color: C.faint, marginBottom: 4 }}>{e.avgRecovery}%</span>
                  <div className="w-full" style={{ height: `${h}px`, background: color }} />
                  <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 4 }}>{e.energy}</span>
                </div>
              )
            })}
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 12 }}>
            {energyCorrelation.length >= 2
              ? `Energy ${energyCorrelation[energyCorrelation.length - 1].avgRecovery > energyCorrelation[0].avgRecovery ? 'strongly tracks' : 'inversely tracks'} recovery in your data.`
              : 'Keep logging energy levels to see the pattern.'}
          </p>
        </div>
      )}
    </div>
  )
}
