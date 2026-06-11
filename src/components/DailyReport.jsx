import { useState, useEffect } from 'react'
import { getRecoveryColor, getRecoveryLabel } from '../lib/calculations'

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

function todayKey(type) {
  return `${type}_brief_${new Date().toISOString().split('T')[0]}`
}

async function generateBrief(apiKey, prompt) {
  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: 'You are a concise personal health coach. Respond in exactly 2 sentences max. Be specific to the numbers. No fluff.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  const j = await res.json()
  return j.content?.[0]?.text || ''
}

export function getTimeOfDay() {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 19 || h < 2) return 'evening'
  return null
}

function StatPill({ label, value, unit = '', up }) {
  const color = up === undefined ? '#888' : up ? '#00c9a7' : '#ef4444'
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold" style={{ color: up !== undefined ? color : '#fff' }}>
        {value}<span className="text-xs text-gray-500 ml-0.5">{unit}</span>
      </span>
    </div>
  )
}

export default function DailyReport({ data, type }) {
  const apiKey = localStorage.getItem('claude_api_key')
  const cacheKey = todayKey(type)

  const [brief, setBrief] = useState(() => localStorage.getItem(cacheKey) || '')
  const [loading, setLoading] = useState(false)

  const {
    recoveryScore = 0, strainScore = 0, stressScore = 0, sleepScore = 0,
    todayHRV = 0, todayRHR = 0, todaySleep, steps = 0, calories = 0,
    hrvHistory = [], rhrHistory = [], sleepDebt = 0, optimalSleepWindow,
  } = data

  const avgHRV14 = hrvHistory.slice(-14).filter(Boolean).reduce((a, b) => a + b, 0) / (hrvHistory.slice(-14).filter(Boolean).length || 1)
  const avgRHR14 = rhrHistory.slice(-14).filter(Boolean).reduce((a, b) => a + b, 0) / (rhrHistory.slice(-14).filter(Boolean).length || 1)
  const hrvDiff = Math.round(todayHRV - avgHRV14)
  const rhrDiff = Math.round(todayRHR - avgRHR14)

  const recoveryColor = getRecoveryColor(recoveryScore)
  const recoveryLabel = getRecoveryLabel(recoveryScore)
  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'

  const optimalStrain = recoveryScore >= 67 ? '12–16' : recoveryScore >= 34 ? '8–12' : '5–8'

  useEffect(() => {
    if (!apiKey || brief) return
    const prompt = type === 'morning'
      ? `Recovery: ${recoveryScore}%, HRV: ${todayHRV}ms (${hrvDiff >= 0 ? '+' : ''}${hrvDiff}ms vs avg), RHR: ${todayRHR}bpm (${rhrDiff >= 0 ? '+' : ''}${rhrDiff} vs avg), Sleep: ${sleepHours}. What should I focus on today and why?`
      : `Strain: ${strainScore}/21, Steps: ${steps}, Calories: ${calories}, Stress: ${stressScore}/100, Sleep debt: ${sleepDebt}h. Give me one specific tip for better sleep tonight based on today's data.`

    setLoading(true)
    generateBrief(apiKey, prompt)
      .then(text => { setBrief(text); localStorage.setItem(cacheKey, text) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const isMorning = type === 'morning'
  const accentColor = isMorning ? recoveryColor : '#3b82f6'
  const title = isMorning ? 'MORNING BRIEF' : 'NIGHTLY WIND-DOWN'

  return (
    <div className="mx-4 rounded-2xl overflow-hidden mb-1" style={{ background: accentColor + '0f', border: `1px solid ${accentColor}30` }}>
      {/* Header bar */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: accentColor + '18' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{isMorning ? '🌅' : '🌙'}</span>
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: accentColor }}>{title}</span>
        </div>
        <span className="text-xs text-gray-600">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {isMorning ? (
          <>
            {/* Recovery highlight */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl" style={{ background: recoveryColor + '18' }}>
                <span className="text-2xl font-bold" style={{ color: recoveryColor }}>{recoveryScore}</span>
                <span className="text-[9px] font-bold uppercase" style={{ color: recoveryColor }}>{recoveryLabel}</span>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <StatPill label="HRV" value={todayHRV} unit="ms" up={hrvDiff >= 0} />
                <StatPill label="Rest HR" value={todayRHR} unit="" up={rhrDiff <= 0} />
                <StatPill label="Sleep" value={sleepHours} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: '#1a1a1a' }}>
              <span className="text-xs text-gray-500">Target strain today</span>
              <span className="text-sm font-bold" style={{ color: accentColor }}>{optimalStrain}</span>
            </div>
          </>
        ) : (
          <>
            {/* Strain highlight */}
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Strain" value={strainScore} unit="/ 21" />
              <StatPill label="Steps" value={(steps || 0).toLocaleString()} />
              <StatPill label="Calories" value={(calories || 0).toLocaleString()} />
            </div>
            <div className="space-y-1.5">
              {optimalSleepWindow && (
                <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: '#1a1a1a' }}>
                  <span className="text-xs text-gray-500">Target bedtime</span>
                  <span className="text-sm font-bold text-white">{optimalSleepWindow.bedtime}</span>
                </div>
              )}
              {sleepDebt > 0 && (
                <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: '#1a1a1a' }}>
                  <span className="text-xs text-gray-500">Sleep debt</span>
                  <span className="text-sm font-bold" style={{ color: sleepDebt >= 3 ? '#ef4444' : '#f59e0b' }}>{sleepDebt}h</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* AI brief */}
        {loading && (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accentColor }} />
            <span className="text-xs text-gray-600">Generating brief…</span>
          </div>
        )}
        {brief && !loading && (
          <p className="text-xs text-gray-300 leading-relaxed border-t pt-2" style={{ borderColor: accentColor + '25' }}>
            {brief}
          </p>
        )}
        {!brief && !loading && !apiKey && (
          <p className="text-xs text-gray-600 border-t pt-2" style={{ borderColor: '#222' }}>
            Add a Claude API key in Coach → Settings to get AI insights here.
          </p>
        )}
      </div>
    </div>
  )
}
