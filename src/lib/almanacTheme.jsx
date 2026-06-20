// ── Shared Almanac design language ────────────────────────────────────────────
// Ink on warm paper, editorial serif type, hairline rules and dotted leaders.
// No rings, no emoji, no traffic-light chips, no uppercase tracking-widest
// labels, no white rounded-shadow cards. Pulled out of HomeAlmanac.jsx so every
// screen draws from the same palette and primitives instead of re-inventing them.

export const C = {
  paper:   '#F6F1E9',
  ink:     '#28231C',
  inkSoft: '#6E6557',
  faint:   '#9A8F7E',
  rule:    '#DBD1BF',
  ruleSoft:'#E7DECE',
  gold:    '#C9A84C',
}

export const SERIF = 'Georgia, "Times New Roman", serif'

export const STAGE = { deep: '#5E5198', rem: '#9B7FD4', light: '#CDC3E6', wake: '#D9A24F', asleep: '#BCAFDD' }

export const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
export const norm = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / Math.max(hi - lo, 1)))
export const fmtDur = m => m == null ? '--' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`

// Small-caps printed-style label.
export function Label({ children, style }) {
  return (
    <span style={{ fontFamily: SERIF, fontVariant: 'small-caps', letterSpacing: '0.08em', fontSize: 12, color: C.faint, ...style }}>
      {children}
    </span>
  )
}

// Masthead back link — a printed "‹ Back", not a floating white pill.
export function BackLink({ onNav, to = 'home', children = 'Back' }) {
  return (
    <button onClick={() => onNav(to)} className="flex items-center gap-1 active:opacity-50 transition-opacity" style={{ color: C.inkSoft }}>
      <span style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1 }}>‹</span>
      <Label style={{ color: C.inkSoft }}>{children}</Label>
    </button>
  )
}

// Section header: small-caps label sitting on a hairline rule.
export function SectionLabel({ children, right, style }) {
  return (
    <div className="flex items-baseline justify-between" style={{ borderBottom: `1px solid ${C.rule}`, paddingBottom: 6, ...style }}>
      <Label>{children}</Label>
      {right && <Label style={{ color: C.faint }}>{right}</Label>}
    </div>
  )
}

// A page masthead matching HomeAlmanac's: wordmark scaled down + a back link.
export function Masthead({ title, onNav, onBack = 'home' }) {
  return (
    <div className="flex items-center justify-between">
      <BackLink onNav={onNav} to={onBack} />
      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15, letterSpacing: '0.18em', color: C.faint }}>SOMA</span>
    </div>
  )
}

// Ledger row — replaces the card StatRow: name, dotted leader, figure.
export function LedgerRow({ label, value, unit = '', accent, note }) {
  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontFamily: SERIF, fontSize: 15, color: C.inkSoft }}>{label}</span>
        <span style={{ flex: 1, borderBottom: `1px dotted ${C.rule}`, transform: 'translateY(-4px)' }} />
        <span style={{ fontFamily: SERIF, fontSize: 17, color: accent || C.ink, fontWeight: 600 }} className="tabular">{value}</span>
        {unit && <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{unit}</span>}
      </div>
      {note && <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 2 }}>{note}</p>}
    </div>
  )
}

// Needle-on-scale instrument — the ring replacement. `pos01`/`base01` are 0..1
// positions on the printed scale; lower-is-better metrics should be pre-inverted
// by the caller so "right" always reads as "good".
export function Gauge({ label, value, unit, sub, pos01, base01, accent, size = 30 }) {
  const p = Math.max(0, Math.min(1, pos01 ?? 0.5))
  const b = base01 == null ? null : Math.max(0, Math.min(1, base01))
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        {sub && <span style={{ fontFamily: SERIF, color: C.faint, fontSize: 11, fontStyle: 'italic' }}>{sub}</span>}
      </div>
      <div className="flex items-baseline gap-1 mt-0.5 mb-2">
        <span style={{ fontFamily: SERIF, fontSize: size, color: C.ink, lineHeight: 1, fontWeight: 600 }} className="tabular">{value}</span>
        {unit && <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{unit}</span>}
      </div>
      <div style={{ position: 'relative', height: 14 }}>
        <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 1, background: C.rule }} />
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} style={{ position: 'absolute', top: 4, left: `${t * 100}%`, width: 1, height: 6, background: C.ruleSoft }} />
        ))}
        {b != null && (
          <div style={{ position: 'absolute', top: 2, left: `${b * 100}%`, transform: 'translateX(-50%)', width: 1.5, height: 10, background: C.faint, opacity: 0.7 }} />
        )}
        <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)' }}>
          <svg width="12" height="14" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={accent || C.ink} /></svg>
        </div>
      </div>
    </div>
  )
}

// Plain annotation block — replaces the colour-tinted "Recommendation" card.
export function Note({ children, accent }) {
  return (
    <div style={{ borderLeft: `2px solid ${accent || C.gold}`, paddingLeft: 14 }}>
      <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.55, color: C.inkSoft }}>{children}</p>
    </div>
  )
}
