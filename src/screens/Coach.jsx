import { useState, useRef, useEffect } from 'react'
import DailyReport from '../components/DailyReport'
import {
  getUserAge, getUserBodyFatPct, getUserHeightCm, getUserWeightKg,
  calculateLeanMass, getUserWaistCm, getUserGripStrengthKg,
  getHOMAIR, getAverageBP, calculatePhysiologicalAge, localDateOf,
} from '../lib/calculations'
import { getPhenoAgeResult, getLabResults } from '../lib/labs'
import { getJournalEntries, getAllTags } from '../lib/storage'

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const REPORT_KEY = 'weekly_report'

function getRecentJournalContext() {
  const entries = getJournalEntries()
  const tags = getAllTags()
  const tagMap = Object.fromEntries(tags.map(t => [t.id, t]))

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = localDateOf(cutoff)

  const recent = entries
    .filter(e => e.date >= cutoffStr)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)

  if (!recent.length) return ''

  const lines = recent.map(e => {
    const tagLabels = (e.tagIds || []).map(id => tagMap[id]?.label).filter(Boolean)
    const energyStr = e.energy != null ? ` energy:${e.energy}/5` : ''
    return `${e.date}:${tagLabels.length ? ' ' + tagLabels.join(', ') : ' (no tags)'}${energyStr}`
  })

  return `\nRECENT JOURNAL (last 7 days):\n${lines.join('\n')}`
}

async function callClaude(apiKey, systemPrompt, userMessage, maxTokens = 400) {
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
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const json = await res.json()
  return json.content?.[0]?.text || ''
}

function buildWeeklyPrompt(data) {
  const { recoveryScore, strainScore, sleepScore, stressScore, todayHRV, todayRHR,
    hrvHistory = [], rhrHistory = [], sleepHistory = [] } = data
  const last7HRV = hrvHistory.slice(-7).filter(Boolean)
  const avgHRV7 = last7HRV.length ? Math.round(last7HRV.reduce((a, b) => a + b, 0) / last7HRV.length) : 0
  const last7RHR = rhrHistory.slice(-7).filter(Boolean)
  const avgRHR7 = last7RHR.length ? Math.round(last7RHR.reduce((a, b) => a + b, 0) / last7RHR.length) : 0
  const last7Sleep = sleepHistory.slice(-7)
  const avgSleep7 = last7Sleep.length ? Math.round(last7Sleep.reduce((a, s) => a + s.minutes, 0) / last7Sleep.length / 60 * 10) / 10 : 0
  const prior7HRV = hrvHistory.slice(-14, -7).filter(Boolean)
  const priorAvgHRV = prior7HRV.length ? Math.round(prior7HRV.reduce((a, b) => a + b, 0) / prior7HRV.length) : avgHRV7

  const age = getUserAge()
  const journalContext = getRecentJournalContext()
  const longevityCtx = buildLongevityContext(data)
  return `Generate a concise but insightful weekly health report for this person. Age ${age}.

THIS WEEK:
- Avg HRV: ${avgHRV7}ms (prior week: ${priorAvgHRV}ms, ${avgHRV7 >= priorAvgHRV ? 'UP' : 'DOWN'} ${Math.abs(avgHRV7 - priorAvgHRV)}ms)
- Avg RHR: ${avgRHR7} bpm
- Avg Sleep: ${avgSleep7}h/night
- Today's Recovery: ${recoveryScore}%, Strain: ${strainScore}, Sleep Score: ${sleepScore}%, Stress: ${stressScore}
${longevityCtx}
${journalContext ? '\n' + journalContext : ''}
FORMAT: Write 3-4 short paragraphs: (1) This week's overall picture including biological age trend if relevant, (2) What went well, (3) Main opportunity to improve, (4) One specific action for next week. Be direct and personal — use "you" and specific numbers. No bullet points, just prose. Max 280 words.`
}

