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

// ── In-app (Notification API) ─────────────────────────────────────────────────

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

  for (const id of newUnlocks) {
    showNotification('Achievement Unlocked 🏆', ACHIEVEMENT_LABELS[id] || id)
  }
  if (recoveryScore < 34 && !sentToday('red_zone')) {
    markSent('red_zone')
    showNotification('Recovery: Red Zone 🔴', `Score ${recoveryScore}% — rest day recommended.`)
  }
  if (sleepDebt >= 3 && !sentToday('sleep_debt')) {
    markSent('sleep_debt')
    showNotification(`${sleepDebt}h Sleep Debt 💤`, 'Try adding 30–60 min tonight.')
  }
  if (stressScore > 78 && !sentToday('high_stress')) {
    markSent('high_stress')
    showNotification('High Physiological Stress ⚠️', `Stress at ${stressScore}/100. Rest today.`)
  }
}

// ── Push (Web Push / VAPID) ───────────────────────────────────────────────────

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function isPushSupported() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  return true
}

export async function getPushSubscription() {
  if (!await isPushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(prefs) {
  if (!await isPushSupported()) throw new Error('Push not supported')
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') throw new Error('Permission denied')
  }

  const { publicKey } = await fetch('/api/vapid-key').then(r => r.json())
  if (!publicKey) throw new Error('Server not configured — add VAPID env vars to Vercel')

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) await existing.unsubscribe()

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, prefs }),
  })

  return subscription
}

export async function unsubscribeFromPush() {
  const sub = await getPushSubscription()
  if (sub) await sub.unsubscribe()
}

export async function savePushPrefs(prefs) {
  await fetch('/api/push-prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  })
  localStorage.setItem('push_prefs', JSON.stringify(prefs))
}

export function getLocalPushPrefs() {
  try {
    return JSON.parse(localStorage.getItem('push_prefs') || 'null')
  } catch {
    return null
  }
}

export const DEFAULT_PREFS = {
  morningEnabled: true,
  morningTime: '07:00',
  eveningEnabled: true,
  eveningTime: '21:00',
  winddownEnabled: false,
  winddownTime: '22:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}
