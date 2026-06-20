const LAYOUT_KEY = 'home_section_order'

export const SECTION_META = {
  recovery:      { label: 'Recovery',         emoji: '💚' },
  strain:        { label: 'Strain',            emoji: '🔥' },
  sleep:         { label: 'Sleep',             emoji: '😴' },
  stress:        { label: 'Stress Monitor',    emoji: '🧠' },
  records:       { label: 'Records & History', emoji: '🏆' },
  chronos:       { label: 'Chronos',           emoji: '⏳' },
  weeklypattern: { label: 'Weekly Pattern',    emoji: '📊' },
  journal:       { label: 'Journal',           emoji: '📓' },
  insights:      { label: 'Insights',          emoji: '🔬', noNav: true },
  trends:        { label: 'Trends',             emoji: '📈' },
}

export const DEFAULT_ORDER = ['recovery', 'strain', 'sleep', 'stress', 'records', 'chronos', 'weeklypattern', 'journal', 'insights', 'trends']

export function getHomeLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY))
    if (Array.isArray(saved) && saved.length > 0) {
      // 'healthspan' was renamed to 'chronos' — migrate any previously saved order in place.
      const merged = saved.map(id => id === 'healthspan' ? 'chronos' : id).filter(id => id in SECTION_META)
      for (const id of DEFAULT_ORDER) {
        if (!merged.includes(id)) merged.push(id)
      }
      return merged.length > 0 ? merged : DEFAULT_ORDER
    }
  } catch {}
  return DEFAULT_ORDER
}

export function saveHomeLayout(order) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(order))
}