function buildLongevityContext(data) {
  const userAge = getUserAge()
  const bodyFatPct = getUserBodyFatPct()
  const heightCm = getUserHeightCm()
  const weightKg = getUserWeightKg()
  const leanMass = calculateLeanMass(weightKg, bodyFatPct)
  const ffmi = leanMass && heightCm ? Math.round(leanMass / Math.pow(heightCm / 100, 2) * 10) / 10 : null
  const waistCm = getUserWaistCm()
  const gripKg = getUserGripStrengthKg()
  const homaIR = getHOMAIR()
  const bp = getAverageBP()
  const phenoAge = getPhenoAgeResult()

  const avgHRV = (data.hrvHistory || []).filter(Boolean).slice(-14)
  const avgHRVVal = avgHRV.length ? avgHRV.reduce((a, b) => a + b, 0) / avgHRV.length : 0
  const avgRHR = (data.rhrHistory || []).filter(Boolean).slice(-14)
  const avgRHRVal = avgRHR.length ? avgRHR.reduce((a, b) => a + b, 0) / avgRHR.length : 0
  const avgSleep = data.sleepHistory?.length
    ? data.sleepHistory.reduce((a, s) => a + s.minutes, 0) / data.sleepHistory.length / 60 : 0

  const physAge = calculatePhysiologicalAge({
    avgHRV: avgHRVVal, avgRHR: avgRHRVal, avgSleep,
    sleepConsistency: 0.7,
    avgSteps: data.steps || 0,
    weeklyAZM: data.weeklyAZM ?? (data.activeMinutes ? data.activeMinutes * 7 : 0),
    vo2Max: data.vo2Max || 0,
  })

  const labs = getLabResults()
  const labLines = []
  const KEY_LABS = ['ldl', 'hdl', 'total_chol', 'trig', 'apob', 'lpa', 'glucose', 'hba1c', 'insulin', 'hscrp', 'homocysteine', 'vit_d']
  for (const key of KEY_LABS) {
    if (labs[key]?.value) labLines.push(`  ${key.toUpperCase()}: ${labs[key].value}`)
  }

  const lines = [
    `\nLONGEVITY PROFILE:`,
    `- Biological Age (wearable model): ${physAge}y (calendar: ${userAge}y, diff: ${physAge - userAge > 0 ? '+' : ''}${physAge - userAge}y)`,
    phenoAge !== null ? `- PhenoAge (Levine bloodwork formula): ${Math.round(phenoAge)}y` : null,
    data.vo2Max > 0 ? `- VO2 Max: ${data.vo2Max} mL/kg/min` : null,
    bodyFatPct !== null ? `- Body Fat: ${bodyFatPct}%${ffmi !== null ? ` · FFMI: ${ffmi} kg/m²` : ''}` : null,
    waistCm > 0 ? `- Waist: ${waistCm}cm` : null,
    gripKg > 0 ? `- Grip strength: ${gripKg}kg` : null,
    homaIR > 0 ? `- HOMA-IR (insulin resistance index): ${homaIR}` : null,
    bp.sys > 0 ? `- Blood pressure: ${bp.sys}/${bp.dia} mmHg` : null,
    labLines.length ? `- Key labs:\n${labLines.join('\n')}` : null,
  ].filter(Boolean)

  return lines.join('\n')
}

