import { useEffect, useState, useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Cell, Tooltip as RechartTooltip,
  ReferenceLine, ResponsiveContainer, LineChart, Line, BarChart, Bar,
} from 'recharts'
import { LineGraph } from '../components/TrendChart'
import { getHRVNorm, getUserAge, getRecoveryColor, localToday } from '../lib/calculations'
import { getHistory } from '../lib/db'

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#7d7363" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

const CARD = { background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }
const TITLE = 'text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-4'
const EMPTY = 'text-[#b3a890] text-sm italic'

function formatMonthDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dayLabel(dateStr, todayStr) {
  if (!dateStr) return ''
  if (dateStr === todayStr) return 'Today'
  const diff = Math.round((new Date(todayStr) - new Date(dateStr)) / 86400000)
  return `-${diff}d`
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-white rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
      <p className="text-[#9a8f7e] text-xs mb-1">{d.dateLabel}</p>
      <p style={{ color: d.dotColor }} className="font-semibold">Recovery: {d.recovery}%</p>
      <p className="text-[#5c5648] font-semibold">Strain: {d.strain}</p>
    </div>
  )
}

function HRVTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
      <p className="text-[#9a8f7e] text-xs mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name === 'ma7' ? 'MA7: ' : ''}{Math.round(p.value ?? 0)} ms
        </p>
      ))}
    </div>
  )
}

function BRTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
      <p className="text-[#9a8f7e] text-xs mb-1">{label}</p>
      <p style={{ color: '#06b6d4' }} className="font-semibold">{Math.round(payload[0]?.value ?? 0)} br/min</p>
    </div>
  )
}


function getVO2Norms(age) {
  if (age <= 29) return [34, 42, 53]
  if (age <= 39) return [31, 39, 49]
  if (age <= 49) return [27, 35, 45]
  if (age <= 59) return [25, 34, 44]
  return [22, 30, 40]
}

