import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function CustomTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {Math.round(p.value)}{unit}
        </p>
      ))}
    </div>
  )
}

export function LineGraph({ data, dataKey, color = '#00c9a7', unit = '', reference, height = 80 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
        {reference && <ReferenceLine y={reference} stroke="#444" strokeDasharray="3 3" />}
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function BarGraph({ data, dataKey, color = '#3b82f6', unit = '', height = 80 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
