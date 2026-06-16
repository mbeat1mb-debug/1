import { kv } from '@vercel/kv'

async function verifyGoogleToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (!token) return false
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
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
    if (!await verifyGoogleToken(req.headers.authorization)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    await kv.set('push:prefs', req.body)
    return res.json({ ok: true })
  }
  res.status(405).end()
}
