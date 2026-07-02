import { useEffect, useState, useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Cell, Tooltip as RechartTooltip,
  ReferenceLine, ResponsiveContainer, LineChart, Line, BarChart, Bar,
} from 'recharts'
import { LineGraph } from '../components/TrendChart'
import { getHRVNorm, getUserAge, getRecoveryColor, localToday, calculateSleepScore } from '../lib/calculations'
import { getHistory } from '../lib/db'
import { C, SERIF, Label, BackLink, SectionLabel, Note } from '../lib/almanacTheme'

const axisTick = { fill: C.faint, fontSize: 11, fontFamily: SERIF }

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

function ChartTooltip({ active, payload, label, unit = '', color }) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
      <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: C.faint, marginBottom: 2 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: color || p.color }}>
          {Math.round(p.value ?? 0)}{unit}
        </p>
      ))}
    </div>
  )
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="px-3 py-2" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
      <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: C.faint, marginBottom: 2 }}>{d.dateLabel}</p>
      <p style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: d.dotColor }}>Recovery: {d.recovery}%</p>
      <p style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: C.inkSoft }}>Strain: {d.strain}</p>
    </div>
  )
}

function HRVTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
      <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: C.faint, marginBottom: 2 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: p.color }}>
          {p.name === 'ma7' ? 'MA7: ' : ''}{Math.round(p.value ?? 0)} ms
        </p>
      ))}
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

