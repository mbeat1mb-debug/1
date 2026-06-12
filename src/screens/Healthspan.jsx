import { calculatePhysiologicalAge, getUserAge, getUserHeightCm, getUserWeightKg, getUserUnits, calculateBMI, getBMILabel, getBMIColor } from '../lib/calculations'
import { LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'

function AgeMeter({ physAge, chronAge }) {
  const diff = physAge - chronAge
  const color = diff <= -3 ? '#00c9a7' : diff <= 0 ? '#3b82f6' : diff <= 3 ? '#f59e0b' : '#ef4444'
  const label = diff <= -3 ? 'Excellent' : diff <= 0 ? 'Good' : diff <= 3 ? 'Fair' : 'Needs Work'

  return (
    <div className="rounded-2xl p-5" style={{ background: '#111', border: '1px solid #222' }}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Physiological Age</p>
      <div className="flex items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-5xl font-bold" style={{ color }}>{physAge}</p>
          <p className="text-xs text-gray-500 mt-1">Your body age</p>
        </div>
        <div className="text-center text-gray-600">
          <p className="text-2xl">vs</p>
        </div>
        <div className="text-center">
          <p className="text-5xl font-bold text-gray-500">{chronAge}</p>
          <p className="text-xs text-gray-500 mt-1">Calendar age</p>
        </div>
      </div>
      <div className="mt-4 text-center">
        <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: color + '20', color }}>
          {diff < 0 ? `${Math.abs(diff)} years younger` : diff > 0 ? `${diff} years older` : 'Same as calendar age'} — {label}
        </span>
      </div>
      <p className="text-xs text-gray-600 text-center mt-3">
        Based on 6-month data trends. Updates weekly.
      </p>
    </div>
  )
}

function MetricContribution({ label, value, unit, contribution, color, sublabel }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <div>
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-gray-500">{value}{unit}{sublabel ? ` — ${sublabel}` : ''}</p>
      </div>
      <span className="text-sm font-bold px-2 py.5 rounded" style={{ background: color + '20', color }}>
        {contribution > 0 ? '+' : ''}{contribution}y
      </span>
    </div>
  )
}

