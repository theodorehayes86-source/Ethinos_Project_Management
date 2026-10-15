// Staff-side task sharing controls: visibility (internal | client) and a
// separate client-facing description. Duplicated in pmt-mobile; keep in sync.
import React from 'react';
import { Lock, Eye } from 'lucide-react';
import { normalizeVisibility } from './core.js';

export default function SharingFields({ visibility, clientDescription, onVisibilityChange, onClientDescriptionChange, disabled = false, disabledReason = '', compact = false, testIdPrefix = 'sharing' }) {
  const v = normalizeVisibility(visibility);
  const opts = [
    { id: 'internal', label: 'Internal', hint: 'Staff only', Icon: Lock },
    { id: 'client', label: 'Client', hint: 'Shared in portal', Icon: Eye },
  ];
  return (
    <div className={`border rounded-xl ${compact ? 'p-3' : 'p-4'} space-y-3 ${v === 'client' ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Visibility</span>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {disabled ? (disabledReason || 'Sharing unavailable') : v === 'client' ? 'Client sees title, status, due date and client description only' : 'Visible to Ethinos staff only'}
          </p>
        </div>
        <div className="flex gap-0.5 p-0.5 bg-white border border-slate-200 rounded-lg flex-shrink-0">
          {opts.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              data-testid={`${testIdPrefix}-visibility-${id}`}
              disabled={disabled && id === 'client'}
              onClick={() => onVisibilityChange(id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all disabled:opacity-40 ${
                v === id ? (id === 'client' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-white') : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
      </div>
      {v === 'client' && !disabled && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client description</label>
          <textarea
            data-testid={`${testIdPrefix}-client-description`}
            value={clientDescription || ''}
            onChange={e => onClientDescriptionChange(e.target.value)}
            rows={compact ? 2 : 3}
            maxLength={4000}
            placeholder="What the client should read. Internal description is never shared."
            className="w-full p-3 border border-indigo-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 ring-indigo-500/20 resize-none bg-white"
          />
        </div>
      )}
    </div>
  );
}
