export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { code, redirect_uri } = req.body
  if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Server not configured' })

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri,
      }).toString(),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(400).json({ error: err })
    }

    const tokens = await response.json()
    return res.status(200).json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
