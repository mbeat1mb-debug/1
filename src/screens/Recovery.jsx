import ScoreRing from '../components/ScoreRing'
import { LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { getRecoveryColor, getRecoveryLabel } from '../lib/calculations'

export default function Recovery({ data }) {
  const { recoveryScore = 0, todayHRV = 0, todayRHR = 0, todaySpO2 = 0, todayBR = 0,
    todaySleep, hrvHistory = [], rhrHistory = [], sleepHistory = [] } = data

  const color = getRecoveryColor(recoveryScore)
  const label = getRecoveryLabel(recoveryScore)

  const hrvChartData = hrvHistory.slice(-14).map((v, i) => ({ label: i === hrvHistory.slice(-14).length - 1 ? 'Today' : `-${hrvHistory.slice(-14).length - 1 - i}d`, hrv: Math.round(v) }))
  const rhrChartData = rhrHistory.slice(-14).map((v, i) => ({ label: i === rhrHistory.slice(-14).length - 1 ? 'Today' : `-${rhrHistory.slice(-14).length - 1 - i}d`, rhr: Math.round(v) }))

  const avgHRV = hrvHistory.length ? Math.round(hrvHistory.reduce((a, b) => a + b, 0) / hrvHistory.length) : 0

  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Recovery</p>
        <h1 className="text-xl font-bold">How recovered are you?</h1>
      </div>

      {/* Main score */}
      <div className="rounded-2xl p-5 flex items-center gap-6" style={{ background: '#111', border: '1px solid #222' }}>
        <ScoreRing score={recoveryScore} color={color} size={130} strokeWidth={11} label={label} />
        <div className="flex-1">
          <p className="text-gray-400 text-sm mb-3">Recovery Score</p>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">HRV weight</span>
              <span className="text-white font-medium">40%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Resting HR</span>
              <span className="text-white font-medium">25%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Sleep</span>
              <span className="text-white font-medium">25%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">SpO₂ + Resp</span>
              <span className="text-white font-medium">10%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Today's Metrics</span>
        </div>
        <div className="px-4">
          <StatRow label="Heart Rate Variability" value={todayHRV} unit="ms" color={todayHRV >= avgHRV ? '#00c9a7' : '#f59e0b'} />
          <StatRow label="30-Day HRV Average" value={avgHRV} unit="ms" />
          <StatRow label="Resting Heart Rate" value={todayRHR} unit="bpm" />
          <StatRow label="Sleep Duration" value={sleepHours} />
          <StatRow label="Sleep Efficiency" value={todaySleep?.efficiency ?? '--'} unit="%" />
          <StatRow label="Blood Oxygen (SpO₂)" value={todaySpO2} unit="%" />
          <StatRow label="Respiratory Rate" value={todayBR} unit="br/min" />
        </div>
      </div>

      {/* HRV trend */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">HRV — 14 Days</p>
        <LineGraph data={hrvChartData} dataKey="hrv" color="#00c9a7" unit="ms" reference={avgHRV} height={100} />
      </div>

      {/* RHR trend */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Resting HR — 14 Days</p>
        <LineGraph data={rhrChartData} dataKey="rhr" color="#ef4444" unit=" bpm" height={100} />
      </div>

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
