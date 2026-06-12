import { sendScheduledPush } from './_push-send.js'

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }
  const result = await sendScheduledPush('winddown')
  res.json(result)
}
