const ACHIEVEMENT_LABELS = {
  first_green: 'First Green Recovery Day',
  green_week: 'Green Week — 7 days straight',
  sleep_champ: 'Sleep Champion',
  iron_hr: 'Iron Heart — RHR below 50',
  hrv_hero: 'HRV Hero — above 80ms',
  step_king: 'Step King — 12,000 steps',
  biohacker: 'Biohacker — 30 journal entries',
  low_stress: 'Zen — 7 low-stress days',
  peak_week: 'Peak Week — avg recovery above 75',
  consistent_sleeper: 'Consistent Sleeper — 14 nights',
}

export function getPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

export function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted'
}

function todayFlag(id) {
  return `notif_${id}_${new Date().toISOString().split('T')[0]}`
}

function sentToday(id) {
  return !!localStorage.getItem(todayFlag(id))
}

function markSent(id) {
  localStorage.setItem(todayFlag(id), '1')
}

export function showNotification(title, body) {
  if (!canNotify()) return
  try {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  } catch {}
}

export function fireDataNotifications(data, newUnlocks = []) {
  if (!canNotify()) return

  const { recoveryScore = 0, stressScore = 0, sleepDebt = 0 } = data

  // Newly unlocked achievements
  for (const id of newUnlocks) {
    const label = ACHIEVEMENT_LABELS[id] || id
    showNotification('Achievement Unlocked 🏆', label)
  }

  // Red zone recovery — once per day
  if (recoveryScore < 34 && !sentToday('red_zone')) {
    markSent('red_zone')
    showNotification('Recovery: Red Zone 🔴', `Score ${recoveryScore}% — rest day recommended. Skip intense training.`)
  }

  // Sleep debt — once per day
  if (sleepDebt >= 3 && !sentToday('sleep_debt')) {
    markSent('sleep_debt')
    showNotification(`${sleepDebt}h Sleep Debt 💤`, 'Running a deficit. Try to add 30–60 min tonight.')
  }

  // High stress — once per day
  if (stressScore > 78 && !sentToday('high_stress')) {
    markSent('high_stress')
    showNotification('High Physiological Stress ⚠️', `Stress at ${stressScore}/100. Signs of overtraining or fatigue.`)
  }
}
