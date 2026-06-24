import ScoreRing from '../components/ScoreRing'
import { LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { getStressColor, getStressLabel, localToday } from '../lib/calculations'
import { C, SERIF, Label, BackLink, SectionLabel, Note, norm } from '../lib/almanacTheme'

export default function Stress({ data, onNav }) {
  const { stressScore = 0, todayHRV = 0, todayRHR = 0, hrvHistory = [], rhrHistory = [], historyDates = [], daytimeStress } = data

  const color = getStressColor(stressScore)
  const label = getStressLabel(stressScore)

  const hrv14 = hrvHistory.slice(-14)
  const avgHRV14 = hrv14.filter(Boolean).reduce((a, b) => a + b, 0) / (hrv14.filter(Boolean).length || 1)
  const avgRHR14 = rhrHistory.slice(-14).filter(Boolean).reduce((a, b) => a + b, 0) / (rhrHistory.slice(-14).filter(Boolean).length || 1)

  const hrvRatio = todayHRV > 0 && avgHRV14 > 0 ? Math.round((todayHRV / avgHRV14) * 100) : null
  const rhrDiff = Math.round(todayRHR - avgRHR14)

  const todayStr = localToday()
  const dates14 = historyDates.slice(-14)
  const stressChartData = hrv14.map((v, i) => {
    const d = dates14[i]
    const lbl = !d ? (i === hrv14.length - 1 ? 'Today' : `-${hrv14.length - 1 - i}d`)
      : d === todayStr ? 'Today' : `-${Math.round((new Date(todayStr) - new Date(d)) / 86400000)}d`
    return { label: lbl, hrv: Math.round(v) }
  })

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>STRESS</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Body stress level</h1>

      <div className="flex items-center gap-8 mt-6">
        <ScoreRing score={stressScore} color={color} size={120} label={label} />
        <div className="flex-1 space-y-4">
          <div>
            <Label>HRV vs baseline</Label>
            <p style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: hrvRatio == null ? C.faint : hrvRatio >= 100 ? '#3E9C7E' : '#D9A23F' }}>{hrvRatio == null ? '—' : `${hrvRatio}%`}</p>
          </div>
          <div>
            <Label>Resting HR vs baseline</Label>
            <p style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: rhrDiff <= 0 ? '#3E9C7E' : '#ef4444' }}>{rhrDiff > 0 ? '+' : ''}{rhrDiff} bpm</p>
          </div>
        </div>
      </div>

      {/* Stress scale */}
      <div className="mt-9">
        <SectionLabel>Stress Scale</SectionLabel>
        <div style={{ position: 'relative', height: 14, marginTop: 12 }}>
          <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: C.rule }} />
          <div style={{ position: 'absolute', top: 0, left: `${Math.min(96, Math.max(2, stressScore))}%`, transform: 'translateX(-50%)' }}>
            <svg width="12" height="14" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={color} /></svg>
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <Label style={{ fontSize: 11 }}>Low</Label>
          <Label style={{ fontSize: 11 }}>Moderate</Label>
          <Label style={{ fontSize: 11 }}>High</Label>
          <Label style={{ fontSize: 11 }}>Very High</Label>
        </div>
      </div>

      {/* Inputs */}
      <div className="mt-9">
        <SectionLabel>Inputs</SectionLabel>
        <div className="mt-1">
          <StatRow label="Today's HRV" value={todayHRV} unit="ms" />
          <StatRow label="14-Day HRV Average" value={Math.round(avgHRV14)} unit="ms" />
          <StatRow label="Today's Resting HR" value={todayRHR} unit="bpm" />
          <StatRow label="14-Day RHR Average" value={Math.round(avgRHR14)} unit="bpm" />
        </div>
      </div>

      {/* HRV trend */}
      <div className="mt-9">
        <SectionLabel>HRV Trend</SectionLabel>
        <div className="mt-3"><LineGraph data={stressChartData} dataKey="hrv" color={color} unit="ms" reference={Math.round(avgHRV14)} height={100} /></div>
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 4 }}>Dashed line = 14-day baseline</p>
      </div>

      {/* Daytime stress */}
      {daytimeStress && (
        <div className="mt-9">
          <SectionLabel>Daytime Autonomic Load</SectionLabel>
          <div className="flex items-center gap-6 mt-4">
            <div>
              <p style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: daytimeStress.score < 35 ? '#3E9C7E' : daytimeStress.score < 65 ? '#D9A23F' : '#ef4444' }}>
                {daytimeStress.score}
              </p>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>
                {daytimeStress.score < 35 ? 'Low — calm day' : daytimeStress.score < 65 ? 'Moderate — some tension' : 'High — stressed day'}
              </p>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <Label style={{ fontSize: 11 }}>Avg waking HR</Label>
                <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600 }}>{daytimeStress.avgHR} bpm</span>
              </div>
              <div className="flex justify-between">
                <Label style={{ fontSize: 11 }}>Above resting HR</Label>
                <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: daytimeStress.delta < 5 ? '#3E9C7E' : '#D9A23F' }}>+{daytimeStress.delta} bpm</span>
              </div>
            </div>
          </div>
          <div style={{ height: 3, marginTop: 12, background: C.ruleSoft }}>
            <div style={{ height: 3, width: `${daytimeStress.score}%`, background: daytimeStress.score < 35 ? '#3E9C7E' : daytimeStress.score < 65 ? '#D9A23F' : '#ef4444' }} />
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>Measured from waking HR vs your resting HR, excluding exercise periods.</p>
        </div>
      )}

      <div className="mt-9 mb-4">
        <Note>
          Overnight stress reflects HRV (60%) and resting HR (40%) vs your 14-day baselines — your nervous system's
          recovery quality. Daytime load measures how elevated your HR stays during waking hours vs your RHR, a proxy
          for sympathetic nervous system activation throughout the day.
        </Note>
      </div>
    </div>
  )
}
