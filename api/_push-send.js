import webPush from 'web-push'
import { kv } from '@vercel/kv'

const MORNING_PAYLOAD = {
  title: 'Morning Brief 🌅',
  body: 'Your recovery and HRV summary is ready.',
  url: '/',
  tag: 'morning',
}

const EVENING_PAYLOAD = {
  title: 'Nightly Wind-Down 🌙',
  body: 'Check your daily strain and sleep prep.',
  url: '/',
  tag: 'evening',
}

function localHourMin(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const h = parts.find(p => p.type === 'hour')?.value || '00'
  const m = parts.find(p => p.type === 'minute')?.value || '00'
  return [parseInt(h, 10), parseInt(m, 10)]
}

function withinWindow(preferredTime, timezone, windowMins = 60) {
  const [prefH, prefM] = preferredTime.split(':').map(Number)
  const [localH, localM] = localHourMin(timezone)
  const diff = Math.abs(prefH * 60 + prefM - (localH * 60 + localM))
  return Math.min(diff, 1440 - diff) <= windowMins
}

export async function sendScheduledPush(type) {
  const subscription = await kv.get('push:subscription')
  if (!subscription) return { skipped: 'no subscription' }

  const prefs = await kv.get('push:prefs') || {}
  const enabledKey = type === 'morning' ? 'morningEnabled' : 'eveningEnabled'
  if (prefs[enabledKey] === false) return { skipped: 'disabled' }

  const defaultTime = type === 'morning' ? '07:00' : '21:00'
  const preferredTime = prefs[type === 'morning' ? 'morningTime' : 'eveningTime'] || defaultTime
  const timezone = prefs.timezone || 'America/New_York'

  if (!withinWindow(preferredTime, timezone)) {
    return { skipped: 'outside window' }
  }

  // Idempotent: only fire once per day
  const today = new Date().toISOString().split('T')[0]
  const sentKey = `push:sent:${type}:${today}`
  if (await kv.get(sentKey)) return { skipped: 'already sent' }
  await kv.set(sentKey, 1, { ex: 90000 }) // expire after ~25 hours

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  const payload = type === 'morning' ? MORNING_PAYLOAD : EVENING_PAYLOAD
  await webPush.sendNotification(subscription, JSON.stringify(payload))
  return { sent: true }
}
