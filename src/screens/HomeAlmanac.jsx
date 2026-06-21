import { useState, useCallback, useRef, useEffect } from 'react'
import { haptic } from '../lib/haptics'
import {
  getRecoveryColor, getStressLabel, getUserHeightCm, getUserUnits,
  calculateDistance, localToday, calculatePhysiologicalAge, getUserAge,
} from '../lib/calculations'
import { C, SERIF, STAGE, Label, mean, fmtDur, norm } from '../lib/almanacTheme'

// ── The Reading ───────────────────────────────────────────────────────────────
// Composes the day into a short written verdict + paragraph, deterministically
// from the data. Numbers are returned as emphasised tokens so they set in ink
// while the prose stays soft — the figures are the evidence, the words are the
// point. No randomness: the phrasing is measured, not mad-libbed.
function composeReading(data) {
  const tok = []
  const push = (t, em) => tok.push({ t, em: !!em })

  const sleep = data.todaySleep
  const mins = sleep?.minutesAsleep
  const eff = sleep?.efficiency
  const hrvVals = (data.hrvHistory || []).filter(Boolean)
  const prior = hrvVals.length > 3 ? hrvVals.slice(0, -1) : hrvVals
  const avgHRV = Math.round(mean(prior))
  const hrv = data.todayHRV || 0
  const rhr = data.todayRHR || 0
  const debt = data.sleepDebt ?? 0
  const form = data.trainingLoad?.form
  const rec = data.recoveryScore ?? 0
  const stress = data.stressScore ?? 0

  // Sleep clause
  if (mins) {
    let how = 'a night of rest'
    if (mins >= 450 && eff >= 88) how = 'a full, settled night'
    else if (mins >= 420) how = 'a decent night'
    else if (mins >= 360) how = 'a short night'
    else how = 'a broken, short night'
    push('You slept ')
    push(fmtDur(mins), true)
    push(` — ${how}`)
    if (eff) { push(' ('); push(`${eff}%`, true); push(' efficient). ') }
    else push('. ')
  }

  // Heart clause
  if (hrv) {
    const diff = avgHRV ? hrv - avgHRV : 0
    if (avgHRV && diff >= 4) push('Your heart variability rose to ')
    else if (avgHRV && diff <= -4) push('Your heart variability dipped to ')
    else push('Your heart variability settled at ')
    push(`${hrv} ms`, true)
    if (avgHRV) {
      if (diff >= 4) push(`, above your fortnight's rhythm of ${avgHRV}`)
      else if (diff <= -4) push(`, under your usual ${avgHRV}`)
      else push(', right on your usual rhythm')
    }
    if (rhr) { push(', with a resting pulse of '); push(`${rhr}`, true); push('. ') }
    else push('. ')
  }

  // Burden clause
  if (debt >= 3) { push('You’re carrying '); push(`${debt} hours`, true); push(' of sleep debt') }
  else if (debt >= 1) { push('A little debt has built up ('); push(`${debt}h`, true); push(')') }
  else push('You’re square on sleep')
  if (form) push(`, and the week’s training sits ${form.toLowerCase()}.`)
  else push('.')

  // Verdict
  let lede, close
  const loaded = form === 'Loaded' || form === 'Overreached'
  if (rec >= 70) {
    if (loaded) { lede = 'Strong, but loaded.'; close = 'There’s capacity today — just respect the load you’re already carrying.' }
    else { lede = 'A day to build.'; close = 'This is a day to ask something of yourself.' }
  } else if (rec >= 55) { lede = 'Move, don’t max.'; close = 'Keep it aerobic and conversational; leave the hard efforts for later in the week.' }
  else if (rec >= 40) { lede = 'Ease into it.'; close = 'Light movement and an early night will pay you back tomorrow.' }
  else { lede = 'A day to recover.'; close = 'Treat rest as the training today.' }
  if (stress >= 60) close = 'Your nervous system is running hot — ' + close.charAt(0).toLowerCase() + close.slice(1)

  push(' ')
  push(close)
  return { lede, tokens: tok }
}

