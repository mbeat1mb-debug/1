import { useMemo, useEffect, useState } from 'react'
import { calculatePhysiologicalAge, getPhysiologicalAgeConfidence, calculatePaceOfAging, getUserAge, getUserHeightCm, getUserWeightKg, getUserUnits, calculateBMI, getBMILabel, getBMIColor, getBodyFatLabel, getBodyFatColor, getUserSmoking, getUserAlcohol, getAverageBP, getUserBodyFatPct, getBodyWeightHistory, calculateLeanMass, calculateFatMass, getUserWaistCm, getUserGripStrengthKg, getHOMAIR, getHRVNorm, getGripHistory, getWaistHistory, getBPReadings, calculateSRI, getChronosDeltas, getLatestHumeData, getVO2MortalityContext, getLastKnownHRR } from '../lib/calculations'
import { getLabContributions, getLabAgeAdjustment, getPhenoAgeResult, getPhenoAgeProgress, getTyGIndex } from '../lib/labs'
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

function BioAgeOrb({ physAge, chronAge }) {
  const diff = physAge - chronAge
  const color = diff <= -3 ? '#00c9a7' : diff <= 0 ? '#3b82f6' : diff <= 3 ? '#f59e0b' : '#ef4444'
  const diffText = diff < 0
    ? `${Math.abs(diff)} years younger`
    : diff > 0
    ? `${diff} years older`
    : 'Same as calendar age'
  return (
    <div className="flex flex-col items-center py-4">
      <div
        className="relative flex items-center justify-center"
        style={{
          width: 220, height: 220, borderRadius: '50%',
          background: `radial-gradient(circle at 30% 28%, ${color}90 0%, ${color}50 22%, ${color}22 48%, ${color}08 68%, transparent)`,
          border: `1px solid ${color}55`,
          boxShadow: `0 0 45px ${color}50, 0 0 90px ${color}28, 0 0 180px ${color}12, inset 0 0 50px ${color}18`,
        }}
      >
        <div style={{ position: 'absolute', width: 95, height: 65, borderRadius: '50%', background: `radial-gradient(ellipse, ${color}70, transparent 70%)`, top: 32, left: 36, filter: 'blur(10px)' }} />
        <div className="text-center z-10">
          <p className="text-6xl font-bold text-white" style={{ lineHeight: 1 }}>{physAge}</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] mt-2" style={{ color }}>SOMA AGE</p>
        </div>
      </div>
      <div className="mt-4 px-5 py-2 rounded-full" style={{ background: color + '20', border: `1px solid ${color}40` }}>
        <p className="text-sm font-bold" style={{ color }}>{diffText}</p>
      </div>
      <p className="text-xs text-gray-600 mt-2">vs {chronAge} calendar age · wearable estimate ±3y</p>
    </div>
  )
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return null
  const { present, total, missingNames } = confidence
  const color = present === total ? '#00c9a7' : present >= total - 1 ? '#3b82f6' : present >= total / 2 ? '#f59e0b' : '#ef4444'
  return (
    <div className="rounded-xl px-4 py-2.5 -mt-1 mb-1" style={{ background: color + '12', border: `1px solid ${color}30` }}>
      <p className="text-xs font-semibold" style={{ color }}>
        {present}/{total} domains using real data
      </p>
      {missingNames.length > 0 && (
        <p className="text-[11px] text-gray-600 mt-0.5">Missing: {missingNames.join(', ')} — those domains default to 0</p>
      )}
    </div>
  )
}

function PaceSlider({ pace, physAge, chronAge }) {
  const rate = pace?.rate ?? (chronAge > 0 ? physAge / chronAge : 1.0)
  const paceColor = rate <= 0.85 ? '#00c9a7' : rate <= 1.05 ? '#3b82f6' : rate <= 1.3 ? '#f59e0b' : '#ef4444'
  const paceLabel = rate <= 0.8 ? 'Slowing significantly' : rate <= 0.95 ? 'Slowing' : rate <= 1.05 ? 'On track' : rate <= 1.3 ? 'Slightly fast' : 'Accelerated'
  const minRate = 0.5, maxRate = 1.8
  const pct = Math.min(96, Math.max(4, ((rate - minRate) / (maxRate - minRate)) * 100))
  return (
    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Pace of Aging</p>
        <span className="text-2xl font-bold" style={{ color: paceColor }}>{rate.toFixed(1)}x</span>
      </div>
      <p className="text-sm font-medium mb-5" style={{ color: paceColor }}>{paceLabel}</p>
      <div className="relative pt-2 mb-3 mx-1">
        <div className="h-2 rounded-full" style={{ background: 'linear-gradient(to right, #00c9a7, #3b82f6 35%, #f59e0b 65%, #ef4444)' }} />
        <div className="absolute top-0 flex justify-center" style={{ left: `calc(${pct}% - 5px)` }}>
          <svg width="10" height="8"><polygon points="5,0 0,8 10,8" fill="white"/></svg>
        </div>
        <div className="absolute top-1 bottom-0 w-px opacity-30" style={{ background: 'white', left: `${((1.0 - minRate) / (maxRate - minRate)) * 100}%` }} />
      </div>
      <div className="flex justify-between">
        <span className="text-xs text-gray-500">← Slow</span>
        <span className="text-xs text-gray-600">1.0× normal</span>
        <span className="text-xs text-gray-500">Fast →</span>
      </div>
      {pace && (
        <p className="text-xs text-gray-600 mt-3">
          Bio age {pace.bioAgeDelta < 0 ? '↓' : '↑'} {Math.abs(pace.bioAgeDelta).toFixed(1)}y over {Math.round(pace.calDays / 30)}mo · longitudinal tracking
        </p>
      )}
      {!pace && (
        <p className="text-xs text-gray-600 mt-3">Longitudinal pace unlocks after 30+ days of tracking.</p>
      )}
    </div>
  )
}

