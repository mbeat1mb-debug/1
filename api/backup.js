import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ') || auth.length < 20) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  if (req.method === 'POST') {
    const { localStorage: lsData, healthDays } = req.body ?? {}
    if (!lsData || typeof lsData !== 'object') {
      return res.status(400).json({ error: 'invalid payload' })
    }
    const savedAt = new Date().toISOString()
    await kv.set('user:backup', { localStorage: lsData, healthDays: healthDays ?? [], savedAt })
    return res.status(200).json({ ok: true, savedAt })
  }

  if (req.method === 'GET') {
    const backup = await kv.get('user:backup')
    if (!backup) return res.status(404).json({ error: 'no backup found' })
    return res.status(200).json(backup)
  }

  return res.status(405).json({ error: 'method not allowed' })
}
