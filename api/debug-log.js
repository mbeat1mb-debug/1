export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  console.log('HEALTH_DEBUG_DUMP', JSON.stringify(req.body))
  res.json({ ok: true })
}