function InsightCard({ physAge, chronAge, pace }) {
  const diff = physAge - chronAge
  const color = diff <= 0 ? '#00c9a7' : '#f59e0b'
  let headline, body
  if (pace && pace.bioAgeDelta < -0.5) {
    headline = 'Trending Younger'
    body = `Your biological age has dropped ${Math.abs(pace.bioAgeDelta).toFixed(1)} years over the last ${Math.round(pace.calDays / 30)} months. What you're doing is working — keep it up.`
  } else if (diff <= -3) {
    headline = 'Keep It Up'
    body = `Your biological age is ${Math.abs(diff)} years younger than your calendar age. Your habits are measurably extending your healthspan.`
  } else if (diff <= 0) {
    headline = 'Good Shape'
    body = `Biological age is in line with your calendar. Optimizing Zone 2 cardio, sleep consistency, or HRV could push you into the "younger" tier.`
  } else {
    headline = 'Room to Improve'
    body = `Biological age is running ${diff} years ahead of your calendar. Focus on your top opportunities below to reverse this trend.`
  }
  return (
    <div className="rounded-2xl p-4" style={{ background: color + '12', border: `1px solid ${color}30` }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color }}>{headline}</p>
      <p className="text-sm text-gray-300 leading-relaxed">{body}</p>
    </div>
  )
}

function BioAgeTrendChart({ chronAge }) {
  const data = useMemo(() => {
    try {
      const history = JSON.parse(localStorage.getItem('physio_age_history') || '[]')
      if (history.length < 2) return []
      const today = new Date()
      return history.slice(-90).map(entry => {
        const daysAgo = Math.round((today - new Date(entry.date + 'T00:00:00')) / 86400000)
        return {
          label: entry.date.slice(5),
          bioAge: entry.physAge,
          chronAge: Math.round((chronAge - daysAgo / 365) * 10) / 10,
        }
      })
    } catch { return [] }
  }, [chronAge])
  if (data.length < 2) return null
  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Age Trend</p>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00c9a7' }} /> Soma Age
          </span>
          <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#555' }} /> Calendar
          </span>
        </div>
      </div>
      <p className="text-[10px] text-gray-600 mb-3">Biological vs chronological age over time</p>
      <DualLineGraph data={data} dataKey1="bioAge" dataKey2="chronAge" color1="#00c9a7" color2="#555" unit="y" height={110} />
    </div>
  )
}

function MetricFactorCard({ label, value, displayValue, unit, contribution, min, max, higherBetter = true, sublabel }) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, ''))
  const rawPct = isNaN(numericValue) || max === min ? 50 : ((numericValue - min) / (max - min)) * 100
  const markerPct = higherBetter
    ? Math.min(96, Math.max(4, rawPct))
    : Math.min(96, Math.max(4, 100 - rawPct))
  const color = contribution < 0 ? '#00c9a7' : contribution === 0 ? '#3b82f6' : contribution <= 2 ? '#f59e0b' : '#ef4444'
  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{label}</p>
      <div className="relative pt-2 mb-2 mx-1">
        <div className="h-2 rounded-full" style={{
          background: higherBetter
            ? 'linear-gradient(to right, #ef4444, #f59e0b 40%, #00c9a7)'
            : 'linear-gradient(to right, #00c9a7, #f59e0b 60%, #ef4444)',
        }} />
        <div className="absolute top-0 flex justify-center" style={{ left: `calc(${markerPct}% - 5px)` }}>
          <svg width="10" height="8"><polygon points="5,0 0,8 10,8" fill="white"/></svg>
        </div>
      </div>
      <div className="flex items-end justify-between mt-1">
        <div>
          <span className="text-base font-bold text-white">{displayValue ?? value}{unit}</span>
          {sublabel && <p className="text-[10px] text-gray-500 mt-0.5">{sublabel}</p>}
        </div>
        <span className="text-base font-bold" style={{ color }}>
          {contribution < 0 ? '' : contribution > 0 ? '+' : ''}{contribution}y
        </span>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600">{higherBetter ? min : max}{unit}</span>
        <span className="text-[10px] text-gray-600">{higherBetter ? max : min}{unit}</span>
      </div>
    </div>
  )
}

