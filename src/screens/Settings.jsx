import { useState, useEffect } from 'react'
import { isConnected, startOAuth, disconnect } from '../lib/auth'
import {
  getPermission, isPushSupported, getPushSubscription,
  subscribeToPush, unsubscribeFromPush, savePushPrefs,
  getLocalPushPrefs, DEFAULT_PREFS,
} from '../lib/notifications'
import { getHistory } from '../lib/db'
import { calculateBMI, getBMILabel, getBMIColor } from '../lib/calculations'

// ── Time options ──────────────────────────────────────────────────────────────

function makeTimes(startH, startM, endH, endM) {
  const opts = []
  let h = startH, m = startM
  while (h < endH || (h === endH && m <= endM)) {
    const label = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
    opts.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, label })
    m += 30
    if (m >= 60) { m = 0; h++ }
  }
  return opts
}

const MORNING_TIMES = makeTimes(5, 0, 9, 30)
const EVENING_TIMES = makeTimes(19, 0, 23, 30)
const WINDDOWN_TIMES = makeTimes(20, 0, 23, 30)

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)', utcOffset: -5 },
  { value: 'America/Chicago', label: 'Central (CT)', utcOffset: -6 },
  { value: 'America/Denver', label: 'Mountain (MT)', utcOffset: -7 },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)', utcOffset: -8 },
  { value: 'America/Anchorage', label: 'Alaska (AKT)', utcOffset: -9 },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)', utcOffset: -10 },
  { value: 'Europe/London', label: 'London (GMT)', utcOffset: 0 },
  { value: 'Europe/Paris', label: 'Paris (CET)', utcOffset: 1 },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', utcOffset: 9 },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)', utcOffset: 10 },
]

