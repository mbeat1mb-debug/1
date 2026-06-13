const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize'
const SCOPES = 'activity heartrate profile sleep settings oxygen_saturation respiratory_rate cardio_fitness'
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
  sessionStorage.setItem('oauth_state', state)
  // No `prompt` param: Fitbit shows login/consent only when needed, so
  // reconnects with an active Fitbit session are silent (auto-connect UX)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: getRedirectUri(),
    state,
  })
  window.location.href = `${FITBIT_AUTH_URL}?${params}`
}

export async function handleOAuthCallback(clientId) {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  if (error || !code) return null

  const savedState = sessionStorage.getItem('oauth_state')
  if (state !== savedState) return null

  sessionStorage.removeItem('oauth_state')

  try {
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: getRedirectUri() }),
    })
    if (!res.ok) return null
    const tokens = await res.json()
    saveTokens(tokens)
    window.history.replaceState({}, '', '/')
    return tokens
  } catch {
    return null
  }
}

export function saveTokens({ access_token, refresh_token, expires_in }) {
  const expiry = Date.now() + ((Number(expires_in) || 3600) - 60) * 1000
  localStorage.setItem('access_token', access_token)
  localStorage.setItem('refresh_token', refresh_token)
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
    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
      })
      if (!res.ok) return false
      const tokens = await res.json()
      saveTokens(tokens)
      return true
    } catch {
      return false
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