function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const diffMs = d - startOfWeek1
  const weekNum = Math.floor(diffMs / 604800000) + 1
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function weekLabel(isoWeekStr) {
  const [year, wStr] = isoWeekStr.split('-W')
  const w = parseInt(wStr, 10)
  const jan4 = new Date(parseInt(year, 10), 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const weekStart = new Date(startOfWeek1.getTime() + (w - 1) * 604800000)
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Trends({ data, onNav }) {
  const {
    calendarDays = [],
    hrvHistory = [],
    rhrHistory = [],
    historyDates = [],
    vo2MaxHistory = [],
    sleepHistory = [],
    weeklyAZM = 0,
  } = data

  const [dbHistory, setDbHistory] = useState([])

  useEffect(() => {
    getHistory(30).then(rows => setDbHistory(rows))
  }, [])

  const todayStr = useMemo(() => localToday(), [])
  const age = getUserAge()
  const hrvNorm = getHRVNorm(age)

  const scatterPoints = useMemo(() =>
    calendarDays
      .filter(d => d.recovery != null && d.strain > 0)
      .slice(-30)
      .map(d => ({
        strain: Math.round(d.strain * 10) / 10,
        recovery: d.recovery,
        dotColor: getRecoveryColor(d.recovery),
        dateLabel: formatMonthDay(d.date),
      })),
    [calendarDays]
  )

  const recoveryChartData = useMemo(() =>
    calendarDays
      .filter(d => d.recovery != null)
      .slice(-30)
      .map(d => ({ label: dayLabel(d.date, todayStr), recovery: d.recovery })),
    [calendarDays, todayStr]
  )

  const hrvChartData = useMemo(() => {
    const dates = historyDates.slice(-30)
    const vals = hrvHistory.slice(-30)
    const points = dates.map((date, i) => ({
      label: dayLabel(date, todayStr),
      hrv: vals[i] != null ? Math.round(vals[i]) : null,
    })).filter(p => p.hrv != null)
    const ma7Points = points.map((p, i) => {
      if (i < 6) return { ...p, ma7: null }
      const slice = points.slice(i - 6, i + 1).map(x => x.hrv)
      const avg = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length)
      return { ...p, ma7: avg }
    })
    return ma7Points
  }, [hrvHistory, historyDates, todayStr])

  const rhrChartData = useMemo(() => {
    const dates = historyDates.slice(-30)
    const vals = rhrHistory.slice(-30)
    return dates
      .map((date, i) => ({ label: dayLabel(date, todayStr), rhr: vals[i] || null }))
      .filter(p => p.rhr != null)
  }, [rhrHistory, historyDates, todayStr])

  const vo2ChartData = useMemo(() =>
    vo2MaxHistory.map(d => ({ label: formatMonthDay(d.date), vo2Max: d.vo2Max })),
    [vo2MaxHistory]
  )
  const vo2Norms = getVO2Norms(age)

  const sleepChartData = useMemo(() =>
    calendarDays
      .filter(d => d.sleep > 0 && d.sleepEfficiency > 0)
      .slice(-30)
      .map(d => ({
        label: dayLabel(d.date, todayStr),
        sleepScore: Math.round(Math.min(100, (d.sleep / 480) * 70 + (d.sleepEfficiency / 100) * 30)),
      })),
    [calendarDays, todayStr]
  )

  const skinTempData = useMemo(() => {
    const rows = dbHistory.filter(d => d.skinTempDev != null)
    return rows.map(d => ({
      label: dayLabel(d.date, todayStr),
      dev: d.skinTempDev,
      barColor: d.skinTempDev <= 0 ? '#3E9C7E' : d.skinTempDev <= 0.3 ? '#D9A23F' : '#ef4444',
    }))
  }, [dbHistory, todayStr])

  const azmWeeklyData = useMemo(() => {
    const byWeek = {}
    for (const d of dbHistory) {
      if (!d.activeMinutes) continue
      const wk = isoWeek(d.date)
      byWeek[wk] = (byWeek[wk] || 0) + d.activeMinutes
    }
    const weeks = Object.keys(byWeek).sort().slice(-8)
    if (weeks.length === 0 && weeklyAZM > 0) {
      return [{ label: 'This week', azm: weeklyAZM }]
    }
    return weeks.map(wk => ({ label: weekLabel(wk), azm: byWeek[wk] }))
  }, [dbHistory, weeklyAZM])

  const brChartData = useMemo(() =>
    dbHistory
      .filter(d => d.br > 0)
      .map(d => ({ label: dayLabel(d.date, todayStr), br: d.br })),
    [dbHistory, todayStr]
  )

  const todayHRV = hrvHistory.length > 0 ? Math.round(hrvHistory[hrvHistory.length - 1]) : null
  const hasMA7 = hrvChartData.some(p => p.ma7 != null)

  return (
    <div className="px-4 pt-safe pb-28 space-y-4" style={{ background: '#F6F1E9', minHeight: '100vh' }}>

      <div className="pt-2 flex items-center gap-3">
        <BackButton onNav={onNav} />
        <div>
          <p className="text-[#9a8f7e] text-xs uppercase tracking-wider">Trends</p>
          <h1 className="text-xl font-bold">30-Day History</h1>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>Recovery × Strain Quadrant</p>
        {scatterPoints.length < 2 ? (
          <p className={EMPTY}>Need more data to plot the quadrant.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
              <XAxis
                type="number" dataKey="strain" name="Strain"
                domain={[0, 21]} label={{ value: 'Strain', position: 'insideBottom', offset: -2, fill: '#9a8f7e', fontSize: 10 }}
                tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false}
              />
              <YAxis
                type="number" dataKey="recovery" name="Recovery"
                domain={[0, 100]} unit="%"
                tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false}
              />
              <ZAxis range={[32, 32]} />
              <ReferenceLine x={10} stroke="#ece3d4" strokeDasharray="3 3" />
              <ReferenceLine y={50} stroke="#ece3d4" strokeDasharray="3 3" />
              <RechartTooltip content={<ScatterTooltip />} />
              <Scatter data={scatterPoints} isAnimationActive={false}>
                {scatterPoints.map((pt, i) => (
                  <Cell key={i} fill={pt.dotColor} fillOpacity={0.85} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
        <div className="grid grid-cols-2 gap-1 mt-2">
          {[
            { label: 'Optimal', sub: 'High recovery · High strain', color: '#3E9C7E' },
            { label: 'Overreaching', sub: 'Low recovery · High strain', color: '#ef4444' },
            { label: 'Recovery', sub: 'High recovery · Low strain', color: '#9B7FD4' },
            { label: 'Undertraining', sub: 'Low recovery · Low strain', color: '#9a8f7e' },
          ].map(q => (
            <div key={q.label} className="rounded-lg px-2 py-1.5" style={{ background: '#F6F1E9' }}>
              <p className="text-[10px] font-semibold" style={{ color: q.color }}>{q.label}</p>
              <p className="text-[9px] text-[#b3a890]">{q.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>Recovery Score — 30 Days</p>
        {recoveryChartData.length < 3 ? (
          <p className={EMPTY}>Need more data to show trend.</p>
        ) : (
          <LineGraph data={recoveryChartData} dataKey="recovery" color="#3E9C7E" unit="%" height={100} />
        )}
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <p className={TITLE} style={{ marginBottom: 0 }}>HRV Trend</p>
          {todayHRV != null && (
            <div className="text-right">
              <p className="text-[10px] text-[#b3a890]">Today vs norm</p>
              <p className="text-xs font-semibold" style={{ color: todayHRV >= hrvNorm ? '#3E9C7E' : '#D9A23F' }}>
                {todayHRV} ms / {hrvNorm} ms
              </p>
            </div>
          )}
        </div>
        {hrvChartData.length < 2 ? (
          <p className={EMPTY}>Need more data to show HRV trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={hrvChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={hrvNorm} stroke="#C9A84C" strokeDasharray="4 3" label={{ value: `Norm ${hrvNorm}`, position: 'right', fill: '#C9A84C', fontSize: 9 }} />
              <RechartTooltip content={<HRVTooltip />} />
              <Line type="monotone" dataKey="hrv" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#a78bfa' }} />
              {hasMA7 && (
                <Line type="monotone" dataKey="ma7" stroke="#c4b5fd" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3, fill: '#c4b5fd' }} name="ma7" />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
        {hasMA7 && (
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded" style={{ background: '#a78bfa' }} />
              <p className="text-[10px] text-[#9a8f7e]">Daily</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded" style={{ background: '#c4b5fd', opacity: 0.7 }} />
              <p className="text-[10px] text-[#9a8f7e]">7-day MA</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded" style={{ background: '#C9A84C' }} />
              <p className="text-[10px] text-[#9a8f7e]">Age norm</p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>Resting HR Trend</p>
        {rhrChartData.length < 2 ? (
          <p className={EMPTY}>Need more data to show RHR trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={rhrChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={60} stroke="#ece3d4" strokeDasharray="3 3" label={{ value: '60', position: 'right', fill: '#9a8f7e', fontSize: 9 }} />
              <RechartTooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-white rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
                    <p className="text-[#9a8f7e] text-xs mb-1">{label}</p>
                    <p style={{ color: '#ef4444' }} className="font-semibold">{Math.round(payload[0]?.value ?? 0)} bpm</p>
                  </div>
                )
              }} />
              <Line type="monotone" dataKey="rhr" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#ef4444' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-[#b3a890] mt-2">Reference at 60 bpm — below is athletic range.</p>
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>VO₂ Max Trend</p>
        {vo2ChartData.length < 2 ? (
          <div>
            <p className={EMPTY}>Need at least 2 cardio fitness updates to show a trend.</p>
            {vo2ChartData.length === 1 && (
              <p className="text-[#5c5648] text-sm mt-2">Current: {vo2ChartData[0].vo2Max} ml/kg/min</p>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={vo2ChartData} margin={{ top: 4, right: 40, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={vo2Norms[0]} stroke="#D9A23F" strokeDasharray="3 3" label={{ value: 'Fair', position: 'right', fill: '#D9A23F', fontSize: 9 }} />
              <ReferenceLine y={vo2Norms[1]} stroke="#9B7FD4" strokeDasharray="3 3" label={{ value: 'Good', position: 'right', fill: '#9B7FD4', fontSize: 9 }} />
              <ReferenceLine y={vo2Norms[2]} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Excellent', position: 'right', fill: '#10b981', fontSize: 9 }} />
              <RechartTooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-white rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
                    <p className="text-[#9a8f7e] text-xs mb-1">{label}</p>
                    <p style={{ color: '#10b981' }} className="font-semibold">{payload[0]?.value} ml/kg/min</p>
                  </div>
                )
              }} />
              <Line type="monotone" dataKey="vo2Max" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>Sleep Score — 30 Days</p>
        {sleepChartData.length < 3 ? (
          <p className={EMPTY}>Need more sleep data to show trend.</p>
        ) : (
          <LineGraph data={sleepChartData} dataKey="sleepScore" color="#8b5cf6" unit="%" height={100} />
        )}
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>Skin Temp Deviation</p>
        {skinTempData.length === 0 ? (
          <p className={EMPTY}>No skin temperature data. Requires a device with a skin temp sensor.</p>
        ) : (
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={skinTempData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={0} stroke="#ece3d4" strokeDasharray="3 3" />
              <RechartTooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const v = payload[0]?.value
                return (
                  <div className="bg-white rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
                    <p className="text-[#9a8f7e] text-xs mb-1">{label}</p>
                    <p style={{ color: v <= 0 ? '#3E9C7E' : v <= 0.3 ? '#D9A23F' : '#ef4444' }} className="font-semibold">
                      {v > 0 ? '+' : ''}{v?.toFixed(2)}°C
                    </p>
                  </div>
                )
              }} />
              <Bar dataKey="dev" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {skinTempData.map((d, i) => (
                  <Cell key={i} fill={d.barColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-[#b3a890] mt-2">Green (≤0°C) = cooler baseline, favorable for recovery. Amber/red = elevated, may signal stress or illness.</p>
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>Weekly Active Zone Minutes</p>
        {azmWeeklyData.length === 0 ? (
          <p className={EMPTY}>No weekly activity data available yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={azmWeeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={150} stroke="#D9A23F" strokeDasharray="3 3" label={{ value: 'WHO 150', position: 'right', fill: '#D9A23F', fontSize: 9 }} />
              <ReferenceLine y={300} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Excellent', position: 'right', fill: '#10b981', fontSize: 9 }} />
              <RechartTooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-white rounded-lg px-3 py-2 text-sm" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
                    <p className="text-[#9a8f7e] text-xs mb-1">{label}</p>
                    <p style={{ color: '#D9A23F' }} className="font-semibold">{payload[0]?.value} min</p>
                  </div>
                )
              }} />
              <Bar dataKey="azm" fill="#D9A23F" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-[#b3a890] mt-2">WHO recommends 150 min/week moderate or 75 min vigorous. 300+ min = excellent.</p>
      </div>

      <div className="rounded-2xl p-5" style={CARD}>
        <p className={TITLE}>Breathing Rate Trend</p>
        {brChartData.length < 2 ? (
          <p className={EMPTY}>Need more data to show breathing rate trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={brChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#9a8f7e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={18} stroke="#ece3d4" strokeDasharray="3 3" label={{ value: '18', position: 'right', fill: '#9a8f7e', fontSize: 9 }} />
              <RechartTooltip content={<BRTooltip />} />
              <Line type="monotone" dataKey="br" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#06b6d4' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-[#b3a890] mt-2">Normal: 12–18 br/min during sleep. Above 18 may indicate stress, illness, or elevated load.</p>
      </div>

    </div>
  )
}
