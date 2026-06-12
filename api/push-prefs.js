import { kv } from '@vercel/kv'

async function verifyFitbitToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (!token) return false
  try {
    const res = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const prefs = await kv.get('push:prefs')
    return res.json(prefs || {})
  }
  if (req.method === 'POST') {
    if (!await verifyFitbitToken(req.headers.authorization)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    await kv.set('push:prefs', req.body)
    return res.json({ ok: true })
  }
  res.status(405).end()
}
