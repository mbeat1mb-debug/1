export default function handler(req, res) {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) return res.status(503).json({ error: 'Push not configured' })
  res.json({ publicKey: key })
}
