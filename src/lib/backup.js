import { getHistory, saveDaysBatch } from './db'
import { getTokens } from './auth'

const BACKUP_KEYS = [
  'journal_entries', 'custom_tags',
  'bp_readings', 'physio_age_history',
  'personal_records', 'unlocked_achievements',
  'observed_max_hr', 'google_client_id',
  'user_age', 'user_units', 'user_height_cm', 'user_weight_kg',
  'user_body_fat_pct', 'weight_history',
  'user_smoking', 'user_alcohol_week',
  'home_layout', 'cards_minimized',
  'lab_results',
]

function authHeader() {
  const { access_token } = getTokens()
  return { Authorization: `Bearer ${access_token || 'none'}` }
}

export async function createBackup() {
  const lsData = {}
  for (const key of BACKUP_KEYS) {
    const val = localStorage.getItem(key)
    if (val !== null) lsData[key] = val
  }

  const healthDays = await getHistory(365)

  const res = await fetch('/api/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ localStorage: lsData, healthDays }),
  })
  if (!res.ok) throw new Error(`Backup failed (${res.status})`)
  const { savedAt } = await res.json()
  localStorage.setItem('last_backup_at', savedAt)
  return savedAt
}

export async function restoreBackup() {
  const res = await fetch('/api/backup', { headers: authHeader() })
  if (res.status === 404) throw new Error('No backup found — back up first from another device')
  if (!res.ok) throw new Error(`Restore failed (${res.status})`)

  const { localStorage: lsData, healthDays, savedAt } = await res.json()

  for (const [key, value] of Object.entries(lsData ?? {})) {
    try { localStorage.setItem(key, value) } catch {}
  }

  if (healthDays?.length) await saveDaysBatch(healthDays)

  return { savedAt, days: healthDays?.length ?? 0 }
}

export function getLastBackupAt() {
  return localStorage.getItem('last_backup_at')
}
