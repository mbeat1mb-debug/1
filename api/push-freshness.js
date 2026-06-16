import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { overdue, due } = req.body || {}
  if (!Array.isArray(overdue)) return res.status(400).json({ error: 'missing overdue array' })
  // Expire after 8 days so stale data doesn't persist if user stops using the app
  await kv.set('push:freshness', { overdue, due: due || [], updatedAt: Date.now() }, { ex: 691200 })
  return res.status(200).json({ ok: true })
}
