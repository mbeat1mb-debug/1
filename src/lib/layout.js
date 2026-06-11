const LAYOUT_KEY = 'home_section_order'

export const SECTION_META = {
  recovery:   { label: 'Recovery',         emoji: '💚' },
  strain:     { label: 'Strain',            emoji: '🔥' },
  sleep:      { label: 'Sleep',             emoji: '😴' },
  stress:     { label: 'Stress Monitor',    emoji: '🧠' },
  records:    { label: 'Records & History', emoji: '🏆' },
  healthspan: { label: 'Healthspan',        emoji: '⏳' },
  journal:    { label: 'Journal',           emoji: '📓' },
}

export const DEFAULT_ORDER = ['recovery', 'strain', 'sleep', 'stress', 'records', 'healthspan', 'journal']

export function getHomeLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY))
    if (Array.isArray(saved) && saved.length > 0) {
      // merge in any new sections added since layout was saved
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
