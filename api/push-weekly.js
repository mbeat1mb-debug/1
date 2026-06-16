import webPush from 'web-push'
import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  const subscription = await kv.get('push:subscription')
  if (!subscription) return res.json({ skipped: 'no subscription' })

  const prefs = await kv.get('push:prefs') || {}
  if (prefs.weeklyEnabled === false) return res.json({ skipped: 'disabled' })

  // Idempotent: only one weekly push per Sunday
  const today = new Date().toISOString().split('T')[0]
  const sentKey = `push:sent:weekly:${today}`
  if (await kv.get(sentKey)) return res.json({ skipped: 'already sent' })

  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return res.json({ error: 'Push not configured' })
  }

  // Build notification body from freshness status the client last synced
  const freshness = await kv.get('push:freshness').catch(() => null)
  let body = 'Open Soma to review your manual health data.'

  if (freshness) {
    const overdue = freshness.overdue || []
    const due = freshness.due || []
    if (overdue.length > 0 || due.length > 0) {
      const parts = []
      if (overdue.length > 0) parts.push(`Overdue: ${overdue.join(', ')}`)
      if (due.length > 0) parts.push(`Due soon: ${due.join(', ')}`)
      body = parts.join(' · ')
    } else {
      body = 'All metrics are up to date. Nothing needed this week.'
    }
  }

  webPush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  try {
    await webPush.sendNotification(
      subscription,
      JSON.stringify({ title: 'Weekly Health Check-In 📋', body, url: '/settings', tag: 'weekly' })
    )
    await kv.set(sentKey, 1, { ex: 90000 })
  } catch (err) {
    console.error('Weekly push failed:', err.message)
    return res.json({ error: err.message })
  }

  return res.json({ sent: true })
}