export default function Healthspan({ data }) {
  const { todayHRV = 0, todayRHR = 0, todaySleep, sleepHistory = [], hrvHistory = [],
    steps = 0, vo2Max = 0, todaySpO2 = 0, todayBR = 0 } = data
  const userAge = getUserAge()
  const heightCm = getUserHeightCm()
  const weightKg = getUserWeightKg()
  const units = getUserUnits()
  const bmi = calculateBMI(heightCm, weightKg)

  const avgHRV = hrvHistory.filter(Boolean).reduce((a, b) => a + b, 0) / (hrvHistory.filter(Boolean).length || 1)
  const avgRHR = data.rhrHistory?.filter(Boolean).reduce((a, b) => a + b, 0) / (data.rhrHistory?.filter(Boolean).length || 1) || 0
  const avgSleepHours = sleepHistory.length
    ? sleepHistory.reduce((a, s) => a + s.minutes, 0) / sleepHistory.length / 60
    : 7

  const sleepDates = sleepHistory.map(s => s.date).sort()
  const sleepConsistency = sleepDates.length >= 7
    ? 1 - (sleepHistory.slice(-7).reduce((acc, s, i, arr) => {
        if (i === 0) return acc
        return acc + Math.abs(s.minutes - arr[i - 1].minutes) / 60
      }, 0) / 6) / 2
    : 0.7

  // Sleep stage averages — only entries that have stage data
  const stageEntries = sleepHistory.filter(s => s.deepMinutes > 0 || s.remMinutes > 0)
  const avgDeepPct = stageEntries.length
    ? stageEntries.reduce((a, s) => a + (s.deepMinutes || 0) / (s.minutes || 1), 0) / stageEntries.length
    : 0
  const avgRemPct = stageEntries.length
    ? stageEntries.reduce((a, s) => a + (s.remMinutes || 0) / (s.minutes || 1), 0) / stageEntries.length
    : 0

  const weeklyAZM = data.activeMinutes ? data.activeMinutes * 7 : 0

  const physAge = calculatePhysiologicalAge({
    avgHRV, avgRHR, avgSleep: avgSleepHours, sleepConsistency,
    avgSteps: steps, weeklyAZM,
    vo2Max, avgDeepPct, avgRemPct,
  })

  const diff = physAge - userAge

  const contributions = [
    {
      label: 'HRV',
      value: Math.round(avgHRV),
      unit: 'ms avg',
      contribution: avgHRV > 60 ? -3 : avgHRV > 50 ? -1 : avgHRV > 40 ? 1 : 3,
    },
    {
      label: 'Resting Heart Rate',
      value: Math.round(avgRHR),
      unit: 'bpm avg',
      contribution: avgRHR < 55 ? -3 : avgRHR < 65 ? -1 : avgRHR > 75 ? 2 : 1,
    },
    {
      label: 'Sleep Duration',
      value: Math.round(avgSleepHours * 10) / 10,
      unit: 'h avg',
      contribution: avgSleepHours >= 7.5 ? -2 : avgSleepHours >= 7 ? -1 : avgSleepHours < 6 ? 3 : 1,
    },
    ...(avgDeepPct > 0 ? [{
      label: 'Sleep Quality',
      value: `${Math.round(avgDeepPct * 100)}% deep / ${Math.round(avgRemPct * 100)}% REM`,
      unit: '',
      contribution: (avgDeepPct >= 0.18 ? -1 : avgDeepPct < 0.10 ? 2 : 0) + (avgRemPct >= 0.20 ? -1 : avgRemPct < 0.15 ? 1 : 0),
    }] : []),
    {
      label: 'Daily Steps',
      value: steps.toLocaleString(),
      unit: '/day',
      contribution: steps >= 10000 ? -2 : steps >= 7000 ? -1 : steps < 4000 ? 2 : 0,
    },
    {
      label: 'Active Zone Minutes',
      value: weeklyAZM,
      unit: '/week',
      contribution: weeklyAZM >= 150 ? -1 : weeklyAZM < 50 ? 2 : 0,
    },
    ...(vo2Max > 0 ? [{
      label: 'VO2 Max',
      value: vo2Max,
      unit: ' mL/kg/min',
      contribution: vo2Max >= 55 ? -3 : vo2Max >= 45 ? -1 : vo2Max >= 35 ? 0 : vo2Max >= 25 ? 2 : 4,
      sublabel: vo2Max >= 55 ? 'Superior' : vo2Max >= 45 ? 'Excellent' : vo2Max >= 35 ? 'Good' : vo2Max >= 25 ? 'Fair' : 'Poor',
    }] : []),
    ...(todaySpO2 > 0 ? [{
      label: 'Blood Oxygen (SpO2)',
      value: todaySpO2,
      unit: '%',
      contribution: todaySpO2 >= 97 ? -1 : todaySpO2 >= 95 ? 0 : todaySpO2 >= 93 ? 1 : 2,
      sublabel: todaySpO2 >= 97 ? 'Excellent' : todaySpO2 >= 95 ? 'Normal' : 'Low',
    }] : []),
    ...(todayBR > 0 ? [{
      label: 'Respiratory Rate',
      value: todayBR,
      unit: ' br/min',
      contribution: todayBR <= 16 ? -1 : todayBR <= 18 ? 0 : 1,
      sublabel: todayBR <= 16 ? 'Optimal' : todayBR <= 18 ? 'Normal' : 'Elevated',
    }] : []),
    ...(bmi !== null ? [{
      label: 'BMI',
      value: bmi,
      unit: '',
      contribution: bmi < 18.5 ? 1 : bmi < 25 ? -1 : bmi < 30 ? 1 : bmi < 35 ? 2 : 4,
      sublabel: getBMILabel(bmi),
    }] : []),
  ]

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Healthspan</p>
        <h1 className="text-xl font-bold">Your biological age</h1>
      </div>

      <AgeMeter physAge={physAge} chronAge={userAge} />

      {/* Body composition */}
      {(bmi !== null || heightCm > 0 || weightKg > 0) && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Body Composition</p>
          <div className="flex gap-4">
            {heightCm > 0 && (
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Height</span>
                <span className="text-sm font-semibold text-white">
                  {units === 'imperial'
                    ? `${Math.floor(heightCm / 30.48)}'${Math.round((heightCm / 2.54) % 12)}"`
                    : `${Math.round(heightCm)} cm`}
                </span>
              </div>
            )}
            {weightKg > 0 && (
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Weight</span>
                <span className="text-sm font-semibold text-white">
                  {units === 'imperial'
                    ? `${Math.round(weightKg * 2.2046)} lbs`
                    : `${Math.round(weightKg * 10) / 10} kg`}
                </span>
              </div>
            )}
            {bmi !== null && (
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">BMI</span>
                <span className="text-sm font-semibold" style={{ color: getBMIColor(bmi) }}>{bmi}</span>
                <span className="text-[10px]" style={{ color: getBMIColor(bmi) }}>{getBMILabel(bmi)}</span>
              </div>
            )}
          </div>
          {bmi === null && (heightCm === 0 || weightKg === 0) && (
            <p className="text-xs text-gray-600 mt-1">Set both height and weight in Settings to see BMI.</p>
          )}
        </div>
      )}

      {/* What's moving the needle */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">What's Moving the Needle</span>
        </div>
        <div className="px-4 pb-2">
          {contributions.map((c) => {
            const color = c.contribution < 0 ? '#00c9a7' : c.contribution > 1 ? '#ef4444' : '#f59e0b'
            return <MetricContribution key={c.label} {...c} color={color} />
          })}
        </div>
      </div>

      {/* Pace of aging */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Pace of Aging</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold" style={{ color: diff <= 0 ? '#00c9a7' : '#f59e0b' }}>
            {(Math.round((physAge / userAge) * 100) / 100).toFixed(2)}x
          </span>
          <span className="text-gray-500 text-sm">
            {diff < 0 ? 'aging slower than the calendar' : diff > 0 ? 'aging faster than the calendar' : 'on track with the calendar'}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Calculated from 30-day averages of your key health metrics vs. population norms for age {userAge}.
        </p>
      </div>

      {/* Recommendations */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Biggest Opportunities</p>
        {contributions
          .filter(c => c.contribution > 0)
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3)
          .map(c => (
            <div key={c.label} className="flex gap-3 items-start">
              <span className="text-yellow-500 mt-0.5">→</span>
              <p className="text-sm text-gray-300">
                Improve <span className="text-white font-medium">{c.label}</span> — currently adding ~{c.contribution} year{c.contribution !== 1 ? 's' : ''} to your biological age.
              </p>
            </div>
          ))}
        {contributions.filter(c => c.contribution > 0).length === 0 && (
          <p className="text-sm text-green-400">All metrics are trending in a healthy direction. Keep it up.</p>
        )}
      </div>
    </div>
  )
}
