const LAYOUT_KEY = 'home_section_order'

export const SECTION_META = {
  recovery:      { label: 'Recovery',         emoji: '💚' },
  strain:        { label: 'Strain',            emoji: '🔥' },
  sleep:         { label: 'Sleep',             emoji: '😴' },
  stress:        { label: 'Stress Monitor',    emoji: '🧠' },
  records:       { label: 'Records & History', emoji: '🏆' },
  healthspan:    { label: 'Healthspan',        emoji: '⏳' },
  weeklypattern: { label: 'Weekly Pattern',    emoji: '📊' },
  journal:       { label: 'Journal',           emoji: '📓' },
  insights:      { label: 'Insights',          emoji: '🔬' },
}

export const DEFAULT_ORDER = ['recovery', 'strain', 'sleep', 'stress', 'records', 'healthspan', 'weeklypattern', 'journal', 'insights']

export function getHomeLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY))
    if (Array.isArray(saved) && saved.length > 0) {
      const merged = [...saved]
      for (const id of DEFAULT_ORDER) {
        if (!merged.includes(id)) merged.push(id)
      }
      return merged
    }
  } catch {}
  return DEFAULT_ORDER
}

export function saveHomeLayout(order) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(order))
}
