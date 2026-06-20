import { C, SERIF, Label } from '../lib/almanacTheme'

export default function MetricCard({ label, value, unit = '', sub, color, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col text-left w-full py-3 active:opacity-60 transition-opacity">
      <Label>{label}</Label>
      <div className="flex items-baseline gap-1 mt-1">
        <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: color || C.ink }}>{value}</span>
        {unit && <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{unit}</span>}
      </div>
      {sub && <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 2 }}>{sub}</span>}
    </button>
  )
}

export function StatRow({ label, value, unit = '', color }) {
  return (
    <div className="flex items-baseline gap-2 py-2.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <span style={{ fontFamily: SERIF, fontSize: 15, color: C.inkSoft }}>{label}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${C.rule}`, transform: 'translateY(-4px)' }} />
      <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: color || C.ink }} className="tabular">{value}</span>
      {unit && <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{unit}</span>}
    </div>
  )
}
