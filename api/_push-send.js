import webPush from 'web-push'
import { kv } from '@vercel/kv'

function buildPayload(type, scores) {
  if (type === 'morning') {
    return {
      title: 'Morning Brief 🌅',
      body: scores
        ? `Recovery ${scores.recovery}% · HRV ${scores.hrv}ms · RHR ${scores.rhr}bpm`
        : 'Your recovery and HRV summary is ready.',
      url: '/',
      tag: 'morning',
    }
  }
  if (type === 'evening') {
    return {
      title: 'Nightly Wind-Down 🌙',
      body: scores
        ? `Strain ${scores.strain}/21 · Stress ${scores.stress}/100`
        : 'Check your daily strain and sleep prep.',
      url: '/',
      tag: 'evening',
    }
  }
  // winddown
  return {
    title: 'Wind-Down Time 🌙',
    body: 'Target bedtime in 30 minutes. Start your wind-down routine.',
    url: '/',
    tag: 'winddown',
  }
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

  if (type === 'morning') {
    if (prefs.morningEnabled === false) return { skipped: 'disabled' }
    const preferredTime = prefs.morningTime || '07:00'
    const timezone = prefs.timezone || 'America/New_York'
    if (!withinWindow(preferredTime, timezone)) return { skipped: 'outside window' }
  } else if (type === 'evening') {
    if (prefs.eveningEnabled === false) return { skipped: 'disabled' }
    const preferredTime = prefs.eveningTime || '21:00'
    const timezone = prefs.timezone || 'America/New_York'
    if (!withinWindow(preferredTime, timezone)) return { skipped: 'outside window' }
  } else if (type === 'winddown') {
    if (!prefs.winddownEnabled) return { skipped: 'disabled' }
    const preferredTime = prefs.winddownTime || '22:00'
    const timezone = prefs.timezone || 'America/New_York'
    if (!withinWindow(preferredTime, timezone, 15)) return { skipped: 'outside window' }
  }

  // Idempotent: only fire once per day per type
  const today = new Date().toISOString().split('T')[0]
  const sentKey = `push:sent:${type}:${today}`
  if (await kv.get(sentKey)) return { skipped: 'already sent' }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    console.error('Push not configured: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must be set')
    return { error: 'Push not configured' }
  }
  webPush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  // Fetch latest health scores for rich notification body
  const scores = await kv.get('push:latest_scores').catch(() => null)
  const payload = buildPayload(type, scores)

  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload))
  } catch (err) {
    console.error('Push delivery failed:', err.message)
    return { error: err.message }
  }

  // Mark sent only after confirmed delivery, expire after ~25 hours
  await kv.set(sentKey, 1, { ex: 90000 })
  return { sent: true }
}
