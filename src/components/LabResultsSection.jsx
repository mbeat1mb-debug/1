import { useState } from 'react';
import { LAB_MARKERS, getLabResults, saveLabResults } from '../lib/labs';

const GROUPS = [
  'Lipids',
  'Metabolic',
  'Inflammation',
  'Vitamins & Minerals',
  'Hormones',
  'Organ Function',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getMostRecentDate(saved) {
  const dates = Object.values(saved)
    .map((e) => e?.date)
    .filter(Boolean)
    .sort()
    .reverse();
  return dates[0] || today();
}

export default function LabResultsSection() {
  const saved = getLabResults();
  const initialDate = getMostRecentDate(saved);

  // Local draft values: key → string (empty string = not entered)
  const initialDraft = {};
  for (const marker of LAB_MARKERS) {
    const entry = saved[marker.key];
    initialDraft[marker.key] =
      entry?.value != null ? String(entry.value) : '';
  }

  const [testDate, setTestDate] = useState(initialDate);
  const [draft, setDraft] = useState(initialDraft);
  const [openGroups, setOpenGroups] = useState({ Lipids: true });
  const [savedState, setSavedState] = useState(true); // false = unsaved changes

  function handleChange(key, val) {
    setDraft((prev) => ({ ...prev, [key]: val }));
    setSavedState(false);
  }

  function handleDateChange(val) {
    setTestDate(val);
    setSavedState(false);
  }

  function toggleGroup(group) {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }

  function handleSave() {
    const existing = getLabResults();
    const updated = { ...existing };
    for (const marker of LAB_MARKERS) {
      const raw = draft[marker.key];
      if (raw !== '' && raw != null) {
        const v = parseFloat(raw);
        if (!isNaN(v)) {
          updated[marker.key] = { value: v, date: testDate };
        }
      }
      // empty fields do not overwrite existing entries
    }
    saveLabResults(updated);
    setSavedState(true);
  }

  function filledCount(group) {
    return LAB_MARKERS.filter(
      (m) => m.group === group && draft[m.key] !== ''
    ).length;
  }

  function groupTotal(group) {
    return LAB_MARKERS.filter((m) => m.group === group).length;
  }

  return (
    <div
      style={{ background: '#111', border: '1px solid #222' }}
      className="rounded-2xl p-6 flex flex-col gap-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white tracking-tight">
          Lab Results
        </h2>
        <p className="text-sm text-gray-400">
          Enter values from your blood panel. Updates biological age and
          healthspan metrics.
        </p>
      </div>

      {/* Test Date */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="lab-test-date"
          className="text-sm text-gray-400 whitespace-nowrap"
        >
          Test Date
        </label>
        <input
          id="lab-test-date"
          type="date"
          value={testDate}
          onChange={(e) => handleDateChange(e.target.value)}
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            color: '#e5e7eb',
            colorScheme: 'dark',
          }}
          className="rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#00c9a7] transition-colors"
        />
      </div>

      {/* Accordion groups */}
      <div className="flex flex-col gap-2">
        {GROUPS.map((group) => {
          const markers = LAB_MARKERS.filter((m) => m.group === group);
          const isOpen = !!openGroups[group];
          const filled = filledCount(group);
          const total = groupTotal(group);

          return (
            <div
              key={group}
              style={{ background: '#1a1a1a', border: '1px solid #222' }}
              className="rounded-xl overflow-hidden"
            >
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-200">
                    {group}
                  </span>
                  {filled > 0 && (
                    <span
                      style={{ background: '#00c9a720', color: '#00c9a7' }}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    >
                      {filled}/{total} filled
                    </span>
                  )}
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className={`text-gray-500 transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Marker rows */}
              {isOpen && (
                <div
                  style={{ borderTop: '1px solid #222' }}
                  className="flex flex-col divide-y divide-[#222]"
                >
                  {markers.map((marker) => {
                    const raw = draft[marker.key];
                    const hasValue = raw !== '' && raw != null;
                    const numVal = hasValue ? parseFloat(raw) : null;
                    const isValidNum = numVal != null && !isNaN(numVal);
                    const markerColor =
                      isValidNum ? marker.color(numVal) : '#333';
                    const gradeLabel =
                      isValidNum ? marker.grade(numVal) : null;

                    return (
                      <div
                        key={marker.key}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        {/* Label + grade badge */}
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-gray-300 leading-tight">
                              {marker.label}
                            </span>
                            {gradeLabel && (
                              <span
                                style={{
                                  background: markerColor + '28',
                                  color: markerColor,
                                  border: `1px solid ${markerColor}40`,
                                }}
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight"
                              >
                                {gradeLabel}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-600 leading-tight">
                            {marker.ref}
                          </span>
                        </div>

                        {/* Input + unit */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            step="any"
                            placeholder="—"
                            value={raw}
                            onChange={(e) =>
                              handleChange(marker.key, e.target.value)
                            }
                            style={{
                              background: '#0d0d0d',
                              border: `1px solid ${isValidNum ? markerColor : '#2a2a2a'}`,
                              color: isValidNum ? markerColor : '#9ca3af',
                              width: '7rem',
                              transition: 'border-color 0.15s, color 0.15s',
                            }}
                            className="rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:border-[#00c9a7] placeholder:text-gray-700"
                          />
                          <span className="text-xs text-gray-600 w-12 leading-tight">
                            {marker.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleSave}
          style={
            savedState
              ? {
                  background: '#00c9a7',
                  color: '#0d0d0d',
                  border: '1px solid #00c9a7',
                }
              : {
                  background: 'transparent',
                  color: '#00c9a7',
                  border: '1px solid #00c9a7',
                }
          }
          className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          {savedState ? 'Saved' : 'Save Lab Results'}
        </button>
      </div>
    </div>
  );
}
