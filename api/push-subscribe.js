import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { subscription, prefs } = req.body
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' })
  await kv.set('push:subscription', subscription)
  if (prefs) await kv.set('push:prefs', prefs)
  res.json({ ok: true })
}
