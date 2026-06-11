import { useState } from 'react'
import { getAlertColor } from '../lib/alerts'

export default function AlertBanner({ alerts = [], onCoach }) {
  const [dismissed, setDismissed] = useState(new Set())

  const visible = alerts.filter(a => !dismissed.has(a.id))
  if (!visible.length) return null

  const top = visible[0]
  const color = getAlertColor(top.severity)

  return (
    <div
      className="mx-4 mb-3 rounded-2xl p-4"
      style={{ background: color + '12', border: `1px solid ${color}33` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{top.icon}</span>
            <span className="font-bold text-sm" style={{ color }}>{top.title}</span>
            {visible.length > 1 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: color + '25', color }}>
                +{visible.length - 1}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{top.message}</p>
          <p className="text-xs font-medium mt-1" style={{ color }}>{top.action}</p>
        </div>
        <button
          onClick={() => setDismissed(new Set([...dismissed, top.id]))}
          className="text-gray-600 text-lg leading-none mt-0.5 flex-shrink-0"
        >
          ×
        </button>
      </div>
      {onCoach && (
        <button
          onClick={onCoach}
          className="mt-2 text-xs font-semibold"
          style={{ color }}
        >
          Ask coach about this →
        </button>
      )}
    </div>
  )
}
