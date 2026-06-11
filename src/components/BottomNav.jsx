const TABS = [
  { id: 'home', label: 'Today', icon: HomeIcon },
  { id: 'recovery', label: 'Recovery', icon: HeartIcon },
  { id: 'strain', label: 'Strain', icon: BoltIcon },
  { id: 'sleep', label: 'Sleep', icon: MoonIcon },
  { id: 'journal', label: 'Journal', icon: TagIcon },
  { id: 'coach', label: 'Coach', icon: ChatIcon },
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

function TagIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
}

function ChatIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe" style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)', borderTop: '1px solid #1f1f1f' }}>
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center gap-0.5 px-2 py-1 transition-all duration-150"
              style={{ color: isActive ? '#00c9a7' : '#555', minWidth: 44 }}
            >
              <Icon active={isActive} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
