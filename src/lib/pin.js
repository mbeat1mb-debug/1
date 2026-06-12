const KEY = 'app_pin_hash'
const SALT = 'fbd-pin:'

async function hashPin(pin) {
  const data = new TextEncoder().encode(SALT + pin)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function isPinSet() {
  return !!localStorage.getItem(KEY)
}

export async function setPin(pin) {
  const hash = await hashPin(pin)
  localStorage.setItem(KEY, hash)
}

export async function verifyPin(pin) {
  const stored = localStorage.getItem(KEY)
  if (!stored) return true
  const hash = await hashPin(pin)
  return hash === stored
}

export function removePin() {
  localStorage.removeItem(KEY)
}
