import { useState, useRef, useEffect } from 'react'
import DailyReport from '../components/DailyReport'
import {
  getUserAge, getUserBodyFatPct, getUserHeightCm, getUserWeightKg,
  calculateLeanMass, calculateFFMI, getUserWaistCm, getUserGripStrengthKg,
  getHOMAIR, getAverageBP, calculatePhysiologicalAge, localDateOf,
  buildPhysioAgeInputs,
} from '../lib/calculations'
import { getPhenoAgeResult, getLabResults } from '../lib/labs'
import { getJournalEntries, getAllTags } from '../lib/storage'
import { C, SERIF, Label, BackLink, SectionLabel, Note } from '../lib/almanacTheme'

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
  const ffmi = calculateFFMI(leanMass, heightCm)
  const waistCm = getUserWaistCm()
  const gripKg = getUserGripStrengthKg()
  const homaIR = getHOMAIR()
  const bp = getAverageBP()
  const phenoAge = getPhenoAgeResult()

  // Shared input builder keeps the age cited here identical to the Chronos screen.
  const physAge = calculatePhysiologicalAge(buildPhysioAgeInputs(data))

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
    <div>
      <div className="flex items-baseline justify-between">
        <Label>Weekly Report</Label>
        {report && <Label style={{ color: C.faint }}>{report.generatedAt}</Label>}
      </div>
      {report ? (
        <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.6, color: C.inkSoft, marginTop: 12, whiteSpace: 'pre-line' }}>{report.text}</p>
      ) : (
        <p style={{ fontFamily: SERIF, fontSize: 14, color: C.faint, marginTop: 10 }}>
          Get a full analysis of your week — what went well, what to improve, one focus for next week.
        </p>
      )}
      <button
        onClick={generate}
        disabled={generating || !apiKey}
        className="mt-4 active:opacity-50 transition-opacity disabled:opacity-40"
        style={{ borderTop: `1px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 8, paddingBottom: 8, width: '100%', textAlign: 'left' }}
      >
        <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: C.ink }}>
          {generating ? 'Generating…' : report ? 'Regenerate Report' : 'Generate This Week\'s Report'}
        </span>
      </button>
    </div>
  )
}

function Turn({ role, content }) {
  const isUser = role === 'user'
  return (
    <div style={{ borderLeft: `2px solid ${isUser ? C.rule : C.gold}`, paddingLeft: 14 }}>
      <Label style={{ color: isUser ? C.faint : C.inkSoft }}>{isUser ? 'You' : 'Coach'}</Label>
      <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.6, color: isUser ? C.inkSoft : C.ink, marginTop: 4, fontStyle: isUser ? 'italic' : 'normal' }}>
        {content}
      </p>
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
      <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
        <div className="pt-3">
          <BackLink onNav={onNav} />
        </div>
        <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
          <Label style={{ color: C.inkSoft }}>COACH</Label>
        </div>

        <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Set up coaching</h1>

        <div className="mt-7">
          <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.6, color: C.inkSoft }}>
            Coaching uses Claude AI to answer questions about your specific health data.
            You need a free Anthropic API key — you pay only for what you use (~$0.01–0.05/day for daily use).
          </p>
          <ol className="mt-4 space-y-1.5">
            <li style={{ fontFamily: SERIF, fontSize: 14, color: C.faint }}>1. Go to <span style={{ color: C.ink }}>console.anthropic.com</span></li>
            <li style={{ fontFamily: SERIF, fontSize: 14, color: C.faint }}>2. Create account → API Keys → Create Key</li>
            <li style={{ fontFamily: SERIF, fontSize: 14, color: C.faint }}>3. Paste it below</li>
          </ol>
          <input
            type="password"
            className="w-full outline-none mt-5"
            style={{ fontFamily: SERIF, fontSize: 14, color: C.ink, background: 'transparent', borderBottom: `1px solid ${C.rule}`, paddingBottom: 8 }}
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey(keyInput)}
          />
          <button
            onClick={() => saveKey(keyInput)}
            className="mt-6 active:opacity-50 transition-opacity"
            style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 8, paddingBottom: 8, width: '100%', textAlign: 'left' }}
          >
            <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 700, color: C.ink }}>Save &amp; Start Coaching</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col pt-safe" style={{ height: '100dvh', background: C.paper, color: C.ink }}>
      <div className="px-5 pt-3 pb-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <BackLink onNav={onNav} />
        <button onClick={() => { setKeyInput(apiKey); setShowKeyInput(true) }} className="active:opacity-50 transition-opacity">
          <Label style={{ color: C.faint }}>API Key</Label>
        </button>
      </div>

      <div className="px-5">
        <div style={{ borderBottom: `1px solid ${C.rule}`, paddingTop: 10, paddingBottom: 6 }}>
          <Label style={{ color: C.inkSoft }}>COACH</Label>
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, marginTop: 10 }}>Ask anything</h1>
      </div>

      {/* Tabs */}
      <div className="flex px-5 pt-4 gap-5 overflow-x-auto" style={{ borderBottom: `1px solid ${C.rule}` }}>
        {[['chat', 'Chat'], ['report', 'Weekly'], ['morning', 'Morning'], ['evening', 'Evening']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="pb-2 whitespace-nowrap flex-shrink-0"
            style={{ borderBottom: activeTab === id ? `2px solid ${C.ink}` : '2px solid transparent' }}
          >
            <Label style={{ color: activeTab === id ? C.ink : C.faint }}>{label}</Label>
          </button>
        ))}
      </div>

      {activeTab === 'report' && (
        <div className="flex-1 overflow-y-auto px-5 py-5 pb-24">
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
      {activeTab === 'chat' && <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 pb-32">
        {messages.length === 0 && (
          <div className="space-y-5">
            <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: C.faint, textAlign: 'center', paddingTop: 8 }}>
              Your coach knows today's data. Ask anything.
            </p>
            <div>
              <SectionLabel>Suggestions</SectionLabel>
              <div className="mt-1">
                {STARTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left py-2.5 active:opacity-50 transition-opacity"
                    style={{ borderBottom: `1px solid ${C.ruleSoft}` }}
                  >
                    <span style={{ fontFamily: SERIF, fontSize: 14, color: C.inkSoft }}>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m, i) => <Turn key={i} role={m.role} content={m.content} />)}

        {loading && (
          <div style={{ borderLeft: `2px solid ${C.gold}`, paddingLeft: 14 }}>
            <Label style={{ color: C.inkSoft }}>Coach</Label>
            <div className="flex gap-1 mt-2">
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.faint, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>}

      {/* Input — chat tab only */}
      {activeTab === 'chat' &&
      <div
        className="fixed bottom-0 left-0 right-0 px-5 pb-safe pt-2"
        style={{ background: `${C.paper}f2`, backdropFilter: 'blur(12px)', borderTop: `1px solid ${C.rule}` }}
      >
        <div className="flex gap-3 items-end pb-16">
          <textarea
            className="flex-1 outline-none resize-none bg-transparent"
            style={{ fontFamily: SERIF, fontSize: 15, color: C.ink, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8, maxHeight: 100 }}
            rows={1}
            placeholder="Ask your coach…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="flex items-center justify-center flex-shrink-0 active:opacity-50 transition-opacity disabled:opacity-30"
            style={{ paddingBottom: 8 }}
            aria-label="Send"
          >
            <span style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1, color: C.ink }}>↑</span>
          </button>
        </div>
      </div>}
    </div>
  )
}
