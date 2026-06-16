import { useState, useMemo } from 'react'
import {
  getUserUnits, getBodyWeightHistory, getBPReadings, getGripHistory,
  getWaistHistory, calculateLeanMass, calculateFatMass, getUserAge,
} from '../lib/calculations'
import { LineGraph, DualLineGraph } from '../components/TrendChart'

const RANGES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
  { label: 'All', days: null },
]

function cutoffFor(days) {
  if (!days) return null
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function delta(current, first) {
  if (current == null || first == null) return null
  return Math.round((current - first) * 10) / 10
}

function DeltaChip({ value, unit, lowerIsBetter = false }) {
  if (value == null) return null
  const improved = lowerIsBetter ? value < 0 : value > 0
  const neutral = value === 0
  const color = neutral ? '#555' : improved ? '#00c9a7' : '#ef4444'
  const sign = value > 0 ? '+' : ''
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full ml-2" style={{ background: color + '18', color }}>
      {sign}{value}{unit}
    </span>
  )
}

function RangeSelector({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {RANGES.map(r => (
        <button
          key={r.label}
          onClick={() => onChange(r.label)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: value === r.label ? '#00c9a7' : '#1a1a1a',
            color: value === r.label ? '#000' : '#666',
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

function VitalCard({ title, emoji, children, count, emptyMsg = 'No data yet — log in Settings' }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #141414, #0f0f0f)', border: '1px solid #1e1e1e' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{emoji}</span>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{title}</p>
        </div>
        {count != null && <p className="text-[10px] text-gray-600">{count} entries</p>}
      </div>
      {count === 0 ? (
        <p className="text-xs text-gray-600">{emptyMsg}</p>
      ) : children}
    </div>
  )
}

function StatRow({ label, value, unit }) {
  return (
    <div className="flex items-baseline justify-between py-1.5" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-white">{value != null ? `${value}${unit}` : '—'}</p>
    </div>
  )
}

export default function Vitals({ data, onNav }) {
  const [range, setRange] = useState('90d')
  const units = getUserUnits()
  const imperial = units === 'imperial'
  const age = getUserAge()

  const rangeDef = RANGES.find(r => r.label === range)
  const cutoff = cutoffFor(rangeDef.days)

  // ── Blood Pressure ──────────────────────────────────────────────────────────
  const bpAll = useMemo(() => getBPReadings(), [])
  const bpFiltered = cutoff ? bpAll.filter(r => r.date >= cutoff) : bpAll
  const bpChartData = bpFiltered.map(r => ({ label: fmtDate(r.date), sys: r.sys, dia: r.dia }))
  const bpLatest = bpAll.at(-1)
  const bpFirst = bpFiltered[0]
  const bpSysDelta = delta(bpLatest?.sys, bpFirst?.sys)
  const bpDiaDelta = delta(bpLatest?.dia, bpFirst?.dia)
  const recentBP = bpAll.slice(-10)
  const avgSys = recentBP.length ? Math.round(recentBP.reduce((s, r) => s + r.sys, 0) / recentBP.length) : null
  const avgDia = recentBP.length ? Math.round(recentBP.reduce((s, r) => s + r.dia, 0) / recentBP.length) : null

  // ── Body Weight ─────────────────────────────────────────────────────────────
  const weightAll = useMemo(() => getBodyWeightHistory(), [])
  const weightFiltered = cutoff ? weightAll.filter(e => e.date >= cutoff) : weightAll
  const weightLatest = weightAll.at(-1)
  const weightFirst = weightFiltered[0]
  const weightDisplay = v => v == null ? null : imperial ? Math.round(v * 2.2046 * 10) / 10 : v
  const weightUnit = imperial ? ' lbs' : ' kg'
  const weightChartData = weightFiltered.map(e => ({ label: fmtDate(e.date), weight: weightDisplay(e.kg) }))
  const weightDelta = delta(weightDisplay(weightLatest?.kg), weightDisplay(weightFirst?.kg))

  // ── Body Fat % ──────────────────────────────────────────────────────────────
  const bfFiltered = weightFiltered.filter(e => e.fatPct != null)
  const bfLatest = weightAll.filter(e => e.fatPct != null).at(-1)
  const bfFirst = bfFiltered[0]
  const bfChartData = bfFiltered.map(e => ({ label: fmtDate(e.date), fatPct: Math.round(e.fatPct * 10) / 10 }))
  const bfDelta = delta(bfLatest?.fatPct, bfFirst?.fatPct)

  // ── Lean Mass ───────────────────────────────────────────────────────────────
  const leanFiltered = weightFiltered.filter(e => e.kg != null && e.fatPct != null)
  const leanLatest = weightAll.filter(e => e.kg != null && e.fatPct != null).at(-1)
  const leanFirst = leanFiltered[0]
  const leanDisplay = e => e == null ? null : weightDisplay(calculateLeanMass(e.kg, e.fatPct))
  const leanChartData = leanFiltered.map(e => ({ label: fmtDate(e.date), lean: leanDisplay(e) }))
  const leanDelta = delta(leanDisplay(leanLatest), leanDisplay(leanFirst))

  // ── Waist ───────────────────────────────────────────────────────────────────
  const waistAll = useMemo(() => getWaistHistory(), [])
  const waistFiltered = cutoff ? waistAll.filter(e => e.date >= cutoff) : waistAll
  const waistLatest = waistAll.at(-1)
  const waistFirst = waistFiltered[0]
  const waistDisplay = v => v == null ? null : imperial ? Math.round(v / 2.54 * 10) / 10 : v
  const waistUnit = imperial ? ' in' : ' cm'
  const waistRef = imperial ? Math.round(94 / 2.54 * 10) / 10 : 94
  const waistChartData = waistFiltered.map(e => ({ label: fmtDate(e.date), waist: waistDisplay(e.cm) }))
  const waistDelta = delta(waistDisplay(waistLatest?.cm), waistDisplay(waistFirst?.cm))

  // ── Grip Strength ───────────────────────────────────────────────────────────
  const gripAll = useMemo(() => getGripHistory(), [])
  const gripFiltered = cutoff ? gripAll.filter(e => e.date >= cutoff) : gripAll
  const gripLatest = gripAll.at(-1)
  const gripFirst = gripFiltered[0]
  const gripDisplay = v => v == null ? null : imperial ? Math.round(v * 2.2046 * 10) / 10 : v
  const gripUnit = imperial ? ' lbs' : ' kg'
  // Age-adjusted grip norm for men: peaks ~45 kg at 35-45, refs from Dodds 2014
  const gripNorm = age < 30 ? 45 : age < 40 ? 48 : age < 50 ? 46 : age < 60 ? 43 : age < 70 ? 38 : 33
  const gripNormDisplay = gripDisplay(gripNorm)
  const gripChartData = gripFiltered.map(e => ({ label: fmtDate(e.date), grip: gripDisplay(e.kg) }))
  const gripDelta = delta(gripDisplay(gripLatest?.kg), gripDisplay(gripFirst?.kg))

  // ── Fitbit RHR & HRV ────────────────────────────────────────────────────────
  const calDays = (data?.calendarDays || []).filter(d => d.date)
  const rhrDays = calDays.filter(d => d.rhr > 0)
  const rhrFiltered = cutoff ? rhrDays.filter(d => d.date >= cutoff) : rhrDays
  const rhrChartData = rhrFiltered.map(d => ({ label: fmtDate(d.date), rhr: d.rhr }))
  const rhrLatest = rhrDays.at(-1)
  const rhrFirst = rhrFiltered[0]
  const rhrDelta = delta(rhrLatest?.rhr, rhrFirst?.rhr)

  const hrvDays = calDays.filter(d => d.hrv > 0)
  const hrvFiltered = cutoff ? hrvDays.filter(d => d.date >= cutoff) : hrvDays
  const hrvChartData = hrvFiltered.map(d => ({ label: fmtDate(d.date), hrv: d.hrv }))
  const hrvLatest = hrvDays.at(-1)
  const hrvFirst = hrvFiltered[0]
  const hrvDelta = delta(hrvLatest?.hrv, hrvFirst?.hrv)

  const vo2Days = calDays.filter(d => d.vo2Max > 0)
  const vo2Filtered = cutoff ? vo2Days.filter(d => d.date >= cutoff) : vo2Days
  const vo2ChartData = vo2Filtered.map(d => ({ label: fmtDate(d.date), vo2: d.vo2Max }))
  const vo2Latest = vo2Days.at(-1)
  const vo2First = vo2Filtered[0]
  const vo2Delta = delta(vo2Latest?.vo2Max, vo2First?.vo2Max)

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">

      {/* Header */}
      <div className="pt-2 flex items-center gap-3">
        <button onClick={() => onNav('healthspan')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold">Vitals History</h1>
          <p className="text-xs text-gray-600">Manually tracked measurements</p>
        </div>
      </div>

      {/* Range selector */}
      <RangeSelector value={range} onChange={setRange} />

      {/* Blood Pressure */}
      <VitalCard title="Blood Pressure" emoji="🩺" count={bpFiltered.length}>
        <div className="flex items-baseline gap-2 mb-1">
          <p className="text-3xl font-bold text-white">
            {bpLatest ? `${bpLatest.sys}/${bpLatest.dia}` : '—'}
          </p>
          <span className="text-sm text-gray-500">mmHg</span>
          {bpSysDelta != null && (
            <DeltaChip value={bpSysDelta} unit="" lowerIsBetter />
          )}
        </div>
        {avgSys != null && (
          <p className="text-[11px] text-gray-600 mb-3">10-reading avg: {avgSys}/{avgDia} mmHg</p>
        )}
        {bpChartData.length >= 2 && (
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
        )}
        <p className="text-[10px] text-gray-600 mt-2">Red = systolic · Blue = diastolic · Dashed at 120/80</p>
      </VitalCard>

      {/* Body Weight */}
      <VitalCard title="Body Weight" emoji="⚖️" count={weightFiltered.length}>
        <div className="flex items-baseline gap-2 mb-3">
          <p className="text-3xl font-bold text-white">
            {weightDisplay(weightLatest?.kg) ?? '—'}
          </p>
          <span className="text-sm text-gray-500">{imperial ? 'lbs' : 'kg'}</span>
          {weightDelta != null && <DeltaChip value={weightDelta} unit={imperial ? ' lbs' : ' kg'} lowerIsBetter />}
        </div>
        {weightChartData.length >= 2 && (
          <LineGraph data={weightChartData} dataKey="weight" color="#3b82f6" unit={imperial ? ' lbs' : ' kg'} height={90} />
        )}
      </VitalCard>

      {/* Body Fat & Lean Mass — only if fat % data exists */}
      {bfFiltered.length > 0 && (
        <VitalCard title="Body Composition" emoji="🔬" count={bfFiltered.length}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl p-3" style={{ background: '#1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Body Fat</p>
              <p className="text-xl font-bold text-white">{bfLatest?.fatPct ?? '—'}<span className="text-xs text-gray-500 ml-1">%</span></p>
              {bfDelta != null && <DeltaChip value={bfDelta} unit="%" lowerIsBetter />}
            </div>
            <div className="rounded-xl p-3" style={{ background: '#1a1a1a' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Lean Mass</p>
              <p className="text-xl font-bold text-white">{leanDisplay(leanLatest) ?? '—'}<span className="text-xs text-gray-500 ml-1">{imperial ? 'lbs' : 'kg'}</span></p>
              {leanDelta != null && <DeltaChip value={leanDelta} unit={imperial ? ' lbs' : ' kg'} lowerIsBetter={false} />}
            </div>
          </div>
          {bfChartData.length >= 2 && (
            <>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Body Fat % Trend</p>
              <LineGraph data={bfChartData} dataKey="fatPct" color="#f59e0b" unit="%" height={80} />
            </>
          )}
          {leanChartData.length >= 2 && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Lean Mass Trend</p>
              <LineGraph data={leanChartData} dataKey="lean" color="#00c9a7" unit={weightUnit} height={80} />
            </div>
          )}
        </VitalCard>
      )}

      {/* Waist Circumference */}
      <VitalCard title="Waist Circumference" emoji="📏" count={waistFiltered.length}>
        <div className="flex items-baseline gap-2 mb-3">
          <p className="text-3xl font-bold text-white">
            {waistDisplay(waistLatest?.cm) ?? '—'}
          </p>
          <span className="text-sm text-gray-500">{imperial ? 'in' : 'cm'}</span>
          {waistDelta != null && <DeltaChip value={waistDelta} unit={waistUnit} lowerIsBetter />}
        </div>
        {waistChartData.length >= 2 && (
          <LineGraph data={waistChartData} dataKey="waist" color="#f59e0b" unit={waistUnit} height={90} reference={waistRef} />
        )}
        <p className="text-[10px] text-gray-600 mt-2">Dashed line = {waistRef}{waistUnit.trim()} metabolic risk threshold (men)</p>
      </VitalCard>

      {/* Grip Strength */}
      <VitalCard title="Grip Strength" emoji="✊" count={gripFiltered.length}>
        <div className="flex items-baseline gap-2 mb-3">
          <p className="text-3xl font-bold text-white">
            {gripDisplay(gripLatest?.kg) ?? '—'}
          </p>
          <span className="text-sm text-gray-500">{imperial ? 'lbs' : 'kg'}</span>
          {gripDelta != null && <DeltaChip value={gripDelta} unit={gripUnit} lowerIsBetter={false} />}
        </div>
        {gripChartData.length >= 2 && (
          <LineGraph data={gripChartData} dataKey="grip" color="#00c9a7" unit={gripUnit} height={90} reference={gripNormDisplay} />
        )}
        <p className="text-[10px] text-gray-600 mt-2">Dashed line = age-adjusted norm for men (Dodds 2014)</p>
      </VitalCard>

      {/* Divider: Fitbit-derived */}
      {(rhrFiltered.length > 0 || hrvFiltered.length > 0 || vo2Filtered.length > 0) && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px" style={{ background: '#1e1e1e' }} />
          <p className="text-[10px] text-gray-600 uppercase tracking-widest">From Fitbit Air</p>
          <div className="flex-1 h-px" style={{ background: '#1e1e1e' }} />
        </div>
      )}

      {/* Resting Heart Rate */}
      {rhrFiltered.length > 0 && (
        <VitalCard title="Resting Heart Rate" emoji="❤️" count={rhrFiltered.length}>
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-3xl font-bold text-white">{rhrLatest?.rhr ?? '—'}</p>
            <span className="text-sm text-gray-500">bpm</span>
            {rhrDelta != null && <DeltaChip value={rhrDelta} unit=" bpm" lowerIsBetter />}
          </div>
          {rhrChartData.length >= 2 && (
            <LineGraph data={rhrChartData} dataKey="rhr" color="#ef4444" unit=" bpm" height={90} reference={60} />
          )}
          <p className="text-[10px] text-gray-600 mt-2">Dashed = 60 bpm · Lower is generally better at rest</p>
        </VitalCard>
      )}

      {/* HRV */}
      {hrvFiltered.length > 0 && (
        <VitalCard title="HRV Baseline" emoji="⚡" count={hrvFiltered.length}>
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-3xl font-bold text-white">{hrvLatest?.hrv ?? '—'}</p>
            <span className="text-sm text-gray-500">ms</span>
            {hrvDelta != null && <DeltaChip value={hrvDelta} unit=" ms" lowerIsBetter={false} />}
          </div>
          {hrvChartData.length >= 2 && (
            <LineGraph data={hrvChartData} dataKey="hrv" color="#00c9a7" unit=" ms" height={90} />
          )}
          <p className="text-[10px] text-gray-600 mt-2">Higher is better · Fitbit overnight rmsSD</p>
        </VitalCard>
      )}

      {/* VO2 Max */}
      {vo2Filtered.length > 0 && (
        <VitalCard title="VO₂ Max" emoji="🫁" count={vo2Filtered.length}>
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-3xl font-bold text-white">{vo2Latest?.vo2Max ?? '—'}</p>
            <span className="text-sm text-gray-500">ml/kg/min</span>
            {vo2Delta != null && <DeltaChip value={vo2Delta} unit="" lowerIsBetter={false} />}
          </div>
          {vo2ChartData.length >= 2 && (
            <LineGraph data={vo2ChartData} dataKey="vo2" color="#a78bfa" unit=" ml/kg/min" height={90} />
          )}
          <p className="text-[10px] text-gray-600 mt-2">Estimated by Fitbit · Higher is better</p>
        </VitalCard>
      )}

      {/* Empty state when no data at all */}
      {bpAll.length === 0 && weightAll.length === 0 && gripAll.length === 0 && waistAll.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ background: '#111', border: '1px solid #222' }}>
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm font-semibold text-gray-300 mb-1">No vitals logged yet</p>
          <p className="text-xs text-gray-600">Open Settings to log your first blood pressure, weight, grip strength, and waist measurements.</p>
        </div>
      )}

    </div>
  )
}
