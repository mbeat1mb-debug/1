import ScoreRing from '../components/ScoreRing'
import { getRecoveryColor, getRecoveryLabel, getStressColor, getStressLabel } from '../lib/calculations'

function formatDate() {
  const d = new Date()
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function SectionCard({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-opacity active:opacity-70"
      style={{ background: '#111', border: '1px solid #222' }}
    >
      {children}
    </button>
  )
}

function Pill({ label, value, unit = '' }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-white">{value}<span className="text-gray-500 text-xs ml-0.5">{unit}</span></span>
    </div>
  )
}

export default function Home({ data, onNav }) {
  const {
    recoveryScore = 0, strainScore = 0, sleepScore = 0, stressScore = 0,
    todayHRV = 0, todayRHR = 0, todaySleep, steps = 0, calories = 0, activeMinutes = 0,
    todaySpO2 = 0, todayBR = 0,
  } = data

  const recoveryColor = getRecoveryColor(recoveryScore)
  const recoveryLabel = getRecoveryLabel(recoveryScore)
  const stressColor = getStressColor(stressScore)
  const stressLabel = getStressLabel(stressScore)

  const sleepHours = todaySleep ? `${Math.floor(todaySleep.minutesAsleep / 60)}h ${todaySleep.minutesAsleep % 60}m` : '--'
  const sleepColor = sleepScore >= 75 ? '#8b5cf6' : sleepScore >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="px-4 pt-safe space-y-3 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between pt-2 pb-1">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">{formatDate()}</p>
          <h1 className="text-xl font-bold text-white">Daily Report</h1>
        </div>
        <button onClick={() => onNav('settings')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Recovery — hero card */}
      <SectionCard onClick={() => onNav('recovery')}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recovery</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: recoveryColor + '22', color: recoveryColor }}>
            {recoveryLabel}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <ScoreRing score={recoveryScore} color={recoveryColor} size={120} strokeWidth={10} />
          <div className="flex-1 space-y-3">
            <Pill label="HRV" value={todayHRV} unit="ms" />
            <Pill label="Resting HR" value={todayRHR} unit="bpm" />
            <Pill label="Sleep" value={sleepHours} />
            <Pill label="SpO₂" value={todaySpO2} unit="%" />
          </div>
        </div>
      </SectionCard>

      {/* Strain */}
      <SectionCard onClick={() => onNav('strain')}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Strain</span>
          <span className="text-xs text-gray-500">0 – 21</span>
        </div>
        <div className="flex items-center gap-5">
          <ScoreRing score={strainScore} max={21} color="#3b82f6" size={100} strokeWidth={9} unit="" />
          <div className="flex-1 space-y-3">
            <Pill label="Calories" value={calories.toLocaleString()} unit="kcal" />
            <Pill label="Active" value={activeMinutes} unit="min" />
            <Pill label="Steps" value={steps.toLocaleString()} />
          </div>
        </div>
      </SectionCard>

      {/* Sleep */}
      <SectionCard onClick={() => onNav('sleep')}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Sleep</span>
        </div>
        <div className="flex items-center gap-5">
          <ScoreRing score={sleepScore} color={sleepColor} size={100} strokeWidth={9} unit="%" />
          <div className="flex-1 space-y-3">
            <Pill label="Duration" value={sleepHours} />
            <Pill label="Efficiency" value={todaySleep?.efficiency ?? '--'} unit="%" />
            <Pill label="Resp Rate" value={todayBR} unit="br/m" />
          </div>
        </div>
      </SectionCard>

      {/* Stress */}
      <SectionCard onClick={() => onNav('stress')}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Stress Monitor</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold" style={{ color: stressColor }}>{stressScore}</span>
              <span className="text-sm font-bold" style={{ color: stressColor }}>{stressLabel}</span>
            </div>
            <span className="text-xs text-gray-600 mt-1">Based on HRV vs 14-day baseline</span>
          </div>
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: stressColor + '15' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={stressColor} strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>
      </SectionCard>

      {/* Records */}
      <SectionCard onClick={() => onNav('records')}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Records & History</span>
            <p className="text-gray-300 text-sm mt-1">PRs, streaks, 90-day calendar</p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={1.5} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
      </SectionCard>

      {/* Healthspan */}
      <SectionCard onClick={() => onNav('healthspan')}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Healthspan</span>
            <p className="text-gray-300 text-sm mt-1">Biological age & pace of aging</p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={1.5} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
      </SectionCard>

      {/* Quick journal tap */}
      <button
        onClick={() => onNav('journal')}
        className="w-full flex items-center justify-between rounded-2xl p-4 transition-opacity active:opacity-70"
        style={{ background: '#111', border: '1px dashed #333' }}
      >
        <span className="text-gray-400 text-sm">Log today's behaviors</span>
        <span className="text-xl">＋</span>
      </button>
    </div>
  )
}
