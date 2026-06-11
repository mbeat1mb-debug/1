import { useState, useEffect } from 'react'
import { isConnected, startOAuth, disconnect } from '../lib/auth'
import {
  getPermission, isPushSupported, getPushSubscription,
  subscribeToPush, unsubscribeFromPush, savePushPrefs,
  getLocalPushPrefs, DEFAULT_PREFS,
} from '../lib/notifications'

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
  let utcH = ((h - utcOffset) % 24 + 24) % 24
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
    setLoading(true)
    setError('')
    try {
      await subscribeToPush(prefs)
      setSubscribed(true)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSavePrefs = async () => {
    setLoading(true)
    setError('')
    try {
      await savePushPrefs(prefs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUnsubscribe = async () => {
    await unsubscribeFromPush()
    setSubscribed(false)
  }

  const morningCron = toCronExpression(prefs.morningTime, tzEntry.utcOffset)
  const eveningCron = toCronExpression(prefs.eveningTime, tzEntry.utcOffset)
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

      {/* Morning toggle + time */}
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
            {MORNING_TIMES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Evening toggle + time */}
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
            {EVENING_TIMES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
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
          {TIMEZONES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Cron update warning */}
      {needsCronUpdate && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: '#1a1000', border: '1px solid #3a2a00' }}>
          <p className="text-xs text-yellow-500 font-semibold">One more step to apply your times</p>
          <p className="text-xs text-gray-500">
            Update <span className="text-white font-mono">vercel.json</span> crons to match your timezone:
          </p>
          <pre className="rounded-lg p-2 overflow-x-auto text-[11px] font-mono text-green-400" style={{ background: '#0a0a0a' }}>
{`"crons": [
  {"path": "/api/push-morning", "schedule": "${morningCron}"},
  {"path": "/api/push-evening", "schedule": "${eveningCron}"}
]`}
          </pre>
          <p className="text-xs text-gray-600">Edit vercel.json in your repo, then redeploy. One-time fix.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Action button */}
      <button
        onClick={subscribed ? handleSavePrefs : handleSubscribe}
        disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
        style={{ background: saved ? '#00c9a7' : '#00c9a720', color: saved ? '#000' : '#00c9a7', border: '1px solid #00c9a733' }}
      >
        {loading ? 'Saving…' : saved ? '✓ Saved'
          : subscribed ? 'Update Schedule' : 'Enable Push Notifications'}
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
            {
              step: '1',
              title: 'Generate VAPID keys',
              code: 'npx web-push generate-vapid-keys',
              desc: 'Run in your terminal. Copy the two keys.',
            },
            {
              step: '2',
              title: 'Add to Vercel environment variables',
              code: 'VAPID_PUBLIC_KEY\nVAPID_PRIVATE_KEY\nVAPID_SUBJECT=mailto:your@email.com',
              desc: 'Vercel Dashboard → Project → Settings → Environment Variables',
            },
            {
              step: '3',
              title: 'Create a Vercel KV database',
              code: null,
              desc: 'Vercel Dashboard → Storage → Create Database → KV → Link to project. Env vars are added automatically.',
            },
            {
              step: '4',
              title: 'Add a cron secret',
              code: 'CRON_SECRET=any-random-string-you-choose',
              desc: 'Add to Vercel env vars. Protects your cron endpoints.',
            },
            {
              step: '5',
              title: 'Redeploy',
              code: null,
              desc: 'Vercel Dashboard → Deployments → Redeploy. Then tap Enable Push Notifications above.',
            },
          ].map(s => (
            <div key={s.step} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] font-bold text-gray-400 flex-shrink-0">{s.step}</span>
                <p className="text-xs font-semibold text-gray-300">{s.title}</p>
              </div>
              {s.code && (
                <pre className="text-[11px] font-mono text-green-400 rounded-lg p-2 overflow-x-auto ml-7"
                  style={{ background: '#0a0a0a' }}>{s.code}</pre>
              )}
              <p className="text-[11px] text-gray-600 ml-7">{s.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Settings screen ──────────────────────────────────────────────────────

export default function Settings({ onBack }) {
  const [clientId, setClientId] = useState(() => localStorage.getItem('fitbit_client_id') || '')
  const [connected, setConnected] = useState(isConnected)
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [saved, setSaved] = useState(false)

  const saveAndConnect = () => {
    if (!clientId.trim()) return
    localStorage.setItem('fitbit_client_id', clientId.trim())
    if (claudeKey.trim()) localStorage.setItem('claude_api_key', claudeKey.trim())
    startOAuth(clientId.trim())
  }

  const saveSettings = () => {
    if (claudeKey.trim()) localStorage.setItem('claude_api_key', claudeKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDisconnect = () => {
    disconnect()
    localStorage.removeItem('fitbit_client_id')
    setConnected(false)
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
