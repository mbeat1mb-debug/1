import ScoreRing from '../components/ScoreRing'
import { BarGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'

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

export default function Sleep({ data }) {
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
      <div className="pt-2">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Sleep</p>
        <h1 className="text-xl font-bold">Last night's sleep</h1>
      </div>

      {/* Main score */}
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
