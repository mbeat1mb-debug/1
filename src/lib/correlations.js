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

  return results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, limit)
}
