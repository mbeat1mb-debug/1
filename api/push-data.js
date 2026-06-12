import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { recovery, strain, stress, hrv, rhr } = req.body || {}
  if (recovery == null) return res.status(400).json({ error: 'missing fields' })
  // Expire after 2 days so stale scores don't persist if user stops syncing
  await kv.set('push:latest_scores', { recovery, strain, stress, hrv, rhr }, { ex: 172800 })
  return res.status(200).json({ ok: true })
}
