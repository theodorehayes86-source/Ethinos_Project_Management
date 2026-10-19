import React from 'react';
import { inputCls } from './StudioUI.jsx';

export default function ClientSelect({ clients, value, onChange }) {
  return (
    <label className="flex w-full sm:w-auto flex-col gap-1 text-left">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Client</span>
      <select data-testid="select-filter-client" aria-label="Select client"
        value={clients.length ? value : 'all'} disabled={!clients.length}
        onChange={e => onChange(e.target.value)}
        className={`${inputCls} sm:!w-64 !py-2 disabled:bg-slate-50 disabled:text-slate-400`}>
        <option value="all">{clients.length ? 'All clients' : 'No enabled clients'}</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}
