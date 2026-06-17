import webPush from 'web-push'
import { kv } from '@vercel/kv'

async function verifyGoogleToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (!token) return false
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!await verifyGoogleToken(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { id, title, body } = req.body || {}
  if (!id || !title || !body) return res.status(400).json({ error: 'missing fields' })

  const prefs = await kv.get('push:prefs') || {}
  if (prefs.alertsEnabled === false) return res.json({ skipped: 'disabled' })

  const subscription = await kv.get('push:subscription')
  if (!subscription) return res.json({ skipped: 'no subscription' })

  // One push per alert id per day — the client may re-detect the same condition on every sync.
  const today = new Date().toISOString().split('T')[0]
  const sentKey = `push:alert_sent:${id}:${today}`
  if (await kv.get(sentKey)) return res.json({ skipped: 'already sent' })
  await kv.set(sentKey, 1, { ex: 90000 })

  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    await kv.del(sentKey)
    return res.status(500).json({ error: 'Push not configured' })
  }
  webPush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  try {
    await webPush.sendNotification(subscription, JSON.stringify({ title, body, url: '/', tag: `alert-${id}` }))
  } catch (err) {
    await kv.del(sentKey)
    return res.status(500).json({ error: err.message })
  }

  return res.json({ sent: true })
}
