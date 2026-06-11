import { useState } from 'react'
import { isConnected, startOAuth, disconnect } from '../lib/auth'
import { getPermission, requestPermission } from '../lib/notifications'

export default function Settings({ onBack }) {
  const [clientId, setClientId] = useState(() => localStorage.getItem('fitbit_client_id') || '')
  const [connected, setConnected] = useState(isConnected)
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [saved, setSaved] = useState(false)
  const [notifPerm, setNotifPerm] = useState(getPermission)

  const enableNotifications = async () => {
    const result = await requestPermission()
    setNotifPerm(result)
  }

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

      {/* Notifications */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {notifPerm === 'unsupported' ? 'Not supported in this browser'
                : notifPerm === 'granted' ? 'Enabled — you\'ll get health alerts'
                : notifPerm === 'denied' ? 'Blocked — enable in iOS Settings → Safari'
                : 'Off — tap to enable'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{
              background: notifPerm === 'granted' ? '#00c9a7' : notifPerm === 'denied' ? '#ef4444' : '#555'
            }} />
          </div>
        </div>
        {notifPerm !== 'granted' && notifPerm !== 'unsupported' && notifPerm !== 'denied' && (
          <button
            onClick={enableNotifications}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
            style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a733' }}
          >
            Enable Notifications
          </button>
        )}
        {notifPerm === 'denied' && (
          <p className="text-xs text-gray-600">
            Open iOS Settings → scroll to Safari → Notifications → allow for this site.
          </p>
        )}
        {notifPerm === 'granted' && (
          <div className="space-y-2 pt-1">
            {[
              { label: 'Recovery red zone', desc: 'Score below 34% — rest day alert' },
              { label: 'Sleep debt ≥ 3h', desc: 'Weekly sleep deficit warning' },
              { label: 'High stress', desc: 'Stress score above 78' },
              { label: 'Achievements', desc: 'When you unlock a new badge' },
            ].map(n => (
              <div key={n.label} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00c9a7] mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-300 font-medium">{n.label}</p>
                  <p className="text-[11px] text-gray-600">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
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
