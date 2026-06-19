import ScoreRing from '../components/ScoreRing'
import { LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { getStressColor, getStressLabel, localToday } from '../lib/calculations'

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#7d7363" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export default function Stress({ data, onNav }) {
  const { stressScore = 0, todayHRV = 0, todayRHR = 0, hrvHistory = [], rhrHistory = [], historyDates = [], daytimeStress } = data

  const color = getStressColor(stressScore)
  const label = getStressLabel(stressScore)

  const hrv14 = hrvHistory.slice(-14)
  const avgHRV14 = hrv14.filter(Boolean).reduce((a, b) => a + b, 0) / (hrv14.filter(Boolean).length || 1)
  const avgRHR14 = rhrHistory.slice(-14).filter(Boolean).reduce((a, b) => a + b, 0) / (rhrHistory.slice(-14).filter(Boolean).length || 1)

  const hrvRatio = avgHRV14 > 0 ? Math.round((todayHRV / avgHRV14) * 100) : 100
  const rhrDiff = Math.round(todayRHR - avgRHR14)

  const todayStr = localToday()
  const dates14 = historyDates.slice(-14)
  const stressChartData = hrv14.map((v, i) => {
    const d = dates14[i]
    const lbl = !d ? (i === hrv14.length - 1 ? 'Today' : `-${hrv14.length - 1 - i}d`)
      : d === todayStr ? 'Today' : `-${Math.round((new Date(todayStr) - new Date(d)) / 86400000)}d`
    return { label: lbl, hrv: Math.round(v) }
  })

  return (
    <div className="px-4 pt-safe pb-28 space-y-4" style={{ background: '#F6F1E9', minHeight: '100vh' }}>
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-[#9a8f7e] text-xs uppercase tracking-wider">Stress Monitor</p>
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Body stress level</h1>
        </div>
      </div>

      {/* Main score */}
      <div className="rounded-2xl p-5 flex items-center gap-6" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <ScoreRing score={stressScore} color={color} size={130} strokeWidth={11} label={label} />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs text-[#9a8f7e] uppercase tracking-wider">HRV vs baseline</p>
            <p className="text-lg font-bold" style={{ color: hrvRatio >= 100 ? '#3E9C7E' : '#D9A23F' }}>
              {hrvRatio}%
            </p>
          </div>
          <div>
            <p className="text-xs text-[#9a8f7e] uppercase tracking-wider">Resting HR vs baseline</p>
            <p className="text-lg font-bold" style={{ color: rhrDiff <= 0 ? '#3E9C7E' : '#ef4444' }}>
              {rhrDiff > 0 ? '+' : ''}{rhrDiff} bpm
            </p>
          </div>
        </div>
      </div>

      {/* Stress scale */}
      <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-4">Stress Scale</p>
        <div className="relative h-3 rounded-full overflow-hidden mb-3"
          style={{ background: 'linear-gradient(to right, #3E9C7E, #D9A23F, #ef4444)' }}>
          <div
            className="absolute top-0 w-3 h-3 bg-white rounded-full shadow-lg transition-all duration-700"
            style={{ left: `calc(${Math.min(96, Math.max(2, stressScore))}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-xs text-[#9a8f7e]">
          <span>Low</span>
          <span>Moderate</span>
          <span>High</span>
          <span>Very High</span>
        </div>
      </div>

      {/* Stats */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest">Inputs</span>
        </div>
        <div className="px-4">
          <StatRow label="Today's HRV" value={todayHRV} unit="ms" />
          <StatRow label="14-Day HRV Average" value={Math.round(avgHRV14)} unit="ms" />
          <StatRow label="Today's Resting HR" value={todayRHR} unit="bpm" />
          <StatRow label="14-Day RHR Average" value={Math.round(avgRHR14)} unit="bpm" />
        </div>
      </div>

      {/* HRV trend */}
      <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-3">HRV Trend</p>
        <LineGraph data={stressChartData} dataKey="hrv" color={color} unit="ms" reference={Math.round(avgHRV14)} height={100} />
        <p className="text-xs text-[#b3a890] mt-1 text-center">Dashed line = 14-day baseline</p>
      </div>

      {/* Daytime stress */}
      {daytimeStress && (
        <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
          <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-3">Daytime Autonomic Load</p>
          <div className="flex items-center gap-4 mb-3">
            <div>
              <p className="text-4xl font-bold" style={{ color: daytimeStress.score < 35 ? '#3E9C7E' : daytimeStress.score < 65 ? '#D9A23F' : '#ef4444' }}>
                {daytimeStress.score}
              </p>
              <p className="text-xs text-[#9a8f7e] mt-0.5">
                {daytimeStress.score < 35 ? 'Low — calm day' : daytimeStress.score < 65 ? 'Moderate — some tension' : 'High — stressed day'}
              </p>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-xs text-[#9a8f7e]">
                <span>Avg waking HR</span>
                <span className="text-[#1a1a1a] font-semibold">{daytimeStress.avgHR} bpm</span>
              </div>
              <div className="flex justify-between text-xs text-[#9a8f7e]">
                <span>Above resting HR</span>
                <span className="font-semibold" style={{ color: daytimeStress.delta < 5 ? '#3E9C7E' : '#D9A23F' }}>
                  +{daytimeStress.delta} bpm
                </span>
              </div>
            </div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EAE2D2' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${daytimeStress.score}%`,
                background: daytimeStress.score < 35 ? '#3E9C7E' : daytimeStress.score < 65 ? '#D9A23F' : '#ef4444',
              }}
            />
          </div>
          <p className="text-[11px] text-[#b3a890] mt-2">Measured from waking HR vs your resting HR, excluding exercise periods.</p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-2">How This Works</p>
        <p className="text-sm text-[#5c5648]">
          Overnight stress reflects HRV (60%) and resting HR (40%) vs your 14-day baselines — your nervous system's
          recovery quality. Daytime load measures how elevated your HR stays during waking hours vs your RHR —
          a proxy for sympathetic nervous system activation throughout the day.
        </p>
      </div>
    </div>
  )
}
