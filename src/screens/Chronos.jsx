import { useMemo, useEffect, useState } from 'react'
import { calculatePhysiologicalAge, getPhysiologicalAgeConfidence, calculatePaceOfAging, getUserAge, getUserHeightCm, getUserWeightKg, getUserUnits, calculateBMI, getBMILabel, getBMIColor, getBodyFatLabel, getBodyFatColor, getUserSmoking, getUserAlcohol, getAverageBP, getUserBodyFatPct, getBodyWeightHistory, calculateLeanMass, calculateFatMass, calculateFFMI, getUserWaistCm, getUserGripStrengthKg, getHOMAIR, getHRVNorm, getGripHistory, getWaistHistory, getBPReadings, calculateSRI, getChronosDeltas, getLatestHumeData, getVO2MortalityContext, getLastKnownHRR, localToday } from '../lib/calculations'
import { getLabContributions, getLabAgeAdjustment, getPhenoAgeResult, getPhenoAgeProgress, getTyGIndex } from '../lib/labs'
import { LineGraph, DualLineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { C, SERIF, Label, BackLink, SectionLabel, Note, norm } from '../lib/almanacTheme'

// ── Soma Age headline ──────────────────────────────────────────────────────────
// Replaces the glowing orb with a printed figure and needle scale: the
// biological age set against the calendar age, read straight off a ruler.
function BioAgeHeadline({ physAge, chronAge }) {
  const diff = physAge - chronAge
  const color = diff <= -3 ? '#3E9C7E' : diff <= 0 ? '#6E6557' : diff <= 3 ? '#D98E3F' : '#ef4444'
  const diffText = diff < 0
    ? `${Math.abs(diff)} years younger than calendar age`
    : diff > 0
    ? `${diff} years older than calendar age`
    : 'Same as calendar age'
  // position the needle on a scale spanning chronAge ± 12 years
  const lo = chronAge - 12, hi = chronAge + 12
  const p = norm(physAge, lo, hi)
  const b = norm(chronAge, lo, hi)
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <Label>Soma Age</Label>
        <Label style={{ color: C.faint }}>wearable estimate ± 3y</Label>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 700, color: C.ink, lineHeight: 1 }} className="tabular">{physAge}</span>
        <span style={{ fontFamily: SERIF, fontSize: 15, color }}>{diffText}</span>
      </div>
      <div style={{ position: 'relative', height: 16, marginTop: 16 }}>
        <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 1, background: C.rule }} />
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} style={{ position: 'absolute', top: 4, left: `${t * 100}%`, width: 1, height: 6, background: C.ruleSoft }} />
        ))}
        <div style={{ position: 'absolute', top: 2, left: `${b * 100}%`, transform: 'translateX(-50%)', width: 1.5, height: 10, background: C.faint, opacity: 0.7 }} />
        <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)' }}>
          <svg width="14" height="16" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={color} /></svg>
        </div>
      </div>
      <div className="flex justify-between mt-1.5">
        <Label style={{ fontSize: 10 }}>{lo}y</Label>
        <Label style={{ fontSize: 10 }}>calendar {chronAge}y</Label>
        <Label style={{ fontSize: 10 }}>{hi}y</Label>
      </div>
    </div>
  )
}

function ConfidenceLine({ confidence }) {
  if (!confidence) return null
  const { present, total, missingNames } = confidence
  return (
    <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 10, fontStyle: 'italic' }}>
      {present}/{total} domains using real data
      {missingNames.length > 0 && ` — missing ${missingNames.join(', ')} (defaults to 0)`}
    </p>
  )
}

