import { useState } from 'react'
import { verifyPin, setPin } from '../lib/pin'

function Dots({ count, error }) {
  return (
    <div className="flex gap-5">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="w-3.5 h-3.5 rounded-full transition-all duration-150"
          style={{ background: error ? '#ef4444' : i < count ? '#3E9C7E' : '#EAE2D2' }}
        />
      ))}
    </div>
  )
}

function Key({ label, onPress, children }) {
  return (
    <button
      onClick={onPress}
      className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl font-light text-[#1a1a1a] active:opacity-60 transition-opacity"
      style={{ background: label ? '#fff' : 'transparent', boxShadow: label ? '0 2px 8px rgba(0,0,0,0.06)' : 'none' }}
    >
      {children ?? label}
    </button>
  )
}

export default function PinLock({ onUnlock, setup = false }) {
  const [phase, setPhase] = useState(setup ? 'enter' : 'verify')
  const [digits, setDigits] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState('')

  const headings = { verify: 'Enter PIN', enter: 'Create a PIN', confirm: 'Confirm PIN' }

  const reset = (err = '') => {
    setError(err)
    setDigits('')
  }

  const handleDigit = async (d) => {
    if (digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    setError('')

    if (next.length < 4) return

    if (phase === 'verify') {
      const ok = await verifyPin(next)
      if (ok) { onUnlock(); return }
      setTimeout(() => reset('Incorrect PIN'), 80)
    } else if (phase === 'enter') {
      setFirstPin(next)
      setTimeout(() => { setPhase('confirm'); setDigits('') }, 150)
    } else if (phase === 'confirm') {
      if (next === firstPin) {
        await setPin(next)
        onUnlock()
      } else {
        setTimeout(() => {
          reset("PINs don't match — try again")
          setPhase('enter')
          setFirstPin('')
        }, 80)
      }
    }
  }

  const handleBack = () => {
    setDigits(d => d.slice(0, -1))
    setError('')
  }

  return (
    <div className="fixed inset-0 bg-[#F6F1E9] flex flex-col items-center justify-center select-none" style={{ zIndex: 100 }}>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#C9A84C', fontFamily: 'Georgia, serif', letterSpacing: '0.2em' }}>Soma</p>
      <h2 className="text-lg font-semibold text-[#1a1a1a] mb-8">{headings[phase]}</h2>

      <Dots count={digits.length} error={!!error} />

      <div className="h-8 flex items-center mt-3 mb-6">
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <Key key={n} label={String(n)} onPress={() => handleDigit(String(n))} />
        ))}
        <div />
        <Key label="0" onPress={() => handleDigit('0')} />
        <Key onPress={handleBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#7d7363" strokeWidth={1.5} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
          </svg>
        </Key>
      </div>
    </div>
  )
}
