export function detectAlerts(data) {
  const {
    hrvHistory = [], rhrHistory = [], recoveryHistory = [],
    stressScore = 0, sleepDebt = 0,
    todayHRV = 0, todayRHR = 0, todayBR = 0,
  } = data
  const alerts = []

  // HRV declining 5+ consecutive days
  const last5 = hrvHistory.slice(-5).filter(Boolean)
  if (last5.length >= 5) {
    const allDecline = last5.every((v, i) => i === 0 || v <= last5[i - 1])
    if (allDecline && last5[4] < last5[0] * 0.85) {
      alerts.push({
        id: 'hrv_declining',
        severity: 'warning',
        title: 'HRV Declining 5 Days',
        message: 'Your HRV has dropped consistently. This often precedes illness or overtraining.',
        action: 'Prioritize sleep and cut today\'s intensity.',
        icon: '📉',
      })
    }
  }

  // Recovery below 33% for 3+ consecutive days
  const last3Recovery = recoveryHistory.slice(-3)
  if (last3Recovery.length >= 3 && last3Recovery.every(r => r < 33)) {
    alerts.push({
      id: 'low_recovery',
      severity: 'danger',
      title: 'Red Zone 3 Days Straight',
      message: 'Extended low recovery signals your body is under serious stress.',
      action: 'Take a complete rest day. Review sleep, nutrition, and stress.',
      icon: '🚨',
    })
  }

  // RHR elevated trend
  const last7RHR = rhrHistory.slice(-7).filter(Boolean)
  const first3RHR = rhrHistory.slice(-7, -4).filter(Boolean)
  if (last7RHR.length >= 6 && first3RHR.length >= 3) {
    const recentAvg = last7RHR.slice(-3).reduce((a, b) => a + b, 0) / 3
    const priorAvg = first3RHR.reduce((a, b) => a + b, 0) / first3RHR.length
    if (recentAvg > priorAvg + 5) {
      alerts.push({
        id: 'rhr_elevated',
        severity: 'warning',
        title: 'Resting HR Trending Up',
        message: `Your resting HR is ${Math.round(recentAvg - priorAvg)} bpm above your recent baseline.`,
        action: 'Watch for signs of illness or accumulated fatigue.',
        icon: '💓',
      })
    }
  }

  // Compound illness signal: HRV drop + RHR elevation (+ elevated breathing rate)
  const avgHRV7 = hrvHistory.slice(-7).filter(Boolean)
  const avgRHR7 = rhrHistory.slice(-7).filter(Boolean)
  if (avgHRV7.length >= 5 && avgRHR7.length >= 5 && todayHRV > 0 && todayRHR > 0) {
    const hrvAvg = avgHRV7.reduce((a, b) => a + b, 0) / avgHRV7.length
    const rhrAvg = avgRHR7.reduce((a, b) => a + b, 0) / avgRHR7.length
    const hrvDrop = todayHRV < hrvAvg * 0.85
    const rhrElevated = todayRHR > rhrAvg + 5
    const brElevated = todayBR > 0 && todayBR > 17
    const signals = [hrvDrop, rhrElevated, brElevated].filter(Boolean).length
    if (signals >= 2 && !alerts.find(a => a.id === 'hrv_declining')) {
      alerts.push({
        id: 'illness_signal',
        severity: 'warning',
        title: 'Possible Illness Signal',
        message: 'Multiple physiological indicators (HRV, resting HR, breathing) are simultaneously outside your norms.',
        action: 'Rest today and monitor closely. Stay hydrated.',
        icon: '🤒',
      })
    }
  }

  // Sleep debt over 3 hours this week
  if (sleepDebt >= 3) {
    alerts.push({
      id: 'sleep_debt',
      severity: sleepDebt >= 5 ? 'danger' : 'warning',
      title: `${sleepDebt}h Sleep Debt This Week`,
      message: 'Your body is running a sleep deficit. Cognitive function and recovery are impaired.',
      action: 'Add 30–60 min tonight. Even partial payback helps.',
      icon: '💤',
    })
  }

  // High stress
  if (stressScore > 78) {
    alerts.push({
      id: 'high_stress',
      severity: 'warning',
      title: 'High Physiological Stress',
      message: 'Your HRV and resting HR indicate significant stress on your body right now.',
      action: 'Avoid hard training. Try breathwork or a walk.',
      icon: '⚠️',
    })
  }

  return alerts
}

export function getAlertColor(severity) {
  return severity === 'danger' ? '#ef4444' : '#f59e0b'
}

// ── Alert calibration ───────────────────────────────────────────────────────
// Persists fired alerts with dates so we can later check whether illness-related
// alerts actually preceded a self-reported "Feeling Sick" journal entry.

const ALERT_HISTORY_KEY = 'alert_history'
const ILLNESS_ALERT_IDS = ['illness_signal', 'hrv_declining', 'rhr_elevated']

export function logAlertHistory(alerts, date = new Date().toISOString().split('T')[0]) {
  if (!alerts || alerts.length === 0) return
  try {
    const history = JSON.parse(localStorage.getItem(ALERT_HISTORY_KEY) || '[]')
    for (const a of alerts) {
      if (!history.find(h => h.date === date && h.id === a.id)) {
        history.push({ date, id: a.id, severity: a.severity })
      }
    }
    localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(history.slice(-500)))
  } catch {}
}

export function getAlertHistory() {
  try {
    return JSON.parse(localStorage.getItem(ALERT_HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

// Of the illness-related alerts fired, what % were followed within `windowDays`
// by a "Feeling Sick" journal tag — a personal precision/hit-rate metric.
export function getIllnessAlertAccuracy(journalEntries, windowDays = 3) {
  const history = getAlertHistory().filter(h => ILLNESS_ALERT_IDS.includes(h.id))
  if (history.length === 0) return null

  const sickDates = new Set(journalEntries.filter(e => e.tagIds?.includes('sick')).map(e => e.date))
  let hits = 0
  for (const h of history) {
    const start = new Date(h.date + 'T00:00:00')
    for (let i = 0; i <= windowDays; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      if (sickDates.has(d.toISOString().split('T')[0])) { hits++; break }
    }
  }
  return { total: history.length, hits, rate: Math.round((hits / history.length) * 100) }
}
