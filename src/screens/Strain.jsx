import ScoreRing from '../components/ScoreRing'
import { StatRow } from '../components/MetricCard'
import { getMaxHR, getTrainingLoadColor, getUserHeightCm, getUserUnits, calculateDistance, getTrainingStatus, localToday } from '../lib/calculations'

const ZONE_COLORS = ['#9a8f7e', '#EAE2D2', '#F0D9A8', '#E8B968', '#D98E3F', '#B8602A']
const ZONE_LABELS = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5']
const ZONE_DESCS = ['Warm-Up', 'Fat Burn', 'Cardio', 'Threshold', 'Max']

const CATEGORY_COLOR = { aerobic: '#3E9C7E', strength: '#D98E3F', recovery: '#9B7FD4' }

function WorkoutRow({ workout, units }) {
  const catColor = CATEGORY_COLOR[workout.category] || '#888'
  const dateLabel = (() => {
    const today = localToday()
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
    <div className="py-3 border-b border-[#ece3d4] last:border-0">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: catColor + '20', color: catColor }}>
            {workout.name}
          </span>
          <span className="text-xs text-[#9a8f7e]">{dateLabel}</span>
        </div>
        <span className="text-xs text-[#9a8f7e]">{workout.durationMins}m</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {workout.avgHR   != null && <span className="text-[#7d7363]">Avg HR <span className="text-[#1a1a1a] font-medium">{workout.avgHR} bpm</span></span>}
        {workout.calories != null && <span className="text-[#7d7363]">Cal <span className="text-[#1a1a1a] font-medium">{workout.calories}</span></span>}
        {distStr && <span className="text-[#7d7363]">Dist <span className="text-[#1a1a1a] font-medium">{distStr}</span></span>}
        {workout.strainContribution != null && <span className="text-[#7d7363]">Strain <span className="font-medium" style={{ color: '#D98E3F' }}>{workout.strainContribution}</span></span>}
      </div>
      {(workout.epoc || workout.cardiacDrift != null) && (
        <div className="flex gap-3 mt-1.5 text-[11px]">
          {workout.epoc?.kcal > 0 && (
            <span className="text-[#9a8f7e]">
              EPOC <span className="text-[#1a1a1a] font-medium">{workout.epoc.kcal} kcal</span>
              <span className="text-[#9a8f7e]"> · {workout.epoc.durationMins}m elevated</span>
            </span>
          )}
          {workout.cardiacDrift != null && (
            <span className={workout.cardiacDrift > 5 ? 'text-amber-500' : 'text-[#9a8f7e]'}>
              HR drift <span className="font-medium">{workout.cardiacDrift > 0 ? '+' : ''}{workout.cardiacDrift}%</span>
              {workout.cardiacDrift > 5 && <span className="text-amber-500"> — hydrate</span>}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#7d7363" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export default function Strain({ data, onNav }) {
  const { strainScore = 0, steps = 0, calories = 0, activeMinutes = 0,
    zoneMinutes = [0, 0, 0, 0, 0], recoveryScore = 0, trainingLoad, trainingEffect, activityLogs = [] } = data

  const maxHR = getMaxHR()
  const strainColor = '#D98E3F'
  const heightCm = getUserHeightCm()
  const units = getUserUnits()
  const distanceKm = calculateDistance(steps, heightCm)
  const distanceDisplay = distanceKm
    ? units === 'imperial' ? `${Math.round(distanceKm * 0.6214 * 10) / 10} mi` : `${distanceKm} km`
    : null
  const totalZoneMinutes = zoneMinutes.reduce((a, b) => a + b, 0)
  const optimalStrain = recoveryScore >= 67 ? 14 : recoveryScore >= 34 ? 10 : 7

  const tsbColor = trainingLoad ? getTrainingLoadColor(trainingLoad.tsb) : '#9a8f7e'

  return (
    <div className="px-4 pt-safe pb-28 space-y-4" style={{ background: '#F6F1E9', minHeight: '100vh' }}>
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-[#9a8f7e] text-xs uppercase tracking-wider">Strain</p>
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Cardiovascular load</h1>
        </div>
      </div>

      {/* Main score */}
      <div className="rounded-2xl p-5 flex items-center gap-6" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <ScoreRing score={strainScore} max={21} color={strainColor} size={130} strokeWidth={11} sublabel="/ 21" />
        <div className="flex-1">
          <p className="text-[#7d7363] text-sm mb-2">Day Strain</p>
          <div className="rounded-xl p-3" style={{ background: strainColor + '15', border: `1px solid ${strainColor}33` }}>
            <p className="text-xs text-[#9a8f7e] mb-0.5">Optimal target today</p>
            <p className="text-2xl font-bold" style={{ color: strainColor }}>{optimalStrain}</p>
            <p className="text-xs text-[#9a8f7e]">Based on recovery {recoveryScore}%</p>
          </div>
        </div>
      </div>

      {/* Training Load (ATL/CTL/TSB) */}
      {trainingLoad && (
        <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
          <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-4">Training Load</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 text-center" style={{ background: '#F6F1E9' }}>
              <p className="text-[10px] text-[#9a8f7e] uppercase tracking-wider mb-1">Fatigue (ATL)</p>
              <p className="text-xl font-bold text-[#1a1a1a]">{trainingLoad.atl}</p>
              <p className="text-[10px] text-[#9a8f7e]">7-day avg</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: '#F6F1E9' }}>
              <p className="text-[10px] text-[#9a8f7e] uppercase tracking-wider mb-1">Fitness (CTL)</p>
              <p className="text-xl font-bold text-[#1a1a1a]">{trainingLoad.ctl}</p>
              <p className="text-[10px] text-[#9a8f7e]">42-day avg</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: tsbColor + '15', border: `1px solid ${tsbColor}33` }}>
              <p className="text-[10px] text-[#9a8f7e] uppercase tracking-wider mb-1">Form (TSB)</p>
              <p className="text-xl font-bold" style={{ color: tsbColor }}>{trainingLoad.tsb > 0 ? '+' : ''}{trainingLoad.tsb}</p>
              <p className="text-[10px] font-semibold" style={{ color: tsbColor }}>{trainingLoad.form}</p>
            </div>
          </div>
          <p className="text-xs text-[#9a8f7e] mt-3">
            {trainingLoad.form === 'Fresh' && 'CTL > ATL — well rested, good time to train hard or race.'}
            {trainingLoad.form === 'Neutral' && 'Balanced fitness and fatigue. Maintain current training load.'}
            {trainingLoad.form === 'Loaded' && 'ATL > CTL — accumulated fatigue. Consider an easy day.'}
            {trainingLoad.form === 'Overreached' && 'High fatigue relative to fitness. Rest is essential now.'}
          </p>
          {(() => {
            const ts = getTrainingStatus(trainingLoad, data.strainVelocity)
            if (!ts) return null
            const { status, color, desc } = ts
            return (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[#9a8f7e]">{desc}</span>
                <span className="text-xs font-bold px-3 py-1 rounded-full ml-2 flex-shrink-0" style={{ background: color + '22', color }}>
                  {status}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-4">Strain Coach</p>
        {(() => {
          const remaining = Math.max(0, Math.round((optimalStrain - strainScore) * 10) / 10)
          const pct = Math.min(100, (strainScore / optimalStrain) * 100)
          return (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[#9a8f7e]">Today's capacity used</span>
                <span className="font-semibold text-[#1a1a1a]">{strainScore} / {optimalStrain}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#EAE2D2' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: pct >= 100 ? '#ef4444' : `linear-gradient(90deg, #D98E3F88, #D98E3F)` }} />
              </div>
              <p className="text-xs text-[#9a8f7e] mt-1.5">
                {remaining > 0
                  ? `${remaining} strain units remaining before exceeding target`
                  : 'Target reached — prioritize recovery now'}
              </p>
            </div>
          )
        })()}
        {data.weeklyAZM != null && (() => {
          const azm = data.weeklyAZM
          const target = 150
          const excellent = 300
          const pct = Math.min(100, (azm / excellent) * 100)
          const color = azm >= excellent ? '#3E9C7E' : azm >= target ? '#D98E3F' : '#ef4444'
          return (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[#9a8f7e]">Weekly Active Zone Minutes</span>
                <span className="font-semibold" style={{ color }}>{azm} AZM</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EAE2D2' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
              </div>
              <div className="flex justify-between text-[10px] text-[#9a8f7e] mt-1">
                <span>0</span>
                <span style={{ color: azm >= target ? '#D98E3F' : '#b3a890' }}>150 WHO</span>
                <span style={{ color: azm >= excellent ? '#3E9C7E' : '#b3a890' }}>300 Excellent</span>
              </div>
              {data.weeklyZone2 > 0 && (
                <p className="text-xs text-[#9a8f7e] mt-1.5">Zone 2 this week: <span className="text-[#1a1a1a] font-medium">{data.weeklyZone2} min</span></p>
              )}
            </div>
          )
        })()}
      </div>

      {/* Activity stats */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest">Activity</span>
        </div>
        <div className="px-4">
          <StatRow label="Steps" value={steps.toLocaleString()} />
          {distanceDisplay && <StatRow label="Distance" value={distanceDisplay} color="#9B7FD4" />}
          <StatRow label="Calories Burned" value={calories.toLocaleString()} unit="kcal" />
          <StatRow label="Active Minutes" value={activeMinutes} unit="min" />
          <StatRow label="Max HR Target" value={maxHR} unit="bpm" color="#D98E3F" />
          {(() => {
            const todayStr = localToday()
            const todayWorkouts = activityLogs.filter(w => w.date === todayStr && w.epoc)
            if (!todayWorkouts.length) return null
            const totalEpoc = todayWorkouts.reduce((s, w) => s + (w.epoc?.kcal || 0), 0)
            const totalDur  = todayWorkouts.reduce((s, w) => s + (w.epoc?.durationMins || 0), 0)
            return (
              <>
                <StatRow label="EPOC (after-burn)" value={totalEpoc} unit="kcal" color="#D98E3F" />
                <StatRow label="Elevated metabolism" value={totalDur} unit="min" color="#D98E3F" />
              </>
            )
          })()}
        </div>
      </div>

      {/* HR Zones breakdown */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-4">Heart Rate Zones</p>
        <div className="space-y-4">
          {ZONE_LABELS.map((zone, i) => {
            const mins = zoneMinutes[i] || 0
            const pct = totalZoneMinutes > 0 ? (mins / totalZoneMinutes) * 100 : 0
            return (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#7d7363]">{zone} <span className="text-[#9a8f7e]">({ZONE_DESCS[i]})</span></span>
                  <span className="text-[#1a1a1a] font-medium">{mins} min</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EAE2D2' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${ZONE_COLORS[i + 1]}88, ${ZONE_COLORS[i + 1]})`,
                      boxShadow: pct > 0 ? `0 0 8px ${ZONE_COLORS[i + 1]}55` : undefined,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Training Effect */}
      {trainingEffect && (
        <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
          <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-4">Training Effect</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Aerobic', value: trainingEffect.aerobic, desc: trainingEffect.aerobicLabel, color: '#3E9C7E' },
              { label: 'Anaerobic', value: trainingEffect.anaerobic, desc: trainingEffect.anaerobicLabel, color: '#D98E3F' },
            ].map(({ label, value, desc, color }) => (
              <div key={label} className="rounded-xl p-3" style={{ background: color + '15', border: `1px solid ${color}33` }}>
                <p className="text-[10px] text-[#9a8f7e] uppercase tracking-wider mb-1">{label}</p>
                <p className="text-3xl font-bold" style={{ color }}>{value.toFixed(1)}</p>
                <p className="text-[11px] font-semibold mt-1" style={{ color }}>{desc}</p>
                <div className="mt-2 h-1.5 rounded-full bg-[#EAE2D2] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(value / 5) * 100}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#9a8f7e] mt-3">Aerobic = Z2+Z3 time. Anaerobic = Z4+Z5 time. Scale 0–5.</p>
        </div>
      )}

      {/* Recent Workouts */}
      {activityLogs.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest">Recent Workouts</span>
            <span className="text-xs text-[#9a8f7e]">{activityLogs.length} sessions (30d)</span>
          </div>
          <div className="px-4">
            {activityLogs.slice(0, 10).map(w => (
              <WorkoutRow key={w.activityId} workout={w} units={units} />
            ))}
          </div>
        </div>
      )}

      {/* Strain guidance */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#D98E3F' }}>How Strain is Calculated</p>
        <p className="text-sm text-[#7d7363]">
          Based on time spent in each heart rate zone throughout the day. Higher zones count exponentially more.
          Your personal max HR is <span className="text-[#1a1a1a] font-semibold">{maxHR} bpm</span>
          {parseInt(localStorage.getItem('observed_max_hr') || '0', 10) > 0 ? ' (from your synced data)' : ' (Gellish formula)'}.
        </p>
      </div>
    </div>
  )
}