function PaceLine({ pace, physAge, chronAge }) {
  const rate = pace?.rate ?? (chronAge > 0 ? physAge / chronAge : 1.0)
  const paceColor = rate <= 0.85 ? '#3E9C7E' : rate <= 1.05 ? C.inkSoft : rate <= 1.3 ? '#D98E3F' : '#ef4444'
  const paceLabel = rate <= 0.8 ? 'Slowing significantly' : rate <= 0.95 ? 'Slowing' : rate <= 1.05 ? 'On track' : rate <= 1.3 ? 'Slightly fast' : 'Accelerated'
  const minRate = 0.5, maxRate = 1.8
  const p = norm(rate, minRate, maxRate)
  return (
    <div className="mt-9">
      <SectionLabel right="1.0x = on pace">Pace of Aging</SectionLabel>
      <div className="flex items-baseline gap-2 mt-3">
        <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: C.ink }} className="tabular">{rate.toFixed(1)}x</span>
        <span style={{ fontFamily: SERIF, fontSize: 14, color: paceColor }}>{paceLabel}</span>
      </div>
      <div style={{ position: 'relative', height: 14, marginTop: 10 }}>
        <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: C.rule }} />
        <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)' }}>
          <svg width="12" height="14" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={paceColor} /></svg>
        </div>
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 8 }}>
        {pace
          ? `Bio age ${pace.bioAgeDelta < 0 ? 'down' : 'up'} ${Math.abs(pace.bioAgeDelta).toFixed(1)}y over ${Math.round(pace.calDays / 30)} months · longitudinal tracking`
          : 'Longitudinal pace unlocks after 30+ days of tracking.'}
      </p>
    </div>
  )
}

function InsightNote({ physAge, chronAge, pace }) {
  const diff = physAge - chronAge
  const accent = diff <= 0 ? '#3E9C7E' : '#D98E3F'
  let body
  if (pace && pace.bioAgeDelta < -0.5) {
    body = `Trending younger — your biological age has dropped ${Math.abs(pace.bioAgeDelta).toFixed(1)} years over the last ${Math.round(pace.calDays / 30)} months. What you're doing is working.`
  } else if (diff <= -3) {
    body = `Keep it up — your biological age is ${Math.abs(diff)} years younger than your calendar age. Your habits are measurably extending your healthspan.`
  } else if (diff <= 0) {
    body = `Good shape — biological age is in line with your calendar. Optimizing Zone 2 cardio, sleep consistency, or HRV could push you into the younger tier.`
  } else {
    body = `Room to improve — biological age is running ${diff} years ahead of your calendar. Focus on your top opportunities below to reverse this trend.`
  }
  return <Note accent={accent}>{body}</Note>
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
    <div className="mt-9">
      <SectionLabel>Age Trend</SectionLabel>
      <div className="flex items-center gap-4 mt-3">
        <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3E9C7E', marginRight: 5 }} />Soma Age
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.faint, marginRight: 5 }} />Calendar
        </span>
      </div>
      <div className="mt-3"><DualLineGraph data={data} dataKey1="bioAge" dataKey2="chronAge" color1="#3E9C7E" color2={C.faint} unit="y" height={110} /></div>
    </div>
  )
}

