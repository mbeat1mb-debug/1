export default function ScoreRing({
  score,
  max = 100,
  color = '#00c9a7',
  size = 140,
  strokeWidth = 10,
  label,
  sublabel,
  unit = '',
}) {
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score, max) / max)
  const cx = size / 2

  return (
    <div className="relative flex flex-col items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#222" strokeWidth={strokeWidth} />
        {/* Fill */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-white leading-none" style={{ fontSize: size * 0.22 }}>
          {score}{unit}
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
