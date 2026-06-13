import { useState } from 'react'
import { getRecoveryColor } from '../lib/calculations'

function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

function buildGrid(days) {
  const map = {}
  for (const d of days) map[d.date] = d

  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 89)

  // Pad start to Sunday
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1)

  const weeks = []
  const cur = new Date(start)
  while (cur <= end) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const dateStr = toDateStr(cur)
      week.push({ date: dateStr, data: map[dateStr] || null, future: cur > end })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function CalendarHeatmap({ days = [] }) {
  const [selected, setSelected] = useState(null)
  const weeks = buildGrid(days)

  const monthLabels = []
  for (let i = 0; i < weeks.length; i++) {
    const firstDay = new Date(weeks[i][0].date)
    if (i === 0 || firstDay.getDate() <= 7) {
      monthLabels[i] = firstDay.toLocaleDateString('en-US', { month: 'short' })
    } else {
      monthLabels[i] = ''
    }
  }

  return (
    <div>
      <div className="flex gap-1">
        {/* Day labels — h-3 spacer matches the month-label row above each week column */}
        <div className="flex flex-col gap-1 mr-1">
          <div className="h-3" />
          {DAY_LABELS.map((l, i) => (
            <div key={i} className="w-4 h-4 flex items-center justify-center text-[9px] text-gray-600">{l}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none flex-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1 flex-shrink-0">
              <div className="text-[9px] text-gray-600 h-3 leading-none">{monthLabels[wi]}</div>
              {week.map((cell, di) => {
                if (cell.future) return <div key={di} className="w-4 h-4" />
                const recovery = cell.data?.recovery
                const bg = recovery === undefined || recovery === null
                  ? '#1f1f1f'
                  : getRecoveryColor(recovery) + (recovery >= 67 ? '99' : recovery >= 34 ? 'aa' : 'cc')
                return (
                  <button
                    key={di}
                    onClick={() => setSelected(selected?.date === cell.date ? null : cell)}
                    className="w-4 h-4 rounded-sm transition-opacity active:opacity-60"
                    style={{ background: bg }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {selected && (
        <div className="mt-3 p-3 rounded-xl text-sm" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-white font-semibold">
            {new Date(selected.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
          {selected.data && (selected.data.recovery != null || selected.data.strain || selected.data.sleep) ? (
            <div className="flex gap-4 mt-1">
              {selected.data.recovery != null && <span className="text-gray-400">Recovery: <span className="font-bold" style={{ color: getRecoveryColor(selected.data.recovery) }}>{selected.data.recovery}%</span></span>}
              {selected.data.strain && <span className="text-gray-400">Strain: <span className="text-blue-400 font-bold">{selected.data.strain}</span></span>}
              {selected.data.sleep && <span className="text-gray-400">Sleep: <span className="text-white font-bold">{Math.round(selected.data.sleep / 60 * 10) / 10}h</span></span>}
            </div>
          ) : (
            <p className="text-gray-600">No data</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 justify-end">
        {[['#ef4444cc', 'Low'], ['#f59e0baa', 'Moderate'], ['#00c9a799', 'Peak']].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="text-[10px] text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