function getActionTip(label) {
  const l = label.toLowerCase()
  if (l.includes('vo2') || l.includes('cardio')) return 'Zone 2 cardio 3×/week'
  if (l.includes('bmi') || l.includes('body fat') || l.includes('waist') || l.includes('visceral')) return 'Resistance training + caloric deficit'
  if (l.includes('grip') || l.includes('strength') || l.includes('muscle mass') || l.includes('ffmi') || l.includes('skeletal')) return 'Progressive grip & compound lifts'
  if (l.includes('insulin') || l.includes('homa') || l.includes('tyg')) return 'Reduce refined carbs, increase fiber and resistance training'
  if (l.includes('rhr') || l.includes('resting heart')) return 'Consistent cardio, sleep quality'
  if (l.includes('hrv')) return 'Sleep consistency, stress management'
  if (l.includes('blood pressure') || l.includes('bp')) return 'DASH diet, cardio, reduce sodium'
  if (l.includes('sleep')) return 'Consistent sleep/wake schedule'
  if (l.includes('smoking')) return 'Quit smoking — largest single modifiable risk'
  if (l.includes('alcohol')) return 'Reduce to ≤1 drink/day'
  return 'Review your habits for this factor'
}

function TopPriorities({ opportunities }) {
  if (!opportunities || opportunities.length === 0) return null
  const top3 = opportunities.slice(0, 3)
  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Top Priorities</p>
      <div className="space-y-0">
        {top3.map((c, i) => (
          <div
            key={c.label}
            className="flex items-start gap-3 py-3"
            style={i < top3.length - 1 ? { borderBottom: '1px solid #1a1a1a' } : {}}
          >
            <span className="text-base font-bold flex-shrink-0 w-14 text-right" style={{ color: '#ef4444' }}>
              +{c.contribution}y
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white leading-tight">{c.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{getActionTip(c.label)}</p>
            </div>
          </div>
        ))}
      </div>
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

export default function Chronos({ data, onNav }) {
  const { todayHRV = 0, todayRHR = 0, todaySleep, sleepHistory = [], hrvHistory = [],
    steps = 0, vo2Max = 0 } = data
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
  const durationConsistency = sleepDates.length >= 7
    ? 1 - (sleepHistory.slice(-7).reduce((acc, s, i, arr) => {
        if (i === 0) return acc
        return acc + Math.abs(s.minutes - arr[i - 1].minutes) / 60
      }, 0) / 6) / 2
    : 0.7
  const sri = calculateSRI(sleepHistory)
  // SRI (timing-based) is more accurate than duration variance; use it when available
  const sleepConsistency = sri !== null ? sri : durationConsistency

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
  const humeData = getLatestHumeData()
  const visceralFatIndex = humeData?.visceralFatIndex ?? null
  const skelMuscleKg = humeData?.skelMuscleKg ?? null
  const tygIndex = getTyGIndex()
  const sleepApneaRisk = data.sleepApneaRisk ?? null
  const socialJetLag = data.socialJetLag ?? null
  const lastKnownHRR = data.hrr ?? getLastKnownHRR()
  const ffmi = leanMass !== null && heightCm > 0 ? Math.round((leanMass / Math.pow(heightCm / 100, 2)) * 10) / 10 : null
  const labContributions = getLabContributions()
  const labAdj = getLabAgeAdjustment()
  const phenoAge = getPhenoAgeResult()

  const physAge = useMemo(() => calculatePhysiologicalAge({
    avgHRV, avgRHR, avgSleep: avgSleepHours, sleepConsistency,
    avgSteps: steps, weeklyAZM,
    vo2Max, avgDeepPct, avgRemPct, hrvHistory, lastKnownHRR,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [avgHRV, avgRHR, avgSleepHours, sleepConsistency, steps, weeklyAZM, vo2Max, avgDeepPct, avgRemPct,
    smoking, alcoholWeek, bp.sys, bp.dia, labAdj, waistCm, gripKg, homaIR, tygIndex, bodyFatPct, sri,
    data.hrvHistory?.length, lastKnownHRR?.hrr60])

  const confidence = useMemo(() => getPhysiologicalAgeConfidence({
    avgHRV, avgRHR, avgSleep: avgSleepHours, avgSteps: steps, weeklyAZM, vo2Max, lastKnownHRR,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [avgHRV, avgRHR, avgSleepHours, steps, weeklyAZM, vo2Max, lastKnownHRR?.hrr60,
    waistCm, gripKg, homaIR, tygIndex, bodyFatPct, bp.sys])

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
        let base = r >= 1.5 ? -3 : r >= 1.2 ? -1 : r >= 0.85 ? 0 : r >= 0.65 ? 2 : 4
        const recent7 = hrvHistory.slice(-7).filter(Boolean)
        const prior7 = hrvHistory.slice(-14, -7).filter(Boolean)
        if (recent7.length >= 4 && prior7.length >= 4) {
          const rAvg = recent7.reduce((a, b) => a + b, 0) / recent7.length
          const pAvg = prior7.reduce((a, b) => a + b, 0) / prior7.length
          const trend = (rAvg - pAvg) / pAvg
          if (trend > 0.06) base = Math.max(base - 1, -3)
          else if (trend < -0.08) base = Math.min(base + 1, 4)
        }
        return base
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
      contribution: (avgDeepPct >= 0.20 ? -1 : avgDeepPct < 0.10 ? 2 : 0) + (avgRemPct >= 0.22 ? -1 : avgRemPct < 0.15 ? 1 : 0),
    }] : []),
    {
      label: 'Daily Steps',
      value: steps.toLocaleString(),
      unit: '/day',
      contribution: steps >= 10000 ? -2 : steps >= 7000 ? -1 : steps >= 5000 ? 0 : steps >= 3000 ? 1 : 3,
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
    ...(bodyFatPct !== null ? [{
      label: 'Body Fat %',
      value: bodyFatPct,
      unit: '%',
      contribution: bodyFatPct < 10 ? 0 : bodyFatPct < 15 ? -2 : bodyFatPct < 20 ? -1 : bodyFatPct < 27 ? 0 : bodyFatPct < 32 ? 3 : 5,
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
    ...(visceralFatIndex !== null ? [{
      label: 'Visceral Fat Index',
      value: visceralFatIndex,
      unit: '',
      contribution: visceralFatIndex <= 7 ? -1 : visceralFatIndex <= 12 ? 0 : visceralFatIndex <= 17 ? 1 : visceralFatIndex <= 24 ? 2 : 3,
      sublabel: visceralFatIndex <= 7 ? 'Low — protective' : visceralFatIndex <= 12 ? 'Standard' : visceralFatIndex <= 17 ? 'Elevated' : visceralFatIndex <= 24 ? 'High' : 'Very High',
    }] : waistCm > 0 ? [{
      label: 'Waist Circumference',
      value: units === 'imperial' ? Math.round(waistCm / 2.54) : waistCm,
      unit: units === 'imperial' ? ' in' : ' cm',
      contribution: waistCm < 90 ? -1 : waistCm < 94 ? 0 : waistCm < 102 ? 2 : 4,
      sublabel: waistCm < 90 ? 'Optimal' : waistCm < 94 ? 'Acceptable' : waistCm < 102 ? 'Elevated Risk' : 'High Risk',
    }] : []),
    ...(skelMuscleKg !== null && weightKg > 0 ? [{
      label: 'Skeletal Muscle Mass',
      value: units === 'imperial' ? Math.round(skelMuscleKg * 2.2046) : skelMuscleKg,
      unit: units === 'imperial' ? ' lbs' : ' kg',
      contribution: (() => {
        const pct = (skelMuscleKg / weightKg) * 100
        return pct > 45 ? -1 : pct >= 38 ? 0 : pct >= 32 ? 1 : 2
      })(),
      sublabel: (() => {
        const pct = Math.round((skelMuscleKg / weightKg) * 100)
        return `${pct}% of body weight · ${pct > 45 ? 'Excellent' : pct >= 38 ? 'Normal' : pct >= 32 ? 'Below Average' : 'Low — sarcopenia risk'}`
      })(),
    }] : []),
    ...(gripKg > 0 ? [{
      label: 'Grip Strength',
      value: units === 'imperial' ? Math.round(gripKg * 2.2046) : gripKg,
      unit: units === 'imperial' ? ' lbs' : ' kg',
      contribution: (() => {
        const norm = userAge <= 29 ? 47 : userAge <= 39 ? 46 : userAge <= 49 ? 43 : userAge <= 59 ? 39 : 33
        const r = gripKg / norm
        return r >= 1.2 ? -2 : r >= 1.0 ? -1 : r >= 0.8 ? 0 : r >= 0.65 ? 2 : 3
      })(),
      sublabel: (() => {
        const norm = userAge <= 29 ? 47 : userAge <= 39 ? 46 : userAge <= 49 ? 43 : userAge <= 59 ? 39 : 33
        const r = gripKg / norm
        return r >= 1.2 ? 'Top quartile' : r >= 1.0 ? 'Above median' : r >= 0.8 ? 'Below median' : r >= 0.65 ? 'Low' : 'Very Low'
      })(),
    }] : []),
    ...(homaIR > 0 ? [{
      label: 'Insulin Resistance (HOMA-IR)',
      value: homaIR,
      unit: '',
      contribution: homaIR < 1.0 ? -1 : homaIR < 2.0 ? 0 : homaIR < 3.0 ? 2 : homaIR < 5.0 ? 4 : 5,
      sublabel: (homaIR < 1.0 ? 'Excellent sensitivity' : homaIR < 2.0 ? 'Normal' : homaIR < 3.0 ? 'Insulin Resistant' : homaIR < 5.0 ? 'Significant IR' : 'Severe IR') + ' · fasting values only',
    }] : []),
    ...(homaIR === 0 && tygIndex !== null ? [{
      label: 'TyG Index (Insulin Resistance)',
      value: tygIndex,
      unit: '',
      contribution: tygIndex < 4.5 ? -1 : tygIndex < 4.68 ? 0 : tygIndex < 5.0 ? 2 : 4,
      sublabel: (tygIndex < 4.5 ? 'Low IR risk' : tygIndex < 4.68 ? 'Borderline' : tygIndex < 5.0 ? 'Elevated IR risk' : 'High IR risk') + ' · ln(trig × glucose ÷ 2)',
    }] : []),
    ...(lastKnownHRR?.hrr60 > 0 ? [{
      label: 'Heart Rate Recovery',
      value: lastKnownHRR.hrr60,
      unit: ' bpm drop',
      contribution: lastKnownHRR.hrr60 >= 25 ? -2 : lastKnownHRR.hrr60 >= 18 ? -1 : lastKnownHRR.hrr60 >= 12 ? 0 : 2,
      sublabel: (lastKnownHRR.hrr60 >= 25 ? 'Excellent' : lastKnownHRR.hrr60 >= 18 ? 'Good' : lastKnownHRR.hrr60 >= 12 ? 'Normal' : 'Poor — ↑ mortality risk') + (data.hrr ? '' : ` · last recorded ${lastKnownHRR.date}`),
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

  const allContributions = [...contributions, ...labContributions]
  const allOpportunities = allContributions.filter(c => c.contribution > 0).sort((a, b) => b.contribution - a.contribution)
  const allAssets = allContributions.filter(c => c.contribution < 0).sort((a, b) => a.contribution - b.contribution)

  const chronosDeltas = getChronosDeltas({
    vo2Max, steps, weeklyAZM, avgHRV, avgSleepHours,
    bodyFatPct, waistCm, gripKg, bp,
  })

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Chronos</p>
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
        <>
          <BioAgeOrb physAge={physAge} chronAge={userAge} />
          <ConfidenceBadge confidence={confidence} />
          <PaceSlider pace={pace} physAge={physAge} chronAge={userAge} />
          <InsightCard physAge={physAge} chronAge={userAge} pace={pace} />
          <BioAgeTrendChart chronAge={userAge} />
          {phenoAge !== null ? (
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">PhenoAge</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">Levine Formula · validated clinical model</p>
                </div>
                <span className="text-2xl font-bold" style={{ color: phenoAge < userAge ? '#00c9a7' : phenoAge < userAge + 5 ? '#f59e0b' : '#ef4444' }}>
                  {Math.round(phenoAge)}y
                </span>
              </div>
            </div>
          ) : phenoProgress ? (
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">PhenoAge — bloodwork panel</p>
                <span className="text-xs font-bold text-gray-400">{phenoProgress.present}/{phenoProgress.total} markers</span>
              </div>
              <div className="w-full rounded-full h-1.5 mb-2" style={{ background: '#222' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${(phenoProgress.present / phenoProgress.total) * 100}%`, background: '#3b82f6' }} />
              </div>
              {phenoProgress.missingNames.length > 0 && (
                <p className="text-[10px] text-gray-600">Still needed: {phenoProgress.missingNames.join(', ')}</p>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Vitals History shortcut */}
      <button
        onClick={() => onNav('vitals')}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl"
        style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📊</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Vitals History</p>
            <p className="text-xs text-gray-600">BP · Weight · Grip · Waist · HRV · RHR</p>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth={2} className="w-5 h-5 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Body composition */}
      {(bmi !== null || heightCm > 0 || weightKg > 0 || bodyFatPct !== null) && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
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
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
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

      {/* Sleep Regularity Index */}
      {sri !== null && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Sleep Regularity Index</p>
          <div className="flex items-end gap-3 mb-2">
            <span className="text-4xl font-bold" style={{ color: sri >= 0.87 ? '#00c9a7' : sri >= 0.80 ? '#3b82f6' : sri >= 0.70 ? '#f59e0b' : '#ef4444' }}>
              {Math.round(sri * 100)}
            </span>
            <div className="pb-1">
              <p className="text-sm text-gray-400">/ 100</p>
              <p className="text-xs text-gray-600">
                {sri >= 0.87 ? 'Excellent regularity' : sri >= 0.80 ? 'Good' : sri >= 0.70 ? 'Moderate — work on consistency' : 'Poor — irregular schedule'}
              </p>
            </div>
          </div>
          <div className="w-full rounded-full h-2 mb-2" style={{ background: '#1a1a1a' }}>
            <div className="h-2 rounded-full" style={{ width: `${Math.round(sri * 100)}%`, background: sri >= 0.87 ? '#00c9a7' : sri >= 0.80 ? '#3b82f6' : sri >= 0.70 ? '#f59e0b' : '#ef4444' }} />
          </div>
          <p className="text-[10px] text-gray-600">Probability of same sleep/wake state 24h apart. ≥87 = excellent circadian rhythm. Used as sleep consistency in your biological age.</p>
        </div>
      )}

      {/* Post-exercise Heart Rate Recovery — shows live today or last known (≤90 days) */}
      {lastKnownHRR && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Heart Rate Recovery</p>
            {!data.hrr && lastKnownHRR.date && (
              <span className="text-[10px] text-gray-600">last recorded {lastKnownHRR.date}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div className="rounded-xl p-3" style={{ background: '#1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Post-Exercise Drop</p>
              <p className="text-2xl font-bold" style={{ color: lastKnownHRR.hrr60 >= 18 ? '#00c9a7' : lastKnownHRR.hrr60 >= 12 ? '#3b82f6' : '#ef4444' }}>
                -{lastKnownHRR.hrr60}<span className="text-sm font-normal text-gray-500"> bpm</span>
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: lastKnownHRR.hrr60 >= 25 ? '#00c9a7' : lastKnownHRR.hrr60 >= 18 ? '#00c9a7' : lastKnownHRR.hrr60 >= 12 ? '#3b82f6' : '#ef4444' }}>
                {lastKnownHRR.hrr60 >= 25 ? 'Excellent' : lastKnownHRR.hrr60 >= 18 ? 'Good' : lastKnownHRR.hrr60 >= 12 ? 'Normal' : 'Poor (↑ risk)'}
              </p>
            </div>
            {lastKnownHRR.hrr120 !== null && (
              <div className="rounded-xl p-3" style={{ background: '#1a1a1a' }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Early Recovery Drop</p>
                <p className="text-2xl font-bold" style={{ color: lastKnownHRR.hrr120 >= 42 ? '#00c9a7' : lastKnownHRR.hrr120 >= 30 ? '#3b82f6' : '#ef4444' }}>
                  -{lastKnownHRR.hrr120}<span className="text-sm font-normal text-gray-500"> bpm</span>
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: lastKnownHRR.hrr120 >= 42 ? '#00c9a7' : lastKnownHRR.hrr120 >= 30 ? '#3b82f6' : '#ef4444' }}>
                  {lastKnownHRR.hrr120 >= 42 ? 'Excellent' : lastKnownHRR.hrr120 >= 30 ? 'Good' : 'Below average'}
                </p>
              </div>
            )}
          </div>
          {lastKnownHRR.peakHR && <p className="text-[10px] text-gray-600">Peak HR {lastKnownHRR.peakHR} bpm · HR drop from peak to 1 min post-exercise. Drop &lt;12 bpm predicts higher mortality (Cole NEJM 1999).</p>}
        </div>
      )}

      {/* Top Priorities — only shown when biologically older than calendar age */}
      {diff > 0 && <TopPriorities opportunities={allOpportunities} />}

      {/* What's moving the needle — WHOOP-style metric factor cards */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 px-1">What's Moving the Needle</p>
        <div className="space-y-3">
          {/* HRV */}
          {avgHRV > 0 && <MetricFactorCard label="Heart Rate Variability" value={Math.round(avgHRV)} unit=" ms" contribution={contributions.find(c => c.label === 'HRV')?.contribution ?? 0} min={20} max={120} higherBetter={true} sublabel={`30-day avg · norm ~${getHRVNorm(userAge)} ms for age`} />}
          {/* RHR */}
          {avgRHR > 0 && <MetricFactorCard label="Resting Heart Rate" value={Math.round(avgRHR)} unit=" bpm" contribution={contributions.find(c => c.label === 'Resting Heart Rate')?.contribution ?? 0} min={40} max={100} higherBetter={false} sublabel="lower is better" />}
          {/* Sleep Duration */}
          <MetricFactorCard label="Sleep Duration" value={Math.round(avgSleepHours * 10) / 10} unit="h avg" contribution={contributions.find(c => c.label === 'Sleep Duration')?.contribution ?? 0} min={5} max={9} higherBetter={true} />
          {/* Daily Steps */}
          <MetricFactorCard label="Daily Steps" value={steps} displayValue={steps.toLocaleString()} unit="" contribution={contributions.find(c => c.label === 'Daily Steps')?.contribution ?? 0} min={0} max={15000} higherBetter={true} />
          {/* VO2 Max */}
          {vo2Max > 0 && <MetricFactorCard label="VO2 Max" value={vo2Max} unit=" ml/kg/min" contribution={contributions.find(c => c.label === 'VO2 Max (Cardio Fitness)')?.contribution ?? 0} min={20} max={60} higherBetter={true} sublabel={(() => { const norms = userAge <= 29 ? [34,42,53] : userAge <= 39 ? [31,39,49] : userAge <= 49 ? [27,35,45] : userAge <= 59 ? [25,34,44] : [22,30,40]; const [f,g,e] = norms; return vo2Max >= e+5 ? 'Elite' : vo2Max >= e ? 'Superior' : vo2Max >= g ? 'Excellent' : vo2Max >= f ? 'Good' : 'Fair' })()} />}
          {/* Body Fat or BMI */}
          {bodyFatPct !== null && <MetricFactorCard label="Body Fat %" value={bodyFatPct} unit="%" contribution={contributions.find(c => c.label === 'Body Fat %')?.contribution ?? 0} min={5} max={35} higherBetter={false} sublabel={getBodyFatLabel(bodyFatPct)} />}
          {bodyFatPct === null && bmi !== null && <MetricFactorCard label="BMI" value={bmi} unit="" contribution={contributions.find(c => c.label?.includes('BMI'))?.contribution ?? 0} min={16} max={40} higherBetter={false} sublabel={getBMILabel(bmi)} />}
          {/* Grip Strength */}
          {gripKg > 0 && <MetricFactorCard label="Grip Strength" value={units === 'imperial' ? Math.round(gripKg * 2.2046) : gripKg} unit={units === 'imperial' ? ' lbs' : ' kg'} contribution={contributions.find(c => c.label === 'Grip Strength')?.contribution ?? 0} min={units === 'imperial' ? 66 : 30} max={units === 'imperial' ? 132 : 60} higherBetter={true} />}
          {/* Active Zone Minutes */}
          <MetricFactorCard label="Weekly Active Zone Min" value={weeklyAZM} unit=" AZM" contribution={contributions.find(c => c.label === 'Active Zone Minutes')?.contribution ?? 0} min={0} max={500} higherBetter={true} sublabel="WHO target: 150/wk · Excellent: 300/wk" />
          {/* Heart Rate Recovery */}
          {lastKnownHRR?.hrr60 > 0 && (
            <MetricFactorCard
              label="Heart Rate Recovery"
              value={lastKnownHRR.hrr60}
              unit=" bpm"
              contribution={contributions.find(c => c.label === 'Heart Rate Recovery')?.contribution ?? 0}
              min={6} max={30}
              higherBetter={true}
              sublabel={(lastKnownHRR.hrr60 >= 25 ? 'Excellent' : lastKnownHRR.hrr60 >= 18 ? 'Good' : lastKnownHRR.hrr60 >= 12 ? 'Normal' : 'Poor — ↑ mortality risk') + (data.hrr ? ' · today' : ` · last recorded ${lastKnownHRR.date}`)}
            />
          )}
        </div>
      </div>

      {/* VO2 Max History */}
      {vo2ChartData.length >= 2 && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">VO2 Max Trend</p>
          <p className="text-[10px] text-gray-600 mb-3">Fitbit cardio fitness score · updates when you exercise. Midpoint of reported range shown.</p>
          <LineGraph data={vo2ChartData} dataKey="vo2Max" color="#3b82f6" unit=" mL/kg/min" height={90} />
          {vo2Max > 0 && (() => {
            const ctx = getVO2MortalityContext(vo2Max, userAge)
            if (!ctx) return null
            return (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid #1a1a1a' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold" style={{ color: ctx.color }}>{ctx.category}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{ctx.note}</p>
                    <p className="text-[10px] text-gray-700 mt-0.5">Mandsager et al., JAMA Network Open 2018</p>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0 px-2 py-1 rounded-lg" style={{ background: ctx.color + '20', color: ctx.color }}>
                    {vo2Max} ml/kg/min
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Lab results impact */}
      {labContributions.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
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
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
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

      {/* Mortality Driver Dashboard */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Longevity Profile</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Top Assets</p>
            {allAssets.slice(0, 3).map(c => (
              <div key={c.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #1a1a1a' }}>
                <p className="text-xs text-gray-300 truncate mr-2">{c.label}</p>
                <span className="text-xs font-bold flex-shrink-0" style={{ color: '#00c9a7' }}>{c.contribution}y</span>
              </div>
            ))}
            {allAssets.length === 0 && <p className="text-xs text-gray-600">No assets yet — keep tracking.</p>}
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Top Liabilities</p>
            {allOpportunities.slice(0, 3).map(c => (
              <div key={c.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #1a1a1a' }}>
                <p className="text-xs text-gray-300 truncate mr-2">{c.label}</p>
                <span className="text-xs font-bold flex-shrink-0" style={{ color: '#ef4444' }}>+{c.contribution}y</span>
              </div>
            ))}
            {allOpportunities.length === 0 && <p className="text-xs text-gray-600 text-green-400">Clean slate.</p>}
          </div>
        </div>
      </div>

      {/* Chronos Delta Engine */}
      {chronosDeltas.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Potential Years to Reclaim</p>
          <p className="text-[10px] text-gray-600 mb-3">One-tier improvement on each factor</p>
          <div className="space-y-3">
            {chronosDeltas.slice(0, 5).map(d => (
              <div key={d.label} className="flex items-start gap-3">
                <span className="text-lg font-bold flex-shrink-0" style={{ color: '#00c9a7', minWidth: 32 }}>+{d.gain}y</span>
                <div>
                  <p className="text-sm font-medium text-white">{d.label}</p>
                  <p className="text-xs text-gray-500">{d.action}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-3">Estimates based on next-tier bio age scoring. Actual gains compound with multiple improvements.</p>
        </div>
      )}

      {/* Social Jet Lag */}
      {socialJetLag !== null && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Circadian Alignment</p>
          <div className="flex items-end gap-3 mb-2">
            <span className="text-4xl font-bold" style={{ color: socialJetLag <= 20 ? '#00c9a7' : socialJetLag <= 45 ? '#3b82f6' : socialJetLag <= 75 ? '#f59e0b' : '#ef4444' }}>
              {socialJetLag}
            </span>
            <div className="pb-1">
              <p className="text-sm text-gray-400">min variability</p>
              <p className="text-xs text-gray-600">
                {socialJetLag <= 20 ? 'Excellent — rock-solid schedule' : socialJetLag <= 45 ? 'Good circadian alignment' : socialJetLag <= 75 ? 'Moderate timing variability' : 'High variability — circadian disruption risk'}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-gray-600">SD of sleep midpoint timing across last 30 nights. Measures sleep schedule consistency (not classic Roenneberg SJL). &lt;20 min = elite consistency.</p>
        </div>
      )}

      {/* Sleep Apnea Risk */}
      {sleepApneaRisk !== null && (
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Sleep Breathing Risk</p>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-2xl font-bold" style={{ color: sleepApneaRisk.riskLevel === 0 ? '#00c9a7' : sleepApneaRisk.riskLevel === 1 ? '#f59e0b' : '#ef4444' }}>
                {sleepApneaRisk.risk}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Based on SpO₂ during sleep</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">Min SpO₂</p>
              <p className="text-lg font-bold" style={{ color: sleepApneaRisk.minSpo2 >= 93 ? '#00c9a7' : sleepApneaRisk.minSpo2 >= 88 ? '#f59e0b' : '#ef4444' }}>
                {sleepApneaRisk.minSpo2}%
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="rounded-xl p-2.5" style={{ background: '#1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase mb-1">Desat. Events/hr</p>
              <p className="text-base font-bold text-white">{sleepApneaRisk.odi}<span className="text-xs text-gray-600"> /hr</span></p>
            </div>
            <div className="rounded-xl p-2.5" style={{ background: '#1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase mb-1">Avg SpO₂</p>
              <p className="text-base font-bold text-white">{sleepApneaRisk.avgSpo2}%</p>
            </div>
          </div>
          {sleepApneaRisk.brElevated && (
            <p className="text-xs text-amber-500 mt-1">Elevated respiratory rate detected — additional risk signal.</p>
          )}
          {sleepApneaRisk.riskLevel >= 2 && (
            <p className="text-xs text-red-400 mt-1">Consider discussing with a doctor — a sleep study (polysomnography) is the only way to diagnose sleep apnea.</p>
          )}
          <p className="text-[10px] text-gray-600 mt-2">Based on 5-min SpO₂ samples — coarser than clinical oximetry. Use risk tier for trend direction, not as a diagnostic ODI value.</p>
        </div>
      )}
    </div>
  )
}