// ── The Day Ribbon ────────────────────────────────────────────────────────────
// One continuous strip from last night's bedtime to now: sleep stages up top,
// daytime heart rate below, the same clock underneath both. This is the data
// the old card layout flattened away — intraday HR and per-stage sleep intervals
// shown on a single timeline instead of split into separate score cards.
function DayRibbon({ data }) {
  const sleep = data.todaySleep
  const now = Date.now()
  const sleepStart = sleep?.startTime ? new Date(sleep.startTime).getTime() : null
  const sleepEnd = sleep?.endTime ? new Date(sleep.endTime).getTime() : null
  // Window: a fixed 24h frame anchored to the local midnight that begins last
  // night's sleep (or today's, if none yet). A fixed span keeps the sleep
  // block's width constant through the day — anchoring to "now" instead would
  // shrink it hour by hour as the denominator grows, which is what made the
  // night look more and more compressed the later you checked the ribbon.
  const dayStart = new Date(sleepStart ?? now)
  dayStart.setHours(0, 0, 0, 0)
  const tMin = dayStart.getTime()
  const tMax = Math.max(tMin + 24 * 3600000, now + 3600000)
  const span = Math.max(tMax - tMin, 3600000)

  const W = 1000, H = 236
  const padL = 4, padR = 4
  const innerW = W - padL - padR
  const x = ms => padL + ((ms - tMin) / span) * innerW

  // Sleep lane — drawn as a hypnogram: depth is vertical position (awake on top,
  // deep at the bottom), not just colour, so the shape of the night reads at a
  // glance the way it does on a polysomnograph.
  const sleepTop = 12, rowH = 15, rowGap = 6, rowUnit = rowH + rowGap
  const LEVELS = ['wake', 'rem', 'light', 'deep']
  const levelIdx = t => {
    const k = t === 'awake' ? 'wake' : t
    const i = LEVELS.indexOf(k)
    return i < 0 ? 2 : i
  }
  const rowTop = lvl => sleepTop + levelIdx(lvl) * rowUnit
  const rowCenter = lvl => rowTop(lvl) + rowH / 2
  const segs = (sleep?.stageSegments || [])
    .map(s => ({ a: new Date(s.startTime).getTime(), b: new Date(s.endTime).getTime(), type: (s.type || '').toLowerCase() }))
    .filter(s => s.b > s.a)
    .sort((a, b) => a.a - b.a)
  const stageColor = t => STAGE[t === 'deep' ? 'deep' : t === 'rem' ? 'rem' : t === 'awake' || t === 'wake' ? 'wake' : 'light'] || STAGE.light
  // Stepped connector through the row centres — the recognisable hypnogram zig-zag.
  const stepPath = segs.length
    ? segs.map((s, i) => `${i ? 'L' : 'M'}${x(s.a).toFixed(1)} ${rowCenter(s.type).toFixed(1)} L${x(s.b).toFixed(1)} ${rowCenter(s.type).toFixed(1)}`).join(' ')
    : ''

  // HR lane
  const hrLaneTop = 124, hrLaneH = 86, hrBottom = hrLaneTop + hrLaneH
  const ds = data.hrIntradayData?.['activities-heart-intraday']?.dataset || []
  const today = new Date()
  const hrPts = ds.map(p => {
    const [hh, mm, ss] = (p.time || '0:0:0').split(':').map(Number)
    const d = new Date(today); d.setHours(hh || 0, mm || 0, ss || 0, 0)
    return { ms: d.getTime(), v: Number(p.value) }
  }).filter(p => p.v > 0 && p.ms >= tMin && p.ms <= tMax).sort((a, b) => a.ms - b.ms)
  // Downsample for a clean line
  const step = Math.max(1, Math.ceil(hrPts.length / 240))
  const hrThin = hrPts.filter((_, i) => i % step === 0)
  const hrVals = hrThin.map(p => p.v)
  const hrLo = hrVals.length ? Math.min(...hrVals) - 4 : 50
  const hrHi = hrVals.length ? Math.max(...hrVals) + 4 : 120
  const yHR = v => hrBottom - ((v - hrLo) / Math.max(hrHi - hrLo, 1)) * hrLaneH
  const linePath = hrThin.map((p, i) => `${i ? 'L' : 'M'}${x(p.ms).toFixed(1)} ${yHR(p.v).toFixed(1)}`).join(' ')
  const areaPath = hrThin.length
    ? `${linePath} L${x(hrThin.at(-1).ms).toFixed(1)} ${hrBottom} L${x(hrThin[0].ms).toFixed(1)} ${hrBottom} Z`
    : ''

  // Hour ticks every 3h
  const ticks = []
  const t0 = new Date(tMin); t0.setMinutes(0, 0, 0)
  for (let t = t0.getTime(); t <= tMax; t += 3 * 3600000) {
    if (t < tMin) continue
    const d = new Date(t)
    let h = d.getHours()
    const ap = h >= 12 ? 'p' : 'a'
    h = h % 12 || 12
    ticks.push({ ms: t, label: `${h}${ap}` })
  }

  const accent = getRecoveryColor(data.recoveryScore || 0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }} preserveAspectRatio="none">
      {/* hour grid */}
      {ticks.map(tk => (
        <line key={tk.ms} x1={x(tk.ms)} x2={x(tk.ms)} y1={sleepTop} y2={hrBottom} stroke={C.ruleSoft} strokeWidth={1} />
      ))}

      {/* sleep lane — hypnogram */}
      {segs.length ? (
        <>
          {stepPath && <path d={stepPath} fill="none" stroke={C.inkSoft} strokeWidth={1} opacity={0.3} />}
          {segs.map((s, i) => (
            <rect key={i} x={x(s.a)} y={rowTop(s.type)} width={Math.max(x(s.b) - x(s.a), 0.8)} height={rowH} rx={2}
              fill={stageColor(s.type)} opacity={s.type === 'wake' || s.type === 'awake' ? 0.55 : 0.92} />
          ))}
        </>
      ) : (sleepStart && sleepEnd) ? (
        <rect x={x(sleepStart)} y={rowTop('light')} width={Math.max(x(sleepEnd) - x(sleepStart), 1)} height={rowH} rx={2}
          fill={STAGE.asleep} opacity={0.7} />
      ) : null}

      {/* divider */}
      <line x1={padL} x2={W - padR} y1={hrLaneTop - 12} y2={hrLaneTop - 12} stroke={C.rule} strokeWidth={1} />

      {/* HR area + line, or a note when intraday HR hasn't synced */}
      {hrThin.length > 1 ? (
        <>
          <path d={areaPath} fill={accent} opacity={0.10} />
          <path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1={padL} x2={W - padR} y1={hrBottom - hrLaneH / 2} y2={hrBottom - hrLaneH / 2} stroke={C.rule} strokeWidth={1} strokeDasharray="3 5" />
          <text x={W / 2} y={hrBottom - hrLaneH / 2 - 8} textAnchor="middle" fill={C.faint} fontFamily={SERIF} fontStyle="italic" fontSize={15}>
            heart rate fills in as the day is recorded
          </text>
        </>
      )}

      {/* now marker */}
      <line x1={x(now)} x2={x(now)} y1={sleepTop - 4} y2={hrBottom} stroke={C.gold} strokeWidth={1.5} />
      <circle cx={x(now)} cy={sleepTop - 4} r={4} fill={C.gold} />

      {/* hour labels */}
      {ticks.map(tk => (
        <text key={tk.ms} x={x(tk.ms)} y={H - 4} textAnchor="middle" fill={C.faint} fontFamily={SERIF} fontSize={15}>
          {tk.label}
        </text>
      ))}
    </svg>
  )
}

