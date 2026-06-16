import { haptic } from '../lib/haptics'

const TABS = [
  { id: 'home',      label: 'Today',      icon: HomeIcon },
  { id: 'recovery',  label: 'Recovery',   icon: HeartIcon },
  { id: 'sleep',     label: 'Sleep',      icon: MoonIcon },
  { id: 'strain',    label: 'Strain',     icon: BoltIcon },
  { id: 'chronos',   label: 'Chronos',    icon: ChronosIcon },
]

function HomeIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function HeartIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}

function BoltIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function MoonIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

function ChronosIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

export default function BottomNav({ active, onChange }) {
  const activeIdx = TABS.findIndex(t => t.id === active)

  function handleTap(id) {
    haptic('light')
    onChange(id)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid #1a1a1a' }}
    >
      <div className="relative flex items-center justify-around px-2 pt-2 pb-1">
        {/* Sliding active background pill */}
        {activeIdx >= 0 && (
          <div
            className="absolute top-1 bottom-1 rounded-2xl pointer-events-none transition-all duration-300 ease-out"
            style={{
              width: `${100 / TABS.length}%`,
              left: `${(activeIdx / TABS.length) * 100}%`,
              background: '#00c9a712',
            }}
          />
        )}

        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => handleTap(id)}
              className="relative flex flex-col items-center gap-0.5 px-2 py-1"
              style={{ color: isActive ? '#00c9a7' : '#555', minWidth: 44, zIndex: 1 }}
            >
              <div style={{ transition: 'transform 0.15s ease', transform: isActive ? 'scale(1.1)' : 'scale(1)' }}>
                <Icon active={isActive} />
              </div>
              <span className="text-[10px] font-medium" style={{ transition: 'color 0.15s ease' }}>{label}</span>
              {/* Active pip dot */}
              {isActive && (
                <span
                  className="nav-pip absolute -bottom-0.5 block rounded-full"
                  style={{ width: 4, height: 4, background: '#00c9a7' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
