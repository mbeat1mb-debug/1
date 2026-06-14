import { useMemo, useEffect, useState } from 'react'
import { calculatePhysiologicalAge, calculatePaceOfAging, getUserAge, getUserHeightCm, getUserWeightKg, getUserUnits, calculateBMI, getBMILabel, getBMIColor, getBodyFatLabel, getBodyFatColor, getUserSmoking, getUserAlcohol, getAverageBP, getUserBodyFatPct, getBodyWeightHistory, calculateLeanMass, calculateFatMass, getUserWaistCm, getUserGripStrengthKg, getHOMAIR, getHRVNorm, getGripHistory, getWaistHistory, getBPReadings } from '../lib/calculations'
import { getLabContributions, getLabAgeAdjustment, getPhenoAgeResult, getPhenoAgeProgress } from '../lib/labs'
import { LineGraph, DualLineGraph } from '../components/TrendChart'

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

function AgeMeter({ physAge, chronAge, phenoAge, phenoProgress }) {
  const diff = physAge - chronAge
  const color = diff <= -3 ? '#00c9a7' : diff <= 0 ? '#3b82f6' : diff <= 3 ? '#f59e0b' : '#ef4444'
  const label = diff <= -3 ? 'Excellent' : diff <= 0 ? 'Good' : diff <= 3 ? 'Fair' : 'Needs Work'

  return (
    <div className="rounded-2xl p-5" style={{ background: '#111', border: '1px solid #222' }}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Biological Age</p>
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
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid #1a1a1a' }}>
        {phenoAge !== null ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">PhenoAge (Levine Formula)</p>
              <p className="text-xs text-gray-600 mt-0.5">Validated clinical model · all 9 markers entered</p>
            </div>
            <span className="text-lg font-bold" style={{ color: phenoAge < chronAge ? '#00c9a7' : phenoAge < chronAge + 5 ? '#f59e0b' : '#ef4444' }}>
              {Math.round(phenoAge)}y
            </span>
          </div>
        ) : phenoProgress ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">PhenoAge — bloodwork panel</p>
              <span className="text-xs font-bold text-gray-400">{phenoProgress.present}/{phenoProgress.total} markers</span>
            </div>
            <div className="w-full rounded-full h-1.5 mb-2" style={{ background: '#222' }}>
              <div className="h-1.5 rounded-full" style={{ width: `${(phenoProgress.present / phenoProgress.total) * 100}%`, background: '#3b82f6' }} />
            </div>
            {phenoProgress.missingNames.length > 0 && (
              <p className="text-[10px] text-gray-600">
                Still needed: {phenoProgress.missingNames.join(', ')}
              </p>
            )}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-gray-600 text-center mt-3">
        Wearable estimate ± ~3y. Updates daily with new data.
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
      <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ background: color + '20', color }}>
        {contribution > 0 ? '+' : ''}{contribution}y
      </span>
    </div>
  )
}

