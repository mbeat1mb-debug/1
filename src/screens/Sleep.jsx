import { useState } from 'react'
import ScoreRing from '../components/ScoreRing'
import { BarGraph, LineGraph } from '../components/TrendChart'
import { StatRow } from '../components/MetricCard'
import { calculateSleepDebt, calculateOptimalSleepWindow, parseSleepArchitecture, getSleepStageNorms, getUserAge, calculateChronotype, calculateSleepDebtPayback, localDateOf } from '../lib/calculations'
import { getSleepTimeOverride, saveSleepTimeOverride, clearSleepTimeOverride } from '../lib/storage'
import { C, SERIF, STAGE, Label, BackLink, SectionLabel, Note } from '../lib/almanacTheme'

function SleepStageBar({ label, minutes, total, color }) {
  const pct = total > 0 ? (minutes / total) * 100 : 0
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`
  return (
    <div>
      <div className="flex justify-between items-baseline">
        <Label style={{ fontSize: 12 }}>{label}</Label>
        <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: C.ink }}>{timeStr}</span>
      </div>
      <div style={{ height: 4, marginTop: 6, background: C.ruleSoft }}>
        <div style={{ height: 4, width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function Hypnogram({ hypnogram }) {
  if (!hypnogram?.length) return null
  const minMs = hypnogram[0].startMs
  const maxMs = hypnogram[hypnogram.length - 1].endMs
  const spanMs = maxMs - minMs
  if (spanMs <= 0) return null

  const STAGE_Y  = { wake: 0, rem: 20, light: 40, deep: 60 }
  const COLORS   = { deep: STAGE.deep, rem: STAGE.rem, light: STAGE.light, wake: STAGE.wake }
  const W = 980

  return (
    <svg viewBox={`0 0 1000 80`} width="100%" style={{ display: 'block' }}>
      {[['W', 0], ['R', 20], ['L', 40], ['D', 60]].map(([l, y]) => (
        <text key={l} x={2} y={y + 15} fontSize={9} fill={C.faint} fontFamily={SERIF}>{l}</text>
      ))}
      {hypnogram.map((seg, i) => {
        const x = 20 + ((seg.startMs - minMs) / spanMs) * W
        const w = Math.max(1, (seg.seconds * 1000 / spanMs) * W)
        return (
          <rect key={i} x={x} y={STAGE_Y[seg.level] ?? 40} width={w} height={20}
            fill={COLORS[seg.level] || C.faint} opacity={0.9} />
        )
      })}
    </svg>
  )
}

// Format ISO datetime or HH:MM string → "h:mm AM/PM"
function fmtSleepTime(iso) {
  if (!iso) return '--'
  try { return new Date(iso.includes('T') ? iso : `2000-01-01T${iso}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '--' }
}

