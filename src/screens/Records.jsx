import CalendarHeatmap from '../components/CalendarHeatmap'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'

function PRCard({ label, value, unit, date, color = '#00c9a7', icon }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-white">{value ?? '—'}{value ? ` ${unit}` : ''}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
      {date && <span className="text-xs text-gray-600">{date}</span>}
    </div>
  )
}

function StreakBar({ label, count, icon, target = 7, color = '#00c9a7' }) {
  const pct = Math.min(100, (count / target) * 100)
  return (
    <div className="py-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm text-white">{label}</span>
        </div>
        <span className="text-sm font-bold" style={{ color }}>
          {count} <span className="text-gray-600 font-normal">day{count !== 1 ? 's' : ''}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#222] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-xs text-gray-600 mt-1">{target}-day target</p>
    </div>
  )
}

function AchievementBadge({ def, unlocked }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl"
      style={{
        background: unlocked ? '#1a1a1a' : '#0f0f0f',
        border: `1px solid ${unlocked ? '#2a2a2a' : '#1a1a1a'}`,
        opacity: unlocked ? 1 : 0.4,
      }}
    >
      <span className="text-2xl" style={{ filter: unlocked ? 'none' : 'grayscale(100%)' }}>{def.emoji}</span>
      <span className="text-xs font-semibold text-center text-white leading-tight">{def.label}</span>
      <span className="text-[10px] text-gray-600 text-center leading-tight">{def.desc}</span>
      {unlocked && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#00c9a720] text-[#00c9a7] font-bold">UNLOCKED</span>
      )}
    </div>
  )
}

function BackButton({ onNav }) {
  return (
    <button onClick={() => onNav('home')} className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export default function Records({ data, onNav }) {
  const { personalRecords = {}, streaks = {}, unlockedAchievements = [], calendarDays = [] } = data

  return (
    <div className="px-4 pt-safe pb-28 space-y-4">
      <div className="pt-2 flex items-center gap-3">
        {onNav && <BackButton onNav={onNav} />}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Records & Trends</p>
          <h1 className="text-xl font-bold">Your History</h1>
        </div>
      </div>

      {/* 90-Day Calendar */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Recovery — 90 Days</p>
        <CalendarHeatmap days={calendarDays} />
      </div>

      {/* Personal Records */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Personal Records</p>
        </div>
        <div className="px-4 pb-2">
          <PRCard label="Best Recovery" value={personalRecords.bestRecovery} unit="%" icon="💚" color="#00c9a7" />
          <PRCard label="Highest HRV" value={personalRecords.bestHRV} unit="ms" icon="⚡" color="#00c9a7" />
          <PRCard label="Lowest Resting HR" value={personalRecords.lowestRHR} unit="bpm" icon="❤️" color="#ef4444" />
          <PRCard label="Highest Strain" value={personalRecords.highestStrain} unit="/ 21" icon="🔥" color="#3b82f6" />
          <PRCard label="Most Steps" value={personalRecords.mostSteps?.toLocaleString()} unit="" icon="👟" color="#f59e0b" />
        </div>
      </div>

      {/* Current Streaks */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Current Streaks</p>
        </div>
        <div className="px-4 pb-2">
          <StreakBar label="Green Recovery" count={streaks.recovery || 0} icon="🟢" target={7} color="#00c9a7" />
          <StreakBar label="7.5h+ Sleep" count={streaks.sleep || 0} icon="😴" target={7} color="#8b5cf6" />
          <StreakBar label="Low Stress" count={streaks.lowStress || 0} icon="🧘" target={7} color="#3b82f6" />
        </div>
      </div>

      {/* Achievements */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #222' }}>
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Achievements</p>
          <p className="text-xs text-gray-500">{unlockedAchievements.length} / {ACHIEVEMENT_DEFS.length}</p>
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
