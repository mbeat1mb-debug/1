import { useEffect, useState } from 'react'
import ScoreRing from '../components/ScoreRing'
import { LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { getRecoveryColor, getRecoveryLabel, getAverageBP, getBPReadings, getHRVNorm, getUserAge, getRHRMortalityContext, localToday, localDateOf } from '../lib/calculations'
import { getHistory } from '../lib/db'
import { getTimingForDate, TIMING_SUBSTANCES, analyzeTimingCorrelation } from '../lib/storage'
import { C, SERIF, Label, BackLink, SectionLabel, Note } from '../lib/almanacTheme'

export default function Recovery({ data, onNav }) {
  const { recoveryScore = 0, todayHRV = 0, todayRHR = 0, todaySpO2 = 0, todayBR = 0,
    todaySleep, hrvHistory = [], rhrHistory = [], sleepHistory = [],
    historyDates = [], vo2Max = 0, skinTempDev, recoveryHistory = [] } = data

  const [spo2History, setSpo2History] = useState([])
  const [brHistory, setBrHistory] = useState([])

  useEffect(() => {
    const todayStr = localToday()
    const daysAgo = date => Math.round((new Date(todayStr) - new Date(date)) / 86400000)
    getHistory(14).then(rows => {
      setSpo2History(rows.filter(r => r.spo2 > 0).map(r => ({
        label: r.date === todayStr ? 'Today' : `-${daysAgo(r.date)}d`,
        spo2: r.spo2,
      })))
      setBrHistory(rows.filter(r => r.br > 0).map(r => ({
        label: r.date === todayStr ? 'Today' : `-${daysAgo(r.date)}d`,
        br: r.br,
      })))
    })
  }, [])

  const color = getRecoveryColor(recoveryScore)
  const label = getRecoveryLabel(recoveryScore)

  const rec30 = recoveryHistory.filter(Boolean).slice(-30)
  const avgRecovery30 = rec30.length >= 3
    ? Math.round(rec30.reduce((a, b) => a + b, 0) / rec30.length)
    : null
  const volatility30 = rec30.length >= 3
    ? Math.round(Math.sqrt(rec30.reduce((sq, v) => sq + Math.pow(v - avgRecovery30, 2), 0) / rec30.length) * 10) / 10
    : null
  const avgBP = getAverageBP()
  const bpReadings = getBPReadings()
  const hasBP = avgBP.sys > 0

  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateOf(d) })()
  const yesterdayTiming = getTimingForDate(yesterdayStr)
  const healthHistory = (data.calendarDays || []).filter(d => d.recovery != null).map(d => ({ date: d.date, recovery: d.recovery }))
  const timingInsights = (() => {
    if (data.isDemo) return []
    const seen = new Set(yesterdayTiming.map(e => e.substance))
    const out = []
    for (const substanceId of seen) {
      const sub = TIMING_SUBSTANCES.find(s => s.id === substanceId)
      const corr = analyzeTimingCorrelation(substanceId, healthHistory)
      if (!corr) continue
      if (corr.timingDiff !== null && Math.abs(corr.timingDiff) >= 5) {
        out.push({ label: `${sub?.emoji} ${sub?.label}: early vs late`, diff: corr.timingDiff })
      } else if (corr.diff !== null && Math.abs(corr.diff) >= 5) {
        out.push({ label: `${sub?.emoji} Days with ${sub?.label}`, diff: corr.diff })
      }
    }
    return out
  })()

  const todayStr = localToday()
  const hrv14 = hrvHistory.slice(-14)
  const rhr14 = rhrHistory.slice(-14)
  const dates14 = historyDates.slice(-14)
  const chartLabel = (i, len) => {
    const d = dates14[i]
    if (!d) return i === len - 1 ? 'Today' : `-${len - 1 - i}d`
    return d === todayStr ? 'Today' : `-${Math.round((new Date(todayStr) - new Date(d)) / 86400000)}d`
  }
  const hrvChartData = hrv14.map((v, i) => ({ label: chartLabel(i, hrv14.length), hrv: v != null ? Math.round(v) : null }))
  const rhrChartData = rhr14.map((v, i) => ({ label: chartLabel(i, rhr14.length), rhr: v != null ? Math.round(v) : null }))

  const validHRV = hrvHistory.filter(Boolean)
  const avgHRV = validHRV.length ? Math.round(validHRV.reduce((a, b) => a + b, 0) / validHRV.length) : 0
  const daysOfData = validHRV.length
  const isCalibrating = daysOfData < 14
  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'

  const skinTempColor = skinTempDev == null ? C.faint
    : Math.abs(skinTempDev) < 0.1 ? '#3E9C7E'
    : Math.abs(skinTempDev) < 0.3 ? '#D9A23F'
    : '#ef4444'
  const skinTempLabel = skinTempDev == null ? 'No data'
    : skinTempDev > 0.3 ? 'Elevated — potential illness'
    : skinTempDev < -0.3 ? 'Below baseline'
    : 'Normal'

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>RECOVERY</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>How recovered are you?</h1>

      {/* Main score */}
      <div className="flex items-center gap-6 mt-6">
        <ScoreRing score={recoveryScore} color={color} size={130} label={label} />
        <div className="flex-1">
          <StatRow label="HRV" value={todayHRV > 0 ? todayHRV : '--'} unit="ms" />
          <StatRow label="Resting HR" value={todayRHR > 0 ? todayRHR : '--'} unit="bpm" />
          <StatRow label="Sleep" value={sleepHours} />
        </div>
      </div>
      {isCalibrating && (
        <p style={{ fontFamily: SERIF, fontSize: 11, color: '#D9A23F', marginTop: 8, fontStyle: 'italic' }}>{daysOfData}/14 days calibrated</p>
      )}

      {/* Recovery Stability */}
      {avgRecovery30 !== null && (
        <div className="mt-9">
          <SectionLabel>Recovery Stability — 30 Days</SectionLabel>
          <div className="grid grid-cols-2 gap-6 mt-4">
            <div>
              <Label style={{ fontSize: 11 }}>30-Day Avg</Label>
              <p style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: getRecoveryColor(avgRecovery30), marginTop: 2 }}>{avgRecovery30}</p>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: getRecoveryColor(avgRecovery30) }}>{getRecoveryLabel(avgRecovery30)}</p>
            </div>
            <div>
              <Label style={{ fontSize: 11 }}>Volatility (σ)</Label>
              <p style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: volatility30 <= 8 ? '#3E9C7E' : volatility30 <= 15 ? '#D9A23F' : '#ef4444', marginTop: 2 }}>{volatility30}</p>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: volatility30 <= 8 ? '#3E9C7E' : volatility30 <= 15 ? '#D9A23F' : '#ef4444' }}>
                {volatility30 <= 8 ? 'Stable' : volatility30 <= 15 ? 'Moderate swings' : 'High variability'}
              </p>
            </div>
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 10 }}>Low σ = consistent recovery. High σ = frequent hard efforts or lifestyle swings.</p>
        </div>
      )}

      {/* Key metrics */}
      <div className="mt-9">
        <SectionLabel>Today's Metrics</SectionLabel>
        <div className="mt-1">
          <StatRow label="Heart Rate Variability" value={todayHRV} unit="ms" color={avgHRV > 0 ? (todayHRV >= avgHRV ? '#3E9C7E' : '#D9A23F') : C.faint} />
          <StatRow label="30-Day HRV Average" value={avgHRV || '—'} unit={avgHRV ? 'ms' : ''} />
          <StatRow label="Resting Heart Rate" value={todayRHR} unit="bpm" />
          <StatRow label="Sleep Duration" value={sleepHours} />
          <StatRow label="Sleep Efficiency" value={todaySleep?.efficiency ?? '--'} unit="%" />
          <StatRow label="Blood Oxygen (SpO₂)" value={todaySpO2} unit="%" />
          <StatRow label="Respiratory Rate" value={todayBR} unit="br/min" />
          {vo2Max > 0 && <StatRow label="VO₂ Max (Cardio Fitness)" value={`~${vo2Max}`} unit="ml/kg/min" color="#9B7FD4" />}
          {hasBP && (
            <StatRow
              label={`Blood Pressure${bpReadings.length > 1 ? ` (${bpReadings.length}-reading avg)` : ''}`}
              value={`${avgBP.sys}/${avgBP.dia}`}
              unit=" mmHg"
              color={avgBP.sys >= 140 ? '#ef4444' : avgBP.sys >= 130 ? '#D9A23F' : '#3E9C7E'}
            />
          )}
        </div>
      </div>

      {/* Skin temperature */}
      {skinTempDev !== undefined && (
        <div className="mt-9">
          <SectionLabel>Skin Temperature</SectionLabel>
          <div className="flex items-center justify-between mt-4">
            <div>
              <p style={{ fontFamily: SERIF, fontSize: 15, color: C.inkSoft }}>{skinTempLabel}</p>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 4 }}>
                {skinTempDev == null
                  ? 'Not supported on your device or no recent sleep data'
                  : `${skinTempDev > 0 ? '+' : ''}${skinTempDev?.toFixed(2)}°C vs personal baseline`}
              </p>
            </div>
            <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: skinTempColor }}>
              {skinTempDev == null ? '--' : `${skinTempDev > 0 ? '+' : ''}${skinTempDev?.toFixed(1)}°`}
            </span>
          </div>
          {skinTempDev != null && Math.abs(skinTempDev) >= 0.3 && (
            <p style={{ fontFamily: SERIF, fontSize: 12, color: skinTempColor, marginTop: 10, fontStyle: 'italic' }}>
              {skinTempDev > 0.3
                ? 'Elevated skin temp can signal early illness, inflammation, or ovulation. Cross-check with HRV and RHR.'
                : 'Below-baseline skin temp may indicate cold exposure, adequate recovery, or device variability.'}
            </p>
          )}
        </div>
      )}

      {/* HRV trend */}
      <div className="mt-9">
        <SectionLabel>HRV — 14 Days</SectionLabel>
        <div className="mt-3"><LineGraph data={hrvChartData} dataKey="hrv" color="#3E9C7E" unit="ms" reference={avgHRV} height={100} /></div>
        {todayHRV > 0 && (() => {
          const age = getUserAge()
          const norm = getHRVNorm(age)
          const pct = Math.round((todayHRV / norm) * 100)
          const c = todayHRV >= norm ? '#3E9C7E' : todayHRV >= norm * 0.8 ? '#D9A23F' : '#ef4444'
          const lbl = todayHRV >= norm * 1.1 ? 'Above age norm' : todayHRV >= norm ? 'At age norm' : todayHRV >= norm * 0.8 ? 'Near age norm' : 'Below age norm'
          return (
            <div className="mt-3 flex items-baseline justify-between">
              <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>vs age-adjusted norm ({norm} ms) · Shaffer &amp; Ginsberg 2017</p>
              <span style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 600, color: c, marginLeft: 8, flexShrink: 0 }}>
                {pct}% · {lbl}
              </span>
            </div>
          )
        })()}
      </div>

      {/* RHR trend */}
      <div className="mt-9">
        <SectionLabel>Resting HR — 14 Days</SectionLabel>
        <div className="mt-3"><LineGraph data={rhrChartData} dataKey="rhr" color="#ef4444" unit=" bpm" height={100} /></div>
        {todayRHR > 0 && (() => {
          const ctx = getRHRMortalityContext(todayRHR)
          if (!ctx) return null
          return (
            <div className="mt-3 flex items-baseline justify-between">
              <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>{ctx.detail}</p>
              <span style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 600, color: ctx.color, marginLeft: 8, flexShrink: 0 }}>
                {ctx.label}
              </span>
            </div>
          )
        })()}
      </div>

      {spo2History.length >= 3 && (
        <div className="mt-9">
          <SectionLabel>Blood Oxygen — 14 Days</SectionLabel>
          <div className="mt-3"><LineGraph data={spo2History} dataKey="spo2" color="#9B7FD4" unit="%" reference={97} height={80} /></div>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 10 }}>Normal range: 95–100%. Below 95% warrants attention.</p>
        </div>
      )}

      {brHistory.length >= 3 && (
        <div className="mt-9">
          <SectionLabel>Respiratory Rate — 14 Days</SectionLabel>
          <div className="mt-3"><LineGraph data={brHistory} dataKey="br" color="#8b5cf6" unit=" br/m" height={80} /></div>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 10 }}>Normal range: 12–20 br/min. Elevated rate may indicate stress or illness.</p>
        </div>
      )}

      {/* Recovery : Strain ratio trend */}
      {data.rsTrend?.length >= 3 && (
        <div className="mt-9">
          <SectionLabel>Recovery:Strain Ratio — 14 Days</SectionLabel>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>Above 4 = well-recovered · Below 2 = accumulated load</p>
          <div className="mt-3"><LineGraph data={data.rsTrend} dataKey="ratio" color="#3E9C7E" unit="" reference={4} height={80} /></div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 10 }}>
            {(() => {
              const latest = data.rsTrend[data.rsTrend.length - 1]?.ratio
              if (!latest) return null
              return latest >= 6 ? 'Very fresh — consider increasing load.' : latest >= 4 ? 'Well balanced.' : latest >= 2 ? 'Moderate load — monitor recovery.' : 'High load — prioritize rest.'
            })()}
          </p>
        </div>
      )}

      {/* Yesterday's substance log */}
      {yesterdayTiming.length > 0 && (
        <div className="mt-9">
          <SectionLabel>Yesterday's Substances</SectionLabel>
          <div className="mt-4 space-y-2">
            {yesterdayTiming.map(entry => {
              const sub = TIMING_SUBSTANCES.find(s => s.id === entry.substance)
              const lateStim = ['caffeine', 'preworkout'].includes(entry.substance) && entry.time >= '14:00'
              const lateAlc = entry.substance === 'alcohol' && entry.time >= '19:00'
              const timeDisplay = new Date(`2000-01-01T${entry.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              return (
                <div key={entry.id} className="flex items-baseline gap-3">
                  <span style={{ fontFamily: SERIF, fontSize: 15, color: C.ink }}>{sub?.label ?? entry.substance}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{timeDisplay}</span>
                  {(lateStim || lateAlc) && (
                    <span style={{ fontFamily: SERIF, fontSize: 11, color: '#D9A23F', fontStyle: 'italic' }}>late</span>
                  )}
                </div>
              )
            })}
          </div>
          {timingInsights.length > 0 && (
            <div className="mt-4 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
              <Label style={{ fontSize: 11 }}>Your patterns — next-day recovery</Label>
              {timingInsights.map(ins => (
                <div key={ins.label} className="flex items-baseline justify-between mt-1.5">
                  <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{ins.label}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: ins.diff >= 0 ? '#3E9C7E' : '#ef4444' }}>
                    {ins.diff > 0 ? '+' : ''}{ins.diff} pts
                  </span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 10 }}>Today's recovery above reflects last night — shaped by these inputs.</p>
        </div>
      )}

      {/* Recovery guidance */}
      <div className="mt-9 mb-4">
        <Note accent={color}>
          {recoveryScore >= 67
            ? 'Your body is well recovered and primed to perform. Today is a great day to push hard or try a new PR.'
            : recoveryScore >= 34
            ? 'Your body is maintaining. Moderate activity is appropriate — avoid going all out today.'
            : 'Your body needs rest. Prioritize sleep, hydration, and light movement only today.'}
        </Note>
      </div>
    </div>
  )
}
