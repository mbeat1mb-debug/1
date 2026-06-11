import { useState, useRef, useEffect } from 'react'

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const REPORT_KEY = 'weekly_report'

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

  return `Generate a concise but insightful weekly health report for this person. Age 39, male.

THIS WEEK:
- Avg HRV: ${avgHRV7}ms (prior week: ${priorAvgHRV}ms, ${avgHRV7 >= priorAvgHRV ? 'UP' : 'DOWN'} ${Math.abs(avgHRV7 - priorAvgHRV)}ms)
- Avg RHR: ${avgRHR7} bpm
- Avg Sleep: ${avgSleep7}h/night
- Today's Recovery: ${recoveryScore}%, Strain: ${strainScore}, Sleep Score: ${sleepScore}%, Stress: ${stressScore}

FORMAT: Write 3-4 short paragraphs: (1) This week's overall picture in 1-2 sentences, (2) What went well, (3) Main opportunity to improve, (4) One specific action for next week. Be direct and personal — use "you" and specific numbers. No bullet points, just prose. Max 250 words.`
}

function buildSystemPrompt(data) {
  const { recoveryScore, strainScore, sleepScore, stressScore, todayHRV, todayRHR,
    todaySleep, todaySpO2, todayBR, steps, calories, hrvHistory, rhrHistory } = data

  const avgHRV = hrvHistory?.filter(Boolean).slice(-14).reduce((a, b) => a + b, 0) /
    (hrvHistory?.filter(Boolean).slice(-14).length || 1)

  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : 'unknown'

  return `You are a world-class personal health coach with access to the user's complete Fitbit Air biometric data.
You give specific, actionable, evidence-based advice tailored to their exact numbers — never generic.
You are direct, encouraging, and concise. You understand HRV, strain, recovery science deeply.

USER PROFILE: Age 39, male. Uses Fitbit Air tracker.

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

GUIDANCE: Answer health and performance questions using this data. When asked "should I work out," give a specific recommendation with reasoning. When asked about trends, reference the numbers. Keep replies concise (2-4 sentences usually). Never say "consult a doctor" for general fitness questions.`
}

const STARTERS = [
  'Should I train hard today?',
  'Why is my recovery low?',
  'How can I improve my HRV?',
  'Am I getting enough sleep?',
  'What does my stress score mean?',
  'How\'s my fitness trending?',
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
    <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Weekly Report</p>
        {report && <span className="text-xs text-gray-600">{report.generatedAt}</span>}
      </div>
      {report ? (
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{report.text}</p>
      ) : (
        <p className="text-sm text-gray-600">Get a full AI analysis of your week — what went well, what to improve, one focus for next week.</p>
      )}
      <button
        onClick={generate}
        disabled={generating || !apiKey}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
        style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a733' }}
      >
        {generating ? 'Generating…' : report ? 'Regenerate Report' : 'Generate This Week\'s Report'}
      </button>
    </div>
  )
}

export default function Coach({ data }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('claude_api_key') || '')
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
      <div className="px-4 pt-safe pb-28 space-y-4">
        <div className="pt-2">
          <p className="text-gray-500 text-xs uppercase tracking-wider">AI Coach</p>
          <h1 className="text-xl font-bold">Set Up Coaching</h1>
        </div>
        <div className="rounded-2xl p-5 space-y-4" style={{ background: '#111', border: '1px solid #00c9a733' }}>
          <p className="text-gray-300 text-sm">
            Coaching uses Claude AI to answer questions about your specific health data.
            You need a free Anthropic API key — you pay only for what you use (~$0.01–0.05/day for daily use).
          </p>
          <ol className="space-y-2 text-sm text-gray-400">
            <li>1. Go to <span className="text-white">console.anthropic.com</span></li>
            <li>2. Create account → API Keys → Create Key</li>
            <li>3. Paste it below</li>
          </ol>
          <input
            type="password"
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00c9a7]"
            placeholder="sk-ant-..."
            defaultValue={apiKey}
            onBlur={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey(e.target.value)}
          />
          <button
            onClick={() => saveKey(apiKey)}
            className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: '#00c9a7', color: '#000' }}
          >
            Save & Start Coaching
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col pt-safe" style={{ height: '100dvh' }}>
      <div className="px-4 pt-2 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">AI Coach</p>
          <h1 className="text-lg font-bold">Ask anything</h1>
        </div>
        <button onClick={() => setShowKeyInput(true)} className="text-xs text-gray-600 px-2 py-1 rounded-lg bg-[#1a1a1a]">
          API Key
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-4 pt-3 gap-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
        {[['chat', 'Chat'], ['report', 'Weekly Report']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="pb-2 text-sm font-semibold transition-colors"
            style={{
              color: activeTab === id ? '#00c9a7' : '#555',
              borderBottom: activeTab === id ? '2px solid #00c9a7' : '2px solid transparent',
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

      {/* Messages */}
      {activeTab === 'chat' && <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-gray-500 text-sm text-center pt-4">Your coach knows today's data. Ask anything.</p>
            <div className="grid grid-cols-2 gap-2">
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left px-3 py-3 rounded-xl text-xs text-gray-300 transition-opacity active:opacity-60"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
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
                background: m.role === 'user' ? '#00c9a7' : '#1a1a1a',
                color: m.role === 'user' ? '#000' : '#e5e7eb',
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
            <div className="rounded-2xl px-4 py-3" style={{ background: '#1a1a1a', borderBottomLeftRadius: 4 }}>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-gray-600"
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
        style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid #1a1a1a' }}
      >
        <div className="flex gap-2 items-end pb-16">
          <textarea
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-white text-sm outline-none resize-none focus:border-[#00c9a7]"
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
            style={{ background: '#00c9a7' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2.5} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>}
    </div>
  )
}