function EmptyNote({ children }) {
  return <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.faint }}>{children}</p>
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
        sleepScore: calculateSleepScore({ minutesAsleep: d.sleep, efficiency: d.sleepEfficiency }),
      })),
    [calendarDays, todayStr]
  )

  const skinTempData = useMemo(() => {
    const rows = dbHistory.filter(d => d.skinTempDev != null)
    return rows.map(d => ({
      label: dayLabel(d.date, todayStr),
      dev: d.skinTempDev,
      barColor: d.skinTempDev <= 0 ? '#3E9C7E' : d.skinTempDev <= 0.3 ? C.gold : '#ef4444',
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

  // Last date can be RHR-only (null HRV slot) — use the most recent real reading
  const lastRealHRV = hrvHistory.findLast(v => v != null)
  const todayHRV = lastRealHRV != null ? Math.round(lastRealHRV) : null
  const hasMA7 = hrvChartData.some(p => p.ma7 != null)

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>TRENDS</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>30-day history</h1>

      {/* Recovery × Strain Quadrant */}
      <div className="mt-9">
        <SectionLabel>Recovery × Strain Quadrant</SectionLabel>
        <div className="mt-3">
          {scatterPoints.length < 2 ? (
            <EmptyNote>Need more data to plot the quadrant.</EmptyNote>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
                <XAxis
                  type="number" dataKey="strain" name="Strain"
                  domain={[0, 21]} label={{ value: 'Strain', position: 'insideBottom', offset: -2, fill: C.faint, fontSize: 10, fontFamily: SERIF }}
                  tick={axisTick} axisLine={false} tickLine={false}
                />
                <YAxis
                  type="number" dataKey="recovery" name="Recovery"
                  domain={[0, 100]} unit="%"
                  tick={axisTick} axisLine={false} tickLine={false}
                />
                <ZAxis range={[32, 32]} />
                <ReferenceLine x={10} stroke={C.ruleSoft} strokeDasharray="3 3" />
                <ReferenceLine y={50} stroke={C.ruleSoft} strokeDasharray="3 3" />
                <RechartTooltip content={<ScatterTooltip />} />
                <Scatter data={scatterPoints} isAnimationActive={false}>
                  {scatterPoints.map((pt, i) => (
                    <Cell key={i} fill={pt.dotColor} fillOpacity={0.85} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
          <div className="grid grid-cols-2 mt-2" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
            {[
              { label: 'Optimal', sub: 'High recovery · High strain', color: '#3E9C7E' },
              { label: 'Overreaching', sub: 'Low recovery · High strain', color: '#ef4444' },
              { label: 'Recovery', sub: 'High recovery · Low strain', color: '#9B7FD4' },
              { label: 'Undertraining', sub: 'Low recovery · Low strain', color: C.faint },
            ].map((q, i) => (
              <div key={q.label} className="py-2" style={{ borderRight: i % 2 === 0 ? `1px solid ${C.ruleSoft}` : 'none', paddingLeft: i % 2 === 0 ? 0 : 12 }}>
                <p style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 600, color: q.color }}>{q.label}</p>
                <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>{q.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recovery Score */}
      <div className="mt-9">
        <SectionLabel>Recovery Score — 30 Days</SectionLabel>
        <div className="mt-3">
          {recoveryChartData.length < 3 ? (
            <EmptyNote>Need more data to show trend.</EmptyNote>
          ) : (
            <LineGraph data={recoveryChartData} dataKey="recovery" color="#3E9C7E" unit="%" height={100} />
          )}
        </div>
      </div>

      {/* HRV Trend */}
      <div className="mt-9">
        <SectionLabel right={todayHRV != null ? `${todayHRV} ms / ${hrvNorm} ms norm` : undefined}>HRV Trend</SectionLabel>
        <div className="mt-3">
          {hrvChartData.length < 2 ? (
            <EmptyNote>Need more data to show HRV trend.</EmptyNote>
          ) : (
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={hrvChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={hrvNorm} stroke={C.gold} strokeDasharray="4 3" label={{ value: `Norm ${hrvNorm}`, position: 'right', fill: C.gold, fontSize: 9, fontFamily: SERIF }} />
                <RechartTooltip content={<HRVTooltip />} />
                <Line type="monotone" dataKey="hrv" stroke="#9B7FD4" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#9B7FD4' }} />
                {hasMA7 && (
                  <Line type="monotone" dataKey="ma7" stroke="#CDC3E6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3, fill: '#CDC3E6' }} name="ma7" />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
          {hasMA7 && (
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div style={{ width: 14, height: 1.5, background: '#9B7FD4' }} />
                <Label style={{ fontSize: 10 }}>Daily</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 14, height: 1.5, background: '#CDC3E6' }} />
                <Label style={{ fontSize: 10 }}>7-day MA</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 14, height: 1.5, background: C.gold }} />
                <Label style={{ fontSize: 10 }}>Age norm</Label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resting HR */}
      <div className="mt-9">
        <SectionLabel>Resting HR Trend</SectionLabel>
        <div className="mt-3">
          {rhrChartData.length < 2 ? (
            <EmptyNote>Need more data to show RHR trend.</EmptyNote>
          ) : (
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={rhrChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={60} stroke={C.ruleSoft} strokeDasharray="3 3" label={{ value: '60', position: 'right', fill: C.faint, fontSize: 9, fontFamily: SERIF }} />
                <RechartTooltip content={<ChartTooltip unit=" bpm" color="#ef4444" />} />
                <Line type="monotone" dataKey="rhr" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#ef4444' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Reference at 60 bpm — below is athletic range.</p>
        </div>
      </div>

      {/* VO2 Max */}
      <div className="mt-9">
        <SectionLabel>VO₂ Max Trend</SectionLabel>
        <div className="mt-3">
          {vo2ChartData.length < 2 ? (
            <div>
              <EmptyNote>Need at least 2 cardio fitness updates to show a trend.</EmptyNote>
              {vo2ChartData.length === 1 && (
                <p style={{ fontFamily: SERIF, fontSize: 14, color: C.inkSoft, marginTop: 8 }}>Current: {vo2ChartData[0].vo2Max} ml/kg/min</p>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={vo2ChartData} margin={{ top: 4, right: 40, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={vo2Norms[0]} stroke={C.gold} strokeDasharray="3 3" label={{ value: 'Fair', position: 'right', fill: C.gold, fontSize: 9, fontFamily: SERIF }} />
                <ReferenceLine y={vo2Norms[1]} stroke="#9B7FD4" strokeDasharray="3 3" label={{ value: 'Good', position: 'right', fill: '#9B7FD4', fontSize: 9, fontFamily: SERIF }} />
                <ReferenceLine y={vo2Norms[2]} stroke="#3E9C7E" strokeDasharray="3 3" label={{ value: 'Excellent', position: 'right', fill: '#3E9C7E', fontSize: 9, fontFamily: SERIF }} />
                <RechartTooltip content={<ChartTooltip unit=" ml/kg/min" color="#3E9C7E" />} />
                <Line type="monotone" dataKey="vo2Max" stroke="#3E9C7E" strokeWidth={2} dot={{ r: 4, fill: '#3E9C7E' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Sleep Score */}
      <div className="mt-9">
        <SectionLabel>Sleep Score — 30 Days</SectionLabel>
        <div className="mt-3">
          {sleepChartData.length < 3 ? (
            <EmptyNote>Need more sleep data to show trend.</EmptyNote>
          ) : (
            <LineGraph data={sleepChartData} dataKey="sleepScore" color="#9B7FD4" unit="%" height={100} />
          )}
        </div>
      </div>

      {/* Skin Temp */}
      <div className="mt-9">
        <SectionLabel>Skin Temp Deviation</SectionLabel>
        <div className="mt-3">
          {skinTempData.length === 0 ? (
            <EmptyNote>No skin temperature data. Requires a device with a skin temp sensor.</EmptyNote>
          ) : (
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={skinTempData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke={C.ruleSoft} strokeDasharray="3 3" />
                <RechartTooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const v = payload[0]?.value
                  return (
                    <div className="px-3 py-2" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
                      <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: C.faint, marginBottom: 2 }}>{label}</p>
                      <p style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: v <= 0 ? '#3E9C7E' : v <= 0.3 ? C.gold : '#ef4444' }}>
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
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Green (≤0°C) = cooler baseline, favorable for recovery. Amber/red = elevated, may signal stress or illness.</p>
        </div>
      </div>

      {/* Weekly AZM */}
      <div className="mt-9">
        <SectionLabel>Weekly Active Zone Minutes</SectionLabel>
        <div className="mt-3">
          {azmWeeklyData.length === 0 ? (
            <EmptyNote>No weekly activity data available yet.</EmptyNote>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={azmWeeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={150} stroke={C.gold} strokeDasharray="3 3" label={{ value: 'WHO 150', position: 'right', fill: C.gold, fontSize: 9, fontFamily: SERIF }} />
                <ReferenceLine y={300} stroke="#3E9C7E" strokeDasharray="3 3" label={{ value: 'Excellent', position: 'right', fill: '#3E9C7E', fontSize: 9, fontFamily: SERIF }} />
                <RechartTooltip content={<ChartTooltip unit=" min" color={C.gold} />} />
                <Bar dataKey="azm" fill={C.gold} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>WHO recommends 150 min/week moderate or 75 min vigorous. 300+ min = excellent.</p>
        </div>
      </div>

      {/* Breathing Rate */}
      <div className="mt-9 mb-4">
        <SectionLabel>Breathing Rate Trend</SectionLabel>
        <div className="mt-3">
          {brChartData.length < 2 ? (
            <EmptyNote>Need more data to show breathing rate trend.</EmptyNote>
          ) : (
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={brChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={18} stroke={C.ruleSoft} strokeDasharray="3 3" label={{ value: '18', position: 'right', fill: C.faint, fontSize: 9, fontFamily: SERIF }} />
                <RechartTooltip content={<ChartTooltip unit=" br/min" color="#5E5198" />} />
                <Line type="monotone" dataKey="br" stroke="#5E5198" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#5E5198' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Normal: 12–18 br/min during sleep. Above 18 may indicate stress, illness, or elevated load.</p>
        </div>
      </div>
    </div>
  )
}
