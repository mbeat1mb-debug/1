import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { C, SERIF } from '../lib/almanacTheme'

const axisTick = { fill: C.faint, fontSize: 11, fontFamily: SERIF }

function CustomTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
      <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: C.faint, marginBottom: 2 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: p.color }}>
          {p.value != null ? `${Math.round(p.value)}${unit}` : '—'}
        </p>
      ))}
    </div>
  )
}

export function LineGraph({ data, dataKey, color = '#3E9C7E', unit = '', reference, height = 80 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
        {reference && <ReferenceLine y={reference} stroke={C.faint} strokeDasharray="3 3" />}
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
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
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
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
        {reference1 && <ReferenceLine y={reference1} stroke={C.faint} strokeDasharray="3 3" />}
        {reference2 && <ReferenceLine y={reference2} stroke={C.ruleSoft} strokeDasharray="3 3" />}
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Line type="monotone" dataKey={dataKey1} stroke={color1} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color1 }} />
        <Line type="monotone" dataKey={dataKey2} stroke={color2} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color2 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
