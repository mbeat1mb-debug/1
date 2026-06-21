const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
].join(' ')
const REDIRECT_PATH = '/'

function getRedirectUri() {
  return `${window.location.origin}${REDIRECT_PATH}`
}

function generateState() {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function startOAuth(clientId) {
  const state = generateState()
  localStorage.setItem('oauth_state', state)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: getRedirectUri(),
    state,
    // Google only issues a refresh_token on first consent (or when re-prompted);
    // access_type=offline + prompt=consent guarantee we get one every connect.
    access_type: 'offline',
    prompt: 'consent',
  })
  window.location.href = `${GOOGLE_AUTH_URL}?${params}`
}

export async function handleOAuthCallback(clientId) {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')

  if (error) { localStorage.setItem('oauth_debug_error', `Google returned error: ${error}`); return null }
  if (!code) return null

  // Some browsers (notably Safari) clear a site's localStorage right after it
  // redirects out to another domain and back, as an anti-tracking measure —
  // that wipes the saved state before we can compare it. Single-user app, so
  // skip the comparison rather than block a legitimate login over a false positive.
  localStorage.removeItem('oauth_state')

  try {
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: getRedirectUri() }),
    })
    if (!res.ok) {
      const text = await res.text()
      localStorage.setItem('oauth_debug_error', `Server rejected token exchange (${res.status}): ${text}`)
      return null
    }
    const tokens = await res.json()
    saveTokens(tokens)
    localStorage.removeItem('oauth_debug_error')
    window.history.replaceState({}, '', '/')
    return tokens
  } catch (e) {
    localStorage.setItem('oauth_debug_error', `Network error: ${e.message}`)
    return null
  }
}

export function saveTokens({ access_token, refresh_token, expires_in }) {
  const expiresInSec = Number(expires_in)
  const expiry = Date.now() + ((Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : 3600) - 60) * 1000
  localStorage.setItem('access_token', access_token)
  // Google omits refresh_token on routine refreshes (no rotation) — keep the
  // existing one rather than clobbering it with undefined.
  if (refresh_token) localStorage.setItem('refresh_token', refresh_token)
  localStorage.setItem('token_expiry', String(expiry))
}

export function getTokens() {
  return {
    access_token: localStorage.getItem('access_token'),
    refresh_token: localStorage.getItem('refresh_token'),
    token_expiry: Number(localStorage.getItem('token_expiry') || 0),
  }
}

export function isTokenExpired() {
  const { token_expiry } = getTokens()
  return Date.now() >= token_expiry
}

// Single-flight guard: when many parallel requests hit an expired token at once,
// they share one refresh instead of each POSTing the (rotating) refresh token,
// which would let all but the first fail and tear down a valid session.
let refreshPromise = null

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const { refresh_token } = getTokens()
    if (!refresh_token) return false
    // Without a timeout, a slow/hung /api/refresh call (cold serverless start,
    // stalled connection) blocks every ghFetch behind it forever — the sync
    // never finishes and the UI is stuck on "gathering" with nothing to show
    // for it, since nothing ever rejects or resolves to let the caller move on.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
        signal: controller.signal,
      })
      if (!res.ok) return false
      const tokens = await res.json()
      saveTokens(tokens)
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  })()
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

export function isConnected() {
  const { access_token } = getTokens()
  return !!access_token
}

export function disconnect() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('token_expiry')
}
