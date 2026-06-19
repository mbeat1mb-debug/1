import CalendarHeatmap from '../components/CalendarHeatmap'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'

function PRCard({ label, value, unit, date, color = '#3E9C7E', icon }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #ece3d4' }}>
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">{value ?? '—'}{value ? ` ${unit}` : ''}</p>
          <p className="text-xs text-[#9a8f7e]">{label}</p>
        </div>
      </div>
      {date && <span className="text-xs text-[#b3a890]">{date}</span>}
    </div>
  )
}

function StreakBar({ label, count, icon, target = 7, color = '#3E9C7E' }) {
  const pct = Math.min(100, (count / target) * 100)
  return (
    <div className="py-3" style={{ borderBottom: '1px solid #ece3d4' }}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm text-[#1a1a1a]">{label}</span>
        </div>
        <span className="text-sm font-bold" style={{ color }}>
          {count} <span className="text-[#b3a890] font-normal">day{count !== 1 ? 's' : ''}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EAE2D2' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-xs text-[#b3a890] mt-1">{target}-day target</p>
    </div>
  )
}

function AchievementBadge({ def, unlocked }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl"
      style={{
        background: '#fff',
        boxShadow: '0 4px 18px rgba(0,0,0,0.05)',
        opacity: unlocked ? 1 : 0.4,
      }}
    >
      <span className="text-2xl" style={{ filter: unlocked ? 'none' : 'grayscale(100%)' }}>{def.emoji}</span>
      <span className="text-xs font-semibold text-center text-[#1a1a1a] leading-tight">{def.label}</span>
      <span className="text-[10px] text-[#9a8f7e] text-center leading-tight">{def.desc}</span>
      {unlocked && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#3E9C7E20', color: '#3E9C7E' }}>UNLOCKED</span>
      )}
    </div>
  )
}

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#7d7363" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export default function Records({ data, onNav }) {
  const { personalRecords = {}, streaks = {}, unlockedAchievements = [], calendarDays = [] } = data

  return (
    <div className="px-4 pt-safe pb-28 space-y-4" style={{ background: '#F6F1E9', minHeight: '100vh' }}>
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-[#9a8f7e] text-xs uppercase tracking-wider">Records & Trends</p>
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Your History</h1>
        </div>
      </div>

      {/* 90-Day Calendar */}
      <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest mb-4">Recovery — 90 Days</p>
        <CalendarHeatmap days={calendarDays} />
      </div>

      {/* Personal Records */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest">Personal Records</p>
        </div>
        <div className="px-4 pb-2">
          <PRCard label="Best Recovery" value={personalRecords.bestRecovery} unit="%" icon="💚" color="#3E9C7E" />
          <PRCard label="Highest HRV" value={personalRecords.bestHRV} unit="ms" icon="⚡" color="#3E9C7E" />
          <PRCard label="Lowest Resting HR" value={personalRecords.lowestRHR} unit="bpm" icon="❤️" color="#ef4444" />
          <PRCard label="Highest Strain" value={personalRecords.highestStrain} unit="/ 21" icon="🔥" color="#D98E3F" />
          <PRCard label="Most Steps" value={personalRecords.mostSteps?.toLocaleString()} unit="" icon="👟" color="#D98E3F" />
        </div>
      </div>

      {/* Current Streaks */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest">Current Streaks</p>
        </div>
        <div className="px-4 pb-2">
          <StreakBar label="Green Recovery" count={streaks.recovery || 0} icon="🟢" target={7} color="#3E9C7E" />
          <StreakBar label="7.5h+ Sleep" count={streaks.sleep || 0} icon="😴" target={7} color="#9B7FD4" />
          <StreakBar label="Low Stress" count={streaks.lowStress || 0} icon="🧘" target={7} color="#D9A23F" />
        </div>
      </div>

      {/* Achievements */}
      <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.05)' }}>
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-xs font-semibold text-[#9a8f7e] uppercase tracking-widest">Achievements</p>
          <p className="text-xs text-[#9a8f7e]">{unlockedAchievements.length} / {ACHIEVEMENT_DEFS.length}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENT_DEFS.map(def => (
            <AchievementBadge
              key={def.id}
              def={def}
              unlocked={unlockedAchievements.includes(def.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
