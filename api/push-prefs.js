import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const prefs = await kv.get('push:prefs')
    return res.json(prefs || {})
  }
  if (req.method === 'POST') {
    await kv.set('push:prefs', req.body)
    return res.json({ ok: true })
  }
  res.status(405).end()
}
