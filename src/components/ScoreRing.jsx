import { useState, useEffect, useId } from 'react'

export default function ScoreRing({
  score, max = 100, color = '#00c9a7',
  size = 140, strokeWidth = 10,
  label, sublabel, unit = '',
}) {
  const uid    = useId().replace(/:/g, 'x')
  const gradId = `sg${uid}`
  const r    = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const targetOffset = circ * (1 - Math.min(score, max) / max)

  // Arc: start fully empty, animate to target after first paint
  const [arcOffset, setArcOffset] = useState(circ)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setArcOffset(targetOffset))
    return () => cancelAnimationFrame(raf)
  }, [targetOffset])

  // Number count-up (easeOutCubic, 750ms)
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (score == null || isNaN(score)) { setDisplay(0); return }
    const isFloat = score !== Math.round(score)
    const duration = 750
    const startTs = Date.now()
    let raf
    const tick = () => {
      const t = Math.min((Date.now() - startTs) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const val = score * eased
      setDisplay(isFloat ? Math.round(val * 10) / 10 : Math.round(val))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setDisplay(score)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])

  // Gradient: 70-unit lighter shade → full color
  const hex = (color || '#00c9a7').replace('#', '').padEnd(6, '0')
  const pr = parseInt(hex.slice(0, 2), 16)
  const pg = parseInt(hex.slice(2, 4), 16)
  const pb = parseInt(hex.slice(4, 6), 16)
  const lighter = `rgb(${Math.min(255, pr + 70)},${Math.min(255, pg + 70)},${Math.min(255, pb + 70)})`

  const cx = size / 2

  return (
    <div className="relative flex flex-col items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={lighter} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e1e1e" strokeWidth={strokeWidth} />
        {/* Animated fill arc */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={arcOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.33, 1, 0.68, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold text-white leading-none"
          style={{ fontSize: size * 0.22, fontVariantNumeric: 'tabular-nums' }}
        >
          {display}{unit}
        </span>
        {label && (
          <span className="text-xs font-semibold mt-0.5" style={{ color, fontSize: size * 0.085 }}>
            {label}
          </span>
        )}
        {sublabel && (
          <span className="text-gray-500 mt-0.5" style={{ fontSize: size * 0.075 }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}
