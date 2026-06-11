import ScoreRing from '../components/ScoreRing'
import { LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { getStressColor, getStressLabel } from '../lib/calculations'

export default function Stress({ data }) {
  const { stressScore = 0, todayHRV = 0, todayRHR = 0, hrvHistory = [], rhrHistory = [] } = data

  const color = getStressColor(stressScore)
  const label = getStressLabel(stressScore)

  const avgHRV14 = hrvHistory.slice(-14).filter(Boolean).reduce((a, b) => a + b, 0) / (hrvHistory.slice(-14).filter(Boolean).length || 1)
  const avgRHR14 = rhrHistory.slice(-14).filter(Boolean).reduce((a, b) => a + b, 0) / (rhrHistory.slice(-14).filter(Boolean).length || 1)

  const hrvRatio = avgHRV14 > 0 ? Math.round((todayHRV / avgHRV14) * 100) : 100
  const rhrDiff = Math.round(todayRHR - avgRHR14)

  const stressChartData = hrvHistory.slice(-14).map((v, i) => ({
    label: i === hrvHistory.slice(-14).length - 1 ? 'Today' : `-${hrvHistory.slice(-14).length - 1 - i}d`,
    hrv: Math.round(v),
  }))

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Stress Monitor</p>
        <h1 className="text-xl font-bold">Body stress level</h1>
      </div>

      {/* Main score */}
      <div className="rounded-2xl p-5 flex items-center gap-6" style={{ background: '#111', border: '1px solid #222' }}>
        <ScoreRing score={stressScore} color={color} size={130} strokeWidth={11} label={label} />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">HRV vs baseline</p>
            <p className="text-lg font-bold" style={{ color: hrvRatio >= 100 ? '#00c9a7' : '#f59e0b' }}>
              {hrvRatio}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Resting HR vs baseline</p>
            <p className="text-lg font-bold" style={{ color: rhrDiff <= 0 ? '#00c9a7' : '#ef4444' }}>
              {rhrDiff > 0 ? '+' : ''}{rhrDiff} bpm
            </p>
          </div>
        </div>
      </div>

      {/* Stress scale */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Stress Scale</p>
        <div className="relative h-3 rounded-full overflow-hidden mb-3"
          style={{ background: 'linear-gradient(to right, #00c9a7, #f59e0b, #ef4444)' }}>
          <div
            className="absolute top-0 w-3 h-3 bg-white rounded-full shadow-lg transition-all duration-700"
            style={{ left: `calc(${Math.min(96, Math.max(2, stressScore))}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Low</span>
          <span>Moderate</span>
          <span>High</span>
          <span>Very High</span>
        </div>
      </div>

      {/* Stats */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Inputs</span>
        </div>
        <div className="px-4">
          <StatRow label="Today's HRV" value={todayHRV} unit="ms" />
          <StatRow label="14-Day HRV Average" value={Math.round(avgHRV14)} unit="ms" />
          <StatRow label="Today's Resting HR" value={todayRHR} unit="bpm" />
          <StatRow label="14-Day RHR Average" value={Math.round(avgRHR14)} unit="bpm" />
        </div>
      </div>

      {/* HRV trend */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">HRV Trend</p>
        <LineGraph data={stressChartData} dataKey="hrv" color={color} unit="ms" reference={Math.round(avgHRV14)} height={100} />
        <p className="text-xs text-gray-600 mt-1 text-center">Dashed line = 14-day baseline</p>
      </div>

      {/* How it works */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">How This Works</p>
        <p className="text-sm text-gray-500">
          Stress is calculated by comparing today's HRV (60% weight) and resting heart rate (40% weight)
          against your 14-day personal baselines. When HRV is suppressed and HR is elevated, stress is high.
          Since the Fitbit Air measures HRV during sleep, this reflects overnight physiological stress.
        </p>
      </div>
    </div>
  )
}