function MetricFactorRow({ label, value, displayValue, unit, contribution, min, max, higherBetter = true, sublabel }) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, ''))
  const p01 = isNaN(numericValue) || max === min ? 0.5 : norm(numericValue, min, max)
  const pos01 = higherBetter ? p01 : 1 - p01
  const color = contribution < 0 ? '#3E9C7E' : contribution === 0 ? C.inkSoft : contribution <= 2 ? '#D98E3F' : '#ef4444'
  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color }}>
          {contribution < 0 ? '' : contribution > 0 ? '+' : ''}{contribution}y
        </span>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.ink }}>{displayValue ?? value}{unit}</span>
        {sublabel && <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, fontStyle: 'italic' }}>{sublabel}</span>}
      </div>
      <div style={{ position: 'relative', height: 12, marginTop: 8 }}>
        <div style={{ position: 'absolute', top: 5, left: 0, right: 0, height: 1, background: C.rule }} />
        <div style={{ position: 'absolute', top: 0, left: `${Math.min(96, Math.max(4, pos01 * 100))}%`, transform: 'translateX(-50%)' }}>
          <svg width="10" height="12" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={color} /></svg>
        </div>
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
    <div className="mt-9">
      <SectionLabel>Top Priorities</SectionLabel>
      <div className="mt-1">
        {top3.map(c => (
          <div key={c.label} className="flex items-start gap-3 py-3" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
            <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: '#ef4444', minWidth: 48, textAlign: 'right' }}>+{c.contribution}y</span>
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: SERIF, fontSize: 15, color: C.ink }}>{c.label}</p>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 1 }}>{getActionTip(c.label)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricContribution({ label, value, unit, contribution, color, sublabel }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <div>
        <p style={{ fontFamily: SERIF, fontSize: 14, color: C.ink }}>{label}</p>
        <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{value}{unit}{sublabel ? ` — ${sublabel}` : ''}</p>
      </div>
      <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 700, color }}>
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
  const ffmi = calculateFFMI(leanMass, heightCm)
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
    const today = localToday()
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
      value: Math.round(visceralFatIndex * 10) / 10,
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
      value: units === 'imperial' ? Math.round(skelMuscleKg * 2.2046) : Math.round(skelMuscleKg * 10) / 10,
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
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>CHRONOS</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Your biological age</h1>

      {!ageIsSet ? (
        <div className="mt-9">
          <Note>Set your age in Settings to get started — biological age needs your calendar age as a baseline.</Note>
          {onNav && (
            <button onClick={() => onNav('settings')} className="mt-4 active:opacity-50 transition-opacity">
              <Label style={{ color: C.ink }}>Open Settings ›</Label>
            </button>
          )}
        </div>
      ) : (
        <>
          <BioAgeHeadline physAge={physAge} chronAge={userAge} />
          <ConfidenceLine confidence={confidence} />
          <PaceLine pace={pace} physAge={physAge} chronAge={userAge} />
          <div className="mt-9"><InsightNote physAge={physAge} chronAge={userAge} pace={pace} /></div>
          <BioAgeTrendChart chronAge={userAge} />

          {phenoAge !== null ? (
            <div className="mt-9">
              <SectionLabel>PhenoAge</SectionLabel>
              <div className="flex items-baseline justify-between mt-3">
                <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>Levine Formula · validated clinical model</p>
                <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: phenoAge < userAge ? '#3E9C7E' : phenoAge < userAge + 5 ? '#D98E3F' : '#ef4444' }}>
                  {Math.round(phenoAge)}y
                </span>
              </div>
            </div>
          ) : phenoProgress ? (
            <div className="mt-9">
              <SectionLabel right={`${phenoProgress.present}/${phenoProgress.total} markers`}>PhenoAge — Bloodwork Panel</SectionLabel>
              <div style={{ height: 3, marginTop: 12, background: C.ruleSoft }}>
                <div style={{ height: 3, width: `${(phenoProgress.present / phenoProgress.total) * 100}%`, background: '#9B7FD4' }} />
              </div>
              {phenoProgress.missingNames.length > 0 && (
                <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Still needed: {phenoProgress.missingNames.join(', ')}</p>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Vitals History shortcut */}
      <div className="mt-9">
        <button onClick={() => onNav('vitals')} className="w-full flex items-center justify-between py-2.5 active:opacity-50 transition-opacity" style={{ borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}` }}>
          <span style={{ fontFamily: SERIF, fontSize: 16, color: C.ink }}>Vitals History</span>
          <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>BP · Weight · Grip · Waist · HRV · RHR ›</span>
        </button>
      </div>

      {/* Body composition */}
      {(bmi !== null || heightCm > 0 || weightKg > 0 || bodyFatPct !== null) && (
        <div className="mt-9">
          <SectionLabel>Body Composition</SectionLabel>
          <div className="mt-1">
            {weightKg > 0 && (
              <StatRow label="Weight" value={units === 'imperial' ? Math.round(weightKg * 2.2046) : Math.round(weightKg * 10) / 10} unit={units === 'imperial' ? 'lbs' : 'kg'} />
            )}
            {bodyFatPct !== null && (
              <StatRow label="Body Fat" value={`${bodyFatPct}%`} unit={getBodyFatLabel(bodyFatPct)} color={getBodyFatColor(bodyFatPct)} />
            )}
            {bmi !== null && (
              <StatRow label="BMI" value={bmi} unit={getBMILabel(bmi)} color={getBMIColor(bmi)} />
            )}
            {leanMass !== null && (
              <>
                <StatRow label="Lean Mass" value={units === 'imperial' ? Math.round(leanMass * 2.2046) : leanMass} unit={units === 'imperial' ? 'lbs' : 'kg'} />
                <StatRow label="Fat Mass" value={units === 'imperial' ? Math.round(fatMass * 2.2046) : fatMass} unit={units === 'imperial' ? 'lbs' : 'kg'} />
              </>
            )}
          </div>

          {weightChartData.length >= 2 && (
            <div className="mt-5">
              <Label style={{ fontSize: 11 }}>Weight Trend</Label>
              <div className="mt-2"><LineGraph data={weightChartData} dataKey="weight" color="#9B7FD4" unit={units === 'imperial' ? 'lbs' : 'kg'} height={80} /></div>
            </div>
          )}

          {gripChartData.length >= 2 && (
            <div className="mt-5">
              <Label style={{ fontSize: 11 }}>Grip Strength Trend</Label>
              <div className="mt-2"><LineGraph data={gripChartData} dataKey="grip" color="#3E9C7E" unit={units === 'imperial' ? 'lbs' : 'kg'} height={70} /></div>
            </div>
          )}

          {waistChartData.length >= 2 && (
            <div className="mt-5">
              <Label style={{ fontSize: 11 }}>Waist Circumference Trend</Label>
              <div className="mt-2"><LineGraph data={waistChartData} dataKey="waist" color="#D98E3F" unit={units === 'imperial' ? 'in' : 'cm'} height={70} reference={units === 'imperial' ? Math.round(94 / 2.54) : 94} /></div>
            </div>
          )}

          {weightKg === 0 && bodyFatPct === null && (
            <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 10 }}>Set height, weight, and body fat % in Settings to see composition metrics.</p>
          )}
          {weightKg > 0 && bodyFatPct === null && (
            <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 10 }}>Add body fat % in Settings to see lean and fat mass.</p>
          )}
        </div>
      )}

      {/* Zone 2 Training */}
      <div className="mt-9">
        <SectionLabel>Zone 2 Cardio This Week</SectionLabel>
        <div className="flex items-baseline gap-2 mt-3">
          <span style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 700, color: weeklyZone2 >= 300 ? '#3E9C7E' : weeklyZone2 >= 150 ? '#6E6557' : '#D98E3F' }}>{weeklyZone2}</span>
          <span style={{ fontFamily: SERIF, fontSize: 14, color: C.faint }}>minutes</span>
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 2 }}>{weeklyZone2 >= 300 ? 'Excellent — above longevity target' : weeklyZone2 >= 150 ? 'Good — meets minimum target' : 'Below target — aim for 150+ min'}</p>
        <div style={{ height: 3, marginTop: 10, background: C.ruleSoft }}>
          <div style={{ height: 3, width: `${Math.min(100, (weeklyZone2 / 300) * 100)}%`, background: weeklyZone2 >= 300 ? '#3E9C7E' : weeklyZone2 >= 150 ? '#9B7FD4' : '#D98E3F' }} />
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>60–70% max HR from your intraday data. 150 min/week = good, 300 min/week = excellent for longevity.</p>
      </div>

      {/* Sleep Regularity Index */}
      {sri !== null && (
        <div className="mt-9">
          <SectionLabel>Sleep Regularity Index</SectionLabel>
          <div className="flex items-baseline gap-2 mt-3">
            <span style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 700, color: sri >= 0.87 ? '#3E9C7E' : sri >= 0.80 ? '#6E6557' : sri >= 0.70 ? '#D98E3F' : '#ef4444' }}>{Math.round(sri * 100)}</span>
            <span style={{ fontFamily: SERIF, fontSize: 14, color: C.faint }}>/ 100</span>
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 2 }}>
            {sri >= 0.87 ? 'Excellent regularity' : sri >= 0.80 ? 'Good' : sri >= 0.70 ? 'Moderate — work on consistency' : 'Poor — irregular schedule'}
          </p>
          <div style={{ height: 3, marginTop: 10, background: C.ruleSoft }}>
            <div style={{ height: 3, width: `${Math.round(sri * 100)}%`, background: sri >= 0.87 ? '#3E9C7E' : sri >= 0.80 ? '#9B7FD4' : sri >= 0.70 ? '#D98E3F' : '#ef4444' }} />
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>Probability of same sleep/wake state 24h apart. ≥87 = excellent circadian rhythm. Used as sleep consistency in your biological age.</p>
        </div>
      )}

      {/* Post-exercise Heart Rate Recovery — shows live today or last known (≤90 days) */}
      {lastKnownHRR && (
        <div className="mt-9">
          <SectionLabel right={!data.hrr && lastKnownHRR.date ? `last recorded ${lastKnownHRR.date}` : undefined}>Heart Rate Recovery</SectionLabel>
          <div className="mt-1">
            <StatRow
              label="Post-Exercise Drop"
              value={`-${lastKnownHRR.hrr60}`}
              unit={`bpm · ${lastKnownHRR.hrr60 >= 25 ? 'Excellent' : lastKnownHRR.hrr60 >= 18 ? 'Good' : lastKnownHRR.hrr60 >= 12 ? 'Normal' : 'Poor (↑ risk)'}`}
              color={lastKnownHRR.hrr60 >= 18 ? '#3E9C7E' : lastKnownHRR.hrr60 >= 12 ? '#9B7FD4' : '#ef4444'}
            />
            {lastKnownHRR.hrr120 !== null && (
              <StatRow
                label="Early Recovery Drop"
                value={`-${lastKnownHRR.hrr120}`}
                unit={`bpm · ${lastKnownHRR.hrr120 >= 42 ? 'Excellent' : lastKnownHRR.hrr120 >= 30 ? 'Good' : 'Below average'}`}
                color={lastKnownHRR.hrr120 >= 42 ? '#3E9C7E' : lastKnownHRR.hrr120 >= 30 ? '#9B7FD4' : '#ef4444'}
              />
            )}
          </div>
          {lastKnownHRR.peakHR && <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Peak HR {lastKnownHRR.peakHR} bpm · HR drop from peak to 1 min post-exercise. Drop &lt;12 bpm predicts higher mortality (Cole NEJM 1999).</p>}
        </div>
      )}

      {/* Top Priorities — only shown when biologically older than calendar age */}
      {diff > 0 && <TopPriorities opportunities={allOpportunities} />}

      {/* What's moving the needle */}
      <div className="mt-9">
        <SectionLabel>What's Moving the Needle</SectionLabel>
        <div className="mt-1">
          {avgHRV > 0 && <MetricFactorRow label="Heart Rate Variability" value={Math.round(avgHRV)} unit=" ms" contribution={contributions.find(c => c.label === 'HRV')?.contribution ?? 0} min={20} max={120} higherBetter={true} sublabel={`30-day avg · norm ~${getHRVNorm(userAge)} ms for age`} />}
          {avgRHR > 0 && <MetricFactorRow label="Resting Heart Rate" value={Math.round(avgRHR)} unit=" bpm" contribution={contributions.find(c => c.label === 'Resting Heart Rate')?.contribution ?? 0} min={40} max={100} higherBetter={false} sublabel="lower is better" />}
          <MetricFactorRow label="Sleep Duration" value={Math.round(avgSleepHours * 10) / 10} unit="h avg" contribution={contributions.find(c => c.label === 'Sleep Duration')?.contribution ?? 0} min={5} max={9} higherBetter={true} />
          <MetricFactorRow label="Daily Steps" value={steps} displayValue={steps.toLocaleString()} unit="" contribution={contributions.find(c => c.label === 'Daily Steps')?.contribution ?? 0} min={0} max={15000} higherBetter={true} />
          {vo2Max > 0 && <MetricFactorRow label="VO2 Max" value={vo2Max} unit=" ml/kg/min" contribution={contributions.find(c => c.label === 'VO2 Max (Cardio Fitness)')?.contribution ?? 0} min={20} max={60} higherBetter={true} sublabel={(() => { const norms = userAge <= 29 ? [34,42,53] : userAge <= 39 ? [31,39,49] : userAge <= 49 ? [27,35,45] : userAge <= 59 ? [25,34,44] : [22,30,40]; const [f,g,e] = norms; return vo2Max >= e+5 ? 'Elite' : vo2Max >= e ? 'Superior' : vo2Max >= g ? 'Excellent' : vo2Max >= f ? 'Good' : 'Fair' })()} />}
          {bodyFatPct !== null && <MetricFactorRow label="Body Fat %" value={bodyFatPct} unit="%" contribution={contributions.find(c => c.label === 'Body Fat %')?.contribution ?? 0} min={5} max={35} higherBetter={false} sublabel={getBodyFatLabel(bodyFatPct)} />}
          {bodyFatPct === null && bmi !== null && <MetricFactorRow label="BMI" value={bmi} unit="" contribution={contributions.find(c => c.label?.includes('BMI'))?.contribution ?? 0} min={16} max={40} higherBetter={false} sublabel={getBMILabel(bmi)} />}
          {gripKg > 0 && <MetricFactorRow label="Grip Strength" value={units === 'imperial' ? Math.round(gripKg * 2.2046) : gripKg} unit={units === 'imperial' ? ' lbs' : ' kg'} contribution={contributions.find(c => c.label === 'Grip Strength')?.contribution ?? 0} min={units === 'imperial' ? 66 : 30} max={units === 'imperial' ? 132 : 60} higherBetter={true} />}
          <MetricFactorRow label="Weekly Active Zone Min" value={weeklyAZM} unit=" AZM" contribution={contributions.find(c => c.label === 'Active Zone Minutes')?.contribution ?? 0} min={0} max={500} higherBetter={true} sublabel="WHO target: 150/wk · Excellent: 300/wk" />
          {lastKnownHRR?.hrr60 > 0 && (
            <MetricFactorRow
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
        <div className="mt-9">
          <SectionLabel>VO2 Max Trend</SectionLabel>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>Fitbit cardio fitness score · updates when you exercise. Midpoint of reported range shown.</p>
          <div className="mt-3"><LineGraph data={vo2ChartData} dataKey="vo2Max" color="#9B7FD4" unit=" mL/kg/min" height={90} /></div>
          {vo2Max > 0 && (() => {
            const ctx = getVO2MortalityContext(vo2Max, userAge)
            if (!ctx) return null
            return (
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: ctx.color }}>{ctx.category}</p>
                    <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 2 }}>{ctx.note}</p>
                    <p style={{ fontFamily: SERIF, fontSize: 10, color: C.faint, marginTop: 2, fontStyle: 'italic' }}>Mandsager et al., JAMA Network Open 2018</p>
                  </div>
                  <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 700, color: ctx.color, flexShrink: 0 }}>{vo2Max} ml/kg/min</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Lab results impact */}
      {labContributions.length > 0 && (
        <div className="mt-9">
          <SectionLabel right={`${labContributions.length} marker${labContributions.length !== 1 ? 's' : ''} entered`}>Bloodwork Impact</SectionLabel>
          <div className="mt-1">
            {labContributions.map((c) => {
              const color = c.contribution < 0 ? '#3E9C7E' : c.contribution > 1 ? '#ef4444' : '#D98E3F'
              return <MetricContribution key={c.label} {...c} color={color} />
            })}
          </div>
        </div>
      )}

      {/* Blood Pressure Trend */}
      {bpChartData.length >= 2 && (
        <div className="mt-9">
          <SectionLabel>Blood Pressure Trend</SectionLabel>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>Red = systolic · Blue = diastolic · Dashed lines at 120/80 mmHg optimal</p>
          <div className="mt-3">
            <DualLineGraph
              data={bpChartData}
              dataKey1="sys"
              dataKey2="dia"
              color1="#ef4444"
              color2="#9B7FD4"
              unit=" mmHg"
              height={100}
              reference1={120}
              reference2={80}
            />
          </div>
        </div>
      )}

      {/* Mortality Driver Dashboard */}
      <div className="mt-9">
        <SectionLabel>Longevity Profile</SectionLabel>
        <div className="grid grid-cols-2 gap-6 mt-3">
          <div>
            <Label style={{ fontSize: 11 }}>Top Assets</Label>
            <div className="mt-2">
              {allAssets.slice(0, 3).map(c => (
                <div key={c.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
                  <p style={{ fontFamily: SERIF, fontSize: 12, color: C.inkSoft }} className="truncate mr-2">{c.label}</p>
                  <span style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 700, color: '#3E9C7E', flexShrink: 0 }}>{c.contribution}y</span>
                </div>
              ))}
              {allAssets.length === 0 && <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>No assets yet — keep tracking.</p>}
            </div>
          </div>
          <div>
            <Label style={{ fontSize: 11 }}>Top Liabilities</Label>
            <div className="mt-2">
              {allOpportunities.slice(0, 3).map(c => (
                <div key={c.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
                  <p style={{ fontFamily: SERIF, fontSize: 12, color: C.inkSoft }} className="truncate mr-2">{c.label}</p>
                  <span style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>+{c.contribution}y</span>
                </div>
              ))}
              {allOpportunities.length === 0 && <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>Clean slate.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Chronos Delta Engine */}
      {chronosDeltas.length > 0 && (
        <div className="mt-9">
          <SectionLabel>Potential Years to Reclaim</SectionLabel>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>One-tier improvement on each factor</p>
          <div className="mt-3">
            {chronosDeltas.slice(0, 5).map(d => (
              <div key={d.label} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
                <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: '#3E9C7E', minWidth: 36 }}>+{d.gain}y</span>
                <div>
                  <p style={{ fontFamily: SERIF, fontSize: 14, color: C.ink }}>{d.label}</p>
                  <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{d.action}</p>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Estimates based on next-tier bio age scoring. Actual gains compound with multiple improvements.</p>
        </div>
      )}

      {/* Social Jet Lag */}
      {socialJetLag !== null && (
        <div className="mt-9">
          <SectionLabel>Circadian Alignment</SectionLabel>
          <div className="flex items-baseline gap-2 mt-3">
            <span style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 700, color: socialJetLag <= 20 ? '#3E9C7E' : socialJetLag <= 45 ? '#6E6557' : socialJetLag <= 75 ? '#D98E3F' : '#ef4444' }}>{socialJetLag}</span>
            <span style={{ fontFamily: SERIF, fontSize: 14, color: C.faint }}>min variability</span>
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 2 }}>
            {socialJetLag <= 20 ? 'Excellent — rock-solid schedule' : socialJetLag <= 45 ? 'Good circadian alignment' : socialJetLag <= 75 ? 'Moderate timing variability' : 'High variability — circadian disruption risk'}
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>SD of sleep midpoint timing across last 30 nights. Measures sleep schedule consistency (not classic Roenneberg SJL). &lt;20 min = elite consistency.</p>
        </div>
      )}

      {/* Sleep Apnea Risk */}
      {sleepApneaRisk !== null && (
        <div className="mt-9 mb-4">
          <SectionLabel>Sleep Breathing Risk</SectionLabel>
          <div className="flex items-center justify-between mt-3">
            <div>
              <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: sleepApneaRisk.riskLevel === 0 ? '#3E9C7E' : sleepApneaRisk.riskLevel === 1 ? '#D98E3F' : '#ef4444' }}>{sleepApneaRisk.risk}</p>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 2 }}>Based on SpO₂ during sleep</p>
            </div>
            <div className="text-right">
              <Label style={{ fontSize: 11 }}>Min SpO₂</Label>
              <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: sleepApneaRisk.minSpo2 >= 93 ? '#3E9C7E' : sleepApneaRisk.minSpo2 >= 88 ? '#D98E3F' : '#ef4444' }}>{sleepApneaRisk.minSpo2}%</p>
            </div>
          </div>
          <div className="mt-3">
            <StatRow label="Desat. Events/hr" value={sleepApneaRisk.odi} unit="/hr" />
            <StatRow label="Avg SpO₂" value={`${sleepApneaRisk.avgSpo2}%`} />
          </div>
          {sleepApneaRisk.brElevated && (
            <p style={{ fontFamily: SERIF, fontSize: 12, color: '#D98E3F', marginTop: 8 }}>Elevated respiratory rate detected — additional risk signal.</p>
          )}
          {sleepApneaRisk.riskLevel >= 2 && (
            <p style={{ fontFamily: SERIF, fontSize: 12, color: '#ef4444', marginTop: 4 }}>Consider discussing with a doctor — a sleep study (polysomnography) is the only way to diagnose sleep apnea.</p>
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Based on 5-min SpO₂ samples — coarser than clinical oximetry. Use risk tier for trend direction, not as a diagnostic ODI value.</p>
        </div>
      )}
    </div>
  )
}
