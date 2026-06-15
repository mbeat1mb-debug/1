const JOURNAL_KEY = 'journal_entries'
const TAGS_KEY = 'custom_tags'

export const DEFAULT_TAGS = [
  { id: 'alcohol', label: 'Alcohol', emoji: '🍷', category: 'intake' },
  { id: 'caffeine_late', label: 'Late Caffeine', emoji: '☕', category: 'intake' },
  { id: 'high_stress', label: 'High Stress', emoji: '😰', category: 'mental' },
  { id: 'meditation', label: 'Meditated', emoji: '🧘', category: 'mental' },
  { id: 'screens_bed', label: 'Screens in Bed', emoji: '📱', category: 'sleep' },
  { id: 'sleep_mask', label: 'Sleep Mask', emoji: '😴', category: 'sleep' },
  { id: 'nap', label: 'Napped', emoji: '💤', category: 'sleep' },
  { id: 'supplements', label: 'Took Supplements', emoji: '💊', category: 'intake' },
  { id: 'hydrated', label: 'Well Hydrated', emoji: '💧', category: 'intake' },
  { id: 'ate_late', label: 'Ate Late', emoji: '🍽️', category: 'intake' },
  { id: 'travel', label: 'Traveled', emoji: '✈️', category: 'activity' },
  { id: 'strength', label: 'Strength Training', emoji: '🏋️', category: 'activity' },
  { id: 'cardio', label: 'Cardio', emoji: '🏃', category: 'activity' },
  { id: 'sick', label: 'Feeling Sick', emoji: '🤒', category: 'health' },
  { id: 'social', label: 'Social Evening', emoji: '🎉', category: 'mental' },
  { id: 'cold_shower', label: 'Cold Shower', emoji: '🚿', category: 'recovery' },
  { id: 'sauna', label: 'Sauna', emoji: '🧖', category: 'recovery' },
  { id: 'zone2', label: 'Zone 2 Cardio', emoji: '🚴', category: 'activity' },
  { id: 'morning_sun', label: 'Morning Sunlight', emoji: '☀️', category: 'health' },
  { id: 'fasting', label: 'Intermittent Fast', emoji: '⏱️', category: 'intake' },
  { id: 'high_protein', label: 'High Protein', emoji: '🥩', category: 'intake' },
]

export function getJournalEntries() {
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveJournalEntry(date, tagIds, notes = '', energy = null) {
  const entries = getJournalEntries()
  const existing = entries.findIndex(e => e.date === date)
  const entry = { date, tagIds, notes, energy, updatedAt: Date.now() }
  if (existing >= 0) entries[existing] = entry
  else entries.push(entry)
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries))
  return entry
}

export function getEntryForDate(date) {
  return getJournalEntries().find(e => e.date === date) || { date, tagIds: [], notes: '', energy: null }
}

export function getCustomTags() {
  try {
    return JSON.parse(localStorage.getItem(TAGS_KEY) || '[]')
  } catch {
    return []
  }
}

export function addCustomTag(label, emoji = '⭐') {
  const tags = getCustomTags()
  const tag = { id: `custom_${Date.now()}`, label, emoji, category: 'custom' }
  tags.push(tag)
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags))
  return tag
}

export function getAllTags() {
  return [...DEFAULT_TAGS, ...getCustomTags()]
}

