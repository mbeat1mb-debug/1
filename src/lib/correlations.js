import { getAllTags, analyzeTagCorrelation } from './storage'
import { getHistory } from './db'

export async function getTopCorrelations(limit = 5) {
  const healthHistory = await getHistory(90)
  if (healthHistory.length < 14) return []

  const tags = getAllTags()
  const results = []

  for (const tag of tags) {
    const result = analyzeTagCorrelation(tag.id, healthHistory)
    if (result && Math.abs(result.diff) >= 5) {
      results.push({ ...result, label: tag.label, emoji: tag.emoji })
    }
  }

  // Weight by sample size too — a 3-day diff is noisier than a 30-day diff
  // of the same magnitude and shouldn't outrank it just because it's bigger.
  const score = r => Math.abs(r.diff) * Math.sqrt(r.sampleSize)
  return results.sort((a, b) => score(b) - score(a)).slice(0, limit)
}
