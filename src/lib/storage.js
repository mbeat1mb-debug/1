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
]

export function getJournalEntries() {
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveJournalEntry(date, tagIds, notes = '') {
  const entries = getJournalEntries()
  const existing = entries.findIndex(e => e.date === date)
  const entry = { date, tagIds, notes, updatedAt: Date.now() }
  if (existing >= 0) entries[existing] = entry
  else entries.push(entry)
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries))
  return entry
}

export function getEntryForDate(date) {
  return getJournalEntries().find(e => e.date === date) || { date, tagIds: [], notes: '' }
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

// Analyze how a tag correlates with recovery scores
export function analyzeTagCorrelation(tagId, healthHistory) {
  const entries = getJournalEntries()
  const tagDays = new Set(entries.filter(e => e.tagIds.includes(tagId)).map(e => e.date))
  const noTagDays = new Set(entries.filter(e => !e.tagIds.includes(tagId)).map(e => e.date))

  const withTag = []
  const withoutTag = []

  for (const day of healthHistory) {
    if (tagDays.has(day.date)) withTag.push(day.recovery)
    else if (noTagDays.has(day.date)) withoutTag.push(day.recovery)
  }

  if (withTag.length < 3 || withoutTag.length < 3) return null

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const withAvg = Math.round(avg(withTag))
  const withoutAvg = Math.round(avg(withoutTag))
  const diff = withAvg - withoutAvg

  return {
    tagId,
    withAvg,
    withoutAvg,
    diff,
    sampleSize: withTag.length,
    trend: diff > 5 ? 'positive' : diff < -5 ? 'negative' : 'neutral',
  }
}