function RibbonLegend({ data }) {
  const hasStages = (data.todaySleep?.stageSegments || []).length > 0
  const items = hasStages
    ? [['Deep', STAGE.deep], ['REM', STAGE.rem], ['Light', STAGE.light], ['Awake', STAGE.wake]]
    : [['Asleep', STAGE.asleep]]
  return (
    <div className="flex items-center gap-3 flex-wrap mt-1">
      {items.map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, background: c, borderRadius: 2, display: 'inline-block' }} />
          <Label style={{ fontSize: 11 }}>{l}</Label>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span style={{ width: 9, height: 2, background: getRecoveryColor(data.recoveryScore || 0), display: 'inline-block' }} />
        <Label style={{ fontSize: 11 }}>Heart rate</Label>
      </span>
    </div>
  )
}

// ── Instruments ───────────────────────────────────────────────────────────────
// A reading on a printed scale with a needle, not a ring. The needle is today;
// the faint mark is your baseline. Lower-is-better scales (resting pulse) read
// right-to-left so "good" is always toward the right.
function Instrument({ label, value, unit, sub, pos01, base01, accent }) {
  const p = Math.max(0, Math.min(1, pos01 ?? 0.5))
  const b = base01 == null ? null : Math.max(0, Math.min(1, base01))
  return (
    <div style={{ padding: '14px 2px' }}>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span style={{ fontFamily: SERIF, color: C.faint, fontSize: 11, fontStyle: 'italic' }}>{sub}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-0.5 mb-2">
        <span style={{ fontFamily: SERIF, fontSize: 30, color: C.ink, lineHeight: 1, fontWeight: 600 }} className="tabular">{value}</span>
        {unit && <span style={{ fontFamily: SERIF, fontSize: 13, color: C.faint }}>{unit}</span>}
      </div>
      {/* scale */}
      <div style={{ position: 'relative', height: 14 }}>
        <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 1, background: C.rule }} />
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} style={{ position: 'absolute', top: 4, left: `${t * 100}%`, width: 1, height: 6, background: C.ruleSoft }} />
        ))}
        {b != null && (
          <div style={{ position: 'absolute', top: 2, left: `${b * 100}%`, transform: 'translateX(-50%)', width: 1.5, height: 10, background: C.faint, opacity: 0.7 }} />
        )}
        {/* needle */}
        <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)' }}>
          <svg width="12" height="14" viewBox="0 0 12 14"><path d="M6 14 L1 4 Q6 0 11 4 Z" fill={accent} /></svg>
        </div>
      </div>
    </div>
  )
}

