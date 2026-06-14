import { useState, useRef } from 'react';
import { LAB_MARKERS, getLabResults, saveLabResults } from '../lib/labs';

const GROUPS = [
  'Lipids',
  'Metabolic',
  'Inflammation',
  'Vitamins & Minerals',
  'Hormones',
  'Organ Function',
  'PhenoAge Panel',
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

  const initialDraft = {};
  for (const marker of LAB_MARKERS) {
    const entry = saved[marker.key];
    initialDraft[marker.key] =
      entry?.value != null ? String(entry.value) : '';
  }

  const [testDate, setTestDate] = useState(initialDate);
  const [draft, setDraft] = useState(initialDraft);
  const [openGroups, setOpenGroups] = useState({ Lipids: true });
  const [savedState, setSavedState] = useState(true);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  const pdfInputRef = useRef(null);

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
    }
    saveLabResults(updated);
    setSavedState(true);
  }

  async function handlePdfImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const apiKey = localStorage.getItem('claude_api_key');
    if (!apiKey) {
      setPdfMsg('Add your Claude API key in Settings first, then try again.');
      return;
    }

    setPdfImporting(true);
    setPdfMsg('Reading your lab report…');

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const markerList = LAB_MARKERS.map(
        (m) => `"${m.key}" (${m.label}, ${m.unit})`
      ).join(', ');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-beta': 'pdfs-2024-09-25',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64,
                  },
                },
                {
                  type: 'text',
                  text: `Extract all lab values from this report. Return ONLY a valid JSON object using these exact keys (skip any you cannot find with confidence): ${markerList}. No explanation — just the JSON object.`,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Error ${response.status}`);
      }

      const result = await response.json();
      const text = result.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No values found in this PDF.');

      const extracted = JSON.parse(jsonMatch[0]);
      const validKeys = Object.keys(extracted).filter((k) => {
        const v = extracted[k];
        return v != null && v !== '' && !isNaN(parseFloat(v));
      });

      if (validKeys.length === 0) throw new Error('No lab values found in this PDF.');

      setDraft((prev) => {
        const next = { ...prev };
        for (const key of validKeys) {
          next[key] = String(parseFloat(extracted[key]));
        }
        return next;
      });
      setSavedState(false);

      // Open every group that received a value
      setOpenGroups((prev) => {
        const next = { ...prev };
        for (const key of validKeys) {
          const marker = LAB_MARKERS.find((m) => m.key === key);
          if (marker) next[marker.group] = true;
        }
        return next;
      });

      setPdfMsg(`Found ${validKeys.length} value${validKeys.length !== 1 ? 's' : ''} — review them below, then hit Save.`);
    } catch (err) {
      setPdfMsg(`Couldn't read the PDF: ${err.message}`);
    } finally {
      setPdfImporting(false);
    }
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-white tracking-tight">
            Lab Results
          </h2>
          <p className="text-sm text-gray-400">
            Upload a PDF from your doctor or enter values by hand. Updates your
            biological age and healthspan score.
          </p>
        </div>

        {/* PDF import button */}
        <button
          type="button"
          onClick={() => pdfInputRef.current?.click()}
          disabled={pdfImporting}
          style={{
            background: pdfImporting ? '#1a1a1a' : '#00c9a715',
            border: '1px solid #00c9a740',
            color: '#00c9a7',
          }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 active:scale-95 disabled:opacity-40"
        >
          {pdfImporting ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              Reading…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import PDF
            </>
          )}
        </button>
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          onChange={handlePdfImport}
          className="hidden"
        />
      </div>

      {/* PDF status message */}
      {pdfMsg && (
        <div
          style={{
            background: pdfMsg.startsWith('Couldn') ? '#ef444415' : '#00c9a715',
            border: `1px solid ${pdfMsg.startsWith('Couldn') ? '#ef444440' : '#00c9a740'}`,
            color: pdfMsg.startsWith('Couldn') ? '#ef4444' : '#00c9a7',
          }}
          className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
        >
          <span className="mt-px">{pdfMsg.startsWith('Couldn') ? '⚠' : '✓'}</span>
          <span>{pdfMsg}</span>
        </div>
      )}

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
          if (markers.length === 0) return null;
          const isOpen = !!openGroups[group];
          const filled = filledCount(group);
          const total = groupTotal(group);

          return (
            <div
              key={group}
              style={{ background: '#1a1a1a', border: '1px solid #222' }}
              className="rounded-xl overflow-hidden"
            >
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