function buildSystemPrompt(data) {
  const { recoveryScore, strainScore, sleepScore, stressScore, todayHRV, todayRHR,
    todaySleep, todaySpO2, todayBR, steps, calories, hrvHistory, rhrHistory } = data

  const recentHRV = (hrvHistory || []).filter(Boolean).slice(-14)
  const avgHRV = recentHRV.length ? recentHRV.reduce((a, b) => a + b, 0) / recentHRV.length : 0

  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : 'unknown'

  return `You are a world-class personal health coach with access to the user's complete Fitbit Air biometric data.
You give specific, actionable, evidence-based advice tailored to their exact numbers — never generic.
You are direct, encouraging, and concise. You understand HRV, strain, recovery, and longevity science deeply.

USER PROFILE: Age ${getUserAge()}. Uses Fitbit Air tracker.

TODAY'S DATA:
- Recovery Score: ${recoveryScore}/100
- Strain Score: ${strainScore}/21
- Sleep Score: ${sleepScore}/100
- Stress Score: ${stressScore}/100
- HRV: ${todayHRV}ms (14-day avg: ${Math.round(avgHRV)}ms)
- Resting HR: ${todayRHR} bpm
- Sleep: ${sleepHours} (efficiency: ${todaySleep?.efficiency ?? 'unknown'}%)
- SpO2: ${todaySpO2}%
- Respiratory Rate: ${todayBR} br/min
- Steps: ${steps?.toLocaleString() ?? 'unknown'}
- Calories: ${calories?.toLocaleString() ?? 'unknown'} kcal
${buildLongevityContext(data)}

GUIDANCE: Answer health, performance, and longevity questions using this data. When asked "should I work out," give a specific recommendation. When asked about biological age or longevity metrics, explain what's driving them and what to improve. Keep replies concise (2-4 sentences usually). Never say "consult a doctor" for general fitness questions.${getRecentJournalContext()}`
}

const STARTERS = [
  'Should I train hard today?',
  'Why is my recovery low?',
  'How can I improve my HRV?',
  'Am I getting enough sleep?',
  'What\'s driving my biological age?',
  'How can I lower my biological age?',
  'What does my stress score mean?',
  'How\'s my VO2 Max trending?',
]

