import React, { useState } from 'react';
import { X } from 'lucide-react';

const ATTENDANCE_OPTIONS = [
  { value: 'all',         label: 'All' },
  { value: 'in_office',   label: 'In Office' },
  { value: 'left',        label: 'Left' },
  { value: 'not_arrived', label: 'Not Arrived' },
];

export const SORT_OPTIONS = [
  { value: 'name',    label: 'Name (A–Z)' },
  { value: 'overdue', label: 'Most Overdue' },
];

function OptionPills({ options, value, onChange, activeCls = 'bg-indigo-600 text-white' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`text-xs font-bold px-3.5 py-2.5 rounded-xl min-h-[44px] transition-colors ${
              active ? activeCls : 'bg-slate-100 text-slate-600 active:bg-slate-200'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={`ml-1 text-[10px] ${active ? 'opacity-70' : 'text-slate-400'}`}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</p>
      {children}
    </div>
  );
}

/**
 * Mobile bottom filter sheet with draft state.
 * Changes only take effect on Apply; Cancel/backdrop leaves applied filters unchanged.
 */
export default function TeamFilterSheet({
  departments,        // ['All', ...]
  deptCounts,         // { dept: n }
  regions,            // ['All', ...] — pass [] to hide (non-admin)
  regionCounts,       // { region: n }
  showAttendance,
  applied,            // { dept, region, attendance, sort }
  onApply,            // (draft) => void
  onClose,
}) {
  const [draft, setDraft] = useState(applied);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const reset = () => setDraft({ dept: 'All', region: 'All', attendance: 'all', sort: 'name' });

  const showDepartments = departments.length > 2;
  const showRegions = regions.length > 2;
  const showSort = true;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Filters">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"
          >
            <X size={16} className="text-slate-600" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
          {showDepartments && (
            <Section label="Department">
              <OptionPills
                options={departments.map(d => ({
                  value: d,
                  label: d === 'All' ? 'All Departments' : d,
                  count: d !== 'All' ? deptCounts?.[d] : undefined,
                }))}
                value={draft.dept}
                onChange={v => set('dept', v)}
              />
            </Section>
          )}

          {showRegions && (
            <Section label="Region">
              <OptionPills
                options={regions.map(r => ({
                  value: r,
                  label: r === 'All' ? 'All Regions' : r,
                  count: r !== 'All' ? regionCounts?.[r] : undefined,
                }))}
                value={draft.region}
                onChange={v => set('region', v)}
                activeCls="bg-sky-600 text-white"
              />
            </Section>
          )}

          {showAttendance && (
            <Section label="Attendance">
              <OptionPills
                options={ATTENDANCE_OPTIONS}
                value={draft.attendance}
                onChange={v => set('attendance', v)}
                activeCls="bg-emerald-600 text-white"
              />
            </Section>
          )}

          {showSort && (
            <Section label="Sort By">
              <OptionPills
                options={SORT_OPTIONS}
                value={draft.sort}
                onChange={v => set('sort', v)}
              />
            </Section>
          )}
        </div>

        {/* Actions — always reachable */}
        <div
          className="px-5 pt-3 border-t border-slate-100 flex gap-2 flex-shrink-0 bg-white"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)' }}
        >
          <button
            type="button"
            onClick={reset}
            className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold min-h-[48px]"
          >
            Reset all
          </button>
          <button
            type="button"
            onClick={() => { onApply(draft); onClose(); }}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold min-h-[48px]"
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}
