export default function MetricCard({ label, value, unit = '', sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-2xl p-4 text-left w-full card-tap"
      style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}
    >
      <span className="text-[9px] uppercase tracking-widest mb-2" style={{ color: '#4a4a4a' }}>{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color: color || '#e8e8e8' }}>{value}</span>
        {unit && <span className="text-sm" style={{ color: '#444' }}>{unit}</span>}
      </div>
      {sub && <span className="text-xs mt-1" style={{ color: '#3a3a3a' }}>{sub}</span>}
    </button>
  )
}

export function StatRow({ label, value, unit = '', color }) {
  return (
    <div className="flex items-center justify-between py-3.5" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <span className="text-sm" style={{ color: '#777' }}>{label}</span>
      <div className="flex items-center gap-2.5">
        {color && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: color, boxShadow: `0 0 7px ${color}cc` }}
          />
        )}
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold" style={{ color: color || '#e8e8e8' }}>{value}</span>
          {unit && <span className="text-xs" style={{ color: '#555' }}>{unit}</span>}
        </div>
      </div>
    </div>
  )
}
