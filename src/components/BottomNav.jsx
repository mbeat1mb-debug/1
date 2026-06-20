import { haptic } from '../lib/haptics'
import { C, SERIF, Label } from '../lib/almanacTheme'

const TABS = [
  { id: 'home',     mark: 'Today' },
  { id: 'recovery', mark: 'Recov.' },
  { id: 'sleep',    mark: 'Sleep' },
  { id: 'strain',   mark: 'Strain' },
  { id: 'chronos',  mark: 'Chronos' },
]

export default function BottomNav({ active, onChange }) {
  function handleTap(id) {
    haptic('light')
    onChange(id)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe"
      style={{ background: 'rgba(246,241,233,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: `1px solid ${C.rule}` }}
    >
      <div className="flex items-stretch">
        {TABS.map(({ id, mark }, i) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => handleTap(id)}
              className="flex-1 flex flex-col items-center justify-center py-2 active:opacity-60 transition-opacity"
              style={{
                borderLeft: i > 0 ? `1px solid ${C.ruleSoft}` : 'none',
                borderTop: isActive ? `2px solid ${C.gold}` : '2px solid transparent',
                minHeight: 50,
              }}
            >
              <span
                style={{
                  fontFamily: SERIF,
                  fontVariant: 'small-caps',
                  letterSpacing: '0.06em',
                  fontSize: isActive ? 13 : 12,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? C.ink : C.faint,
                }}
              >
                {mark}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