// Analyze how a tag correlates with recovery, HRV, RHR, and sleep
export function analyzeTagCorrelation(tagId, healthHistory) {
  const entries = getJournalEntries()
  const tagDays = new Set(entries.filter(e => e.tagIds.includes(tagId)).map(e => e.date))
  const noTagDays = new Set(entries.filter(e => !e.tagIds.includes(tagId)).map(e => e.date))

  const withTag = [], withoutTag = []
  for (const day of healthHistory) {
    if (tagDays.has(day.date)) withTag.push(day)
    else if (noTagDays.has(day.date)) withoutTag.push(day)
  }

  if (withTag.length < 3 || withoutTag.length < 3) return null

  const avgField = (arr, field) => {
    const vals = arr.map(d => d[field]).filter(v => v != null && !isNaN(v))
    return vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const withRecovery = avgField(withTag, 'recovery')
  const withoutRecovery = avgField(withoutTag, 'recovery')
  if (withRecovery === null || withoutRecovery === null) return null

  const diff = Math.round(withRecovery - withoutRecovery)
  const withHRV = avgField(withTag, 'hrv')
  const withoutHRV = avgField(withoutTag, 'hrv')
  const withRHR = avgField(withTag, 'rhr')
  const withoutRHR = avgField(withoutTag, 'rhr')
  const withSleep = avgField(withTag, 'sleep')
  const withoutSleep = avgField(withoutTag, 'sleep')

  return {
    tagId,
    withAvg: Math.round(withRecovery),
    withoutAvg: Math.round(withoutRecovery),
    diff,
    hrvDiff: withHRV !== null && withoutHRV !== null ? Math.round((withHRV - withoutHRV) * 10) / 10 : null,
    rhrDiff: withRHR !== null && withoutRHR !== null ? Math.round((withRHR - withoutRHR) * 10) / 10 : null,
    sleepDiff: withSleep !== null && withoutSleep !== null ? Math.round(withSleep - withoutSleep) : null,
    sampleSize: withTag.length,
    trend: diff > 5 ? 'positive' : diff < -5 ? 'negative' : 'neutral',
  }
}


// How many consecutive days (ending today) has this tag been logged
export function getTagStreak(tagId) {
  const entryMap = {}
  for (const e of getJournalEntries()) entryMap[e.date] = e.tagIds || []
  let streak = 0
  const d = new Date()
  for (let i = 0; i < 90; i++) {
    const dateStr = d.toISOString().slice(0, 10)
    if (!(entryMap[dateStr] || []).includes(tagId)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// Last numDays of journal entries with their tag lists
export function getRecentTagActivity(numDays = 7) {
  const entryMap = {}
  for (const e of getJournalEntries()) entryMap[e.date] = e.tagIds || []
  const result = []
  const d = new Date()
  for (let i = numDays - 1; i >= 0; i--) {
    const dt = new Date(d)
    dt.setDate(dt.getDate() - i)
    const dateStr = dt.toISOString().slice(0, 10)
    result.push({ date: dateStr, tagIds: entryMap[dateStr] || [] })
  }
  return result
}

// ── Substance & Timing Log ──────────────────────────────────────────────────
// Time-stamped intake events correlated with next-day recovery score.

const TIMING_KEY = 'substance_timing_log'

export const TIMING_SUBSTANCES = [
  { id: 'caffeine',     label: 'Caffeine',    emoji: '☕' },
  { id: 'creatine',    label: 'Creatine',    emoji: '💪' },
  { id: 'preworkout',  label: 'Pre-workout', emoji: '⚡' },
  { id: 'alcohol',     label: 'Alcohol',     emoji: '🍷' },
  { id: 'melatonin',   label: 'Melatonin',   emoji: '🌙' },
  { id: 'nsaid',       label: 'NSAIDs',      emoji: '💊' },
  { id: 'ashwagandha', label: 'Ashwagandha', emoji: '🌿' },
  { id: 'magnesium',   label: 'Magnesium',   emoji: '🔋' },
]

export function getTimingLog() {
  try { return JSON.parse(localStorage.getItem(TIMING_KEY) || '[]') } catch { return [] }
}

export function getTimingForDate(date) {
  return getTimingLog().filter(e => e.date === date).sort((a, b) => a.time.localeCompare(b.time))
}

export function addTimingEntry(date, substance, time) {
  const log = getTimingLog()
  const entry = { id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, date, substance, time }
  log.push(entry)
  localStorage.setItem(TIMING_KEY, JSON.stringify(log.slice(-500)))

  // Auto-populate journal tags based on the substance logged
  const tagsToAdd = []
  if (substance === 'caffeine' && time >= '14:00') tagsToAdd.push('caffeine_late')
  if (substance === 'alcohol') tagsToAdd.push('alcohol')

  if (tagsToAdd.length > 0) {
    const journalEntry = getEntryForDate(date)
    const existingTags = journalEntry.tagIds || []
    const newTags = tagsToAdd.filter(t => !existingTags.includes(t))
    if (newTags.length > 0) {
      saveJournalEntry(date, [...existingTags, ...newTags], journalEntry.notes, journalEntry.energy)
    }
  }

  return entry
}

export function removeTimingEntry(id) {
  localStorage.setItem(TIMING_KEY, JSON.stringify(getTimingLog().filter(e => e.id !== id)))
}

// Substance taken on day D correlated with recovery score on day D+1.
// Stimulants/alcohol also split by timing (before vs after 14:00) since
// the hour of intake matters more than the fact of intake.
export function analyzeTimingCorrelation(substanceId, healthHistory) {
  const log = getTimingLog()
  const substanceDays = {}
  for (const e of log) {
    if (e.substance !== substanceId) continue
    if (!substanceDays[e.date]) substanceDays[e.date] = []
    substanceDays[e.date].push(e.time)
  }
  if (Object.keys(substanceDays).length < 2) return null

  const recoveryByDate = {}
  for (const day of healthHistory) recoveryByDate[day.date] = day.recovery

  const withNextDay = [], earlyOnly = [], lateDay = []
  for (const [date, times] of Object.entries(substanceDays)) {
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const nextDate = d.toISOString().split('T')[0]
    if (recoveryByDate[nextDate] == null) continue
    const rec = recoveryByDate[nextDate]
    withNextDay.push(rec)
    if (times.some(t => t >= '14:00')) lateDay.push(rec)
    if (times.every(t => t < '14:00')) earlyOnly.push(rec)
  }
  if (withNextDay.length < 2) return null

  // "Without" days = user was logging (has any timing entry that day) but not this substance
  const allLoggedDates = new Set(log.map(e => e.date))
  const withoutNextDay = []
  for (const day of healthHistory) {
    const d = new Date(day.date + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    const prev = d.toISOString().split('T')[0]
    if (allLoggedDates.has(prev) && !substanceDays[prev]) withoutNextDay.push(day.recovery)
  }

  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
  return {
    withAvg: avg(withNextDay),
    withoutAvg: withoutNextDay.length >= 2 ? avg(withoutNextDay) : null,
    diff: withoutNextDay.length >= 2 ? avg(withNextDay) - avg(withoutNextDay) : null,
    earlyAvg: earlyOnly.length >= 2 ? avg(earlyOnly) : null,
    lateAvg: lateDay.length >= 2 ? avg(lateDay) : null,
    timingDiff: earlyOnly.length >= 2 && lateDay.length >= 2 ? avg(earlyOnly) - avg(lateDay) : null,
    count: withNextDay.length,
  }
}

// Analyze how self-reported energy correlates with recovery score
export function analyzeEnergyCorrelation(healthHistory) {
  const entries = getJournalEntries().filter(e => e.energy != null)
  const pairs = []
  for (const entry of entries) {
    const day = healthHistory.find(d => d.date === entry.date)
    if (day) pairs.push({ energy: entry.energy, recovery: day.recovery })
  }
  if (pairs.length < 5) return null
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const byEnergy = [1, 2, 3, 4, 5].map(n => {
    const days = pairs.filter(p => p.energy === n)
    return { energy: n, avgRecovery: days.length ? Math.round(avg(days.map(p => p.recovery))) : null, count: days.length }
  })
  return byEnergy.filter(e => e.count > 0)
}