function Instruments({ data, onNav }) {
  const hrvVals = (data.hrvHistory || []).filter(Boolean)
  const hrvMin = hrvVals.length ? Math.min(...hrvVals) : 30
  const hrvMax = hrvVals.length ? Math.max(...hrvVals) : 90
  const hrvBase = mean(hrvVals)
  const hrv = data.todayHRV || 0

  const rhrVals = (data.rhrHistory || []).filter(Boolean)
  const rhrMin = rhrVals.length ? Math.min(...rhrVals) : 45
  const rhrMax = rhrVals.length ? Math.max(...rhrVals) : 70
  const rhrBase = mean(rhrVals)
  const rhr = data.todayRHR || 0

  const sMins = data.todaySleep?.minutesAsleep || 0
  const tsb = data.trainingLoad?.tsb ?? 0

  const accent = getRecoveryColor(data.recoveryScore || 0)

  const rows = [
    {
      key: 'recovery', label: 'Heart Variability', value: hrv || '--', unit: 'ms',
      sub: hrvBase ? `usual ${Math.round(hrvBase)}` : '',
      pos01: norm(hrv, hrvMin, hrvMax), base01: hrvBase ? norm(hrvBase, hrvMin, hrvMax) : null, accent,
    },
    {
      key: 'recovery', label: 'Resting Pulse', value: rhr || '--', unit: 'bpm',
      sub: rhrBase ? `usual ${Math.round(rhrBase)}` : '',
      // lower is better → invert so right = good
      pos01: 1 - norm(rhr, rhrMin, rhrMax), base01: rhrBase ? 1 - norm(rhrBase, rhrMin, rhrMax) : null, accent,
    },
    {
      key: 'sleep', label: 'Sleep', value: fmtDur(sMins), unit: '',
      sub: data.todaySleep?.efficiency ? `${data.todaySleep.efficiency}% eff.` : '',
      pos01: norm(sMins, 240, 600), base01: norm(450, 240, 600), accent: '#5E5198',
    },
    {
      key: 'strain', label: 'Training Form', value: data.trainingLoad?.form || '--', unit: '',
      sub: data.trainingLoad ? `balance ${tsb > 0 ? '+' : ''}${tsb}` : 'needs 7 days',
      pos01: norm(tsb, -20, 10), base01: norm(0, -20, 10), accent: '#D98E3F',
    },
  ]

  return (
    <div className="grid grid-cols-2" style={{ borderTop: `1px solid ${C.rule}` }}>
      {rows.map((r, i) => (
        <button key={i} onClick={() => onNav(r.key)} className="text-left active:opacity-60 transition-opacity"
          style={{ borderRight: i % 2 === 0 ? `1px solid ${C.rule}` : 'none', borderBottom: i < 2 ? `1px solid ${C.rule}` : 'none', paddingLeft: i % 2 === 0 ? 0 : 16, paddingRight: i % 2 === 0 ? 16 : 0 }}>
          <Instrument {...r} />
        </button>
      ))}
    </div>
  )
}