export default function Sleep({ data, onNav }) {
  const { todaySleep, sleepHistory = [], todayBR = 0 } = data

  const sleepScore = data.sleepScore || 0
  const sleepColor = sleepScore >= 75 ? STAGE.rem : sleepScore >= 50 ? '#D9A23F' : '#ef4444'

  // Google Health sleep points are normalized to flat deepMinutes/remMinutes/
  // minutesAwake fields (see normalizeSleepPoint in calculations.js) — fall
  // back to the old Fitbit levels.summary shape for any cached/legacy data.
  const stages = todaySleep?.levels?.summary || {}
  const deep = todaySleep?.deepMinutes ?? (stages.deep?.minutes || stages.deepSleep?.minutes || 0)
  const rem = todaySleep?.remMinutes ?? (stages.rem?.minutes || 0)
  const wake = todaySleep?.minutesAwake ?? (stages.wake?.minutes || stages.awake?.minutes || 0)
  const totalMins = todaySleep?.minutesAsleep || 0
  const light = todaySleep?.deepMinutes != null
    ? Math.max(0, totalMins - deep - rem)
    : (stages.light?.minutes || stages.lightSleep?.minutes || 0)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60

  const sleepDate = todaySleep?.date ?? localDateOf(new Date())
  const [override, setOverride] = useState(() => getSleepTimeOverride(sleepDate))
  const [editingBed, setEditingBed] = useState(false)
  const [editingWake, setEditingWake] = useState(false)

  const displayBed = override?.bed
    ? fmtSleepTime(override.bed)
    : fmtSleepTime(todaySleep?.startTime)
  const displayWake = override?.wake
    ? fmtSleepTime(override.wake)
    : fmtSleepTime(todaySleep?.endTime)

  // If override exists, recalculate minutesAsleep from the corrected window
  const correctedMins = override?.bed && override?.wake
    ? (() => {
        const bed = new Date(`2000-01-01T${override.bed}`)
        const wake = new Date(`2000-01-01T${override.wake}`)
        let mins = (wake - bed) / 60000
        if (mins < 0) mins += 24 * 60  // crosses midnight
        const awake = todaySleep?.minutesAwake || 0
        return Math.max(0, Math.round(mins - awake))
      })()
    : null

  const displayMins = correctedMins ?? totalMins
  const displayHours = Math.floor(displayMins / 60)
  const displayMinRemainder = displayMins % 60

  // Apply correction to today's entry so debt and chart reflect the edited time
  const adjustedSleepHistory = correctedMins !== null
    ? sleepHistory.map(s => s.date === sleepDate ? { ...s, minutes: correctedMins } : s)
    : sleepHistory

  const sleepDebt = calculateSleepDebt(adjustedSleepHistory)
  const chronotype = calculateChronotype(adjustedSleepHistory)
  const sleepDebtPayback = calculateSleepDebtPayback(sleepDebt, adjustedSleepHistory)

  const todayStr = localDateOf(new Date())
  const sleepChartData = adjustedSleepHistory.slice(-14).map(s => ({
    label: s.date === todayStr ? 'Today' : `-${Math.round((new Date(todayStr) - new Date(s.date)) / 86400000)}d`,
    hours: Math.round((s.minutes / 60) * 10) / 10,
  }))

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>SLEEP</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Last night's sleep</h1>

      {!todaySleep && (
        <div className="mt-9 text-center">
          <p style={{ fontFamily: SERIF, fontSize: 16, color: C.inkSoft }}>No sleep data yet</p>
          <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 4 }}>Make sure Google Health synced after waking up.</p>
        </div>
      )}

      {/* Main score */}
      {todaySleep && (
        <>
          <div className="flex items-center gap-6 mt-6">
            <ScoreRing score={sleepScore} color={sleepColor} size={120} unit="%" />
            <div className="flex-1">
              <p style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 700, color: C.ink }}>{displayHours}h {displayMinRemainder}m</p>
              <Label>Time asleep</Label>
              {correctedMins !== null && (
                <p style={{ fontFamily: SERIF, fontSize: 11, color: '#D9A23F', marginTop: 4, fontStyle: 'italic' }}>Synced: {hours}h {mins}m · edited</p>
              )}
              <p style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: sleepColor, marginTop: 8 }}>
                {sleepScore >= 75 ? 'Great' : sleepScore >= 50 ? 'Fair' : 'Poor'}
              </p>
            </div>
          </div>

          {/* Bed / Wake times with inline editing */}
          <div className="grid grid-cols-2 gap-6 mt-5">
            <div>
              <Label style={{ fontSize: 11 }}>Bedtime</Label>
              {editingBed ? (
                <input
                  type="time"
                  defaultValue={override?.bed ?? (todaySleep?.startTime ? todaySleep.startTime.slice(11, 16) : '')}
                  autoFocus
                  className="bg-transparent outline-none w-full"
                  style={{ colorScheme: 'light', fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: C.ink, marginTop: 2 }}
                  onBlur={e => {
                    const val = e.target.value
                    if (val) {
                      const next = { ...(override || {}), bed: val }
                      saveSleepTimeOverride(sleepDate, next.bed, next.wake)
                      setOverride(next)
                    }
                    setEditingBed(false)
                  }}
                />
              ) : (
                <button className="flex items-baseline gap-2 mt-0.5" onClick={() => setEditingBed(true)}>
                  <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: C.ink }}>{displayBed}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>edit</span>
                </button>
              )}
            </div>
            <div>
              <Label style={{ fontSize: 11 }}>Wake Time</Label>
              {editingWake ? (
                <input
                  type="time"
                  defaultValue={override?.wake ?? (todaySleep?.endTime ? todaySleep.endTime.slice(11, 16) : '')}
                  autoFocus
                  className="bg-transparent outline-none w-full"
                  style={{ colorScheme: 'light', fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: C.ink, marginTop: 2 }}
                  onBlur={e => {
                    const val = e.target.value
                    if (val) {
                      const next = { ...(override || {}), wake: val }
                      saveSleepTimeOverride(sleepDate, next.bed, next.wake)
                      setOverride(next)
                    }
                    setEditingWake(false)
                  }}
                />
              ) : (
                <button className="flex items-baseline gap-2 mt-0.5" onClick={() => setEditingWake(true)}>
                  <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: C.ink }}>{displayWake}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>edit</span>
                </button>
              )}
            </div>
          </div>
          {override && (
            <button
              onClick={() => { clearSleepTimeOverride(sleepDate); setOverride(null) }}
              style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, textDecoration: 'underline', marginTop: 10 }}
            >
              Reset to synced times
            </button>
          )}
        </>
      )}

      {/* Sleep stages + metrics — only when data exists */}
      {todaySleep && (
        <>
          <div className="mt-9">
            <SectionLabel>Sleep Stages</SectionLabel>
            <div className="mt-4 space-y-4">
              <SleepStageBar label="Deep (Restorative)" minutes={deep} total={displayMins} color={STAGE.deep} />
              <SleepStageBar label="REM (Dream)" minutes={rem} total={displayMins} color={STAGE.rem} />
              <SleepStageBar label="Light" minutes={light} total={displayMins} color={STAGE.light} />
              <SleepStageBar label="Awake" minutes={wake} total={displayMins} color={STAGE.wake} />
            </div>
          </div>

          {todaySleep?.stageSegments?.length > 0 && (() => {
            const arch = parseSleepArchitecture(todaySleep)
            if (!arch?.hypnogram?.length) return null
            return (
              <div className="mt-9">
                <SectionLabel>Hypnogram</SectionLabel>
                <div className="flex gap-3 justify-end mt-3">
                  {[['Deep', STAGE.deep], ['REM', STAGE.rem], ['Light', STAGE.light], ['Wake', STAGE.wake]].map(([l, c]) => (
                    <span key={l} className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, background: c, borderRadius: 2, display: 'inline-block' }} />
                      <Label style={{ fontSize: 11 }}>{l}</Label>
                    </span>
                  ))}
                </div>
                <div className="mt-2"><Hypnogram hypnogram={arch.hypnogram} /></div>
                <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 8 }}>W=Wake · R=REM · L=Light · D=Deep</p>
              </div>
            )
          })()}

          <div className="mt-9">
            <SectionLabel>Metrics</SectionLabel>
            <div className="mt-1">
              <StatRow label="Sleep Efficiency" value={todaySleep.efficiency ?? '--'} unit="%" color={sleepColor} />
              <StatRow label="Sleep Score" value={sleepScore} unit="/ 100" color={sleepColor} />
              <StatRow label="Respiratory Rate" value={todayBR} unit="br/min" />
              <StatRow label="Wakeups" value={(() => {
                const arch = parseSleepArchitecture(todaySleep)
                return arch ? arch.fullAwakenings + arch.briefAwakenings : '--'
              })()} />
            </div>
          </div>

          {todaySleep?.stageSegments?.length > 0 && (() => {
            const arch = parseSleepArchitecture(todaySleep)
            if (!arch?.hypnogram?.length) return null
            const latColor  = arch.sleepLatency <= 20 ? '#3E9C7E' : arch.sleepLatency <= 30 ? '#D9A23F' : '#ef4444'
            const wakeColor = arch.minutesAwake  <= 30 ? '#3E9C7E' : arch.minutesAwake  <= 45 ? '#D9A23F' : '#ef4444'
            return (
              <div className="mt-9">
                <SectionLabel>Sleep Architecture</SectionLabel>
                <div className="mt-1">
                  <StatRow label="Sleep Onset Latency" value={arch.sleepLatency} unit="min" color={latColor} />
                  <StatRow label="Time Awake"          value={arch.minutesAwake} unit="min" color={wakeColor} />
                  <StatRow label="Sleep Cycles"        value={arch.cycleCount > 0 ? arch.cycleCount : '--'} color={STAGE.rem} />
                  <StatRow label="Full Awakenings"     value={arch.fullAwakenings} />
                  <StatRow label="Brief Awakenings"    value={arch.briefAwakenings} />
                </div>
              </div>
            )
          })()}

          {todaySleep?.stageSegments?.length > 0 && (() => {
            const arch  = parseSleepArchitecture(todaySleep)
            if (!arch?.hypnogram?.length) return null
            const age   = getUserAge()
            const norms = getSleepStageNorms(age)
            const totalMinsN = todaySleep.minutesAsleep || 0
            const deepMins  = todaySleep.deepMinutes || 0
            const remMins   = todaySleep.remMinutes || 0
            const deepPct   = totalMinsN > 0 ? Math.round(deepMins / totalMinsN * 100) : 0
            const remPct    = totalMinsN > 0 ? Math.round(remMins  / totalMinsN * 100) : 0
            const deepColor = deepPct >= norms.deepPct ? '#3E9C7E' : deepPct >= norms.deepPct * 0.7 ? '#D9A23F' : '#ef4444'
            const remColor  = remPct  >= norms.remPct  ? '#3E9C7E' : remPct  >= norms.remPct  * 0.7 ? '#D9A23F' : '#ef4444'
            return (
              <div className="mt-9">
                <SectionLabel>vs Age-Adjusted Norms</SectionLabel>
                <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>Ohayon 2004 meta-analysis · males age {age}</p>
                <div className="mt-4 space-y-4">
                  {[
                    { label: 'Deep Sleep', yours: deepPct, norm: norms.deepPct, color: deepColor, unit: '%' },
                    { label: 'REM Sleep',  yours: remPct,  norm: norms.remPct,  color: remColor,  unit: '%' },
                  ].map(({ label, yours, norm, color, unit }) => (
                    <div key={label}>
                      <div className="flex justify-between items-baseline">
                        <Label style={{ fontSize: 12 }}>{label}</Label>
                        <span>
                          <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color }}>{yours}{unit}</span>
                          <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}> / norm {norm}{unit}</span>
                        </span>
                      </div>
                      <div style={{ height: 4, marginTop: 6, background: C.ruleSoft }}>
                        {(() => { const w = Math.min(100, (yours / (norm * 1.5)) * 100); return (
                          <div style={{ height: 4, width: `${w}%`, background: color }} />
                        ) })()}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-6 mt-1">
                    <div>
                      <Label style={{ fontSize: 11 }}>Sleep Onset Latency</Label>
                      <p style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: C.ink, marginTop: 2 }}>{arch.sleepLatency}<span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}> min</span></p>
                      <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>Norm &lt;{norms.solMins} min</p>
                    </div>
                    <div>
                      <Label style={{ fontSize: 11 }}>Time Awake</Label>
                      <p style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: C.ink, marginTop: 2 }}>{arch.minutesAwake}<span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}> min</span></p>
                      <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint }}>Norm &lt;{norms.wasoMins} min</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {(() => {
            const arch = parseSleepArchitecture(todaySleep)
            if (!arch || arch.cycleCount === 0) return null
            return (
              <div className="mt-9">
                <SectionLabel>Sleep Architecture Split</SectionLabel>
                <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 6 }}>Borbely two-process model — deep front-loads, REM back-loads</p>
                <div className="grid grid-cols-2 gap-6 mt-4">
                  <div>
                    <Label style={{ fontSize: 11 }}>First half</Label>
                    <p style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft, marginTop: 6 }}><span style={{ fontWeight: 700, color: STAGE.deep }}>{arch.firstHalfDeepMins}m</span> deep</p>
                    <p style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft }}><span style={{ fontWeight: 700, color: STAGE.rem }}>{arch.firstHalfRemMins}m</span> REM</p>
                    {arch.deepFrontLoaded && <p style={{ fontFamily: SERIF, fontSize: 11, color: '#3E9C7E', marginTop: 4 }}>Deep front-loaded ✓</p>}
                  </div>
                  <div>
                    <Label style={{ fontSize: 11 }}>Second half</Label>
                    <p style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft, marginTop: 6 }}><span style={{ fontWeight: 700, color: STAGE.deep }}>{arch.secondHalfDeepMins}m</span> deep</p>
                    <p style={{ fontFamily: SERIF, fontSize: 13, color: C.inkSoft }}><span style={{ fontWeight: 700, color: STAGE.rem }}>{arch.secondHalfRemMins}m</span> REM</p>
                    {arch.remBackLoaded && <p style={{ fontFamily: SERIF, fontSize: 11, color: '#3E9C7E', marginTop: 4 }}>REM back-loaded ✓</p>}
                  </div>
                </div>
                <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 12 }}>
                  {arch.deepFrontLoaded && arch.remBackLoaded
                    ? 'Healthy architecture. Deep sleep concentrating early, REM enriching the back half.'
                    : !arch.deepFrontLoaded
                    ? 'Deep sleep not concentrating in first half — alcohol, late eating, or stress can shift SWS later.'
                    : 'REM not concentrating in second half — consistent sleep times strengthen circadian REM drive.'}
                </p>
              </div>
            )
          })()}
        </>
      )}

      {/* 14-day trend */}
      <div className="mt-9">
        <SectionLabel>Sleep Duration — 14 Days</SectionLabel>
        <div className="mt-3"><BarGraph data={sleepChartData} dataKey="hours" color={STAGE.rem} unit="h" height={100} /></div>
        <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 8, textAlign: 'center' }}>Target: 7.5–9 hrs</p>
      </div>

      {/* Sleep Debt */}
      {(() => {
        const debt = sleepDebt
        const debtColor = debt >= 5 ? '#ef4444' : debt >= 2 ? '#D9A23F' : '#3E9C7E'
        return (
          <div className="mt-9">
            <SectionLabel>7-Day Sleep Debt</SectionLabel>
            <div className="flex items-baseline gap-2 mt-4">
              <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: debtColor }}>{debt}h</span>
              <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{debt === 0 ? 'fully caught up' : 'owed this week'}</span>
            </div>
            {sleepDebtPayback != null && (
              <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 6 }}>
                At current pace, clear in <span style={{ color: C.ink, fontWeight: 600 }}>{sleepDebtPayback} {sleepDebtPayback === 1 ? 'night' : 'nights'}</span>
              </p>
            )}
            <div style={{ height: 4, marginTop: 10, background: C.ruleSoft }}>
              <div style={{ height: 4, width: `${Math.min(100, (debt / 10) * 100)}%`, background: debtColor }} />
            </div>
            <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 10 }}>
              {debt === 0
                ? 'No debt — your body is fully rested.'
                : debt < 2
                ? 'Minor debt. One good night recovers this.'
                : `Add ${Math.ceil(debt / 7 * 60)} extra minutes per night to break even by end of week.`}
            </p>
          </div>
        )
      })()}

      {/* Optimal Sleep Window */}
      {(() => {
        const window = calculateOptimalSleepWindow(sleepHistory)
        if (!window) return (
          <div className="mt-9">
            <SectionLabel>Optimal Sleep Window</SectionLabel>
            <p style={{ fontFamily: SERIF, fontSize: 14, color: C.faint, marginTop: 8 }}>Need 7+ nights of data to calculate your natural window.</p>
          </div>
        )
        const consistencyColor = window.consistency >= 75 ? '#3E9C7E' : window.consistency >= 50 ? '#D9A23F' : '#ef4444'
        return (
          <div className="mt-9">
            <SectionLabel>Your Natural Sleep Window</SectionLabel>
            <div className="flex justify-around text-center mt-5">
              <div>
                <Label style={{ fontSize: 11 }}>Target Bedtime</Label>
                <p style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: C.ink, marginTop: 4 }}>{window.bedtime}</p>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 19, color: C.faint, alignSelf: 'center' }}>→</div>
              <div>
                <Label style={{ fontSize: 11 }}>Natural Wake</Label>
                <p style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: C.ink, marginTop: 4 }}>{window.wakeTime}</p>
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-5">
              <Label style={{ fontSize: 12 }}>Consistency score</Label>
              <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: consistencyColor }}>{window.consistency}%</span>
            </div>
            <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 8 }}>
              {window.consistency >= 75
                ? 'Great consistency. Your body has a stable rhythm — protect it.'
                : 'Irregular sleep schedule detected. Staying within 30 min of your target adds ~20% recovery quality.'}
            </p>
          </div>
        )
      })()}

      {chronotype && (
        <div className="mt-9">
          <SectionLabel>Chronotype</SectionLabel>
          <div className="mt-4">
            <p style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 700, color: C.ink }}>{chronotype.type}</p>
            <p style={{ fontFamily: SERIF, fontSize: 14, color: C.faint, marginTop: 2 }}>Sleep midpoint: {chronotype.timeStr}</p>
            <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 6 }}>
              {chronotype.type === 'Morning' && 'Natural early riser — align wake time with light exposure'}
              {chronotype.type === 'Neutral' && 'Intermediate chronotype — flexible sleep timing'}
              {chronotype.type === 'Evening' && 'Natural night owl — avoid early morning hard training'}
            </p>
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 10 }}>Based on average sleep midpoint over last 30 nights (Roenneberg MCTQ)</p>
        </div>
      )}

      {(() => {
        const scorePts = (data.calendarDays || [])
          .filter(d => d.sleep > 0 && d.sleepEfficiency > 0)
          .slice(-30)
          .map((d, i, arr) => {
            const score = Math.round(Math.min(100, (d.sleep / 480) * 70 + (d.sleepEfficiency / 100) * 30))
            const daysAgo = Math.round((new Date() - new Date(d.date + 'T12:00:00')) / 86400000)
            return { label: daysAgo === 0 ? 'Today' : `${daysAgo}d`, score }
          })
        if (scorePts.length < 5) return null
        return (
          <div className="mt-9">
            <SectionLabel>Sleep Score Trend</SectionLabel>
            <div className="mt-3"><LineGraph data={scorePts} dataKey="score" color={STAGE.rem} unit="%" height={90} /></div>
          </div>
        )
      })()}

      {/* Sleep tip */}
      <div className="mt-9 mb-4">
        <Note accent={STAGE.rem}>
          {deep < 60
            ? 'Deep sleep is low. Avoid alcohol and late meals — they suppress slow-wave sleep.'
            : rem < 90
            ? 'REM sleep is below optimal. Consistent sleep/wake times improve REM quality.'
            : 'Good sleep architecture. Maintain your current schedule to lock in the pattern.'}
        </Note>
      </div>
    </div>
  )
}
