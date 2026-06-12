import ScoreRing from '../components/ScoreRing'
import { BarGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { calculateSleepDebt, calculateOptimalSleepWindow } from '../lib/calculations'

function SleepStageBar({ label, minutes, total, color }) {
  const pct = total > 0 ? (minutes / total) * 100 : 0
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-medium">{timeStr}</span>
      </div>
      <div className="h-2 rounded-full bg-[#222] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
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

  const sleepChartData = sleepHistory.slice(-14).map((s, i) => ({
    label: i === sleepHistory.slice(-14).length - 1 ? 'Today' : `-${sleepHistory.slice(-14).length - 1 - i}d`,
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
        <div className="rounded-2xl p-6 text-center" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-2xl mb-3">😴</p>
          <p className="text-gray-300 text-sm font-medium">No sleep data yet</p>
          <p className="text-xs text-gray-600 mt-1">Make sure your Fitbit synced after waking up.</p>
        </div>
      )}

      {/* Main score */}
      {todaySleep && (
        <div className="rounded-2xl p-5 flex items-center gap-6" style={{ background: '#111', border: '1px solid #222' }}>
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

      {/* Sleep stages */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Sleep Stages</p>
        <div className="space-y-3">
          <SleepStageBar label="Deep (Restorative)" minutes={deep} total={totalMins} color="#4f46e5" />
          <SleepStageBar label="REM (Dream)" minutes={rem} total={totalMins} color="#8b5cf6" />
          <SleepStageBar label="Light" minutes={light} total={totalMins} color="#a78bfa" />
          <SleepStageBar label="Awake" minutes={wake} total={totalMins} color="#374151" />
        </div>
      </div>

      {/* Sleep stats */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Metrics</span>
        </div>
        <div className="px-4">
          <StatRow label="Sleep Efficiency" value={todaySleep?.efficiency ?? '--'} unit="%" color={sleepColor} />
          <StatRow label="Sleep Score" value={sleepScore} unit="/ 100" color={sleepColor} />
          <StatRow label="Respiratory Rate" value={todayBR} unit="br/min" />
          <StatRow label="Wakeups" value={todaySleep?.levels?.data?.filter(d => d.level === 'wake').length ?? '--'} />
        </div>
      </div>

      {/* 14-day trend */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Sleep Duration — 14 Days</p>
        <BarGraph data={sleepChartData} dataKey="hours" color="#8b5cf6" unit="h" height={100} />
        <p className="text-xs text-gray-600 mt-2 text-center">Target: 7.5–9 hrs</p>
      </div>

      {/* Guidance */}
      {/* Sleep Debt */}
      {(() => {
        const debt = calculateSleepDebt(sleepHistory)
        const debtColor = debt >= 5 ? '#ef4444' : debt >= 2 ? '#f59e0b' : '#00c9a7'
        return (
          <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">7-Day Sleep Debt</p>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-bold" style={{ color: debtColor }}>{debt}h</span>
              <span className="text-gray-500 text-sm">{debt === 0 ? 'fully caught up' : 'owed this week'}</span>
            </div>
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
          <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Optimal Sleep Window</p>
            <p className="text-sm text-gray-600">Need 7+ nights of data to calculate your natural window.</p>
          </div>
        )
        const consistencyColor = window.consistency >= 75 ? '#00c9a7' : window.consistency >= 50 ? '#f59e0b' : '#ef4444'
        return (
          <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
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