function WeeklyReport({ data, apiKey }) {
  const [report, setReport] = useState(() => {
    try { return JSON.parse(localStorage.getItem(REPORT_KEY) || 'null') } catch { return null }
  })
  const [generating, setGenerating] = useState(false)

  const generate = async () => {
    if (!apiKey || generating) return
    setGenerating(true)
    try {
      const text = await callClaude(apiKey, 'You are a personal health coach generating weekly reports.', buildWeeklyPrompt(data), 600)
      const saved = { text, generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
      setReport(saved)
      localStorage.setItem(REPORT_KEY, JSON.stringify(saved))
    } catch (e) {
      setReport({ text: `Error generating report: ${e.message}`, generatedAt: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest">Weekly Report</p>
        {report && <span className="text-xs text-[#b3a890]">{report.generatedAt}</span>}
      </div>
      {report ? (
        <p className="text-sm text-[#5c5648] leading-relaxed whitespace-pre-line">{report.text}</p>
      ) : (
        <p className="text-sm text-[#9a8f7e]">Get a full AI analysis of your week — what went well, what to improve, one focus for next week.</p>
      )}
      <button
        onClick={generate}
        disabled={generating || !apiKey}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
        style={{ background: '#3E9C7E20', color: '#3E9C7E', border: '1px solid #3E9C7E33' }}
      >
        {generating ? 'Generating…' : report ? 'Regenerate Report' : 'Generate This Week\'s Report'}
      </button>
    </div>
  )
}

export default function Coach({ data, onNav }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [keyInput, setKeyInput] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const hasKey = !!apiKey

  const saveKey = (key) => {
    localStorage.setItem('claude_api_key', key)
    setApiKey(key)
    setShowKeyInput(false)
  }

  const send = async (text) => {
    const question = text || input.trim()
    if (!question || loading || !hasKey) return
    setInput('')
    const newMessages = [...messages, { role: 'user', content: question }]
    setMessages(newMessages)
    setLoading(true)
    try {
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
          max_tokens: 400,
          system: buildSystemPrompt(data),
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: json.content?.[0]?.text || 'No response.' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}. Check your API key in Settings.` }])
    } finally {
      setLoading(false)
    }
  }

  if (!hasKey || showKeyInput) {
    return (
      <div className="px-4 pt-safe pb-28 space-y-4" style={{ background: '#F6F1E9', minHeight: '100vh' }}>
        <div className="pt-2 flex items-center gap-3">
          {onNav && (
            <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#7d7363" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <p className="text-[#9a8f7e] text-xs uppercase tracking-wider">AI Coach</p>
            <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Set Up Coaching</h1>
          </div>
        </div>
        <div className="rounded-2xl p-5 space-y-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
          <p className="text-[#5c5648] text-sm">
            Coaching uses Claude AI to answer questions about your specific health data.
            You need a free Anthropic API key — you pay only for what you use (~$0.01–0.05/day for daily use).
          </p>
          <ol className="space-y-2 text-sm text-[#9a8f7e]">
            <li>1. Go to <span className="text-[#1a1a1a]">console.anthropic.com</span></li>
            <li>2. Create account → API Keys → Create Key</li>
            <li>3. Paste it below</li>
          </ol>
          <input
            type="password"
            className="w-full bg-[#F6F1E9] border border-[#ece3d4] rounded-xl px-4 py-3 text-[#1a1a1a] text-sm outline-none focus:border-[#3E9C7E]"
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey(keyInput)}
          />
          <button
            onClick={() => saveKey(keyInput)}
            className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: '#3E9C7E', color: '#fff' }}
          >
            Save & Start Coaching
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col pt-safe" style={{ height: '100dvh', background: '#F6F1E9' }}>
      <div className="px-4 pt-2 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #ece3d4' }}>
        <div className="flex items-center gap-3">
          {onNav && (
            <button onClick={() => onNav('home')} className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#7d7363" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <p className="text-[#9a8f7e] text-xs uppercase tracking-wider">AI Coach</p>
            <h1 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>Ask anything</h1>
          </div>
        </div>
        <button onClick={() => { setKeyInput(apiKey); setShowKeyInput(true) }} className="text-xs text-[#9a8f7e] px-2 py-1 rounded-lg bg-white" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          API Key
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-4 pt-3 gap-4 overflow-x-auto" style={{ borderBottom: '1px solid #ece3d4' }}>
        {[['chat', 'Chat'], ['report', 'Weekly'], ['morning', 'Morning'], ['evening', 'Evening']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="pb-2 text-sm font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            style={{
              color: activeTab === id ? '#3E9C7E' : '#9a8f7e',
              borderBottom: activeTab === id ? '2px solid #3E9C7E' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'report' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
          <WeeklyReport data={data} apiKey={apiKey} />
        </div>
      )}

      {activeTab === 'morning' && (
        <div className="flex-1 overflow-y-auto py-4 pb-24">
          <DailyReport data={data} type="morning" />
        </div>
      )}

      {activeTab === 'evening' && (
        <div className="flex-1 overflow-y-auto py-4 pb-24">
          <DailyReport data={data} type="evening" />
        </div>
      )}

      {/* Messages */}
      {activeTab === 'chat' && <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-[#9a8f7e] text-sm text-center pt-4">Your coach knows today's data. Ask anything.</p>
            <div className="grid grid-cols-2 gap-2">
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left px-3 py-3 rounded-xl text-xs text-[#5c5648] transition-opacity active:opacity-60"
                  style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: m.role === 'user' ? '#3E9C7E' : '#fff',
                color: m.role === 'user' ? '#fff' : '#1a1a1a',
                borderBottomRightRadius: m.role === 'user' ? 4 : undefined,
                borderBottomLeftRadius: m.role === 'assistant' ? 4 : undefined,
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3" style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderBottomLeftRadius: 4 }}>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#cabfa9]"
                    style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>}

      {/* Input — chat tab only */}
      {activeTab === 'chat' &&
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pb-safe pt-2"
        style={{ background: 'rgba(246,241,233,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid #ece3d4' }}
      >
        <div className="flex gap-2 items-end pb-16">
          <textarea
            className="flex-1 bg-white border border-[#ece3d4] rounded-2xl px-4 py-3 text-[#1a1a1a] text-sm outline-none resize-none focus:border-[#3E9C7E]"
            rows={1}
            placeholder="Ask your coach..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            style={{ maxHeight: 100 }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-40"
            style={{ background: '#3E9C7E' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>}
    </div>
  )
}
