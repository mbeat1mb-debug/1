const PR_KEY = 'personal_records'
const STREAK_KEY = 'streak_data'
const UNLOCK_KEY = 'achievements_unlocked'

export const ACHIEVEMENT_DEFS = [
  { id: 'first_green', label: 'First Green Day', desc: 'Recovery ≥ 67%', emoji: '🟢' },
  { id: 'green_week', label: 'Green Week', desc: '7 consecutive days recovery ≥ 67%', emoji: '🏆' },
  { id: 'sleep_champ', label: 'Sleep Champion', desc: '7 consecutive nights of 7.5h+ sleep', emoji: '😴' },
  { id: 'iron_hr', label: 'Iron Heart', desc: 'Resting HR below 50 bpm', emoji: '❤️' },
  { id: 'hrv_hero', label: 'HRV Hero', desc: 'HRV above 80ms', emoji: '⚡' },
  { id: 'step_king', label: 'Step King', desc: '12,000 steps in a single day', emoji: '👟' },
  { id: 'biohacker', label: 'Biohacker', desc: '30 journal entries logged', emoji: '🧬' },
  { id: 'low_stress', label: 'Zen', desc: '7 consecutive days stress ≤ 25', emoji: '🧘' },
  { id: 'peak_week', label: 'Peak Week', desc: 'Average recovery above 75 for a full week', emoji: '🔥' },
  { id: 'consistent_sleeper', label: 'Consistent Sleeper', desc: 'Sleep within 30min of target 14 nights', emoji: '📅' },
]

export function getPersonalRecords() {
  try { return JSON.parse(localStorage.getItem(PR_KEY) || '{}') } catch { return {} }
}

export function updatePersonalRecords({ todayHRV, todayRHR, recoveryScore, strainScore, steps }) {
  const pr = getPersonalRecords()
  let updated = false

  const check = (key, val, better) => {
    if (val && (pr[key] === undefined || better(val, pr[key]))) {
      pr[key] = val
      updated = true
    }
  }

  check('bestHRV', todayHRV, (a, b) => a > b)
  check('lowestRHR', todayRHR, (a, b) => a < b)
  check('bestRecovery', recoveryScore, (a, b) => a > b)
  check('highestStrain', strainScore, (a, b) => a > b)
  check('mostSteps', steps, (a, b) => a > b)

  if (updated) localStorage.setItem(PR_KEY, JSON.stringify(pr))
  return pr
}

export function calculateStreaks(recoveryHistory, sleepHistory, stressHistory = []) {
  const recovery = [...recoveryHistory].reverse()
  const sleep = [...sleepHistory].reverse()
  const stress = [...stressHistory].reverse()

  const streak = (arr, test) => {
    let count = 0
    for (const v of arr) {
      if (test(v)) count++
      else break
    }
    return count
  }

  return {
    recovery: streak(recovery, v => v >= 67),
    sleep: streak(sleep.map(s => s?.minutesAsleep ?? s?.minutes ?? 0), v => v >= 450),
    lowStress: streak(stress, v => v <= 25),
  }
}

export function getUnlockedAchievements() {
  try { return JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]') } catch { return [] }
}

export function checkAndUnlockAchievements({ pr, streaks, recoveryHistory, sleepHistory, stressHistory }) {
  const unlocked = new Set(getUnlockedAchievements())
  const newUnlocks = []

  const check = (id, condition) => {
    if (!unlocked.has(id) && condition) {
      unlocked.add(id)
      newUnlocks.push(id)
    }
  }

  const avgRecovery = recoveryHistory.slice(-7).reduce((a, b) => a + b, 0) / (recoveryHistory.slice(-7).length || 1)
  const journalCount = JSON.parse(localStorage.getItem('journal_entries') || '[]').length

  check('first_green', recoveryHistory.some(r => r >= 67))
  check('green_week', streaks.recovery >= 7)
  check('sleep_champ', streaks.sleep >= 7)
  check('iron_hr', pr.lowestRHR && pr.lowestRHR < 50)
  check('hrv_hero', pr.bestHRV && pr.bestHRV >= 80)
  check('step_king', pr.mostSteps && pr.mostSteps >= 12000)
  check('biohacker', journalCount >= 30)
  check('low_stress', streaks.lowStress >= 7)
  check('peak_week', avgRecovery >= 75)
  check('consistent_sleeper', streaks.sleep >= 14)

  if (newUnlocks.length) localStorage.setItem(UNLOCK_KEY, JSON.stringify([...unlocked]))
  return { unlocked: [...unlocked], newUnlocks }
}

export function getStreakData() {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY) || '{}') } catch { return {} }
}
