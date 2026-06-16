import ScoreRing from '../components/ScoreRing'
import { BarGraph, LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { calculateSleepDebt, calculateOptimalSleepWindow, parseSleepArchitecture, getSleepStageNorms, getUserAge, calculateChronotype, calculateSleepDebtPayback } from '../lib/calculations'

function SleepStageBar({ label, minutes, total, color }) {
  const pct = total > 0 ? (minutes / total) * 100 : 0
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span style={{ color: '#666' }}>{label}</span>
        <span className="font-semibold text-white">{timeStr}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: pct > 0 ? `0 0 8px ${color}55` : undefined,
          }}
        />
      </div>
    </div>
  )
}

function Hypnogram({ hypnogram }) {
  if (!hypnogram?.length) return null
  const minMs = hypnogram[0].startMs
  const maxMs = hypnogram[hypnogram.length - 1].endMs
  const spanMs = maxMs - minMs
  if (spanMs <= 0) return null

  const STAGE_Y  = { wake: 0, rem: 20, light: 40, deep: 60 }
  const COLORS   = { deep: '#4f46e5', rem: '#8b5cf6', light: '#a78bfa', wake: '#374151' }
  const W = 980

  return (
    <svg viewBox={`0 0 1000 80`} width="100%" style={{ display: 'block' }}>
      {[['W', 0], ['R', 20], ['L', 40], ['D', 60]].map(([l, y]) => (
        <text key={l} x={2} y={y + 15} fontSize={9} fill="#555" fontFamily="monospace">{l}</text>
      ))}
      {hypnogram.map((seg, i) => {
        const x = 20 + ((seg.startMs - minMs) / spanMs) * W
        const w = Math.max(1, (seg.seconds * 1000 / spanMs) * W)
        return (
          <rect key={i} x={x} y={STAGE_Y[seg.level] ?? 40} width={w} height={20}
            fill={COLORS[seg.level] || '#555'} opacity={0.9} />
        )
      })}
    </svg>
  )
}

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export default function Sleep({ data, onNav }) {
  const { todaySleep, sleepHistory = [], todayBR = 0 } = data

  const sleepScore = data.sleepScore || 0
  const sleepColor = sleepScore >= 75 ? '#8b5cf6' : sleepScore >= 50 ? '#f59e0b' : '#ef4444'

  const stages = todaySleep?.levels?.summary || {}
  const deep = stages.deep?.minutes || stages.deepSleep?.minutes || 0
  const light = stages.light?.minutes || stages.lightSleep?.minutes || 0
  const rem = stages.rem?.minutes || 0
  const wake = stages.wake?.minutes || stages.awake?.minutes || 0
  const totalMins = todaySleep?.minutesAsleep || 0
  const totalInBed = todaySleep?.timeInBed || 0

  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60

  const sleepDebt = calculateSleepDebt(sleepHistory)
  const chronotype = calculateChronotype(sleepHistory)
  const sleepDebtPayback = calculateSleepDebtPayback(sleepDebt, sleepHistory)

  const todayStr = new Date().toISOString().split('T')[0]
  const sleepChartData = sleepHistory.slice(-14).map(s => ({
    label: s.date === todayStr ? 'Today' : `-${Math.round((new Date(todayStr) - new Date(s.date)) / 86400000)}d`,
    hours: Math.round((s.minutes / 60) * 10) / 10,
  }))

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Sleep</p>
          <h1 className="text-xl font-bold">Last night's sleep</h1>
        </div>
      </div>

      {!todaySleep && (
        <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-2xl mb-3">😴</p>
          <p className="text-gray-300 text-sm font-medium">No sleep data yet</p>
          <p className="text-xs text-gray-600 mt-1">Make sure your Fitbit synced after waking up.</p>
        </div>
      )}

      {/* Main score */}
      {todaySleep && (
        <div className="rounded-2xl p-5 flex items-center gap-6" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <ScoreRing score={sleepScore} color={sleepColor} size={130} strokeWidth={11} unit="%" />
          <div className="flex-1">
            <p className="text-2xl font-bold text-white">{hours}h {mins}m</p>
            <p className="text-gray-500 text-sm">Time asleep</p>
            <p className="text-gray-600 text-xs mt-2">In bed: {Math.floor(totalInBed / 60)}h {totalInBed % 60}m</p>
            <div className="mt-3 px-2 py-1 rounded-lg inline-block" style={{ background: sleepColor + '20' }}>
              <span className="text-xs font-bold" style={{ color: sleepColor }}>
                {sleepScore >= 75 ? 'GREAT' : sleepScore >= 50 ? 'FAIR' : 'POOR'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sleep stages + metrics — only when data exists */}
      {todaySleep && (
        <>
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Sleep Stages</p>
            <div className="space-y-3">
              <SleepStageBar label="Deep (Restorative)" minutes={deep} total={totalMins} color="#4f46e5" />
              <SleepStageBar label="REM (Dream)" minutes={rem} total={totalMins} color="#8b5cf6" />
              <SleepStageBar label="Light" minutes={light} total={totalMins} color="#a78bfa" />
              <SleepStageBar label="Awake" minutes={wake} total={totalMins} color="#374151" />
            </div>
          </div>

          {todaySleep?.levels?.data?.length > 0 && (() => {
            const arch = parseSleepArchitecture(todaySleep)
            if (!arch?.hypnogram?.length) return null
            return (
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Hypnogram</p>
                <div className="flex gap-3 text-[10px] text-gray-600 mb-2 justify-end">
                  {[['Deep', '#4f46e5'], ['REM', '#8b5cf6'], ['Light', '#a78bfa'], ['Wake', '#374151']].map(([l, c]) => (
                    <span key={l} className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: c }} />{l}
                    </span>
                  ))}
                </div>
                <Hypnogram hypnogram={arch.hypnogram} />
                <p className="text-[10px] text-gray-600 mt-2">W=Wake · R=REM · L=Light · D=Deep</p>
              </div>
            )
          })()}

          <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
            <div className="px-4 pt-4 pb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Metrics</span>
            </div>
            <div className="px-4">
              <StatRow label="Sleep Efficiency" value={todaySleep.efficiency ?? '--'} unit="%" color={sleepColor} />
              <StatRow label="Sleep Score" value={sleepScore} unit="/ 100" color={sleepColor} />
              <StatRow label="Respiratory Rate" value={todayBR} unit="br/min" />
              <StatRow label="Wakeups" value={todaySleep.levels?.data?.filter(d => d.level === 'wake' && d.seconds >= 60).length ?? '--'} />
            </div>
          </div>

          {todaySleep?.levels?.data?.length > 0 && (() => {
            const arch = parseSleepArchitecture(todaySleep)
            if (!arch?.hypnogram?.length) return null
            const latColor  = arch.sleepLatency <= 20 ? '#00c9a7' : arch.sleepLatency <= 30 ? '#f59e0b' : '#ef4444'
            const wakeColor = arch.minutesAwake  <= 30 ? '#00c9a7' : arch.minutesAwake  <= 45 ? '#f59e0b' : '#ef4444'
            return (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
                <div className="px-4 pt-4 pb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Sleep Architecture</span>
                </div>
                <div className="px-4 pb-3">
                  <StatRow label="Sleep Onset Latency" value={arch.sleepLatency} unit="min" color={latColor} />
                  <StatRow label="Time Awake"          value={arch.minutesAwake} unit="min" color={wakeColor} />
                  <StatRow label="Sleep Cycles"        value={arch.cycleCount > 0 ? arch.cycleCount : '--'} color="#a78bfa" />
                  <StatRow label="Full Awakenings"     value={arch.fullAwakenings} />
                  <StatRow label="Brief Awakenings"    value={arch.briefAwakenings} />
                </div>
              </div>
            )
          })()}

          {todaySleep?.levels?.data?.length > 0 && (() => {
            const arch  = parseSleepArchitecture(todaySleep)
            if (!arch?.hypnogram?.length) return null
            const age   = getUserAge()
            const norms = getSleepStageNorms(age)
            const totalMinsN = todaySleep.minutesAsleep || 0
            const deepMins  = todaySleep.levels?.summary?.deep?.minutes || 0
            const remMins   = todaySleep.levels?.summary?.rem?.minutes  || 0
            const deepPct   = totalMinsN > 0 ? Math.round(deepMins / totalMinsN * 100) : 0
            const remPct    = totalMinsN > 0 ? Math.round(remMins  / totalMinsN * 100) : 0
            const deepColor = deepPct >= norms.deepPct ? '#00c9a7' : deepPct >= norms.deepPct * 0.7 ? '#f59e0b' : '#ef4444'
            const remColor  = remPct  >= norms.remPct  ? '#00c9a7' : remPct  >= norms.remPct  * 0.7 ? '#f59e0b' : '#ef4444'
            return (
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">vs Age-Adjusted Norms</p>
                <p className="text-[10px] text-gray-600 mb-3">Ohayon 2004 meta-analysis · males age {age}</p>
                <div className="space-y-3">
                  {[
                    { label: 'Deep Sleep', yours: deepPct, norm: norms.deepPct, color: deepColor, unit: '%' },
                    { label: 'REM Sleep',  yours: remPct,  norm: norms.remPct,  color: remColor,  unit: '%' },
                  ].map(({ label, yours, norm, color, unit }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">{label}</span>
                        <span>
                          <span className="font-semibold" style={{ color }}>{yours}{unit}</span>
                          <span className="text-gray-600"> / norm {norm}{unit}</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
                        {(() => { const w = Math.min(100, (yours / (norm * 1.5)) * 100); return (
                          <div className="h-full rounded-full" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${color}77, ${color})`, boxShadow: w > 0 ? `0 0 6px ${color}44` : undefined }} />
                        ) })()}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="rounded-xl p-2" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
                      <p className="text-[10px] text-gray-600 mb-0.5">Sleep Onset Latency</p>
                      <p className="text-sm font-bold text-white">{arch.sleepLatency}<span className="text-xs text-gray-500"> min</span></p>
                      <p className="text-[10px] text-gray-600">Norm &lt;{norms.solMins} min</p>
                    </div>
                    <div className="rounded-xl p-2" style={{ background: 'linear-gradient(145deg, #1c1c1c, #171717)' }}>
                      <p className="text-[10px] text-gray-600 mb-0.5">Time Awake</p>
                      <p className="text-sm font-bold text-white">{arch.minutesAwake}<span className="text-xs text-gray-500"> min</span></p>
                      <p className="text-[10px] text-gray-600">Norm &lt;{norms.wasoMins} min</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {(() => {
            const arch = parseSleepArchitecture(todaySleep)
            if (!arch || arch.cycleCount === 0) return null
            return (
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Sleep Architecture Split</p>
                <p className="text-[10px] text-gray-600 mb-3">Borbely two-process model — deep front-loads, REM back-loads</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-3" style={{ background: '#0d0d1f', border: '1px solid #2a2a4a' }}>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">First half</p>
                    <p className="text-xs text-white"><span className="font-bold" style={{ color: '#4f46e5' }}>{arch.firstHalfDeepMins}m</span> deep</p>
                    <p className="text-xs text-white"><span className="font-bold" style={{ color: '#8b5cf6' }}>{arch.firstHalfRemMins}m</span> REM</p>
                    {arch.deepFrontLoaded && <p className="text-[10px] text-green-500 mt-1">Deep front-loaded ✓</p>}
                  </div>
                  <div className="rounded-xl p-3" style={{ background: '#0d0d1f', border: '1px solid #2a2a4a' }}>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Second half</p>
                    <p className="text-xs text-white"><span className="font-bold" style={{ color: '#4f46e5' }}>{arch.secondHalfDeepMins}m</span> deep</p>
                    <p className="text-xs text-white"><span className="font-bold" style={{ color: '#8b5cf6' }}>{arch.secondHalfRemMins}m</span> REM</p>
                    {arch.remBackLoaded && <p className="text-[10px] text-green-500 mt-1">REM back-loaded ✓</p>}
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 mt-3">
                  {arch.deepFrontLoaded && arch.remBackLoaded
                    ? 'Healthy architecture. Deep sleep concentrating early, REM enriching the back half.'
                    : !arch.deepFrontLoaded
                    ? 'Deep sleep not concentrating in first half — alcohol, late eating, or stress can shift SWS later.'
                    : 'REM not concentrating in second half — consistent sleep times strengthen circadian REM drive.'}
                </p>
              </div>
            )
          })()}
        </>
      )}

      {/* 14-day trend */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Sleep Duration — 14 Days</p>
        <BarGraph data={sleepChartData} dataKey="hours" color="#8b5cf6" unit="h" height={100} />
        <p className="text-xs text-gray-600 mt-2 text-center">Target: 7.5–9 hrs</p>
      </div>

      {/* Guidance */}
      {/* Sleep Debt */}
      {(() => {
        const debt = sleepDebt
        const debtColor = debt >= 5 ? '#ef4444' : debt >= 2 ? '#f59e0b' : '#00c9a7'
        return (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">7-Day Sleep Debt</p>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-bold" style={{ color: debtColor }}>{debt}h</span>
              <span className="text-gray-500 text-sm">{debt === 0 ? 'fully caught up' : 'owed this week'}</span>
            </div>
            {sleepDebtPayback != null && (
              <p className="text-xs text-gray-500 mt-1">
                At current pace, clear in <span className="text-white font-semibold">{sleepDebtPayback} {sleepDebtPayback === 1 ? 'night' : 'nights'}</span>
              </p>
            )}
            <div className="h-2 rounded-full bg-[#222] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (debt / 10) * 100)}%`, background: debtColor }} />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {debt === 0
                ? 'No debt — your body is fully rested.'
                : debt < 2
                ? 'Minor debt. One good night recovers this.'
                : `Add ${Math.ceil(debt / 7 * 60)} extra minutes per night to break even by end of week.`}
            </p>
          </div>
        )
      })()}

      {/* Optimal Sleep Window */}
      {(() => {
        const window = calculateOptimalSleepWindow(sleepHistory)
        if (!window) return (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Optimal Sleep Window</p>
            <p className="text-sm text-gray-600">Need 7+ nights of data to calculate your natural window.</p>
          </div>
        )
        const consistencyColor = window.consistency >= 75 ? '#00c9a7' : window.consistency >= 50 ? '#f59e0b' : '#ef4444'
        return (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Your Natural Sleep Window</p>
            <div className="flex justify-around text-center mb-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Target Bedtime</p>
                <p className="text-xl font-bold text-white">{window.bedtime}</p>
              </div>
              <div className="text-gray-700 self-center text-xl">→</div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Natural Wake</p>
                <p className="text-xl font-bold text-white">{window.wakeTime}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Consistency score</span>
              <span className="text-sm font-bold" style={{ color: consistencyColor }}>{window.consistency}%</span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {window.consistency >= 75
                ? 'Great consistency. Your body has a stable rhythm — protect it.'
                : 'Irregular sleep schedule detected. Staying within 30 min of your target adds ~20% recovery quality.'}
            </p>
          </div>
        )
      })()}

      {chronotype && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Chronotype</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{chronotype.type}</p>
              <p className="text-sm text-gray-500 mt-0.5">Sleep midpoint: {chronotype.timeStr}</p>
              <p className="text-xs text-gray-600 mt-1">
                {chronotype.type === 'Morning' && 'Natural early riser — align wake time with light exposure'}
                {chronotype.type === 'Neutral' && 'Intermediate chronotype — flexible sleep timing'}
                {chronotype.type === 'Evening' && 'Natural night owl — avoid early morning hard training'}
              </p>
            </div>
            <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ml-3"
              style={{ background: '#ffffff10', border: '1px solid #333' }}>
              <span className="text-2xl">{chronotype.type === 'Morning' ? '🌅' : chronotype.type === 'Evening' ? '🌙' : '🌤'}</span>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">Based on average sleep midpoint over last 30 nights (Roenneberg MCTQ)</p>
        </div>
      )}

      {(() => {
        const scorePts = (data.calendarDays || [])
          .filter(d => d.sleep > 0 && d.sleepEfficiency > 0)
          .slice(-30)
          .map((d, i, arr) => {
            const score = Math.round(Math.min(100, (d.sleep / 480) * 70 + (d.sleepEfficiency / 100) * 30))
            const daysAgo = Math.round((new Date() - new Date(d.date + 'T12:00:00')) / 86400000)
            return { label: daysAgo === 0 ? 'Today' : `${daysAgo}d`, score }
          })
        if (scorePts.length < 5) return null
        return (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Sleep Score Trend</p>
            <LineGraph data={scorePts} dataKey="score" color="#8b5cf6" unit="%" height={90} />
          </div>
        )
      })()}

      {/* Sleep tip */}
      <div className="rounded-2xl p-4" style={{ background: '#1a1526', border: '1px solid #3b2d5e' }}>
        <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-2">Sleep Tip</p>
        <p className="text-sm text-gray-400">
          {deep < 60
            ? 'Deep sleep is low. Avoid alcohol and late meals — they suppress slow-wave sleep.'
            : rem < 90
            ? 'REM sleep is below optimal. Consistent sleep/wake times improve REM quality.'
            : 'Good sleep architecture. Maintain your current schedule to lock in the pattern.'}
        </p>
      </div>
    </div>
  )
}
