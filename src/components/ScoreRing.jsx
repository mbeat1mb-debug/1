import { C, SERIF } from '../lib/almanacTheme'

// Printed dial — the day's headline figure plus a needle on a scale, replacing
// the circular progress-ring widget. Keeps the old prop API (score, max, color,
// size, label, sublabel, unit) so every screen that called <ScoreRing /> keeps
// working unchanged.
export default function ScoreRing({ score = 0, max = 100, color = C.ink, size = 140, label, sublabel, unit = '' }) {
  const p = Math.max(0, Math.min(1, (score || 0) / max))
  return (
    <div style={{ width: size }}>
      <div className="flex items-baseline gap-1">
        <span style={{ fontFamily: SERIF, fontSize: size * 0.34, fontWeight: 700, color: C.ink, lineHeight: 1 }} className="tabular">
          {Math.round(score)}
        </span>
        {unit ? (
          <span style={{ fontFamily: SERIF, fontSize: size * 0.12, color: C.faint }}>{unit}</span>
        ) : max !== 100 ? (
          <span style={{ fontFamily: SERIF, fontSize: size * 0.12, color: C.faint }}>/ {max}</span>
        ) : null}
      </div>
      {label && <p style={{ fontFamily: SERIF, fontSize: size * 0.1, color, fontWeight: 600, marginTop: 2 }}>{label}</p>}
      <div style={{ position: 'relative', height: 16, marginTop: 10 }}>
        <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 1, background: C.rule }} />
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} style={{ position: 'absolute', top: 4, left: `${t * 100}%`, width: 1, height: 6, background: C.ruleSoft }} />
        ))}
        <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)' }}>
          <svg width="14" height="16" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={color} /></svg>
        </div>
      </div>
      {sublabel && <p style={{ fontFamily: SERIF, fontSize: size * 0.08, color: C.faint, marginTop: 4 }}>{sublabel}</p>}
    </div>
  )
}
