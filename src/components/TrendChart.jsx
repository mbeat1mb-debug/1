import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function CustomTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-[#ece3d4] rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.08)' }}>
      <p className="text-[#9a8f7e] text-xs mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {Math.round(p.value ?? 0)}{unit}
        </p>
      ))}
    </div>
  )
}

export function LineGraph({ data, dataKey, color = '#3E9C7E', unit = '', reference, height = 80 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
        {reference && <ReferenceLine y={reference} stroke="#cabfa9" strokeDasharray="3 3" />}
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function BarGraph({ data, dataKey, color = '#9B7FD4', unit = '', height = 80 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DualLineGraph({ data, dataKey1, dataKey2, color1 = '#ef4444', color2 = '#9B7FD4', unit = '', height = 80, reference1, reference2 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
        {reference1 && <ReferenceLine y={reference1} stroke="#cabfa9" strokeDasharray="3 3" />}
        {reference2 && <ReferenceLine y={reference2} stroke="#ece3d4" strokeDasharray="3 3" />}
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Line type="monotone" dataKey={dataKey1} stroke={color1} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color1 }} />
        <Line type="monotone" dataKey={dataKey2} stroke={color2} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color2 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
