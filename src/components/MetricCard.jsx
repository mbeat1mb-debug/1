export default function MetricCard({ label, value, unit = '', sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col bg-[#111] rounded-2xl p-4 text-left w-full transition-opacity active:opacity-70"
      style={{ border: '1px solid #222' }}
    >
      <span className="text-gray-500 text-xs uppercase tracking-wider mb-2">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color: color || '#fff' }}>{value}</span>
        {unit && <span className="text-gray-400 text-sm">{unit}</span>}
      </div>
      {sub && <span className="text-gray-600 text-xs mt-1">{sub}</span>}
    </button>
  )
}

export function StatRow({ label, value, unit = '', color }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <span className="text-gray-400 text-sm">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="font-semibold text-sm" style={{ color: color || '#fff' }}>{value}</span>
        {unit && <span className="text-gray-500 text-xs">{unit}</span>}
      </div>
    </div>
  )
}
