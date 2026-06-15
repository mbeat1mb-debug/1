import ScoreRing from '../components/ScoreRing'
import { BarGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { getMaxHR, getTrainingLoadColor, getUserHeightCm, getUserUnits, calculateDistance } from '../lib/calculations'

const ZONE_COLORS = ['#374151', '#3b82f6', '#10b981', '#f59e0b', '#f97316', '#ef4444']
const ZONE_LABELS = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5']
const ZONE_DESCS = ['Warm-Up', 'Fat Burn', 'Cardio', 'Threshold', 'Max']

const CATEGORY_COLOR = { aerobic: '#3b82f6', strength: '#f59e0b', recovery: '#00c9a7' }

function WorkoutRow({ workout, units }) {
  const catColor = CATEGORY_COLOR[workout.category] || '#888'
  const dateLabel = (() => {
    const today = new Date().toISOString().split('T')[0]
    if (workout.date === today) return 'Today'
    const diff = Math.round((new Date(today) - new Date(workout.date)) / 86400000)
    return diff === 1 ? 'Yesterday' : `${diff}d ago`
  })()
  const distStr = workout.distance != null
    ? units === 'imperial'
      ? `${Math.round(workout.distance * 0.6214 * 10) / 10} mi`
      : `${Math.round(workout.distance * 10) / 10} km`
    : null

  return (
    <div className="py-3 border-b border-[#1a1a1a] last:border-0">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: catColor + '20', color: catColor }}>
            {workout.name}
          </span>
          <span className="text-xs text-gray-600">{dateLabel}</span>
        </div>
        <span className="text-xs text-gray-500">{workout.durationMins}m</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {workout.avgHR   != null && <span className="text-gray-400">Avg HR <span className="text-white font-medium">{workout.avgHR} bpm</span></span>}
        {workout.calories != null && <span className="text-gray-400">Cal <span className="text-white font-medium">{workout.calories}</span></span>}
        {distStr && <span className="text-gray-400">Dist <span className="text-white font-medium">{distStr}</span></span>}
        {workout.strainContribution != null && <span className="text-gray-400">Strain <span className="font-medium" style={{ color: '#3b82f6' }}>{workout.strainContribution}</span></span>}
      </div>
      {(workout.epoc || workout.cardiacDrift != null) && (
        <div className="flex gap-3 mt-1.5 text-[11px]">
          {workout.epoc?.kcal > 0 && (
            <span className="text-gray-600">
              EPOC <span className="text-white font-medium">{workout.epoc.kcal} kcal</span>
              <span className="text-gray-600"> · {workout.epoc.durationMins}m elevated</span>
            </span>
          )}
          {workout.cardiacDrift != null && (
            <span className={workout.cardiacDrift > 5 ? 'text-amber-400' : 'text-gray-600'}>
              HR drift <span className="font-medium">{workout.cardiacDrift > 0 ? '+' : ''}{workout.cardiacDrift}%</span>
              {workout.cardiacDrift > 5 && <span className="text-amber-400"> — hydrate</span>}
            </span>
          )}
        </div>
      )}
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

export default function Strain({ data, onNav }) {
  const { strainScore = 0, steps = 0, calories = 0, activeMinutes = 0,
    zoneMinutes = [0, 0, 0, 0, 0], recoveryScore = 0, trainingLoad, trainingEffect, activityLogs = [] } = data

  const maxHR = getMaxHR()
  const strainColor = '#3b82f6'
  const heightCm = getUserHeightCm()
  const units = getUserUnits()
  const distanceKm = calculateDistance(steps, heightCm)
  const distanceDisplay = distanceKm
    ? units === 'imperial' ? `${Math.round(distanceKm * 0.6214 * 10) / 10} mi` : `${distanceKm} km`
    : null
  const totalZoneMinutes = zoneMinutes.reduce((a, b) => a + b, 0)
  const optimalStrain = recoveryScore >= 67 ? 14 : recoveryScore >= 34 ? 10 : 7

  const tsbColor = trainingLoad ? getTrainingLoadColor(trainingLoad.tsb) : '#888'

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Strain</p>
          <h1 className="text-xl font-bold">Cardiovascular load</h1>
        </div>
      </div>

      {/* Main score */}
      <div className="rounded-2xl p-5 flex items-center gap-6" style={{ background: '#111', border: '1px solid #222' }}>
        <ScoreRing score={strainScore} max={21} color={strainColor} size={130} strokeWidth={11} sublabel="/ 21" />
        <div className="flex-1">
          <p className="text-gray-400 text-sm mb-2">Day Strain</p>
          <div className="rounded-xl p-3" style={{ background: strainColor + '15', border: `1px solid ${strainColor}33` }}>
            <p className="text-xs text-gray-400 mb-0.5">Optimal target today</p>
            <p className="text-2xl font-bold" style={{ color: strainColor }}>{optimalStrain}</p>
            <p className="text-xs text-gray-500">Based on recovery {recoveryScore}%</p>
          </div>
        </div>
      </div>

      {/* Training Load (ATL/CTL/TSB) */}
      {trainingLoad && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Training Load</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 text-center" style={{ background: '#1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Fatigue (ATL)</p>
              <p className="text-xl font-bold text-white">{trainingLoad.atl}</p>
              <p className="text-[10px] text-gray-600">7-day avg</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: '#1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Fitness (CTL)</p>
              <p className="text-xl font-bold text-white">{trainingLoad.ctl}</p>
              <p className="text-[10px] text-gray-600">42-day avg</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: tsbColor + '15', border: `1px solid ${tsbColor}33` }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Form (TSB)</p>
              <p className="text-xl font-bold" style={{ color: tsbColor }}>{trainingLoad.tsb > 0 ? '+' : ''}{trainingLoad.tsb}</p>
              <p className="text-[10px] font-semibold" style={{ color: tsbColor }}>{trainingLoad.form}</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            {trainingLoad.form === 'Fresh' && 'CTL > ATL — well rested, good time to train hard or race.'}
            {trainingLoad.form === 'Neutral' && 'Balanced fitness and fatigue. Maintain current training load.'}
            {trainingLoad.form === 'Loaded' && 'ATL > CTL — accumulated fatigue. Consider an easy day.'}
            {trainingLoad.form === 'Overreached' && 'High fatigue relative to fitness. Rest is essential now.'}
          </p>
        </div>
      )}

      {/* Activity stats */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Activity</span>
        </div>
        <div className="px-4">
          <StatRow label="Steps" value={steps.toLocaleString()} />
          {distanceDisplay && <StatRow label="Distance" value={distanceDisplay} color="#3b82f6" />}
          <StatRow label="Calories Burned" value={calories.toLocaleString()} unit="kcal" />
          <StatRow label="Active Minutes" value={activeMinutes} unit="min" />
          <StatRow label="Max HR Target" value={maxHR} unit="bpm" color="#f59e0b" />
          {(() => {
            const todayStr = new Date().toISOString().split('T')[0]
            const todayWorkouts = activityLogs.filter(w => w.date === todayStr && w.epoc)
            if (!todayWorkouts.length) return null
            const totalEpoc = todayWorkouts.reduce((s, w) => s + (w.epoc?.kcal || 0), 0)
            const totalDur  = todayWorkouts.reduce((s, w) => s + (w.epoc?.durationMins || 0), 0)
            return (
              <>
                <StatRow label="EPOC (after-burn)" value={totalEpoc} unit="kcal" color="#f97316" />
                <StatRow label="Elevated metabolism" value={totalDur} unit="min" color="#f97316" />
              </>
            )
          })()}
        </div>
      </div>

      {/* HR Zones breakdown */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Heart Rate Zones</p>
        <div className="space-y-3">
          {ZONE_LABELS.map((zone, i) => {
            const mins = zoneMinutes[i] || 0
            const pct = totalZoneMinutes > 0 ? (mins / totalZoneMinutes) * 100 : 0
            return (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">{zone} <span className="text-gray-600">({ZONE_DESCS[i]})</span></span>
                  <span className="text-white font-medium">{mins} min</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#222] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: ZONE_COLORS[i + 1] }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Training Effect */}
      {trainingEffect && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Training Effect</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Aerobic', value: trainingEffect.aerobic, desc: trainingEffect.aerobicLabel, color: '#00c9a7' },
              { label: 'Anaerobic', value: trainingEffect.anaerobic, desc: trainingEffect.anaerobicLabel, color: '#f97316' },
            ].map(({ label, value, desc, color }) => (
              <div key={label} className="rounded-xl p-3" style={{ background: color + '15', border: `1px solid ${color}33` }}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-3xl font-bold" style={{ color }}>{value.toFixed(1)}</p>
                <p className="text-[11px] font-semibold mt-1" style={{ color }}>{desc}</p>
                <div className="mt-2 h-1.5 rounded-full bg-[#222] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(value / 5) * 100}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 mt-3">Aerobic = Z2+Z3 time. Anaerobic = Z4+Z5 time. Scale 0–5.</p>
        </div>
      )}

      {/* Recent Workouts */}
      {activityLogs.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recent Workouts</span>
            <span className="text-xs text-gray-600">{activityLogs.length} sessions (30d)</span>
          </div>
          <div className="px-4">
            {activityLogs.slice(0, 10).map(w => (
              <WorkoutRow key={w.activityId} workout={w} units={units} />
            ))}
          </div>
        </div>
      )}

      {/* Strain guidance */}
      <div className="rounded-2xl p-4" style={{ background: '#1a1f2e', border: '1px solid #2a3a5e' }}>
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">How Strain is Calculated</p>
        <p className="text-sm text-gray-400">
          Based on time spent in each heart rate zone throughout the day. Higher zones count exponentially more.
          Your personal max HR is <span className="text-white font-semibold">{maxHR} bpm</span>
          {parseInt(localStorage.getItem('observed_max_hr') || '0', 10) > 0 ? ' (from your Fitbit data)' : ' (Gellish formula)'}.
        </p>
      </div>
    </div>
  )
}
