import { useEffect, useState } from 'react'
import ScoreRing from '../components/ScoreRing'
import { LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { getRecoveryColor, getRecoveryLabel, getAverageBP, getBPReadings, getHRVNorm, getUserAge, getRHRMortalityContext } from '../lib/calculations'
import { getHistory } from '../lib/db'
import { getTimingForDate, TIMING_SUBSTANCES, analyzeTimingCorrelation } from '../lib/storage'

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export default function Recovery({ data, onNav }) {
  const { recoveryScore = 0, todayHRV = 0, todayRHR = 0, todaySpO2 = 0, todayBR = 0,
    todaySleep, hrvHistory = [], rhrHistory = [], sleepHistory = [],
    historyDates = [], vo2Max = 0, skinTempDev, recoveryHistory = [] } = data

  const [spo2History, setSpo2History] = useState([])
  const [brHistory, setBrHistory] = useState([])

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
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

  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
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

  const todayStr = new Date().toISOString().split('T')[0]
  const hrv14 = hrvHistory.slice(-14)
  const rhr14 = rhrHistory.slice(-14)
  const dates14 = historyDates.slice(-14)
  const chartLabel = (i, len) => {
    const d = dates14[i]
    if (!d) return i === len - 1 ? 'Today' : `-${len - 1 - i}d`
    return d === todayStr ? 'Today' : `-${Math.round((new Date(todayStr) - new Date(d)) / 86400000)}d`
  }
  const hrvChartData = hrv14.map((v, i) => ({ label: chartLabel(i, hrv14.length), hrv: Math.round(v) }))
  const rhrChartData = rhr14.map((v, i) => ({ label: chartLabel(i, rhr14.length), rhr: Math.round(v) }))

  const validHRV = hrvHistory.filter(Boolean)
  const avgHRV = validHRV.length ? Math.round(validHRV.reduce((a, b) => a + b, 0) / validHRV.length) : 0
  const daysOfData = validHRV.length
  const isCalibrating = daysOfData < 14
  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'

  const skinTempColor = skinTempDev == null ? '#888'
    : Math.abs(skinTempDev) < 0.1 ? '#00c9a7'
    : Math.abs(skinTempDev) < 0.3 ? '#f59e0b'
    : '#ef4444'
  const skinTempLabel = skinTempDev == null ? 'No data'
    : skinTempDev > 0.3 ? 'Elevated — potential illness'
    : skinTempDev < -0.3 ? 'Below baseline'
    : 'Normal'

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Recovery</p>
          <h1 className="text-xl font-bold">How recovered are you?</h1>
        </div>
      </div>

      {/* Main score */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <div className="flex items-center gap-5">
          <ScoreRing score={recoveryScore} color={color} size={130} strokeWidth={11} label={label} />
          <div className="flex-1">
            <div className="pb-3 mb-3" style={{ borderBottom: '1px solid #1e1e1e' }}>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-0.5">HRV</p>
              <p className="text-3xl font-bold text-white leading-tight">{todayHRV > 0 ? todayHRV : '--'}<span className="text-sm font-normal text-gray-500 ml-1">ms</span></p>
            </div>
            <div className="pb-3 mb-3" style={{ borderBottom: '1px solid #1e1e1e' }}>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-0.5">Resting HR</p>
              <p className="text-3xl font-bold text-white leading-tight">{todayRHR > 0 ? todayRHR : '--'}<span className="text-sm font-normal text-gray-500 ml-1">bpm</span></p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-0.5">Sleep</p>
              <p className="text-3xl font-bold text-white leading-tight">{sleepHours}</p>
            </div>
          </div>
        </div>
        {isCalibrating && (
          <p className="text-[10px] text-yellow-600 mt-3">{daysOfData}/14 days calibrated</p>
        )}
      </div>

      {/* Recovery Stability */}
      {avgRecovery30 !== null && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Recovery Stability — 30 Days</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">30-Day Avg</p>
              <p className="text-2xl font-bold" style={{ color: getRecoveryColor(avgRecovery30) }}>{avgRecovery30}</p>
              <p className="text-[10px] mt-0.5" style={{ color: getRecoveryColor(avgRecovery30) }}>{getRecoveryLabel(avgRecovery30)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Volatility (σ)</p>
              <p className="text-2xl font-bold" style={{ color: volatility30 <= 8 ? '#00c9a7' : volatility30 <= 15 ? '#f59e0b' : '#ef4444' }}>{volatility30}</p>
              <p className="text-[10px] mt-0.5" style={{ color: volatility30 <= 8 ? '#00c9a7' : volatility30 <= 15 ? '#f59e0b' : '#ef4444' }}>
                {volatility30 <= 8 ? 'Stable' : volatility30 <= 15 ? 'Moderate swings' : 'High variability'}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">Low σ = consistent recovery. High σ = frequent hard efforts or lifestyle swings.</p>
        </div>
      )}

      {/* Key metrics */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Today's Metrics</span>
        </div>
        <div className="px-4">
          <StatRow label="Heart Rate Variability" value={todayHRV} unit="ms" color={avgHRV > 0 ? (todayHRV >= avgHRV ? '#00c9a7' : '#f59e0b') : '#888'} />
          <StatRow label="30-Day HRV Average" value={avgHRV || '—'} unit={avgHRV ? 'ms' : ''} />
          <StatRow label="Resting Heart Rate" value={todayRHR} unit="bpm" />
          <StatRow label="Sleep Duration" value={sleepHours} />
          <StatRow label="Sleep Efficiency" value={todaySleep?.efficiency ?? '--'} unit="%" />
          <StatRow label="Blood Oxygen (SpO₂)" value={todaySpO2} unit="%" />
          <StatRow label="Respiratory Rate" value={todayBR} unit="br/min" />
          {vo2Max > 0 && <StatRow label="VO₂ Max (Cardio Fitness)" value={`~${vo2Max}`} unit="ml/kg/min" color="#3b82f6" />}
          {hasBP && (
            <StatRow
              label={`Blood Pressure${bpReadings.length > 1 ? ` (${bpReadings.length}-reading avg)` : ''}`}
              value={`${avgBP.sys}/${avgBP.dia}`}
              unit=" mmHg"
              color={avgBP.sys >= 140 ? '#ef4444' : avgBP.sys >= 130 ? '#f59e0b' : '#00c9a7'}
            />
          )}
        </div>
      </div>

      {/* Skin temperature */}
      {skinTempDev !== undefined && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Skin Temperature</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">{skinTempLabel}</p>
              <p className="text-xs text-gray-600 mt-1">
                {skinTempDev == null
                  ? 'Not supported on your device or no recent sleep data'
                  : `${skinTempDev > 0 ? '+' : ''}${skinTempDev?.toFixed(2)}°C vs personal baseline`}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: skinTempColor + '20' }}>
              <span className="text-xl">🌡️</span>
            </div>
          </div>
          {skinTempDev != null && Math.abs(skinTempDev) >= 0.3 && (
            <p className="text-xs mt-2 p-2 rounded-lg" style={{ background: skinTempColor + '15', color: skinTempColor }}>
              {skinTempDev > 0.3
                ? 'Elevated skin temp can signal early illness, inflammation, or ovulation. Cross-check with HRV and RHR.'
                : 'Below-baseline skin temp may indicate cold exposure, adequate recovery, or device variability.'}
            </p>
          )}
        </div>
      )}

      {/* HRV trend */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">HRV — 14 Days</p>
        <LineGraph data={hrvChartData} dataKey="hrv" color="#00c9a7" unit="ms" reference={avgHRV} height={100} />
        {todayHRV > 0 && (() => {
          const age = getUserAge()
          const norm = getHRVNorm(age)
          const pct = Math.round((todayHRV / norm) * 100)
          const color = todayHRV >= norm ? '#00c9a7' : todayHRV >= norm * 0.8 ? '#f59e0b' : '#ef4444'
          const label = todayHRV >= norm * 1.1 ? 'Above age norm' : todayHRV >= norm ? 'At age norm' : todayHRV >= norm * 0.8 ? 'Near age norm' : 'Below age norm'
          return (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] text-gray-600">vs age-adjusted norm ({norm} ms) · Shaffer & Ginsberg 2017</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded ml-2 flex-shrink-0" style={{ background: color + '20', color }}>
                {pct}% · {label}
              </span>
            </div>
          )
        })()}
      </div>

      {/* RHR trend */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Resting HR — 14 Days</p>
        <LineGraph data={rhrChartData} dataKey="rhr" color="#ef4444" unit=" bpm" height={100} />
        {todayRHR > 0 && (() => {
          const ctx = getRHRMortalityContext(todayRHR)
          if (!ctx) return null
          return (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] text-gray-600">{ctx.detail}</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded ml-2 flex-shrink-0" style={{ background: ctx.color + '20', color: ctx.color }}>
                {ctx.label}
              </span>
            </div>
          )
        })()}
      </div>

      {spo2History.length >= 3 && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Blood Oxygen — 14 Days</p>
          <LineGraph data={spo2History} dataKey="spo2" color="#3b82f6" unit="%" reference={97} height={80} />
          <p className="text-xs text-gray-600 mt-2">Normal range: 95–100%. Below 95% warrants attention.</p>
        </div>
      )}

      {brHistory.length >= 3 && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Respiratory Rate — 14 Days</p>
          <LineGraph data={brHistory} dataKey="br" color="#8b5cf6" unit=" br/m" height={80} />
          <p className="text-xs text-gray-600 mt-2">Normal range: 12–20 br/min. Elevated rate may indicate stress or illness.</p>
        </div>
      )}

      {/* Recovery : Strain ratio trend */}
      {data.rsTrend?.length >= 3 && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Recovery:Strain Ratio — 14 Days</p>
          <p className="text-[10px] text-gray-600 mb-3">Above 4 = well-recovered · Below 2 = accumulated load</p>
          <LineGraph data={data.rsTrend} dataKey="ratio" color="#00c9a7" unit="" reference={4} height={80} />
          <p className="text-[10px] text-gray-600 mt-2">
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
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Yesterday's Substances</p>
          <div className="space-y-2 mb-2">
            {yesterdayTiming.map(entry => {
              const sub = TIMING_SUBSTANCES.find(s => s.id === entry.substance)
              const lateStim = ['caffeine', 'preworkout'].includes(entry.substance) && entry.time >= '14:00'
              const lateAlc = entry.substance === 'alcohol' && entry.time >= '19:00'
              const timeDisplay = new Date(`2000-01-01T${entry.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              return (
                <div key={entry.id} className="flex items-center gap-3">
                  <span className="text-base">{sub?.emoji ?? '💊'}</span>
                  <span className="text-sm text-white">{sub?.label ?? entry.substance}</span>
                  <span className="text-sm text-gray-500">{timeDisplay}</span>
                  {(lateStim || lateAlc) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#f59e0b20', color: '#f59e0b' }}>late</span>
                  )}
                </div>
              )
            })}
          </div>
          {timingInsights.length > 0 && (
            <div className="space-y-1.5 pt-2 mt-1" style={{ borderTop: '1px solid #1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Your patterns — next-day recovery</p>
              {timingInsights.map(ins => (
                <div key={ins.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{ins.label}</span>
                  <span className="text-xs font-bold" style={{ color: ins.diff >= 0 ? '#00c9a7' : '#ef4444' }}>
                    {ins.diff > 0 ? '+' : ''}{ins.diff} pts
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-600 mt-2">Today's recovery above reflects last night — shaped by these inputs.</p>
        </div>
      )}

      {/* Recovery guidance */}
      <div className="rounded-2xl p-4" style={{ background: color + '10', border: `1px solid ${color}33` }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color }}>Recommendation</p>
        <p className="text-sm text-gray-300">
          {recoveryScore >= 67
            ? 'Your body is well recovered and primed to perform. Today is a great day to push hard or try a new PR.'
            : recoveryScore >= 34
            ? 'Your body is maintaining. Moderate activity is appropriate — avoid going all out today.'
            : 'Your body needs rest. Prioritize sleep, hydration, and light movement only today.'}
        </p>
      </div>
    </div>
  )
}
