import { useState, useEffect, useRef } from 'react'
import { isConnected, startOAuth, disconnect } from '../lib/auth'
import {
  getPermission, isPushSupported, getPushSubscription,
  subscribeToPush, unsubscribeFromPush, savePushPrefs,
  getLocalPushPrefs, DEFAULT_PREFS,
} from '../lib/notifications'
import { getHistory } from '../lib/db'
import { calculateBMI, getBMILabel, getBMIColor, getBodyFatLabel, getBodyFatColor, getUserSmoking, getUserAlcohol, getUserBP, saveBPReading, saveBodyWeightEntry, saveGripEntry, saveWaistEntry } from '../lib/calculations'
import { getLabResults, saveLabResults } from '../lib/labs'
import { isPinSet, setPin, verifyPin, removePin } from '../lib/pin'
import { createBackup, restoreBackup, getLastBackupAt } from '../lib/backup'
import LabResultsSection from '../components/LabResultsSection'
import { getDataFreshness } from '../lib/dataFreshness'

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
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

function getCurrentUTCOffset(timezone) {
  const now = new Date()
  // en-CA produces "YYYY-MM-DD, HH:mm:ss" — reliably parseable as ISO on all browsers
  const toMs = tz => new Date(now.toLocaleString('en-CA', { timeZone: tz, hour12: false }).replace(', ', 'T') + 'Z').getTime()
  return Math.round((toMs(timezone) - toMs('UTC')) / 3600000)
}

