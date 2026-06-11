export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { refresh_token } = req.body
  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' })

  const clientId = process.env.FITBIT_CLIENT_ID
  const clientSecret = process.env.FITBIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Server not configured' })

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  try {
    const response = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
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
