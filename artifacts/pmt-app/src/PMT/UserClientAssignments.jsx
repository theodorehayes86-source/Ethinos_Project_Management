import React, { useMemo, useState } from 'react';
import { Building2, ChevronRight, Search } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';

export function assignedClientNames(clients) {
  return [...new Set((Array.isArray(clients) ? clients : []).filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()))];
}

export function filterAssignedClients(names, query) {
  const search = query.trim().toLocaleLowerCase();
  return names.filter(name => name.toLocaleLowerCase().includes(search));
}

export function AssignedClientList({ names, query }) {
  const visible = filterAssignedClients(names, query);
  return (
    <div className="max-h-[min(50dvh,360px)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200">
      {visible.length ? <ul aria-label="Assigned clients" className="divide-y divide-slate-100">
        {visible.map(name => <li key={name} className="flex items-start gap-2.5 px-3 py-2.5 text-sm text-slate-700">
          <Building2 size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-blue-500" />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{name}</span>
        </li>)}
      </ul> : <p role="status" className="p-5 text-center text-sm text-slate-500">No matching clients.</p>}
    </div>
  );
}

export default function UserClientAssignments({ clients, userName }) {
  const names = useMemo(() => assignedClientNames(clients), [clients]);
  const [query, setQuery] = useState('');
  if (!names.length) return <span className="text-xs text-slate-400 italic">None</span>;
  return (
    <Dialog onOpenChange={() => setQuery('')}>
      <DialogTrigger asChild>
        <button type="button" aria-label={`View ${names.length} assigned client${names.length === 1 ? '' : 's'} for ${userName}`}
          className="group w-[190px] max-w-full rounded-lg px-2 py-1.5 -ml-2 text-left hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 ring-blue-500">
          <span className="flex items-center gap-1.5">
            <Building2 size={12} aria-hidden="true" className="shrink-0 text-blue-500" />
            <span className="text-xs font-semibold text-blue-700">{names.length} client{names.length === 1 ? '' : 's'}</span>
            <ChevronRight size={12} aria-hidden="true" className="ml-auto shrink-0 text-blue-400" />
          </span>
          <span className="block mt-1 truncate text-[11px] text-slate-500">{names.slice(0, 2).join(', ')}{names.length > 2 ? ` +${names.length - 2} more` : ''}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl bg-white p-5">
        <DialogHeader>
          <DialogTitle>Assigned clients</DialogTitle>
          <DialogDescription className="break-words [overflow-wrap:anywhere]">{userName} · {names.length} client{names.length === 1 ? '' : 's'}</DialogDescription>
        </DialogHeader>
        <label className="relative block">
          <span className="sr-only">Search assigned clients</span>
          <Search size={14} aria-hidden="true" className="absolute left-3 top-3 text-slate-400" />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search assigned clients…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </label>
        <AssignedClientList names={names} query={query} />
        <p className="text-[11px] text-slate-400">To change assignments, use the user’s edit button.</p>
      </DialogContent>
    </Dialog>
  );
}
