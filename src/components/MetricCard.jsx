export default function MetricCard({ label, value, unit = '', sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-2xl p-5 text-left w-full card-tap"
      style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}
    >
      <span className="text-[9px] uppercase tracking-widest mb-2" style={{ color: '#9a8f7e' }}>{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color: color || '#1a1a1a' }}>{value}</span>
        {unit && <span className="text-sm" style={{ color: '#9a8f7e' }}>{unit}</span>}
      </div>
      {sub && <span className="text-xs mt-1" style={{ color: '#b3a890' }}>{sub}</span>}
    </button>
  )
}

export function StatRow({ label, value, unit = '', color }) {
  return (
    <div className="flex items-center justify-between py-3.5" style={{ borderBottom: '1px solid #ece3d4' }}>
      <span className="text-sm" style={{ color: '#7d7363' }}>{label}</span>
      <div className="flex items-center gap-2.5">
        {color && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: color, boxShadow: `0 0 7px ${color}cc` }}
          />
        )}
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold" style={{ color: color || '#1a1a1a' }}>{value}</span>
          {unit && <span className="text-xs" style={{ color: '#9a8f7e' }}>{unit}</span>}
        </div>
      </div>
    </div>
  )
}