export default function Healthspan({ data, onNav }) {
  const { todayHRV = 0, todayRHR = 0, todaySleep, sleepHistory = [], hrvHistory = [],
    steps = 0, vo2Max = 0, todaySpO2 = 0, todayBR = 0 } = data
  const userAge = getUserAge()
  const ageIsSet = !!localStorage.getItem('user_age')
  const heightCm = getUserHeightCm()
  const weightKg = getUserWeightKg()
  const units = getUserUnits()
  const bmi = calculateBMI(heightCm, weightKg)
  const bodyFatPct = getUserBodyFatPct()
  const weightHistory = getBodyWeightHistory()
  const leanMass = calculateLeanMass(weightKg, bodyFatPct)
  const fatMass = calculateFatMass(weightKg, bodyFatPct)
  const weightChartData = weightHistory.slice(-30).map((entry, i, arr) => ({
    label: i === arr.length - 1 ? 'Today' : entry.date.slice(5),
    weight: units === 'imperial' ? Math.round(entry.kg * 2.2046) : Math.round(entry.kg * 10) / 10,
  }))

  const weeklyZone2 = data.weeklyZone2 ?? 0
  const vo2MaxRange = data.vo2MaxRange ?? null

  const gripHistory = getGripHistory()
  const gripChartData = gripHistory.slice(-20).map((entry, i, arr) => ({
    label: i === arr.length - 1 ? 'Today' : entry.date.slice(5),
    grip: units === 'imperial' ? Math.round(entry.kg * 2.2046) : entry.kg,
  }))

  const waistHistory = getWaistHistory()
  const waistChartData = waistHistory.slice(-20).map((entry, i, arr) => ({
    label: i === arr.length - 1 ? 'Today' : entry.date.slice(5),
    waist: units === 'imperial' ? Math.round(entry.cm / 2.54 * 10) / 10 : entry.cm,
  }))

  const bpReadings = getBPReadings()
  const bpChartData = bpReadings.slice(-30).map((r, i, arr) => ({
    label: i === arr.length - 1 ? 'Today' : r.date.slice(5),
    sys: r.sys,
    dia: r.dia,
  }))

  const vo2MaxHistoryArr = data.vo2MaxHistory ?? []
  const vo2ChartData = vo2MaxHistoryArr.slice(-20).map((entry, i, arr) => ({
    label: i === arr.length - 1 ? 'Today' : entry.date.slice(5),
    vo2Max: entry.vo2Max,
  }))

  const phenoProgress = getPhenoAgeProgress()

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

  const weeklyAZM = data.weeklyAZM ?? (data.activeMinutes ? data.activeMinutes * 7 : 0)
  const smoking = getUserSmoking()
  const alcoholWeek = getUserAlcohol()
  const bp = getAverageBP()
  const waistCm = getUserWaistCm()
  const gripKg = getUserGripStrengthKg()
  const homaIR = getHOMAIR()
  const ffmi = leanMass !== null && heightCm > 0 ? Math.round((leanMass / Math.pow(heightCm / 100, 2)) * 10) / 10 : null
  const labContributions = getLabContributions()
  const labAdj = getLabAgeAdjustment()
  const phenoAge = getPhenoAgeResult()

  const physAge = useMemo(() => calculatePhysiologicalAge({
    avgHRV, avgRHR, avgSleep: avgSleepHours, sleepConsistency,
    avgSteps: steps, weeklyAZM,
    vo2Max, avgDeepPct, avgRemPct, hrvHistory,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [avgHRV, avgRHR, avgSleepHours, sleepConsistency, steps, weeklyAZM, vo2Max, avgDeepPct, avgRemPct,
    smoking, alcoholWeek, bp.sys, bp.dia, labAdj, waistCm, gripKg, homaIR, bodyFatPct, data.hrvHistory?.length])

  // Persist today's biological age snapshot; compute longitudinal pace from history
  const [pace, setPace] = useState(null)
  useEffect(() => {
    if (!ageIsSet || physAge <= 0) return
    const today = new Date().toISOString().split('T')[0]
    try {
      const history = JSON.parse(localStorage.getItem('physio_age_history') || '[]')
      const idx = history.findIndex(e => e.date === today)
      if (idx >= 0) history[idx].physAge = physAge
      else history.push({ date: today, physAge })
      history.sort((a, b) => a.date.localeCompare(b.date))
      localStorage.setItem('physio_age_history', JSON.stringify(history.slice(-365)))
      setPace(calculatePaceOfAging())
    } catch { setPace(null) }
  }, [physAge, ageIsSet])

  const diff = physAge - userAge

  const contributions = [
    {
      label: 'HRV',
      value: Math.round(avgHRV),
      unit: 'ms avg',
      contribution: (() => {
        if (avgHRV <= 0) return 0
        const r = avgHRV / getHRVNorm(userAge)
        return r >= 1.5 ? -3 : r >= 1.2 ? -1 : r >= 0.85 ? 0 : r >= 0.65 ? 2 : 4
      })(),
    },
    {
      label: 'Resting Heart Rate',
      value: Math.round(avgRHR),
      unit: 'bpm avg',
      contribution: avgRHR < 50 ? -2 : avgRHR < 60 ? -1 : avgRHR < 70 ? 0 : avgRHR < 80 ? 2 : avgRHR < 90 ? 3 : 4,
    },
    {
      label: 'Sleep Duration',
      value: Math.round(avgSleepHours * 10) / 10,
      unit: 'h avg',
      contribution: avgSleepHours >= 7 && avgSleepHours <= 9 ? -1 : avgSleepHours >= 6 || avgSleepHours > 9 ? 1 : 3,
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
      contribution: weeklyAZM >= 500 ? -2 : weeklyAZM >= 300 ? -1 : weeklyAZM >= 150 ? 0 : weeklyAZM >= 75 ? 1 : 2,
    },
    ...(vo2Max > 0 ? [{
      label: 'VO2 Max (Cardio Fitness)',
      value: vo2MaxRange ?? vo2Max,
      unit: vo2MaxRange ? ' mL/kg/min (Fitbit range)' : ' mL/kg/min',
      contribution: (() => {
        const norms = userAge <= 29 ? [34, 42, 53] : userAge <= 39 ? [31, 39, 49] : userAge <= 49 ? [27, 35, 45] : userAge <= 59 ? [25, 34, 44] : [22, 30, 40]
        const [fair, good, excel] = norms
        return vo2Max >= excel + 5 ? -5 : vo2Max >= excel ? -3 : vo2Max >= good ? -1 : vo2Max >= fair ? 2 : vo2Max >= fair * 0.8 ? 4 : 6
      })(),
      sublabel: (() => {
        const norms = userAge <= 29 ? [34, 42, 53] : userAge <= 39 ? [31, 39, 49] : userAge <= 49 ? [27, 35, 45] : userAge <= 59 ? [25, 34, 44] : [22, 30, 40]
        const [fair, good, excel] = norms
        return vo2Max >= excel + 5 ? 'Elite (top 2%)' : vo2Max >= excel ? 'Superior (top 15%)' : vo2Max >= good ? 'Excellent' : vo2Max >= fair ? 'Good' : vo2Max >= fair * 0.8 ? 'Fair' : 'Poor'
      })(),
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
    ...(bodyFatPct !== null ? [{
      label: 'Body Fat %',
      value: bodyFatPct,
      unit: '%',
      contribution: bodyFatPct < 15 ? -2 : bodyFatPct < 20 ? -1 : bodyFatPct < 27 ? 0 : bodyFatPct < 32 ? 3 : 5,
      sublabel: getBodyFatLabel(bodyFatPct),
    }] : bmi !== null ? [{
      label: 'BMI (body fat % not set)',
      value: bmi,
      unit: '',
      contribution: bmi < 18.5 ? 1 : bmi < 25 ? -1 : bmi < 30 ? 1 : bmi < 35 ? 3 : 5,
      sublabel: getBMILabel(bmi),
    }] : []),
    ...(ffmi !== null ? [{
      label: 'Muscle Mass Index (FFMI)',
      value: ffmi,
      unit: ' kg/m²',
      contribution: ffmi > 24 ? -2 : ffmi > 21 ? -1 : ffmi >= 18 ? 0 : ffmi >= 16 ? 2 : 3,
      sublabel: ffmi > 24 ? 'Athletic' : ffmi > 21 ? 'Above Average' : ffmi >= 18 ? 'Average' : ffmi >= 16 ? 'Below Average' : 'Low',
    }] : []),
    ...(waistCm > 0 ? [{
      label: 'Waist Circumference',
      value: units === 'imperial' ? Math.round(waistCm / 2.54) : waistCm,
      unit: units === 'imperial' ? ' in' : ' cm',
      contribution: waistCm < 90 ? -1 : waistCm < 94 ? 0 : waistCm < 102 ? 2 : 4,
      sublabel: waistCm < 90 ? 'Optimal' : waistCm < 94 ? 'Acceptable' : waistCm < 102 ? 'Elevated Risk' : 'High Risk',
    }] : []),
    ...(gripKg > 0 ? [{
      label: 'Grip Strength',
      value: units === 'imperial' ? Math.round(gripKg * 2.2046) : gripKg,
      unit: units === 'imperial' ? ' lbs' : ' kg',
      contribution: (() => {
        const norm = userAge < 40 ? 47 : userAge < 50 ? 46 : userAge < 60 ? 43 : userAge < 70 ? 39 : 33
        const r = gripKg / norm
        return r >= 1.2 ? -2 : r >= 1.0 ? -1 : r >= 0.8 ? 0 : r >= 0.65 ? 2 : 3
      })(),
      sublabel: (() => {
        const norm = userAge < 40 ? 47 : userAge < 50 ? 46 : userAge < 60 ? 43 : userAge < 70 ? 39 : 33
        const r = gripKg / norm
        return r >= 1.2 ? 'Top quartile' : r >= 1.0 ? 'Above median' : r >= 0.8 ? 'Below median' : r >= 0.65 ? 'Low' : 'Very Low'
      })(),
    }] : []),
    ...(homaIR > 0 ? [{
      label: 'Insulin Resistance (HOMA-IR)',
      value: homaIR,
      unit: '',
      contribution: homaIR < 1.0 ? -1 : homaIR < 2.0 ? 0 : homaIR < 3.0 ? 2 : homaIR < 5.0 ? 4 : 6,
      sublabel: (homaIR < 1.0 ? 'Excellent sensitivity' : homaIR < 2.0 ? 'Normal' : homaIR < 3.0 ? 'Insulin Resistant' : homaIR < 5.0 ? 'Significant IR' : 'Severe IR') + ' · fasting values only',
    }] : []),
    {
      label: 'Smoking',
      value: smoking === 'never' ? 'Never' : smoking === 'former' ? 'Former' : 'Current',
      unit: '',
      contribution: smoking === 'current' ? 7 : smoking === 'former' ? 2 : 0,
      sublabel: smoking === 'never' ? 'No lifetime risk' : smoking === 'former' ? 'Residual risk' : 'Active risk',
    },
    ...(alcoholWeek !== null ? [{
      label: 'Alcohol',
      value: alcoholWeek,
      unit: ' drinks/wk',
      contribution: alcoholWeek >= 14 ? 3 : alcoholWeek >= 7 ? 1 : 0,
      sublabel: alcoholWeek === 0 ? 'None' : alcoholWeek < 7 ? 'Light' : alcoholWeek < 14 ? 'Moderate' : 'Heavy',
    }] : []),
    ...(bp.sys > 0 ? [{
      label: 'Blood Pressure',
      value: `${bp.sys}/${bp.dia}`,
      unit: ' mmHg',
      contribution: bp.sys >= 160 || bp.dia >= 100 ? 5 : bp.sys >= 140 || bp.dia >= 90 ? 3 : bp.sys >= 130 || bp.dia >= 80 ? 1 : -1,
      sublabel: bp.sys >= 160 || bp.dia >= 100 ? 'Severe HTN' : bp.sys >= 140 || bp.dia >= 90 ? 'Stage 2 HTN' : bp.sys >= 130 || bp.dia >= 80 ? 'Stage 1 / Elevated' : bp.sys < 120 && bp.dia < 80 ? 'Optimal' : 'Normal',
    }] : []),
  ]

  const allOpportunities = [...contributions, ...labContributions].filter(c => c.contribution > 0).sort((a, b) => b.contribution - a.contribution)

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Healthspan</p>
          <h1 className="text-xl font-bold">Your biological age</h1>
        </div>
      </div>

      {!ageIsSet ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: '#111', border: '1px solid #333' }}>
          <p className="text-2xl mb-3">⏳</p>
          <p className="text-gray-300 text-sm font-medium">Set your age to get started</p>
          <p className="text-xs text-gray-600 mt-1 mb-4">Biological age needs your calendar age as a baseline.</p>
          {onNav && (
            <button
              onClick={() => onNav('settings')}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#00c9a720', color: '#00c9a7', border: '1px solid #00c9a733' }}
            >
              Open Settings
            </button>
          )}
        </div>
      ) : (
        <AgeMeter physAge={physAge} chronAge={userAge} phenoAge={phenoAge} phenoProgress={phenoProgress} />
      )}

      {/* Body composition */}
      {(bmi !== null || heightCm > 0 || weightKg > 0 || bodyFatPct !== null) && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Body Composition</p>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {weightKg > 0 && (
              <div className="rounded-xl p-2.5 text-center" style={{ background: '#1a1a1a' }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Weight</p>
                <p className="text-xl font-bold text-white">
                  {units === 'imperial' ? Math.round(weightKg * 2.2046) : Math.round(weightKg * 10) / 10}
                </p>
                <p className="text-[10px] text-gray-600">{units === 'imperial' ? 'lbs' : 'kg'}</p>
              </div>
            )}
            {bodyFatPct !== null && (
              <div className="rounded-xl p-2.5 text-center" style={{ background: '#1a1a1a' }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Body Fat</p>
                <p className="text-xl font-bold" style={{ color: getBodyFatColor(bodyFatPct) }}>
                  {bodyFatPct}%
                </p>
                <p className="text-[10px]" style={{ color: getBodyFatColor(bodyFatPct) }}>
                  {getBodyFatLabel(bodyFatPct)}
                </p>
              </div>
            )}
            {bmi !== null && (
              <div className="rounded-xl p-2.5 text-center" style={{ background: '#1a1a1a' }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">BMI</p>
                <p className="text-xl font-bold" style={{ color: getBMIColor(bmi) }}>{bmi}</p>
                <p className="text-[10px]" style={{ color: getBMIColor(bmi) }}>{getBMILabel(bmi)}</p>
              </div>
            )}
          </div>

          {/* Lean / fat mass */}
          {leanMass !== null && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-xl p-3" style={{ background: '#1a1a1a' }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Lean Mass</p>
                <p className="text-base font-bold text-white">
                  {units === 'imperial' ? Math.round(leanMass * 2.2046) : leanMass}
                  <span className="text-xs text-gray-600 ml-1">{units === 'imperial' ? 'lbs' : 'kg'}</span>
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ background: '#1a1a1a' }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Fat Mass</p>
                <p className="text-base font-bold text-white">
                  {units === 'imperial' ? Math.round(fatMass * 2.2046) : fatMass}
                  <span className="text-xs text-gray-600 ml-1">{units === 'imperial' ? 'lbs' : 'kg'}</span>
                </p>
              </div>
            </div>
          )}

          {/* Weight trend chart */}
          {weightChartData.length >= 2 && (
            <>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Weight Trend</p>
              <LineGraph data={weightChartData} dataKey="weight" color="#3b82f6" unit={units === 'imperial' ? 'lbs' : 'kg'} height={80} />
            </>
          )}

          {/* Grip strength trend */}
          {gripChartData.length >= 2 && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Grip Strength Trend</p>
              <LineGraph data={gripChartData} dataKey="grip" color="#00c9a7" unit={units === 'imperial' ? 'lbs' : 'kg'} height={70} />
            </div>
          )}

          {/* Waist trend */}
          {waistChartData.length >= 2 && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Waist Circumference Trend</p>
              <LineGraph data={waistChartData} dataKey="waist" color="#f59e0b" unit={units === 'imperial' ? 'in' : 'cm'} height={70} reference={units === 'imperial' ? Math.round(94 / 2.54) : 94} />
            </div>
          )}

          {weightKg === 0 && bodyFatPct === null && (
            <p className="text-xs text-gray-600">Set height, weight, and body fat % in Settings to see composition metrics.</p>
          )}
          {weightKg > 0 && bodyFatPct === null && (
            <p className="text-xs text-gray-600 mt-1">Add body fat % in Settings to see lean and fat mass.</p>
          )}
        </div>
      )}

      {/* Zone 2 Training */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Zone 2 Cardio This Week</p>
        <div className="flex items-end gap-3 mb-3">
          <span className="text-4xl font-bold" style={{ color: weeklyZone2 >= 300 ? '#00c9a7' : weeklyZone2 >= 150 ? '#3b82f6' : '#f59e0b' }}>
            {weeklyZone2}
          </span>
          <div className="pb-1">
            <p className="text-sm text-gray-400">minutes</p>
            <p className="text-xs text-gray-600">{weeklyZone2 >= 300 ? 'Excellent — above longevity target' : weeklyZone2 >= 150 ? 'Good — meets minimum target' : 'Below target — aim for 150+ min'}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-full rounded-full h-2" style={{ background: '#1a1a1a' }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (weeklyZone2 / 300) * 100)}%`, background: weeklyZone2 >= 300 ? '#00c9a7' : weeklyZone2 >= 150 ? '#3b82f6' : '#f59e0b' }} />
            </div>
            <span className="text-[10px] text-gray-600 whitespace-nowrap">300 goal</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-600 mt-2">60–70% max HR from your intraday data. 150 min/week = good, 300 min/week = excellent for longevity.</p>
      </div>

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

      {/* VO2 Max History */}
      {vo2ChartData.length >= 2 && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">VO2 Max Trend</p>
          <p className="text-[10px] text-gray-600 mb-3">Fitbit cardio fitness score · updates when you exercise. Lower bound shown.</p>
          <LineGraph data={vo2ChartData} dataKey="vo2Max" color="#3b82f6" unit=" mL/kg/min" height={90} />
        </div>
      )}

      {/* Pace of aging */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Pace of Aging</p>
        {pace ? (() => {
          const bioYrsPerCalYr = pace.rate  // bio years elapsed per calendar year (1.0 = calendar rate)
          const paceColor = bioYrsPerCalYr <= 0 ? '#00c9a7' : bioYrsPerCalYr <= 0.9 ? '#00c9a7' : bioYrsPerCalYr <= 1.1 ? '#3b82f6' : bioYrsPerCalYr <= 1.5 ? '#f59e0b' : '#ef4444'
          const paceLabel = bioYrsPerCalYr <= 0 ? 'Getting younger' : bioYrsPerCalYr <= 0.9 ? 'Slowing down' : bioYrsPerCalYr <= 1.1 ? 'On track' : bioYrsPerCalYr <= 1.5 ? 'Slightly fast' : 'Accelerated'
          const months = Math.round(pace.calDays / 30)
          const windowLabel = months < 2 ? `${pace.calDays}d` : months < 12 ? `${months}mo` : `${Math.round(months / 12)}yr`
          return (
            <>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-4xl font-bold" style={{ color: paceColor }}>
                  {bioYrsPerCalYr.toFixed(2)}x
                </span>
                <div>
                  <p className="text-sm font-medium" style={{ color: paceColor }}>{paceLabel}</p>
                  <p className="text-xs text-gray-600">biological years per calendar year</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{ background: paceColor + '20', color: paceColor }}>
                  {pace.bioAgeDelta < 0 ? '↓' : pace.bioAgeDelta > 0 ? '↑' : '→'}{Math.abs(pace.bioAgeDelta)}y
                </span>
                <span className="text-xs text-gray-600">
                  biological age change over {windowLabel} · from {pace.calDays} days of data
                </span>
              </div>
            </>
          )
        })() : (
          <div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-4xl font-bold" style={{ color: diff <= 0 ? '#00c9a7' : '#f59e0b' }}>
                {userAge > 0 ? (physAge / userAge).toFixed(2) : '--'}x
              </span>
              <div>
                <p className="text-sm font-medium text-gray-400">Current ratio</p>
                <p className="text-xs text-gray-600">biological ÷ calendar age</p>
              </div>
            </div>
            <p className="text-xs text-gray-600">Longitudinal pace calculates after 14+ days of tracking.</p>
          </div>
        )}
        <p className="text-xs text-gray-600 mt-3">
          Pace measures how fast your biological clock is moving relative to calendar time. Below 1.0x = aging slower than the calendar.
        </p>
      </div>

      {/* Lab results impact */}
      {labContributions.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="px-4 pt-4 pb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Bloodwork Impact</span>
            <p className="text-xs text-gray-600 mt-1">{labContributions.length} marker{labContributions.length !== 1 ? 's' : ''} entered</p>
          </div>
          <div className="px-4 pb-2">
            {labContributions.map((c) => {
              const color = c.contribution < 0 ? '#00c9a7' : c.contribution > 1 ? '#ef4444' : '#f59e0b'
              return <MetricContribution key={c.label} {...c} color={color} />
            })}
          </div>
        </div>
      )}

      {/* Blood Pressure Trend */}
      {bpChartData.length >= 2 && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Blood Pressure Trend</p>
          <p className="text-[10px] text-gray-600 mb-3">Red = systolic · Blue = diastolic · Dashed lines at 120/80 mmHg optimal</p>
          <DualLineGraph
            data={bpChartData}
            dataKey1="sys"
            dataKey2="dia"
            color1="#ef4444"
            color2="#3b82f6"
            unit=" mmHg"
            height={100}
            reference1={120}
            reference2={80}
          />
        </div>
      )}

      {/* Biggest Opportunities */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Biggest Opportunities</p>
        {allOpportunities.slice(0, 4).map(c => (
          <div key={c.label} className="flex gap-3 items-start">
            <span className="text-yellow-500 mt-0.5">→</span>
            <p className="text-sm text-gray-300">
              Improve <span className="text-white font-medium">{c.label}</span> — currently adding ~{c.contribution} year{c.contribution !== 1 ? 's' : ''} to your biological age.
            </p>
          </div>
        ))}
        {allOpportunities.length === 0 && (
          <p className="text-sm text-green-400">All metrics are trending in a healthy direction. Keep it up.</p>
        )}
      </div>
    </div>
  )
}