// ── Contents (navigation as an almanac index, with dotted leaders) ────────────
function Contents({ data, onNav }) {
  const units = getUserUnits()
  const distKm = calculateDistance(data.steps || 0, getUserHeightCm())
  const dist = distKm ? (units === 'imperial' ? `${Math.round(distKm * 0.6214 * 10) / 10} mi` : `${distKm} km`) : `${(data.steps || 0).toLocaleString()} steps`

  const { hrvHistory = [], rhrHistory = [], sleepHistory = [], steps = 0, vo2Max = 0, weeklyZone2 = 0 } = data
  const userAge = getUserAge()
  const physAge = userAge > 0 ? calculatePhysiologicalAge({
    avgHRV: mean(hrvHistory.filter(Boolean)) || 0,
    avgRHR: mean(rhrHistory.filter(Boolean)) || 0,
    avgSleep: sleepHistory.length ? sleepHistory.reduce((a, s) => a + s.minutes, 0) / sleepHistory.length / 60 : 7,
    sleepConsistency: 0.8,
    avgSteps: steps,
    weeklyAZM: weeklyZone2,
    vo2Max,
    hrvHistory,
  }) : null

  const entries = [
    ['recovery', 'Recovery', `${data.recoveryScore ?? '--'}`],
    ['sleep', 'Sleep', `${data.sleepScore ?? '--'}`],
    ['strain', 'Strain', `${data.strainScore ?? '--'} of 21`],
    ['stress', 'Stress', getStressLabel(data.stressScore ?? 0)],
    ['chronos', 'Chronos', physAge != null ? `${physAge}y body age` : 'body age'],
    ['records', 'Movement', dist],
    ['journal', 'Journal', 'notes & tags'],
    ['trends', 'Trends', 'long view'],
  ]
  return (
    <div>
      <Label>Contents</Label>
      <div className="mt-2">
        {entries.map(([id, name, val]) => (
          <button key={id} onClick={() => onNav(id)}
            className="w-full flex items-baseline gap-2 py-2.5 active:opacity-50 transition-opacity"
            style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
            <span style={{ fontFamily: SERIF, fontSize: 17, color: C.ink }}>{name}</span>
            <span style={{ flex: 1, borderBottom: `1px dotted ${C.rule}`, transform: 'translateY(-4px)' }} />
            <span style={{ fontFamily: SERIF, fontSize: 15, color: C.inkSoft }} className="tabular">{val}</span>
            <span style={{ color: C.faint, fontSize: 13 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function HomeAlmanac({ data, onNav, onRefresh, isSyncing, syncFailed, lastSyncedAt }) {
  const daysOfData = data.hrvHistory?.filter(Boolean).length || 0
  const reading = composeReading(data)
  const now = new Date()
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()

  // Pull to refresh (carried over from the original home)
  const [pullY, setPullY] = useState(0)
  const pulling = useRef(false)
  const startY = useRef(0)
  const TH = 70
  const onTouchStart = useCallback(e => { if (window.scrollY > 0) return; startY.current = e.touches[0].clientY; pulling.current = true }, [])
  const onTouchMove = useCallback(e => { if (!pulling.current) return; const d = e.touches[0].clientY - startY.current; if (d > 0) setPullY(Math.min(d * 0.4, TH)) }, [])
  const onTouchEnd = useCallback(() => { if (pulling.current && pullY >= TH && onRefresh && !isSyncing) { haptic('medium'); onRefresh() } setPullY(0); pulling.current = false }, [pullY, onRefresh, isSyncing])

  // Subtle ambient tint at the very top of the page, keyed to recovery
  const accent = getRecoveryColor(data.recoveryScore || 0)
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    root.style.background = `radial-gradient(ellipse 90% 22% at 50% 0%, ${accent}0a 0%, transparent 70%)`
    return () => { root.style.background = '' }
  }, [accent])

  const iconBtn = 'w-9 h-9 flex items-center justify-center active:opacity-50 transition-opacity'

  return (
    <div className="pt-safe pb-28" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      style={{ background: C.paper, minHeight: '100vh', color: C.ink,
        transform: pullY > 0 ? `translateY(${pullY}px)` : undefined, transition: pullY === 0 ? 'transform 0.2s ease' : undefined }}>

      {(pullY > 0 || isSyncing) && (
        <div className="flex justify-center pt-1" style={{ opacity: isSyncing ? 1 : pullY / TH }}>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.faint }}>{isSyncing ? 'gathering…' : 'release to refresh'}</span>
        </div>
      )}

      {/* Masthead */}
      <div className="px-5 pt-3">
        <div className="flex items-start justify-between">
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: SERIF, color: C.gold, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>Σ</span>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 27, letterSpacing: '0.18em', color: C.ink }}>SOMA</span>
          </div>
          <div className="flex items-center" style={{ marginRight: -8 }}>
            {onRefresh && (
              <button onClick={onRefresh} disabled={isSyncing} className={iconBtn} aria-label="Refresh">
                <svg viewBox="0 0 24 24" fill="none" stroke={syncFailed ? '#D98E3F' : C.inkSoft} strokeWidth={1.8} className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} style={isSyncing ? { animationDirection: 'reverse' } : {}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            <button onClick={() => onNav('coach')} className={iconBtn} aria-label="Coach">
              <svg viewBox="0 0 24 24" fill="none" stroke={C.inkSoft} strokeWidth={1.8} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
            <button onClick={() => onNav('settings')} className={iconBtn} aria-label="Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke={C.inkSoft} strokeWidth={1.8} className="w-5 h-5">
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
        {/* date / edition line */}
        <div className="flex items-center justify-between mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 4, paddingBottom: 4, marginTop: 6 }}>
          <Label style={{ color: C.inkSoft, fontSize: 11 }}>{dateLine}</Label>
          <Label style={{ color: C.faint, fontSize: 11 }}>
            {isSyncing ? 'gathering' : syncFailed ? 'sync failed' : lastSyncedAt ? `synced ${lastSyncedAt}` : `day ${daysOfData}`}
          </Label>
        </div>
      </div>

      {/* The Reading */}
      <div className="px-5 pt-5">
        <h1 style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.12, color: C.ink, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {reading.lede}
        </h1>
        <p style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.62, color: C.inkSoft, marginTop: 12 }}>
          {reading.tokens.map((tk, i) => {
            if (i === 0 && tk.t) {
              // Editorial drop cap on the first letter of the reading.
              return (
                <span key={i}>
                  <span style={{ float: 'left', fontFamily: SERIF, fontSize: 52, lineHeight: 0.82, color: C.ink, paddingRight: 7, paddingTop: 4, fontWeight: 700 }}>
                    {tk.t.charAt(0)}
                  </span>
                  <span style={tk.em ? { color: C.ink, fontWeight: 600 } : undefined}>{tk.t.slice(1)}</span>
                </span>
              )
            }
            return <span key={i} style={tk.em ? { color: C.ink, fontWeight: 600 } : undefined}>{tk.t}</span>
          })}
        </p>
      </div>

      {/* The Day Ribbon */}
      <div className="px-5 pt-7">
        <div className="flex items-baseline justify-between">
          <Label style={{ color: C.inkSoft }}>The Day So Far</Label>
          <Label style={{ fontSize: 11 }}>midnight → midnight</Label>
        </div>
        <div className="mt-2"><DayRibbon data={data} /></div>
        <RibbonLegend data={data} />
      </div>

      {/* Instruments */}
      <div className="px-5 pt-7">
        <Instruments data={data} onNav={onNav} />
      </div>

      {/* Contents */}
      <div className="px-5 pt-8">
        <Contents data={data} onNav={onNav} />
      </div>

      <p className="text-center pt-8" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: C.faint }}>
        Soma · a record of one body
      </p>
    </div>
  )
}