function localTimeToUTC(localTime, timezone) {
  const utcOffset = getCurrentUTCOffset(timezone)
  const [h, m] = localTime.split(':').map(Number)
  const utcH = ((h - utcOffset) % 24 + 24) % 24
  return `${String(utcH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function toCronExpression(localTime, timezone) {
  const utc = localTimeToUTC(localTime, timezone)
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

  const morningCron = toCronExpression(prefs.morningTime, tzEntry.value)
  const eveningCron = toCronExpression(prefs.eveningTime, tzEntry.value)
  const winddownCron = prefs.winddownEnabled ? toCronExpression(prefs.winddownTime, tzEntry.value) : null
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

      {/* Health alerts */}
      <div className="space-y-3 pt-1" style={{ borderTop: '1px solid #1a1a1a' }}>
        <p className="text-xs text-gray-500 uppercase tracking-wider pt-1">Health Alerts</p>
        {[
          { key: 'alertsEnabled', label: 'Illness & Red-Zone Alerts', desc: 'Pushes immediately when an illness signal or 3+ day low recovery streak is detected' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <span className="text-sm text-white">{label}</span>
              <p className="text-[11px] text-gray-600">{desc}</p>
            </div>
            <button
              onClick={() => setPrefs(p => ({ ...p, [key]: p[key] !== false ? false : true }))}
              className="w-10 h-6 rounded-full transition-colors relative flex-shrink-0"
              style={{ background: prefs[key] !== false ? '#00c9a7' : '#333' }}
            >
              <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
                style={{ left: prefs[key] !== false ? '22px' : '4px' }} />
            </button>
          </div>
        ))}
      </div>

      {/* Data reminders */}
      <div className="space-y-3 pt-1" style={{ borderTop: '1px solid #1a1a1a' }}>
        <p className="text-xs text-gray-500 uppercase tracking-wider pt-1">Data Entry Reminders</p>
        {[
          { key: 'bpReminderEnabled', label: 'Blood Pressure', desc: 'Reminds you Mon · Wed · Fri' },
          { key: 'bodyMetricsReminderEnabled', label: 'Waist & Grip Strength', desc: 'Reminds you monthly' },
          { key: 'labsReminderEnabled', label: 'Blood Work', desc: 'Reminds you quarterly' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <span className="text-sm text-white">{label}</span>
              <p className="text-[11px] text-gray-600">{desc}</p>
            </div>
            <button
              onClick={() => setPrefs(p => ({ ...p, [key]: p[key] !== false ? false : true }))}
              className="w-10 h-6 rounded-full transition-colors relative flex-shrink-0"
              style={{ background: prefs[key] !== false ? '#00c9a7' : '#333' }}
            >
              <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
                style={{ left: prefs[key] !== false ? '22px' : '4px' }} />
            </button>
          </div>
        ))}
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

// ── PIN Management ────────────────────────────────────────────────────────────

function PinKeypad({ onComplete, onCancel, label }) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')

  const handleDigit = (d) => {
    if (digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    setError('')
    if (next.length === 4) setTimeout(() => onComplete(next), 80)
  }

  const handleBack = () => {
    setDigits(d => d.slice(0, -1))
    setError('')
  }

  return (
    <div className="pt-2 space-y-4">
      <p className="text-sm text-gray-400 text-center">{label}</p>
      <div className="flex justify-center gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="w-3 h-3 rounded-full transition-all duration-150"
            style={{ background: i < digits.length ? '#00c9a7' : '#333' }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[220px] mx-auto">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => handleDigit(String(n))}
            className="h-14 rounded-2xl text-xl font-light text-white active:opacity-60 transition-opacity"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            {n}
          </button>
        ))}
        <div />
        <button onClick={() => handleDigit('0')}
          className="h-14 rounded-2xl text-xl font-light text-white active:opacity-60 transition-opacity"
          style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          0
        </button>
        <button onClick={handleBack}
          className="h-14 rounded-2xl flex items-center justify-center active:opacity-60 transition-opacity">
          <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
          </svg>
        </button>
      </div>
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      <button onClick={onCancel} className="w-full text-xs text-gray-600 py-1">Cancel</button>
    </div>
  )
}

function PinSection() {
  const [pinActive, setPinActive] = useState(isPinSet)
  const [mode, setMode] = useState(null) // 'create' | 'change-verify' | 'change-new' | 'change-confirm' | 'new-confirm'
  const [newPin, setNewPin] = useState('')
  const [msg, setMsg] = useState('')

  const startCreate = () => { setMode('create'); setMsg('') }
  const startChange = () => { setMode('change-verify'); setMsg('') }

  const handleRemove = () => {
    removePin()
    setPinActive(false)
    setMode(null)
    setMsg('PIN removed')
    setTimeout(() => setMsg(''), 2500)
  }

  const handleComplete = async (pin) => {
    if (mode === 'create') {
      setNewPin(pin)
      setMode('create-confirm')
    } else if (mode === 'create-confirm') {
      if (pin === newPin) {
        await setPin(pin)
        setPinActive(true)
        setMode(null)
        setMsg('PIN enabled')
        setTimeout(() => setMsg(''), 2500)
      } else {
        setMode('create')
        setNewPin('')
        setMsg("PINs didn't match — try again")
        setTimeout(() => setMsg(''), 3000)
      }
    } else if (mode === 'change-verify') {
      const ok = await verifyPin(pin)
      if (ok) { setMode('change-new'); setMsg('') }
      else { setMsg('Incorrect PIN'); setTimeout(() => setMsg(''), 2500); setMode(null) }
    } else if (mode === 'change-new') {
      setNewPin(pin)
      setMode('change-confirm')
    } else if (mode === 'change-confirm') {
      if (pin === newPin) {
        await setPin(pin)
        setMode(null)
        setMsg('PIN updated')
        setTimeout(() => setMsg(''), 2500)
      } else {
        setMode('change-new')
        setNewPin('')
        setMsg("PINs didn't match — try again")
        setTimeout(() => setMsg(''), 3000)
      }
    }
  }

  const phaseLabel = {
    'create': 'Enter a 4-digit PIN',
    'create-confirm': 'Confirm your PIN',
    'change-verify': 'Enter your current PIN',
    'change-new': 'Enter new PIN',
    'change-confirm': 'Confirm new PIN',
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">App PIN Lock</p>
          <p className="text-xs mt-0.5" style={{ color: pinActive ? '#00c9a7' : '#888' }}>
            {pinActive ? '● Enabled — required on every open' : '○ Off'}
          </p>
        </div>
        {pinActive && !mode && (
          <div className="flex gap-2">
            <button onClick={startChange} className="text-xs text-gray-400 px-3 py-1.5 rounded-xl bg-[#1a1a1a]">Change</button>
            <button onClick={handleRemove} className="text-xs text-red-400 px-3 py-1.5 rounded-xl bg-[#1a1a1a]">Remove</button>
          </div>
        )}
      </div>

      {msg && <p className="text-xs text-center" style={{ color: msg.includes('❌') || msg.includes("didn't") || msg.includes('Incorrect') ? '#ef4444' : '#00c9a7' }}>{msg}</p>}

      {!pinActive && !mode && (
        <button onClick={startCreate}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a733' }}>
          Enable PIN Lock
        </button>
      )}

      {mode && (
        <PinKeypad
          label={phaseLabel[mode]}
          onComplete={handleComplete}
          onCancel={() => { setMode(null); setNewPin('') }}
        />
      )}
    </div>
  )
}

// ── Apple Health XML Import ───────────────────────────────────────────────────
// Parses the export.xml from Apple Health's "Export All Health Data" zip.
// Targets body mass, body fat %, and lean body mass records from any source.
// Uses a fast string-scan approach rather than DOMParser to handle large files.
function parseAppleHealthBodyData(xmlText) {
  const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass'
  const BODY_FAT  = 'HKQuantityTypeIdentifierBodyFatPercentage'
  const LEAN_MASS = 'HKQuantityTypeIdentifierLeanBodyMass'
  const TARGET_TYPES = [BODY_MASS, BODY_FAT, LEAN_MASS]

  const byDate = {} // date → { kg?, fatPct? }
  let pos = 0

  while (pos < xmlText.length) {
    const start = xmlText.indexOf('<Record', pos)
    if (start === -1) break
    const end = xmlText.indexOf('>', start)
    if (end === -1) { pos = start + 7; continue }

    const tag = xmlText.substring(start, end + 1)
    pos = end + 1

    // Quick pre-check before allocating regex objects
    if (!TARGET_TYPES.some(t => tag.includes(t))) continue

    const type  = /\btype="([^"]+)"/.exec(tag)?.[1]
    const value = parseFloat(/\bvalue="([^"]+)"/.exec(tag)?.[1])
    const date  = /\bstartDate="(\d{4}-\d{2}-\d{2})/.exec(tag)?.[1]
    const unit  = /\bunit="([^"]+)"/.exec(tag)?.[1] ?? 'kg'

    if (!type || isNaN(value) || !date) continue

    if (!byDate[date]) byDate[date] = {}

    if (type === BODY_MASS) {
      // Weight: handle kg and lb
      const kg = unit.toLowerCase().startsWith('lb') ? value / 2.2046 : value
      if (kg > 20 && kg < 300) byDate[date].kg = Math.round(kg * 10) / 10
    } else if (type === BODY_FAT) {
      // Apple Health stores fat% as decimal 0-1; some apps write as 0-100
      const pct = value <= 1 ? Math.round(value * 1000) / 10 : Math.round(value * 10) / 10
      if (pct > 2 && pct < 65) byDate[date].fatPct = pct
    } else if (type === LEAN_MASS && !byDate[date].fatPct) {
      // Back-calculate fat% from lean mass + weight if fat% not directly available
      // We'll resolve this after collecting all records for the date
      const kg = unit.toLowerCase().startsWith('lb') ? value / 2.2046 : value
      if (kg > 10 && kg < 200) byDate[date].leanKg = Math.round(kg * 10) / 10
    }
  }

  // Second pass: derive fat% from lean mass when direct fat% is absent
  for (const [date, entry] of Object.entries(byDate)) {
    if (!entry.fatPct && entry.kg && entry.leanKg) {
      const derived = ((entry.kg - entry.leanKg) / entry.kg) * 100
      if (derived > 2 && derived < 65) entry.fatPct = Math.round(derived * 10) / 10
    }
  }

  return byDate
}

// ── CSV Import ────────────────────────────────────────────────────────────────

async function parseAndImportCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = e => {
      try {
        const lines = e.target.result.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        if (lines.length) lines[0] = lines[0].replace(/^﻿/, '')
        if (lines.length < 2) { reject(new Error('File appears empty')); return }

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
        const hasSys = headers.some(h => h === 'systolic' || h === 'sys')
        const hasMarker = headers.includes('marker')

        if (hasSys) {
          const dateIdx = headers.indexOf('date')
          const sysIdx = headers.findIndex(h => h === 'systolic' || h === 'sys')
          const diaIdx = headers.findIndex(h => h === 'diastolic' || h === 'dia')
          if (sysIdx < 0 || diaIdx < 0) { reject(new Error('Expected columns: date, systolic/sys, diastolic/dia')); return }

          let count = 0
          lines.slice(1).forEach(line => {
            const cols = line.split(',').map(c => c.trim())
            const date = dateIdx >= 0 ? cols[dateIdx] : new Date().toISOString().split('T')[0]
            const sys = parseInt(cols[sysIdx], 10)
            const dia = parseInt(cols[diaIdx], 10)
            if (date && !isNaN(sys) && !isNaN(dia)) { saveBPReading(date, sys, dia); count++ }
          })
          resolve({ type: 'Blood Pressure', count })

        } else if (hasMarker) {
          const markerIdx = headers.indexOf('marker')
          const valueIdx = headers.indexOf('value')
          const dateIdx = headers.indexOf('date')
          if (valueIdx < 0) { reject(new Error('Expected columns: marker, value[, date]')); return }

          const today = new Date().toISOString().split('T')[0]
          const existing = getLabResults()
          let count = 0
          lines.slice(1).forEach(line => {
            const cols = line.split(',').map(c => c.trim())
            const marker = cols[markerIdx]?.toLowerCase().replace(/\s+/g, '_')
            const value = parseFloat(cols[valueIdx])
            const date = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : today
            if (marker && !isNaN(value)) {
              if (value <= 0 || value > 9999) return
              existing[marker] = { value, date }; count++
            }
          })
          saveLabResults(existing)
          resolve({ type: 'Lab Results', count })

        } else {
          reject(new Error('Unrecognized format. Supported:\n• BP: date,systolic,diastolic\n• Labs: marker,value,date'))
        }
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsText(file)
  })
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

// ── Data Freshness ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  ok:      { color: '#00c9a7', label: 'Current',  dot: '#00c9a7' },
  due:     { color: '#f59e0b', label: 'Due soon', dot: '#f59e0b' },
  overdue: { color: '#ef4444', label: 'Overdue',  dot: '#ef4444' },
  never:   { color: '#ef4444', label: 'Never logged', dot: '#ef4444' },
}

function DataFreshnessSection() {
  const [metrics, setMetrics] = useState([])

  useEffect(() => {
    setMetrics(getDataFreshness())
  }, [])

  const needsAttention = metrics.filter(m => m.status !== 'ok')
  const headerColor = needsAttention.length === 0 ? '#00c9a7' : needsAttention.some(m => m.status === 'overdue' || m.status === 'never') ? '#ef4444' : '#f59e0b'

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: `1px solid ${headerColor}28` }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Data Freshness</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {needsAttention.length === 0 ? 'All metrics are up to date' : `${needsAttention.length} metric${needsAttention.length > 1 ? 's' : ''} need attention`}
          </p>
        </div>
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: headerColor }} />
      </div>

      <div className="space-y-2">
        {metrics.map(m => {
          const cfg = STATUS_CONFIG[m.status]
          return (
            <div key={m.id} className="flex items-center justify-between py-2" style={{ borderTop: '1px solid #1a1a1a' }}>
              <div className="flex items-center gap-2.5">
                <span className="text-lg leading-none">{m.emoji}</span>
                <div>
                  <p className="text-sm text-gray-200">{m.label}</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {m.status === 'never'
                      ? m.action
                      : m.status === 'ok'
                        ? `${m.daysAgo}d ago · every ${m.cadenceDays}d`
                        : `${m.daysAgo}d ago · ${m.action}`}
                  </p>
                </div>
              </div>
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                style={{ background: cfg.color + '18', color: cfg.color }}
              >
                {cfg.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Settings screen ──────────────────────────────────────────────────────

export default function Settings({ onBack }) {
  const [clientId, setClientId] = useState(() => localStorage.getItem('google_client_id') || '')
  const [connected, setConnected] = useState(isConnected)
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [userAge, setUserAge] = useState(() => localStorage.getItem('user_age') || '39')
  const [units, setUnits] = useState(() => localStorage.getItem('user_units') || 'imperial')
  const [smoking, setSmoking] = useState(() => getUserSmoking())
  const [alcoholWeek, setAlcoholWeek] = useState(() => {
    const v = getUserAlcohol(); return v !== null ? String(v) : ''
  })
  const [saved, setSaved] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [backupMsg, setBackupMsg] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [lastBackup, setLastBackup] = useState(getLastBackupAt)
  const [ahImporting, setAhImporting] = useState(false)
  const [ahMsg, setAhMsg] = useState('')
  const [humeImporting, setHumeImporting] = useState(false)
  const [humeMsg, setHumeMsg] = useState('')
  const csvInputRef = useRef(null)
  const ahInputRef = useRef(null)
  const humeInputRef = useRef(null)

  // Height/weight stored in metric; displayed per unit preference
  const storedHCm = parseFloat(localStorage.getItem('user_height_cm') || '0') || 0
  const storedWKg = parseFloat(localStorage.getItem('user_weight_kg') || '0') || 0
  const [heightFt, setHeightFt] = useState(() => storedHCm ? String(Math.floor(storedHCm / 30.48)) : '')
  const [heightIn, setHeightIn] = useState(() => storedHCm ? String(Math.round((storedHCm / 2.54) % 12)) : '')
  const [weightLbs, setWeightLbs] = useState(() => storedWKg ? String(Math.round(storedWKg * 2.2046)) : '')
  const [heightCm, setHeightCm] = useState(() => storedHCm ? String(Math.round(storedHCm)) : '')
  const [weightKg, setWeightKg] = useState(() => storedWKg ? String(Math.round(storedWKg * 10) / 10) : '')
  const [bodyFatPct, setBodyFatPct] = useState(() => localStorage.getItem('user_body_fat_pct') || '')
  const [vo2MaxVal, setVo2MaxVal] = useState(() => localStorage.getItem('user_vo2_max') || '')
  const [vo2MaxError, setVo2MaxError] = useState('')

  // Waist circumference — stored in cm, displayed per units preference
  const storedWaistCm = parseFloat(localStorage.getItem('user_waist_cm') || '0') || 0
  const [waistIn, setWaistIn] = useState(() => storedWaistCm ? String(Math.round(storedWaistCm / 2.54)) : '')
  const [waistCmVal, setWaistCmVal] = useState(() => storedWaistCm ? String(Math.round(storedWaistCm)) : '')

  // Grip strength — stored in kg, displayed per units preference
  const storedGripKg = parseFloat(localStorage.getItem('user_grip_kg') || '0') || 0
  const [gripLbs, setGripLbs] = useState(() => storedGripKg ? String(Math.round(storedGripKg * 2.2046)) : '')
  const [gripKgVal, setGripKgVal] = useState(() => storedGripKg ? String(Math.round(storedGripKg * 10) / 10) : '')

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
    try {
      localStorage.setItem('google_client_id', clientId.trim())
      if (claudeKey.trim()) localStorage.setItem('claude_api_key', claudeKey.trim())
      const age = parseInt(userAge, 10)
      if (!isNaN(age) && age >= 15 && age <= 100) localStorage.setItem('user_age', String(age))
    } catch {
      setSettingsError('Could not save settings (storage full or restricted)')
      setTimeout(() => setSettingsError(''), 5000)
      return
    }
    startOAuth(clientId.trim())
  }

  const saveSettings = () => {
    try {
      if (claudeKey.trim()) localStorage.setItem('claude_api_key', claudeKey.trim())
      const age = parseInt(userAge, 10)
      if (!isNaN(age) && age >= 15 && age <= 100) localStorage.setItem('user_age', String(age))

      localStorage.setItem('user_units', units)
      const today = new Date().toISOString().split('T')[0]
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

      const fatPct = parseFloat(bodyFatPct)
      if (bodyFatPct.trim() === '') localStorage.removeItem('user_body_fat_pct')
      else if (!isNaN(fatPct) && fatPct > 0 && fatPct <= 60) localStorage.setItem('user_body_fat_pct', String(Math.round(fatPct * 10) / 10))

      // Write a manual-source history entry so a sync can't overwrite this weight
      const enteredKg = units === 'imperial'
        ? (() => { const lbs = parseFloat(weightLbs); return !isNaN(lbs) && lbs > 0 ? Math.round(lbs / 2.2046 * 10) / 10 : 0 })()
        : (() => { const kg = parseFloat(weightKg); return !isNaN(kg) && kg > 0 ? kg : 0 })()
      const enteredFat = parseFloat(bodyFatPct)
      if (enteredKg > 0) saveBodyWeightEntry(today, enteredKg, !isNaN(enteredFat) && enteredFat > 0 ? enteredFat : null, 'manual')
      if (units === 'imperial') {
        const wIn = parseFloat(waistIn)
        if (!isNaN(wIn) && wIn > 0) saveWaistEntry(today, Math.round(wIn * 2.54 * 10) / 10)
        const gLbs = parseFloat(gripLbs)
        if (!isNaN(gLbs) && gLbs > 0) saveGripEntry(today, Math.round(gLbs / 2.2046 * 10) / 10)
      } else {
        const wCm = parseFloat(waistCmVal)
        if (!isNaN(wCm) && wCm > 0) saveWaistEntry(today, wCm)
        const gKg = parseFloat(gripKgVal)
        if (!isNaN(gKg) && gKg > 0) saveGripEntry(today, gKg)
      }

      if (vo2MaxVal.trim() === '') {
        localStorage.removeItem('user_vo2_max')
        setVo2MaxError('')
      } else {
        const vo2 = parseFloat(vo2MaxVal)
        if (!isNaN(vo2) && vo2 >= 10 && vo2 <= 90) {
          localStorage.setItem('user_vo2_max', String(vo2))
          setVo2MaxError('')
        } else {
          setVo2MaxError('Enter a value between 10 and 90')
        }
      }

      localStorage.setItem('user_smoking', smoking)
      const alcohol = parseInt(alcoholWeek, 10)
      if (!isNaN(alcohol) && alcohol >= 0) localStorage.setItem('user_alcohol_week', String(alcohol))
    } catch {
      setSettingsError('Could not save settings (storage full or restricted)')
      setTimeout(() => setSettingsError(''), 5000)
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleBackup = async () => {
    setBackupBusy(true)
    setBackupMsg('')
    try {
      const savedAt = await createBackup()
      const when = new Date(savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      setLastBackup(savedAt)
      setBackupMsg(`Backed up at ${when}`)
    } catch (e) {
      setBackupMsg(`Error: ${e.message}`)
    } finally {
      setBackupBusy(false)
      setTimeout(() => setBackupMsg(''), 6000)
    }
  }

  const handleRestore = async () => {
    if (!window.confirm('Restore from cloud backup? This will overwrite any data entered since the last backup.')) return
    setBackupBusy(true)
    setBackupMsg('')
    try {
      const { savedAt, days } = await restoreBackup()
      const when = new Date(savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      setBackupMsg(`Restored ${days} days of history from ${when}`)
    } catch (e) {
      setBackupMsg(`Error: ${e.message}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    localStorage.removeItem('google_client_id')
    setConnected(false)
  }

  const handleHumeImport = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ''
    const apiKey = localStorage.getItem('claude_api_key')
    if (!apiKey) {
      setHumeMsg('Claude API key required — add it in the API Keys section')
      setTimeout(() => setHumeMsg(''), 5000)
      return
    }
    setHumeImporting(true)
    setHumeMsg('Analyzing screenshots…')
    try {
      const imageContents = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const parts = reader.result.split(',')
          const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
          resolve({ type: 'image', source: { type: 'base64', media_type: mimeType, data: parts[1] } })
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })))
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: [
            ...imageContents,
            { type: 'text', text: `These are Hume Health scale app screenshots. Extract all visible metrics. Return ONLY valid JSON with these keys (null for any not visible):
{"endDate":"visible end date like Jun 14","weightLbs":null,"bodyFatPct":null,"leanMassLbs":null,"subcutaneousFatLbs":null,"visceralFatIndex":null,"skelMuscleMassLbs":null,"skeletalMassLbs":null,"bodyWaterPct":null,"bmrCal":null,"bodyCellMassLbs":null}` }
          ]}]
        })
      })
      if (!resp.ok) throw new Error(`API ${resp.status}`)
      const respData = await resp.json()
      const text = respData.content?.[0]?.text || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No data extracted')
      const p = JSON.parse(match[0])
      const lbsToKg = lbs => (lbs != null && lbs > 0) ? Math.round(lbs / 2.2046 * 10) / 10 : null
      const weightKg = lbsToKg(p.weightLbs)
      const fatPct = (p.bodyFatPct != null && p.bodyFatPct > 0) ? p.bodyFatPct : null
      const humeExtras = {}
      if (lbsToKg(p.leanMassLbs)) humeExtras.leanMassKg = lbsToKg(p.leanMassLbs)
      if (lbsToKg(p.skelMuscleMassLbs)) humeExtras.skelMuscleKg = lbsToKg(p.skelMuscleMassLbs)
      if (lbsToKg(p.subcutaneousFatLbs)) humeExtras.subcutFatKg = lbsToKg(p.subcutaneousFatLbs)
      if (p.visceralFatIndex != null) humeExtras.visceralFatIndex = p.visceralFatIndex
      if (p.bodyWaterPct != null) humeExtras.bodyWaterPct = p.bodyWaterPct
      if (p.bmrCal != null) humeExtras.bmrCal = p.bmrCal
      if (lbsToKg(p.bodyCellMassLbs)) humeExtras.bodyCellMassKg = lbsToKg(p.bodyCellMassLbs)
      let date = new Date().toISOString().slice(0, 10)
      if (p.endDate) {
        const now = new Date()
        let d = new Date(`${p.endDate} ${now.getFullYear()}`)
        // Guard cross-year edge case: if parsed date is more than 7 days in the future, try previous year
        if (!isNaN(d) && d - now > 7 * 86400000) d = new Date(`${p.endDate} ${now.getFullYear() - 1}`)
        if (!isNaN(d)) date = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
      }
      saveBodyWeightEntry(date, weightKg, fatPct, 'hume', Object.keys(humeExtras).length ? humeExtras : null)
      if (fatPct) { setBodyFatPct(String(fatPct)); localStorage.setItem('user_body_fat_pct', String(fatPct)) }
      if (weightKg) {
        if (units === 'imperial') setWeightLbs(String(Math.round(weightKg * 2.2046 * 10) / 10))
        else setWeightKg(String(weightKg))
      }
      const parts = [
        weightKg ? `${Math.round(weightKg * 2.2046)} lbs` : null,
        fatPct ? `${fatPct}% fat` : null,
        humeExtras.visceralFatIndex != null ? `VFI ${humeExtras.visceralFatIndex}` : null,
        humeExtras.skelMuscleKg ? `${Math.round(humeExtras.skelMuscleKg * 2.2046)} lbs muscle` : null,
      ].filter(Boolean)
      setHumeMsg(`Saved to ${date}: ${parts.join(' · ')}`)
    } catch (err) {
      setHumeMsg(`Error: ${err.message}`)
    } finally {
      setHumeImporting(false)
      setTimeout(() => setHumeMsg(''), 12000)
    }
  }

  const handleAppleHealthImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setAhImporting(true)
    setAhMsg('')
    const reader = new FileReader()
    reader.onerror = () => { setAhImporting(false); setAhMsg('Error: could not read file') }
    reader.onload = (ev) => {
      try {
        const xml = ev.target.result
        const byDate = parseAppleHealthBodyData(xml)
        const dates = Object.keys(byDate).sort()
        if (!dates.length) { setAhMsg('No body composition records found'); setAhImporting(false); return }
        let weightCount = 0, fatCount = 0
        for (const date of dates) {
          const { kg, fatPct } = byDate[date]
          if (kg || fatPct) {
            saveBodyWeightEntry(date, kg ?? null, fatPct ?? null, 'apple_health')
            if (kg) weightCount++
            if (fatPct) fatCount++
          }
        }
        // Set latest body fat % as the live setting
        const latestDate = dates[dates.length - 1]
        if (byDate[latestDate]?.fatPct) {
          localStorage.setItem('user_body_fat_pct', String(byDate[latestDate].fatPct))
          setBodyFatPct(String(byDate[latestDate].fatPct))
        }
        setAhMsg(`Imported ${weightCount} weight + ${fatCount} body fat readings (${dates[0]} → ${latestDate})`)
      } catch (err) {
        setAhMsg(`Error: ${err.message}`)
      } finally {
        setAhImporting(false)
        setTimeout(() => setAhMsg(''), 8000)
      }
    }
    reader.readAsText(file)
  }

  const handleExport = async () => {
    setExporting(true)
    try { await exportCSV() } finally { setExporting(false) }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportMsg('')
    try {
      const result = await parseAndImportCSV(file)
      setImportMsg(`Imported ${result.count} ${result.type} record${result.count !== 1 ? 's' : ''}`)
    } catch (err) {
      setImportMsg(`Error: ${err.message}`)
    } finally {
      setImporting(false)
      setTimeout(() => setImportMsg(''), 5000)
    }
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
            <p className="text-sm font-semibold text-white">Google Health</p>
            <p className="text-xs text-gray-500">{connected ? 'Connected' : 'Not connected'}</p>
          </div>
        </div>
        {connected && (
          <button onClick={handleDisconnect} className="text-xs text-red-400 px-3 py-1.5 rounded-xl bg-[#1a1a1a]">
            Disconnect
          </button>
        )}
      </div>

      {/* Google Health credentials */}
      {!connected && (
        <div className="rounded-2xl p-4 space-y-4" style={{ background: '#111', border: '1px solid #222' }}>
          <div>
            <p className="text-sm font-semibold text-white mb-1">Connect Google Health</p>
            <p className="text-xs text-gray-500">You'll need a Google Cloud project with the Health API enabled</p>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Steps to get your Client ID:</p>
              <ol className="space-y-1 text-xs text-gray-500">
                <li>1. Go to <span className="text-white">console.cloud.google.com</span> → create a project</li>
                <li>2. Enable the <span className="text-white">Google Health API</span></li>
                <li>3. Create an OAuth 2.0 Client ID, set the redirect URI to your Vercel app URL</li>
                <li>4. Copy the <span className="text-white">Client ID</span> below</li>
              </ol>
            </div>
            <input
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00c9a7]"
              placeholder="Google Client ID (e.g. 1234-abc.apps.googleusercontent.com)"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
            />
            <button
              onClick={saveAndConnect}
              disabled={!clientId.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm transition-opacity disabled:opacity-40"
              style={{ background: '#00c9a7', color: '#000' }}
            >
              Connect to Google Health
            </button>
          </div>
        </div>
      )}

      {/* PIN Lock */}
      <PinSection />

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

        <div>
          <p className="text-xs text-gray-500 mb-1.5">Body Fat %</p>
          <div className="flex gap-2 items-center">
            <input
              type="number" min={3} max={60} step={0.1}
              className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
              placeholder="18"
              value={bodyFatPct}
              onChange={e => setBodyFatPct(e.target.value)}
            />
            <span className="text-xs text-gray-600">%</span>
            {bodyFatPct && !isNaN(parseFloat(bodyFatPct)) && (
              <span className="text-xs font-semibold" style={{ color: getBodyFatColor(parseFloat(bodyFatPct)) }}>
                {getBodyFatLabel(parseFloat(bodyFatPct))}
              </span>
            )}
          </div>
        </div>

        {previewBMI && (
          <p className="text-xs">
            <span className="text-gray-500">BMI: </span>
            <span className="font-bold" style={{ color: getBMIColor(previewBMI) }}>
              {previewBMI} — {getBMILabel(previewBMI)}
            </span>
          </p>
        )}

        {/* Waist Circumference */}
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Waist Circumference</p>
          <p className="text-[11px] text-gray-600 mb-1.5">Measure around your belly button — used for visceral fat risk</p>
          <div className="flex gap-2 items-center">
            {units === 'imperial' ? (
              <>
                <input
                  type="number" min={20} max={80} step={0.5}
                  className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
                  placeholder="34"
                  value={waistIn}
                  onChange={e => setWaistIn(e.target.value)}
                />
                <span className="text-xs text-gray-600">inches</span>
              </>
            ) : (
              <>
                <input
                  type="number" min={50} max={200} step={0.5}
                  className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
                  placeholder="87"
                  value={waistCmVal}
                  onChange={e => setWaistCmVal(e.target.value)}
                />
                <span className="text-xs text-gray-600">cm</span>
              </>
            )}
          </div>
        </div>

        {/* Grip Strength */}
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Grip Strength (dominant hand)</p>
          <p className="text-[11px] text-gray-600 mb-1.5">Use a hand dynamometer — one of the best longevity predictors</p>
          <div className="flex gap-2 items-center">
            {units === 'imperial' ? (
              <>
                <input
                  type="number" min={20} max={200} step={1}
                  className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
                  placeholder="95"
                  value={gripLbs}
                  onChange={e => setGripLbs(e.target.value)}
                />
                <span className="text-xs text-gray-600">lbs</span>
              </>
            ) : (
              <>
                <input
                  type="number" min={10} max={100} step={0.5}
                  className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
                  placeholder="43"
                  value={gripKgVal}
                  onChange={e => setGripKgVal(e.target.value)}
                />
                <span className="text-xs text-gray-600">kg</span>
              </>
            )}
          </div>
        </div>

        {/* VO2 Max */}
        <div>
          <p className="text-xs text-gray-500 mb-0.5">VO2 Max (mL/kg/min)</p>
          <p className="text-[11px] text-gray-600 mb-1.5">From Google Health app, Garmin, or lab test</p>
          <div className="flex gap-2 items-center">
            <input
              type="number" min={10} max={90} step={1}
              className="w-20 bg-[#1a1a1a] border rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
              style={{ borderColor: vo2MaxError ? '#ef4444' : '#333' }}
              placeholder="e.g. 46"
              value={vo2MaxVal}
              onChange={e => { setVo2MaxVal(e.target.value); setVo2MaxError('') }}
            />
            <span className="text-xs text-gray-600">mL/kg/min</span>
          </div>
          {vo2MaxError && <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>{vo2MaxError}</p>}
        </div>
      </div>

      {/* Lifestyle factors */}
      <div className="rounded-2xl p-4 space-y-5" style={{ background: '#111', border: '1px solid #222' }}>
        <div>
          <p className="text-sm font-semibold text-white">Lifestyle Factors</p>
          <p className="text-xs text-gray-500 mt-0.5">Factored into your biological age calculation.</p>
        </div>

        {/* Smoking */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Smoking</p>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #333' }}>
            {[['never', 'Never'], ['former', 'Former'], ['current', 'Current']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSmoking(val)}
                className="flex-1 py-2 text-xs font-semibold transition-colors"
                style={{
                  background: smoking === val ? (val === 'never' ? '#00c9a7' : val === 'former' ? '#f59e0b' : '#ef4444') : '#1a1a1a',
                  color: smoking === val ? '#000' : '#888',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Alcohol */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Alcohol (drinks/week)</p>
          <div className="flex gap-2 items-center">
            <input
              type="number" min={0} max={50}
              className="w-20 bg-[#1a1a1a] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#00c9a7] text-center"
              placeholder="0"
              value={alcoholWeek}
              onChange={e => setAlcoholWeek(e.target.value)}
            />
            <span className="text-xs text-gray-500">
              {alcoholWeek === '' ? '' : parseInt(alcoholWeek) === 0 ? 'None' : parseInt(alcoholWeek) < 7 ? 'Light' : parseInt(alcoholWeek) < 14 ? 'Moderate' : 'Heavy'}
            </span>
          </div>
        </div>

        {/* Blood pressure note */}
        <div className="space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Blood Pressure</p>
          <p className="text-xs text-gray-600">Log readings a few times a week in the <span className="text-gray-400">Journal</span> tab. A rolling average is used in your biological age calculation.</p>
        </div>
      </div>

      {/* Lab Results */}
      <LabResultsSection />

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
      {settingsError && (
        <p className="text-xs text-center" style={{ color: '#ef4444' }}>{settingsError}</p>
      )}

      {/* Push Notifications */}
      <PushNotificationsSection />

      {/* Apple Health Import */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Apple Health — Body Composition</p>
          <p className="text-xs text-gray-500">Import weight and body fat % history from your Hume scale (or any Apple Health source) directly into Soma.</p>
        </div>

        <div className="rounded-xl p-3 space-y-2" style={{ background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">How to export</p>
          {[
            'Open the Health app on iPhone',
            'Tap your profile photo → Export All Health Data',
            'Save the zip to Files',
            'Open Files → tap the zip → navigate to export.xml',
            'Tap the share icon → choose this app or pick the file below',
          ].map((s, i) => (
            <p key={i} className="text-[11px] text-gray-600">
              <span className="text-gray-500 font-semibold">{i + 1}.</span> {s}
            </p>
          ))}
        </div>

        <input
          ref={ahInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          className="hidden"
          onChange={handleAppleHealthImport}
        />
        <button
          onClick={() => ahInputRef.current?.click()}
          disabled={ahImporting}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a733' }}
        >
          {ahImporting ? 'Parsing…  (large files may take a moment)' : '↑ Select Apple Health export.xml'}
        </button>
        {ahMsg && (
          <p className="text-xs text-center" style={{ color: ahMsg.startsWith('Error') || ahMsg.startsWith('No') ? '#f59e0b' : '#00c9a7' }}>
            {ahMsg}
          </p>
        )}

        <div className="rounded-xl p-3" style={{ background: '#0d1a0d', border: '1px solid #1a2e1a' }}>
          <p className="text-[11px] text-gray-500">
            <span className="text-green-500 font-semibold">Note:</span> This imports weight and body fat % only. For full body composition data (VFI, skeletal muscle, etc.) use the Hume Health import below.
          </p>
        </div>
      </div>

      {/* Hume Health Import */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Hume Health — Full Body Composition</p>
          <p className="text-xs text-gray-500">Screenshot your Hume progress report and import all body composition metrics directly into Soma's biological age algorithm.</p>
        </div>

        <div className="rounded-xl p-3 space-y-2" style={{ background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">What gets imported</p>
          {[
            'Weight, Body Fat %, Lean Mass → BMI / FFMI scoring',
            'Visceral Fat Index → replaces waist circumference in algorithm',
            'Skeletal Muscle Mass → anti-sarcopenia scoring (Janssen JAMA 2000)',
            'Body Water %, BMR → stored for reference',
          ].map((s, i) => (
            <p key={i} className="text-[11px] text-gray-600">· {s}</p>
          ))}
        </div>

        <div className="rounded-xl p-3 space-y-1" style={{ background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">How to import</p>
          <p className="text-[11px] text-gray-600">1. In Hume app → Progress Report → scroll through all screens</p>
          <p className="text-[11px] text-gray-600">2. Screenshot each screen (4 screenshots covers everything)</p>
          <p className="text-[11px] text-gray-600">3. Select all screenshots below — Claude reads them all at once</p>
          <p className="text-[11px] text-gray-600 mt-1">Requires a Claude API key (set above in API Keys section)</p>
        </div>

        <input
          ref={humeInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleHumeImport}
        />
        <button
          onClick={() => humeInputRef.current?.click()}
          disabled={humeImporting}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a733' }}
        >
          {humeImporting ? 'Reading screenshots…' : '↑ Select Hume Screenshots (select all at once)'}
        </button>
        {humeMsg && (
          <p className="text-xs text-center" style={{ color: humeMsg.startsWith('Error') ? '#f59e0b' : '#00c9a7' }}>
            {humeMsg}
          </p>
        )}
      </div>

      {/* Data import / export */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Data</p>
          <p className="text-xs text-gray-500">Import blood pressure or lab results from CSV, or export your full history.</p>
        </div>

        {/* Import */}
        <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
        <button
          onClick={() => csvInputRef.current?.click()}
          disabled={importing}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: '#1a1a1a', color: '#888', border: '1px solid #333' }}
        >
          {importing ? 'Importing…' : '⬆ Import CSV (BP or Labs)'}
        </button>
        {importMsg && (
          <p className="text-xs text-center" style={{ color: importMsg.startsWith('Error') ? '#ef4444' : '#00c9a7' }}>
            {importMsg}
          </p>
        )}

        {/* Template hint */}
        <div className="rounded-xl p-3 space-y-1" style={{ background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Accepted formats</p>
          <pre className="text-[11px] font-mono text-gray-600 leading-relaxed">{`BP:   date,systolic,diastolic
Labs: marker,value,date`}</pre>
        </div>

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: '#1a1a1a', color: '#888', border: '1px solid #333' }}
        >
          {exporting ? 'Preparing…' : '⬇ Export Health History (CSV)'}
        </button>

        {/* Cloud Backup */}
        <div className="pt-2" style={{ borderTop: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Cloud Backup</p>
          <p className="text-xs text-gray-600 mb-3">
            Save all settings and health history to the cloud so a browser wipe won't lose your data.
            {lastBackup && (
              <span className="block mt-1 text-gray-500">
                Last backed up: {new Date(lastBackup).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleBackup}
              disabled={backupBusy}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a7' }}
            >
              {backupBusy ? '…' : '☁ Backup Now'}
            </button>
            <button
              onClick={handleRestore}
              disabled={backupBusy}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: '#1a1a1a', color: '#888', border: '1px solid #333' }}
            >
              {backupBusy ? '…' : '⬇ Restore'}
            </button>
          </div>
          {backupMsg && (
            <p className="text-xs text-center mt-2" style={{ color: backupMsg.startsWith('Error') ? '#ef4444' : '#00c9a7' }}>
              {backupMsg}
            </p>
          )}
        </div>
      </div>

      {/* Data Freshness */}
      <DataFreshnessSection />

      {/* Note on data source */}
      <div className="rounded-2xl p-4" style={{ background: '#1a1000', border: '1px solid #3a2a00' }}>
        <p className="text-xs text-yellow-600 font-semibold uppercase tracking-wider mb-2">Note</p>
        <p className="text-xs text-gray-500">
          This app syncs through the Google Health API. If a sync ever fails after reconnecting, check that your Google Cloud OAuth credentials are still valid — your data and settings will not be affected.
        </p>
      </div>

      {/* Native app upgrade */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Upgrade to Native App</p>
        <p className="text-xs text-gray-500">These features require upgrading from PWA to a native iPhone app (Option B). When you're ready, ask Claude to build it.</p>
        {[
          { icon: '🏠', label: 'Home Screen Widget', desc: 'Recovery ring on your home screen without opening the app' },
          { icon: '🍎', label: 'Apple Health Write-Back', desc: 'Push your Soma recovery/strain scores into the Apple Health app' },
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
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#C9A84C', fontFamily: 'Georgia, serif' }}>Soma</p>
        <p className="text-xs text-gray-600">σῶμα · Your body, understood. Data stays on your device. No third-party servers. Built for personal use only.</p>
      </div>
    </div>
  )
}
