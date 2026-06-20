import ScoreRing from '../components/ScoreRing'
import { StatRow } from '../components/MetricCard'
import { getMaxHR, getTrainingLoadColor, getUserHeightCm, getUserUnits, calculateDistance, getTrainingStatus, localToday } from '../lib/calculations'
import { C, SERIF, Label, BackLink, SectionLabel, Note, norm } from '../lib/almanacTheme'

const ZONE_LABELS = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5']
const ZONE_DESCS = ['Warm-Up', 'Fat Burn', 'Cardio', 'Threshold', 'Max']
const CATEGORY_LABEL = { aerobic: 'Aerobic', strength: 'Strength', recovery: 'Recovery' }

function WorkoutRow({ workout, units }) {
  const dateLabel = (() => {
    const today = localToday()
    if (workout.date === today) return 'Today'
    const diff = Math.round((new Date(today) - new Date(workout.date)) / 86400000)
    return diff === 1 ? 'Yesterday' : `${diff}d ago`
  })()
  const distStr = workout.distance != null
    ? units === 'imperial' ? `${Math.round(workout.distance * 0.6214 * 10) / 10} mi` : `${Math.round(workout.distance * 10) / 10} km`
    : null

  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <div className="flex items-baseline justify-between">
        <span style={{ fontFamily: SERIF, fontSize: 16, color: C.ink }}>
          {workout.name}<span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, fontStyle: 'italic' }}> · {CATEGORY_LABEL[workout.category] || ''}</span>
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{dateLabel} · {workout.durationMins}m</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
        {workout.avgHR != null && <span style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft }}>HR <b style={{ color: C.ink }}>{workout.avgHR}</b></span>}
        {workout.calories != null && <span style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft }}>Cal <b style={{ color: C.ink }}>{workout.calories}</b></span>}
        {distStr && <span style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft }}>Dist <b style={{ color: C.ink }}>{distStr}</b></span>}
        {workout.strainContribution != null && <span style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft }}>Strain <b style={{ color: C.gold }}>{workout.strainContribution}</b></span>}
      </div>
      {(workout.epoc || workout.cardiacDrift != null) && (
        <p style={{ fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: C.faint, marginTop: 4 }}>
          {workout.epoc?.kcal > 0 && `${workout.epoc.kcal} kcal after-burn · ${workout.epoc.durationMins}m elevated`}
          {workout.cardiacDrift != null && `${workout.epoc?.kcal > 0 ? ' · ' : ''}HR drift ${workout.cardiacDrift > 0 ? '+' : ''}${workout.cardiacDrift}%${workout.cardiacDrift > 5 ? ' — hydrate' : ''}`}
        </p>
      )}
    </div>
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
  const tsbColor = trainingLoad ? getTrainingLoadColor(trainingLoad.tsb) : C.faint

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>STRAIN</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Cardiovascular load</h1>

      {/* Main score */}
      <div className="flex items-center gap-8 mt-6">
        <ScoreRing score={strainScore} max={21} color={strainColor} size={120} />
        <div className="flex-1">
          <Label>Optimal target today</Label>
          <p style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: strainColor, marginTop: 2 }}>{optimalStrain}</p>
          <p style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>based on recovery {recoveryScore}%</p>
        </div>
      </div>

      {/* Training Load */}
      {trainingLoad && (
        <div className="mt-9">
          <SectionLabel>Training Load</SectionLabel>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <div>
              <Label style={{ fontSize: 11 }}>Fatigue (ATL)</Label>
              <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, marginTop: 2 }}>{trainingLoad.atl}</p>
              <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>7-day avg</p>
            </div>
            <div>
              <Label style={{ fontSize: 11 }}>Fitness (CTL)</Label>
              <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, marginTop: 2 }}>{trainingLoad.ctl}</p>
              <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>42-day avg</p>
            </div>
            <div>
              <Label style={{ fontSize: 11 }}>Form (TSB)</Label>
              <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: tsbColor, marginTop: 2 }}>{trainingLoad.tsb > 0 ? '+' : ''}{trainingLoad.tsb}</p>
              <p style={{ fontFamily: SERIF, fontSize: 11, color: tsbColor }}>{trainingLoad.form}</p>
            </div>
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft, marginTop: 12 }}>
            {trainingLoad.form === 'Fresh' && 'CTL > ATL — well rested, good time to train hard or race.'}
            {trainingLoad.form === 'Neutral' && 'Balanced fitness and fatigue. Maintain current training load.'}
            {trainingLoad.form === 'Loaded' && 'ATL > CTL — accumulated fatigue. Consider an easy day.'}
            {trainingLoad.form === 'Overreached' && 'High fatigue relative to fitness. Rest is essential now.'}
          </p>
          {(() => {
            const ts = getTrainingStatus(trainingLoad, data.strainVelocity)
            if (!ts) return null
            return (
              <p style={{ fontFamily: SERIF, fontSize: 13, color: ts.color, marginTop: 4, fontStyle: 'italic' }}>{ts.status} — {ts.desc}</p>
            )
          })()}
        </div>
      )}

      {/* Strain Coach */}
      <div className="mt-9">
        <SectionLabel>Strain Coach</SectionLabel>
        {(() => {
          const remaining = Math.max(0, Math.round((optimalStrain - strainScore) * 10) / 10)
          const p = norm(strainScore, 0, optimalStrain)
          return (
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <Label style={{ fontSize: 11 }}>Today's capacity used</Label>
                <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600 }}>{strainScore} / {optimalStrain}</span>
              </div>
              <div style={{ position: 'relative', height: 14, marginTop: 8 }}>
                <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: C.rule }} />
                <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)' }}>
                  <svg width="12" height="14" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={strainColor} /></svg>
                </div>
              </div>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 6 }}>
                {remaining > 0 ? `${remaining} units remaining before exceeding target` : 'Target reached — prioritize recovery now'}
              </p>
            </div>
          )
        })()}
        {data.weeklyAZM != null && (() => {
          const azm = data.weeklyAZM
          const p = norm(azm, 0, 300)
          return (
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <Label style={{ fontSize: 11 }}>Weekly Active Zone Minutes</Label>
                <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600 }}>{azm} AZM</span>
              </div>
              <div style={{ position: 'relative', height: 4, marginTop: 8, background: C.ruleSoft }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: `${p * 100}%`, background: C.gold }} />
              </div>
              <div className="flex justify-between mt-1">
                <span style={{ fontFamily: SERIF, fontSize: 10, color: C.faint }}>0</span>
                <span style={{ fontFamily: SERIF, fontSize: 10, color: C.faint }}>150 WHO</span>
                <span style={{ fontFamily: SERIF, fontSize: 10, color: C.faint }}>300 excellent</span>
              </div>
              {data.weeklyZone2 > 0 && (
                <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 6 }}>Zone 2 this week: {data.weeklyZone2} min</p>
              )}
            </div>
          )
        })()}
      </div>

      {/* Activity */}
      <div className="mt-9">
        <SectionLabel>Activity</SectionLabel>
        <div className="mt-1">
          <StatRow label="Steps" value={steps.toLocaleString()} />
          {distanceDisplay && <StatRow label="Distance" value={distanceDisplay} color="#9B7FD4" />}
          <StatRow label="Calories Burned" value={calories.toLocaleString()} unit="kcal" />
          <StatRow label="Active Minutes" value={activeMinutes} unit="min" />
          <StatRow label="Max HR Target" value={maxHR} unit="bpm" color={strainColor} />
          {(() => {
            const todayStr = localToday()
            const todayWorkouts = activityLogs.filter(w => w.date === todayStr && w.epoc)
            if (!todayWorkouts.length) return null
            const totalEpoc = todayWorkouts.reduce((s, w) => s + (w.epoc?.kcal || 0), 0)
            const totalDur = todayWorkouts.reduce((s, w) => s + (w.epoc?.durationMins || 0), 0)
            return (
              <>
                <StatRow label="EPOC (after-burn)" value={totalEpoc} unit="kcal" color={strainColor} />
                <StatRow label="Elevated metabolism" value={totalDur} unit="min" color={strainColor} />
              </>
            )
          })()}
        </div>
      </div>

      {/* HR Zones */}
      <div className="mt-9">
        <SectionLabel>Heart Rate Zones</SectionLabel>
        <div className="mt-4 space-y-4">
          {ZONE_LABELS.map((zone, i) => {
            const mins = zoneMinutes[i] || 0
            const p = totalZoneMinutes > 0 ? mins / totalZoneMinutes : 0
            return (
              <div key={i}>
                <div className="flex justify-between items-baseline">
                  <span style={{ fontFamily: SERIF, fontSize: 14, color: C.inkSoft }}>{zone} <span style={{ color: C.faint, fontSize: 12 }}>({ZONE_DESCS[i]})</span></span>
                  <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600 }}>{mins} min</span>
                </div>
                <div style={{ height: 3, marginTop: 5, background: C.ruleSoft }}>
                  <div style={{ height: 3, width: `${p * 100}%`, background: strainColor }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Training Effect */}
      {trainingEffect && (
        <div className="mt-9">
          <SectionLabel>Training Effect</SectionLabel>
          <div className="grid grid-cols-2 gap-6 mt-4">
            {[
              { label: 'Aerobic', value: trainingEffect.aerobic, desc: trainingEffect.aerobicLabel, color: '#3E9C7E' },
              { label: 'Anaerobic', value: trainingEffect.anaerobic, desc: trainingEffect.anaerobicLabel, color: strainColor },
            ].map(({ label, value, desc, color }) => (
              <div key={label}>
                <Label>{label}</Label>
                <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color, marginTop: 2 }}>{value.toFixed(1)}</p>
                <p style={{ fontFamily: SERIF, fontSize: 12, color, fontStyle: 'italic' }}>{desc}</p>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 10 }}>Aerobic = Z2+Z3 time. Anaerobic = Z4+Z5 time. Scale 0–5.</p>
        </div>
      )}

      {/* Recent Workouts */}
      {activityLogs.length > 0 && (
        <div className="mt-9">
          <SectionLabel right={`${activityLogs.length} sessions (30d)`}>Recent Workouts</SectionLabel>
          <div className="mt-1">
            {activityLogs.slice(0, 10).map(w => <WorkoutRow key={w.activityId} workout={w} units={units} />)}
          </div>
        </div>
      )}

      <div className="mt-9 mb-4">
        <Note accent={strainColor}>
          Strain is based on time spent in each heart rate zone throughout the day — higher zones count exponentially more.
          Your personal max HR is {maxHR} bpm{parseInt(localStorage.getItem('observed_max_hr') || '0', 10) > 0 ? ' (from your synced data)' : ' (Gellish formula)'}.
        </Note>
      </div>
    </div>
  )
}
