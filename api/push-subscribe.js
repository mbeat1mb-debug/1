import { kv } from '@vercel/kv'

async function verifyFitbitToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (!token) return false
  try {
    const res = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!await verifyFitbitToken(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { subscription, prefs } = req.body
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' })
  await kv.set('push:subscription', subscription)
  if (prefs) await kv.set('push:prefs', prefs)
  res.json({ ok: true })
}