function localTimeToUTC(localTime, utcOffset) {
  const [h, m] = localTime.split(':').map(Number)
  const utcH = ((h - utcOffset) % 24 + 24) % 24
  return `${String(utcH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function toCronExpression(localTime, utcOffset) {
  const utc = localTimeToUTC(localTime, utcOffset)
  const [h, m] = utc.split(':').map(Number)
  return `${m} ${h} * * *`
}

// ── Push Notifications Panel ──────────────────────────────────────────────────

function PushNotificationsSection() {
  const [pushSupported, setPushSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [error, setError] = useState('')

  const stored = getLocalPushPrefs() || DEFAULT_PREFS
  const [prefs, setPrefs] = useState(stored)

  useEffect(() => {
    isPushSupported().then(supported => {
      setPushSupported(supported)
      if (supported) getPushSubscription().then(sub => setSubscribed(!!sub))
    })
  }, [])

  const detectedTZ = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzEntry = TIMEZONES.find(t => t.value === prefs.timezone) ||
    TIMEZONES.find(t => t.value === detectedTZ) ||
    TIMEZONES[0]

  const handleSubscribe = async () => {
    setLoading(true); setError('')
    try {
      await subscribeToPush(prefs)
      setSubscribed(true); setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const handleSavePrefs = async () => {
    setLoading(true); setError('')
    try {
      await savePushPrefs(prefs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const handleUnsubscribe = async () => {
    await unsubscribeFromPush()
    setSubscribed(false)
  }

  const morningCron = toCronExpression(prefs.morningTime, tzEntry.utcOffset)
  const eveningCron = toCronExpression(prefs.eveningTime, tzEntry.utcOffset)
  const winddownCron = prefs.winddownEnabled ? toCronExpression(prefs.winddownTime, tzEntry.utcOffset) : null
  const defaultMorningCron = '0 12 * * *'
  const defaultEveningCron = '0 2 * * *'
  const needsCronUpdate = morningCron !== defaultMorningCron || eveningCron !== defaultEveningCron

  if (!pushSupported) {
    return (
      <div className="rounded-2xl p-4 space-y-2" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-sm font-semibold text-white">Push Notifications</p>
        <p className="text-xs text-gray-500">
          Add this app to your Home Screen first (Share → Add to Home Screen), then push notifications will be available.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4 space-y-4" style={{ background: '#111', border: '1px solid #222' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Push Notifications</p>
          <p className="text-xs mt-0.5" style={{ color: subscribed ? '#00c9a7' : '#888' }}>
            {subscribed ? '● Active — fires even when app is closed' : '○ Not set up'}
          </p>
        </div>
        {subscribed && (
          <button onClick={handleUnsubscribe} className="text-xs text-red-400 px-3 py-1.5 rounded-xl bg-[#1a1a1a]">
            Remove
          </button>
        )}
      </div>

      {/* Morning toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white">🌅 Morning Brief</span>
          <button
            onClick={() => setPrefs(p => ({ ...p, morningEnabled: !p.morningEnabled }))}
            className="w-10 h-6 rounded-full transition-colors relative"
            style={{ background: prefs.morningEnabled ? '#00c9a7' : '#333' }}
          >
            <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
              style={{ left: prefs.morningEnabled ? '22px' : '4px' }} />
          </button>
        </div>
        {prefs.morningEnabled && (
          <select
            value={prefs.morningTime}
            onChange={e => setPrefs(p => ({ ...p, morningTime: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-white text-sm outline-none"
          >
            {MORNING_TIMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
      </div>

      {/* Evening toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white">🌙 Nightly Wind-Down</span>
          <button
            onClick={() => setPrefs(p => ({ ...p, eveningEnabled: !p.eveningEnabled }))}
            className="w-10 h-6 rounded-full transition-colors relative"
            style={{ background: prefs.eveningEnabled ? '#00c9a7' : '#333' }}
          >
            <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
              style={{ left: prefs.eveningEnabled ? '22px' : '4px' }} />
          </button>
        </div>
        {prefs.eveningEnabled && (
          <select
            value={prefs.eveningTime}
            onChange={e => setPrefs(p => ({ ...p, eveningTime: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-white text-sm outline-none"
          >
            {EVENING_TIMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
      </div>

      {/* Wind-down reminder toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-white">💤 Bedtime Reminder</span>
            <p className="text-[11px] text-gray-600 mt-0.5">30-min heads-up before your target bedtime</p>
          </div>
          <button
            onClick={() => setPrefs(p => ({ ...p, winddownEnabled: !p.winddownEnabled }))}
            className="w-10 h-6 rounded-full transition-colors relative flex-shrink-0"
            style={{ background: prefs.winddownEnabled ? '#8b5cf6' : '#333' }}
          >
            <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
              style={{ left: prefs.winddownEnabled ? '22px' : '4px' }} />
          </button>
        </div>
        {prefs.winddownEnabled && (
          <>
            <select
              value={prefs.winddownTime || '22:00'}
              onChange={e => setPrefs(p => ({ ...p, winddownTime: e.target.value }))}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-white text-sm outline-none"
            >
              {WINDDOWN_TIMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="rounded-xl p-3" style={{ background: '#1a0f2e', border: '1px solid #3a2a5e' }}>
              <p className="text-xs text-purple-400 font-semibold mb-1">Requires Vercel Pro plan</p>
              <p className="text-[11px] text-gray-600">Wind-down uses a 3rd cron job. Add to vercel.json:</p>
              {winddownCron && (
                <pre className="text-[11px] font-mono text-green-400 mt-1 overflow-x-auto">
                  {`{"path": "/api/push-winddown", "schedule": "${winddownCron}"}`}
                </pre>
              )}
            </div>
          </>
        )}
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Your Timezone</p>
        <select
          value={prefs.timezone}
          onChange={e => setPrefs(p => ({ ...p, timezone: e.target.value }))}
          className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-white text-sm outline-none"
        >
          {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Cron update warning */}
      {needsCronUpdate && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: '#1a1000', border: '1px solid #3a2a00' }}>
          <p className="text-xs text-yellow-500 font-semibold">One more step to apply your times</p>
          <p className="text-xs text-gray-500">
            Update <span className="text-white font-mono">vercel.json</span> crons:
          </p>
          <pre className="rounded-lg p-2 overflow-x-auto text-[11px] font-mono text-green-400" style={{ background: '#0a0a0a' }}>
{`"crons": [
  {"path": "/api/push-morning", "schedule": "${morningCron}"},
  {"path": "/api/push-evening", "schedule": "${eveningCron}"}
]`}
          </pre>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={subscribed ? handleSavePrefs : handleSubscribe}
        disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
        style={{ background: saved ? '#00c9a7' : '#00c9a720', color: saved ? '#000' : '#00c9a7', border: '1px solid #00c9a733' }}
      >
        {loading ? 'Saving…' : saved ? '✓ Saved' : subscribed ? 'Update Schedule' : 'Enable Push Notifications'}
      </button>

      {/* Setup guide */}
      <button
        onClick={() => setShowGuide(g => !g)}
        className="w-full text-xs text-gray-600 text-left flex items-center justify-between"
      >
        <span>First-time setup guide</span>
        <span>{showGuide ? '▲' : '▼'}</span>
      </button>
      {showGuide && (
        <div className="rounded-xl p-3 space-y-3" style={{ background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">One-time Vercel setup</p>
          {[
            { step: '1', title: 'Generate VAPID keys', code: 'npx web-push generate-vapid-keys', desc: 'Run in your terminal. Copy both keys.' },
            { step: '2', title: 'Add to Vercel env vars', code: 'VAPID_PUBLIC_KEY\nVAPID_PRIVATE_KEY\nVAPID_SUBJECT=mailto:your@email.com', desc: 'Vercel Dashboard → Project → Settings → Environment Variables' },
            { step: '3', title: 'Create a Vercel KV database', code: null, desc: 'Vercel Dashboard → Storage → Create Database → KV → Link to project.' },
            { step: '4', title: 'Add a cron secret', code: 'CRON_SECRET=any-random-string-you-choose', desc: 'Add to Vercel env vars. Protects cron endpoints.' },
            { step: '5', title: 'Redeploy', code: null, desc: 'Vercel Dashboard → Deployments → Redeploy. Then tap Enable Push Notifications above.' },
          ].map(s => (
            <div key={s.step} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] font-bold text-gray-400 flex-shrink-0">{s.step}</span>
                <p className="text-xs font-semibold text-gray-300">{s.title}</p>
              </div>
              {s.code && <pre className="text-[11px] font-mono text-green-400 rounded-lg p-2 overflow-x-auto ml-7" style={{ background: '#0a0a0a' }}>{s.code}</pre>}
              <p className="text-[11px] text-gray-600 ml-7">{s.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CSV Export ────────────────────────────────────────────────────────────────

async function exportCSV() {
  const history = await getHistory(365)
  if (!history.length) { alert('No data to export yet.'); return }
  const header = 'Date,Recovery,Strain,Sleep (min),Sleep Efficiency (%),Stress,HRV (ms),RHR (bpm),Steps,Calories'
  const rows = history.map(d =>
    [d.date, d.recovery ?? '', d.strain ?? '', d.sleep ?? '', d.sleepEfficiency ?? '',
      d.stressScore ?? '', d.hrv ?? '', d.rhr ?? '', d.steps ?? '', d.calories ?? ''].join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `health-export-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main Settings screen ──────────────────────────────────────────────────────

export default function Settings({ onBack }) {
  const [clientId, setClientId] = useState(() => localStorage.getItem('fitbit_client_id') || '')
  const [connected, setConnected] = useState(isConnected)
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [userAge, setUserAge] = useState(() => localStorage.getItem('user_age') || '39')
  const [units, setUnits] = useState(() => localStorage.getItem('user_units') || 'imperial')
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Height/weight stored in metric; displayed per unit preference
  const storedHCm = parseFloat(localStorage.getItem('user_height_cm') || '0') || 0
  const storedWKg = parseFloat(localStorage.getItem('user_weight_kg') || '0') || 0
  const [heightFt, setHeightFt] = useState(() => storedHCm ? String(Math.floor(storedHCm / 30.48)) : '')
  const [heightIn, setHeightIn] = useState(() => storedHCm ? String(Math.round((storedHCm / 2.54) % 12)) : '')
  const [weightLbs, setWeightLbs] = useState(() => storedWKg ? String(Math.round(storedWKg * 2.2046)) : '')
  const [heightCm, setHeightCm] = useState(() => storedHCm ? String(Math.round(storedHCm)) : '')
  const [weightKg, setWeightKg] = useState(() => storedWKg ? String(Math.round(storedWKg * 10) / 10) : '')

  // Live BMI preview
  const previewBMI = (() => {
    let hCm = 0, wKg = 0
    if (units === 'imperial') {
      const ft = parseInt(heightFt, 10), inch = parseInt(heightIn, 10) || 0
      if (!isNaN(ft) && ft > 0) hCm = (ft * 12 + inch) * 2.54
      const lbs = parseFloat(weightLbs)
      if (!isNaN(lbs) && lbs > 0) wKg = lbs / 2.2046
    } else {
      hCm = parseFloat(heightCm) || 0
      wKg = parseFloat(weightKg) || 0
    }
    return calculateBMI(hCm, wKg)
  })()

  const saveAndConnect = () => {
    if (!clientId.trim()) return
    localStorage.setItem('fitbit_client_id', clientId.trim())
    if (claudeKey.trim()) localStorage.setItem('claude_api_key', claudeKey.trim())
    const age = parseInt(userAge, 10)
    if (!isNaN(age) && age > 0) localStorage.setItem('user_age', String(age))
    startOAuth(clientId.trim())
  }

  const saveSettings = () => {
    if (claudeKey.trim()) localStorage.setItem('claude_api_key', claudeKey.trim())
    const age = parseInt(userAge, 10)
    if (!isNaN(age) && age >= 15 && age <= 100) localStorage.setItem('user_age', String(age))

    localStorage.setItem('user_units', units)
    if (units === 'imperial') {
      const ft = parseInt(heightFt, 10), inch = parseInt(heightIn, 10) || 0
      if (!isNaN(ft) && ft > 0) localStorage.setItem('user_height_cm', String(Math.round((ft * 12 + inch) * 2.54)))
      const lbs = parseFloat(weightLbs)
      if (!isNaN(lbs) && lbs > 0) localStorage.setItem('user_weight_kg', String(Math.round(lbs / 2.2046 * 10) / 10))
    } else {
      const cm = parseFloat(heightCm)
      if (!isNaN(cm) && cm > 0) localStorage.setItem('user_height_cm', String(cm))
      const kg = parseFloat(weightKg)
      if (!isNaN(kg) && kg > 0) localStorage.setItem('user_weight_kg', String(kg))
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDisconnect = () => {
    disconnect()
    localStorage.removeItem('fitbit_client_id')
    setConnected(false)
  }

  const handleExport = async () => {
    setExporting(true)
    try { await exportCSV() } finally { setExporting(false) }
  }

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Connection status */}
      <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: '#111', border: `1px solid ${connected ? '#00c9a733' : '#333'}` }}>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: connected ? '#00c9a7' : '#555' }} />
          <div>
            <p className="text-sm font-semibold text-white">Fitbit Air</p>
            <p className="text-xs text-gray-500">{connected ? 'Connected' : 'Not connected'}</p>
          </div>
        </div>
        {connected && (
          <button onClick={handleDisconnect} className="text-xs text-red-400 px-3 py-1.5 rounded-xl bg-[#1a1a1a]">
            Disconnect
          </button>
        )}
      </div>

      {/* Fitbit credentials */}
      {!connected && (
        <div className="rounded-2xl p-4 space-y-4" style={{ background: '#111', border: '1px solid #222' }}>
          <div>
            <p className="text-sm font-semibold text-white mb-1">Connect Fitbit Air</p>
            <p className="text-xs text-gray-500">You'll need a free Fitbit Developer account</p>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Steps to get your Client ID:</p>
              <ol className="space-y-1 text-xs text-gray-500">
                <li>1. Go to <span className="text-white">dev.fitbit.com</span> → Log In</li>
                <li>2. Register an App → set type to <span className="text-white">Personal</span></li>
                <li>3. Set Callback URL to your Vercel app URL</li>
                <li>4. Copy the <span className="text-white">OAuth 2.0 Client ID</span> below</li>
              </ol>
            </div>
            <input
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00c9a7]"
              placeholder="Fitbit Client ID (e.g. 23ABCD)"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
            />
            <button
              onClick={saveAndConnect}
              disabled={!clientId.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm transition-opacity disabled:opacity-40"
              style={{ background: '#00c9a7', color: '#000' }}
            >
              Connect to Fitbit
            </button>
          </div>
        </div>
      )}

      {/* Age */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Your Age</p>
          <p className="text-xs text-gray-500">Used for max HR zones and physiological age calculations.</p>
        </div>
        <input
          type="number"
          min={15} max={100}
          className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00c9a7]"
          placeholder="39"
          value={userAge}
          onChange={e => setUserAge(e.target.value)}
        />
      </div>

      {/* Height & Weight */}
      <div className="rounded-2xl p-4 space-y-4" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Height & Weight</p>
            <p className="text-xs text-gray-500 mt-0.5">Used for BMI, distance, and biological age.</p>
          </div>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #333' }}>
            {['imperial', 'metric'].map(u => (
              <button
                key={u}
                onClick={() => setUnits(u)}
                className="px-3 py-1 text-xs font-semibold capitalize transition-colors"
                style={{ background: units === u ? '#00c9a7' : '#1a1a1a', color: units === u ? '#000' : '#888' }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {units === 'imperial' ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1.5">Height</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number" min={3} max={8}
                  className="w-14 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
                  placeholder="5" value={heightFt} onChange={e => setHeightFt(e.target.value)}
                />
                <span className="text-xs text-gray-600">ft</span>
                <input
                  type="number" min={0} max={11}
                  className="w-14 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
                  placeholder="10" value={heightIn} onChange={e => setHeightIn(e.target.value)}
                />
                <span className="text-xs text-gray-600">in</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1.5">Weight</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number" min={50} max={600}
                  className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7]"
                  placeholder="176" value={weightLbs} onChange={e => setWeightLbs(e.target.value)}
                />
                <span className="text-xs text-gray-600">lbs</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1.5">Height</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number" min={100} max={250}
                  className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7]"
                  placeholder="178" value={heightCm} onChange={e => setHeightCm(e.target.value)}
                />
                <span className="text-xs text-gray-600">cm</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1.5">Weight</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number" min={30} max={300}
                  className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7]"
                  placeholder="80" value={weightKg} onChange={e => setWeightKg(e.target.value)}
                />
                <span className="text-xs text-gray-600">kg</span>
              </div>
            </div>
          </div>
        )}

        {previewBMI && (
          <p className="text-xs">
            <span className="text-gray-500">BMI: </span>
            <span className="font-bold" style={{ color: getBMIColor(previewBMI) }}>
              {previewBMI} — {getBMILabel(previewBMI)}
            </span>
          </p>
        )}
      </div>

      {/* Claude API key */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <div>
          <p className="text-sm font-semibold text-white mb-1">AI Coach (Claude)</p>
          <p className="text-xs text-gray-500">Optional. Powers the coach tab. ~$0.01–0.05/day.</p>
        </div>
        <input
          type="password"
          className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00c9a7]"
          placeholder="sk-ant-..."
          value={claudeKey}
          onChange={e => setClaudeKey(e.target.value)}
        />
        <p className="text-xs text-gray-600">Get one at console.anthropic.com → API Keys</p>
      </div>

      <button
        onClick={saveSettings}
        className="w-full py-4 rounded-2xl font-bold text-sm transition-all"
        style={{ background: saved ? '#00c9a7' : '#00c9a720', color: saved ? '#000' : '#00c9a7', border: '1px solid #00c9a7' }}
      >
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>

      {/* Push Notifications */}
      <PushNotificationsSection />

      {/* Data export */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Export Data</p>
          <p className="text-xs text-gray-500">Download your full health history as a CSV file.</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: '#1a1a1a', color: '#888', border: '1px solid #333' }}
        >
          {exporting ? 'Preparing…' : '⬇ Export Health History (CSV)'}
        </button>
      </div>

      {/* Note on API migration */}
      <div className="rounded-2xl p-4" style={{ background: '#1a1000', border: '1px solid #3a2a00' }}>
        <p className="text-xs text-yellow-600 font-semibold uppercase tracking-wider mb-2">Note</p>
        <p className="text-xs text-gray-500">
          This app uses the Fitbit Web API (deprecated September 2026). A one-time update will be needed when Google migrates to the new Health API. Your data and settings will not be affected.
        </p>
      </div>

      {/* Native app upgrade */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Upgrade to Native App</p>
        <p className="text-xs text-gray-500">These features require upgrading from PWA to a native iPhone app (Option B). When you're ready, ask Claude to build it.</p>
        {[
          { icon: '🏠', label: 'Home Screen Widget', desc: 'Recovery ring on your home screen without opening the app' },
          { icon: '🍎', label: 'Apple Health Sync', desc: 'Write your scores into the native Apple Health app' },
          { icon: '🔄', label: 'Background Sync', desc: 'Data refreshes at 6am — numbers waiting before you open it' },
        ].map(f => (
          <div key={f.label} className="flex items-start gap-3 py-2" style={{ borderTop: '1px solid #1a1a1a' }}>
            <span className="text-xl">{f.icon}</span>
            <div>
              <p className="text-sm text-gray-300 font-medium">{f.label}</p>
              <p className="text-xs text-gray-600">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* About */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">About</p>
        <p className="text-xs text-gray-600">Personal Fitbit Air dashboard. Data stays on your device. No third-party servers. Built for personal use only.</p>
      </div>
    </div>
  )
}
