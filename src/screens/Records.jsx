import CalendarHeatmap from '../components/CalendarHeatmap'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'
import { C, SERIF, Label, BackLink, SectionLabel, norm } from '../lib/almanacTheme'

function PRRow({ label, value, unit, date }) {
  return (
    <div className="flex items-baseline gap-2 py-2.5" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <span style={{ fontFamily: SERIF, fontSize: 15, color: C.inkSoft }}>{label}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${C.rule}`, transform: 'translateY(-4px)' }} />
      <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: C.ink }} className="tabular">{value ?? '—'}</span>
      {value != null && unit && <span style={{ fontFamily: SERIF, fontSize: 12, color: C.faint }}>{unit}</span>}
      {date && <span style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, fontStyle: 'italic' }}>{date}</span>}
    </div>
  )
}

function StreakRow({ label, count, target = 7, color }) {
  const p = norm(count, 0, target)
  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${C.ruleSoft}` }}>
      <div className="flex justify-between items-baseline">
        <span style={{ fontFamily: SERIF, fontSize: 15, color: C.inkSoft }}>{label}</span>
        <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color }}>{count} <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}>day{count !== 1 ? 's' : ''}</span></span>
      </div>
      <div style={{ height: 3, marginTop: 6, background: C.ruleSoft }}>
        <div style={{ height: 3, width: `${p * 100}%`, background: color }} />
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 11, color: C.faint, marginTop: 4 }}>{target}-day target</p>
    </div>
  )
}

function AchievementEntry({ def, unlocked }) {
  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${C.ruleSoft}`, opacity: unlocked ? 1 : 0.45 }}>
      <div className="flex items-baseline justify-between">
        <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: C.ink }}>{def.label}</span>
        {unlocked && <Label style={{ color: C.gold, fontSize: 10 }}>Unlocked</Label>}
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 12, color: C.faint, marginTop: 1 }}>{def.desc}</p>
    </div>
  )
}

export default function Records({ data, onNav }) {
  const { personalRecords = {}, streaks = {}, unlockedAchievements = [], calendarDays = [] } = data

  return (
    <div className="px-5 pt-safe pb-28" style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="pt-3">
        <BackLink onNav={onNav} />
      </div>
      <div className="mt-1" style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}`, paddingTop: 6, paddingBottom: 6, marginTop: 10 }}>
        <Label style={{ color: C.inkSoft }}>RECORDS</Label>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, marginTop: 14 }}>Your history</h1>

      {/* Calendar */}
      <div className="mt-9">
        <SectionLabel>Recovery — 90 Days</SectionLabel>
        <div className="mt-4"><CalendarHeatmap days={calendarDays} /></div>
      </div>

      {/* Personal Records */}
      <div className="mt-9">
        <SectionLabel>Personal Records</SectionLabel>
        <div className="mt-1">
          <PRRow label="Best Recovery" value={personalRecords.bestRecovery} unit="%" />
          <PRRow label="Highest HRV" value={personalRecords.bestHRV} unit="ms" />
          <PRRow label="Lowest Resting HR" value={personalRecords.lowestRHR} unit="bpm" />
          <PRRow label="Highest Strain" value={personalRecords.highestStrain} unit="/ 21" />
          <PRRow label="Most Steps" value={personalRecords.mostSteps?.toLocaleString()} unit="" />
        </div>
      </div>

      {/* Streaks */}
      <div className="mt-9">
        <SectionLabel>Current Streaks</SectionLabel>
        <div className="mt-1">
          <StreakRow label="Green Recovery" count={streaks.recovery || 0} target={7} color="#3E9C7E" />
          <StreakRow label="7.5h+ Sleep" count={streaks.sleep || 0} target={7} color="#9B7FD4" />
          <StreakRow label="Low Stress" count={streaks.lowStress || 0} target={7} color="#D9A23F" />
        </div>
      </div>

      {/* Achievements */}
      <div className="mt-9 mb-4">
        <SectionLabel right={`${unlockedAchievements.length} / ${ACHIEVEMENT_DEFS.length}`}>Achievements</SectionLabel>
        <div className="mt-1">
          {ACHIEVEMENT_DEFS.map(def => (
            <AchievementEntry key={def.id} def={def} unlocked={unlockedAchievements.includes(def.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
