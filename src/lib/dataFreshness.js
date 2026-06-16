import { getBPReadings, getGripHistory, getWaistHistory, getBodyWeightHistory } from './calculations'
import { getLabResults } from './labs'

// Returns the most recent date string (YYYY-MM-DD) from an array of objects with a .date field,
// or null if the array is empty.
function latestDate(arr) {
  if (!arr || arr.length === 0) return null
  return arr.reduce((best, item) => {
    if (!best) return item.date
    return item.date > best ? item.date : best
  }, null)
}

// Returns the most recent date string across all entered lab markers.
function latestLabDate() {
  try {
    const results = getLabResults()
    let best = null
    for (const entry of Object.values(results)) {
      if (entry && entry.date) {
        if (!best || entry.date > best) best = entry.date
      }
    }
    return best
  } catch {
    return null
  }
}

// Returns days elapsed since a YYYY-MM-DD date string, or null.
export function daysSince(dateStr) {
  if (!dateStr) return null
  const msPerDay = 86400000
  const then = new Date(dateStr + 'T12:00:00').getTime()
  return Math.floor((Date.now() - then) / msPerDay)
}

// Freshness rules: each metric the user must manually log.
// cadenceDays: target interval between entries
// graceDays: how many extra days before flipping from "due" to "overdue"
export const FRESHNESS_RULES = [
  {
    id: 'blood_pressure',
    label: 'Blood Pressure',
    emoji: '🩺',
    cadenceDays: 3,
    graceDays: 2,
    action: 'Log a reading in Settings',
    getLastDate: () => latestDate(getBPReadings()),
  },
  {
    id: 'body_weight',
    label: 'Body Weight / Composition',
    emoji: '⚖️',
    cadenceDays: 3,
    graceDays: 2,
    action: 'Weigh in via Hume scale or Settings',
    getLastDate: () => latestDate(getBodyWeightHistory()),
  },
  {
    id: 'grip_strength',
    label: 'Grip Strength',
    emoji: '✊',
    cadenceDays: 30,
    graceDays: 7,
    action: 'Test & log in Settings',
    getLastDate: () => latestDate(getGripHistory()),
  },
  {
    id: 'waist',
    label: 'Waist Circumference',
    emoji: '📏',
    cadenceDays: 30,
    graceDays: 7,
    action: 'Measure & log in Settings',
    getLastDate: () => latestDate(getWaistHistory()),
  },
  {
    id: 'bloodwork',
    label: 'Bloodwork / Labs',
    emoji: '🧪',
    cadenceDays: 180,
    graceDays: 30,
    action: 'Enter results in Healthspan → Labs',
    getLastDate: latestLabDate,
  },
]

// Returns the freshness status for every rule.
// Each entry: { id, label, emoji, action, lastDate, daysAgo, cadenceDays, status }
// status: 'ok' | 'due' | 'overdue' | 'never'
export function getDataFreshness() {
  return FRESHNESS_RULES.map(rule => {
    const lastDate = rule.getLastDate()
    const daysAgo = daysSince(lastDate)

    let status
    if (lastDate === null) {
      status = 'never'
    } else if (daysAgo <= rule.cadenceDays) {
      status = 'ok'
    } else if (daysAgo <= rule.cadenceDays + rule.graceDays) {
      status = 'due'
    } else {
      status = 'overdue'
    }

    return {
      id: rule.id,
      label: rule.label,
      emoji: rule.emoji,
      action: rule.action,
      cadenceDays: rule.cadenceDays,
      lastDate,
      daysAgo,
      status,
    }
  })
}

// Summarizes overdue/never/due items as a plain-text string for push notifications.
export function getOverdueSummary() {
  const items = getDataFreshness().filter(m => m.status === 'overdue' || m.status === 'never' || m.status === 'due')
  if (items.length === 0) return null
  const overdue = items.filter(m => m.status === 'overdue' || m.status === 'never')
  const due = items.filter(m => m.status === 'due')
  const parts = []
  if (overdue.length) parts.push(`Overdue: ${overdue.map(m => m.label).join(', ')}`)
  if (due.length) parts.push(`Due soon: ${due.map(m => m.label).join(', ')}`)
  return parts.join(' · ')
}
