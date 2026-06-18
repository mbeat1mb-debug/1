import { sendScheduledPush } from './_push-send.js'

const VALID_TYPES = ['morning', 'evening', 'winddown']

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }
  const { type } = req.query
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' })
  const result = await sendScheduledPush(type)
  res.json(result)
}
