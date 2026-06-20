import { useState } from 'react'
import {
  getUserUnits, getBodyWeightHistory, getBPReadings, getGripHistory,
  getWaistHistory, calculateLeanMass, calculateFatMass, getUserAge, localDateOf,
} from '../lib/calculations'
import { LineGraph, DualLineGraph } from '../components/TrendChart'
import { C, SERIF, Label, BackLink, SectionLabel } from '../lib/almanacTheme'

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
  return localDateOf(d)
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
  const color = neutral ? C.faint : improved ? '#3E9C7E' : '#ef4444'
  const sign = value > 0 ? '+' : ''
  return (
    <span style={{ fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color, marginLeft: 8 }}>
      {sign}{value}{unit}
    </span>
  )
}

function RangeSelector({ value, onChange }) {
  return (
    <div className="flex gap-4">
      {RANGES.map(r => (
        <button
          key={r.label}
          onClick={() => onChange(r.label)}
          style={{
            fontFamily: SERIF, fontVariant: 'small-caps', letterSpacing: '0.06em', fontSize: 13,
            color: value === r.label ? C.ink : C.faint,
            fontWeight: value === r.label ? 700 : 400,
            borderBottom: value === r.label ? `2px solid ${C.gold}` : '2px solid transparent',
            paddingBottom: 3,
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

function VitalCard({ title, children, count, emptyMsg = 'No data yet — log in Settings' }) {
  return (
    <div className="mt-9">
      <SectionLabel right={count != null ? `${count} entries` : undefined}>{title}</SectionLabel>
      <div className="mt-4">
        {count === 0 ? (
          <p style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{emptyMsg}</p>
        ) : children}
      </div>
    </div>
  )
}

function StatRow({ label, value, unit }) {
  return (
    <div className="flex items-baseline justify-between py-1.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <p style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{label}</p>
      <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: C.ink }}>{value != null ? `${value}${unit}` : '—'}</p>
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
  const bpAll = getBPReadings()
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
  const weightAll = getBodyWeightHistory()
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
  const waistAll = getWaistHistory()
  const waistFiltered = cutoff ? waistAll.filter(e => e.date >= cutoff) : waistAll
  const waistLatest = waistAll.at(-1)
  const waistFirst = waistFiltered[0]
  const waistDisplay = v => v == null ? null : imperial ? Math.round(v / 2.54 * 10) / 10 : v
  const waistUnit = imperial ? ' in' : ' cm'
  const waistRef = imperial ? Math.round(94 / 2.54 * 10) / 10 : 94
  const waistChartData = waistFiltered.map(e => ({ label: fmtDate(e.date), waist: waistDisplay(e.cm) }))
  const waistDelta = delta(waistDisplay(waistLatest?.cm), waistDisplay(waistFirst?.cm))

  // ── Grip Strength ───────────────────────────────────────────────────────────
  const gripAll = getGripHistory()
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

  const vo2History = data?.vo2MaxHistory || []
  const vo2Filtered = cutoff ? vo2History.filter(d => d.date >= cutoff) : vo2History
  const vo2ChartData = vo2Filtered.map(d => ({ label: fmtDate(d.date), vo2: d.vo2Max }))
  const vo2Latest = vo2History.at(-1)
  const vo2First = vo2Filtered[0]
  const vo2Delta = delta(vo2Latest?.vo2Max, vo2First?.vo2Max)

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} to="chronos" />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>VITALS</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Vitals history</h1>
      <p style={{ fontFamily: SERIF, fontSize: 13, color: C.faint, marginTop: 2 }}>Manually tracked measurements</p>

      {/* Range selector */}
      <div className="mt-6">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {/* Blood Pressure */}
      <VitalCard title="Blood Pressure" count={bpFiltered.length}>
        <div className="flex items-baseline gap-2 mb-1">
          <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: C.ink }}>
            {bpLatest ? `${bpLatest.sys}/${bpLatest.dia}` : '—'}
          </p>
          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>mmHg</span>
          {bpSysDelta != null && (
            <DeltaChip value={bpSysDelta} unit="" lowerIsBetter />
          )}
        </div>
        {avgSys != null && (
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginBottom: 14 }}>10-reading avg: {avgSys}/{avgDia} mmHg</p>
        )}
        {bpChartData.length >= 2 && (
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
        )}
        <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Red = systolic · Blue = diastolic · Dashed at 120/80</p>
      </VitalCard>

      {/* Body Weight */}
      <VitalCard title="Body Weight" count={weightFiltered.length}>
        <div className="flex items-baseline gap-2 mb-4">
          <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: C.ink }}>
            {weightDisplay(weightLatest?.kg) ?? '—'}
          </p>
          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{imperial ? 'lbs' : 'kg'}</span>
          {weightDelta != null && <DeltaChip value={weightDelta} unit={imperial ? ' lbs' : ' kg'} lowerIsBetter />}
        </div>
        {weightChartData.length >= 2 && (
          <LineGraph data={weightChartData} dataKey="weight" color="#9B7FD4" unit={imperial ? ' lbs' : ' kg'} height={90} />
        )}
      </VitalCard>

      {/* Body Fat & Lean Mass — only if fat % data exists */}
      {bfFiltered.length > 0 && (
        <VitalCard title="Body Composition" count={bfFiltered.length}>
          <div className="flex gap-6 mb-4">
            <div className="flex-1">
              <Label>Body Fat</Label>
              <p style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: C.ink, marginTop: 2 }}>{bfLatest?.fatPct ?? '—'}<span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginLeft: 4 }}>%</span></p>
              {bfDelta != null && <DeltaChip value={bfDelta} unit="%" lowerIsBetter />}
            </div>
            <div className="flex-1">
              <Label>Lean Mass</Label>
              <p style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: C.ink, marginTop: 2 }}>{leanDisplay(leanLatest) ?? '—'}<span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginLeft: 4 }}>{imperial ? 'lbs' : 'kg'}</span></p>
              {leanDelta != null && <DeltaChip value={leanDelta} unit={imperial ? ' lbs' : ' kg'} lowerIsBetter={false} />}
            </div>
          </div>
          {bfChartData.length >= 2 && (
            <>
              <Label style={{ marginBottom: 6, display: 'block' }}>Body Fat % Trend</Label>
              <LineGraph data={bfChartData} dataKey="fatPct" color="#D9A23F" unit="%" height={80} />
            </>
          )}
          {leanChartData.length >= 2 && (
            <div className="mt-3">
              <Label style={{ marginBottom: 6, display: 'block' }}>Lean Mass Trend</Label>
              <LineGraph data={leanChartData} dataKey="lean" color="#3E9C7E" unit={weightUnit} height={80} />
            </div>
          )}
        </VitalCard>
      )}

      {/* Waist Circumference */}
      <VitalCard title="Waist Circumference" count={waistFiltered.length}>
        <div className="flex items-baseline gap-2 mb-4">
          <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: C.ink }}>
            {waistDisplay(waistLatest?.cm) ?? '—'}
          </p>
          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{imperial ? 'in' : 'cm'}</span>
          {waistDelta != null && <DeltaChip value={waistDelta} unit={waistUnit} lowerIsBetter />}
        </div>
        {waistChartData.length >= 2 && (
          <LineGraph data={waistChartData} dataKey="waist" color="#D9A23F" unit={waistUnit} height={90} reference={waistRef} />
        )}
        <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Dashed line = {waistRef}{waistUnit.trim()} metabolic risk threshold (men)</p>
      </VitalCard>

      {/* Grip Strength */}
      <VitalCard title="Grip Strength" count={gripFiltered.length}>
        <div className="flex items-baseline gap-2 mb-4">
          <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: C.ink }}>
            {gripDisplay(gripLatest?.kg) ?? '—'}
          </p>
          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{imperial ? 'lbs' : 'kg'}</span>
          {gripDelta != null && <DeltaChip value={gripDelta} unit={gripUnit} lowerIsBetter={false} />}
        </div>
        {gripChartData.length >= 2 && (
          <LineGraph data={gripChartData} dataKey="grip" color="#3E9C7E" unit={gripUnit} height={90} reference={gripNormDisplay} />
        )}
        <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Dashed line = age-adjusted norm for men (Dodds 2014)</p>
      </VitalCard>

      {/* Divider: Fitbit-derived */}
      {(rhrFiltered.length > 0 || hrvFiltered.length > 0 || vo2Filtered.length > 0) && (
        <div className="flex items-center gap-3 mt-9">
          <div style={{ flex: 1, height: 1, background: C.rule }} />
          <Label>From Fitbit Air</Label>
          <div style={{ flex: 1, height: 1, background: C.rule }} />
        </div>
      )}

      {/* Resting Heart Rate */}
      {rhrFiltered.length > 0 && (
        <VitalCard title="Resting Heart Rate" count={rhrFiltered.length}>
          <div className="flex items-baseline gap-2 mb-4">
            <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: C.ink }}>{rhrLatest?.rhr ?? '—'}</p>
            <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>bpm</span>
            {rhrDelta != null && <DeltaChip value={rhrDelta} unit=" bpm" lowerIsBetter />}
          </div>
          {rhrChartData.length >= 2 && (
            <LineGraph data={rhrChartData} dataKey="rhr" color="#ef4444" unit=" bpm" height={90} reference={60} />
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Dashed = 60 bpm · Lower is generally better at rest</p>
        </VitalCard>
      )}

      {/* HRV */}
      {hrvFiltered.length > 0 && (
        <VitalCard title="HRV Baseline" count={hrvFiltered.length}>
          <div className="flex items-baseline gap-2 mb-4">
            <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: C.ink }}>{hrvLatest?.hrv ?? '—'}</p>
            <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>ms</span>
            {hrvDelta != null && <DeltaChip value={hrvDelta} unit=" ms" lowerIsBetter={false} />}
          </div>
          {hrvChartData.length >= 2 && (
            <LineGraph data={hrvChartData} dataKey="hrv" color="#3E9C7E" unit=" ms" height={90} />
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Higher is better · Fitbit overnight rmsSD</p>
        </VitalCard>
      )}

      {/* VO2 Max */}
      {vo2Filtered.length > 0 && (
        <VitalCard title="VO₂ Max" count={vo2Filtered.length}>
          <div className="flex items-baseline gap-2 mb-4">
            <p style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: C.ink }}>{vo2Latest?.vo2Max ?? '—'}</p>
            <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>ml/kg/min</span>
            {vo2Delta != null && <DeltaChip value={vo2Delta} unit="" lowerIsBetter={false} />}
          </div>
          {vo2ChartData.length >= 2 && (
            <LineGraph data={vo2ChartData} dataKey="vo2" color="#a78bfa" unit=" ml/kg/min" height={90} />
          )}
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Estimated by Fitbit · Higher is better</p>
        </VitalCard>
      )}

      {/* Empty state when no data at all */}
      {bpAll.length === 0 && weightAll.length === 0 && gripAll.length === 0 && waistAll.length === 0 && (
        <div className="mt-9 mb-4 text-center" style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 24 }}>
          <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 4 }}>No vitals logged yet</p>
          <p style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>Open Settings to log your first blood pressure, weight, grip strength, and waist measurements.</p>
        </div>
      )}

      <div className="mb-4" />
    </div>
  )
}
