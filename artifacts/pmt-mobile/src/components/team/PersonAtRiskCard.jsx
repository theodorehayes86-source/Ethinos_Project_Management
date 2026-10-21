import React from 'react';
import { AlertTriangle, Clock, ChevronDown } from 'lucide-react';
import { personDisplayName } from './displayName.js';

export default function PersonAtRiskCard({ user, tasks, isOnLeave, accent, onTaskClick }) {
  const red = accent === 'red';
  const c = red
    ? { bg: 'bg-red-50', border: 'border-red-100', avatar: 'bg-red-200', avatarText: 'text-red-700', name: 'text-red-800', countBg: 'bg-red-100', countText: 'text-red-500', rowHover: 'hover:bg-red-100', taskText: 'text-red-700' }
    : { bg: 'bg-indigo-50', border: 'border-indigo-100', avatar: 'bg-indigo-200', avatarText: 'text-indigo-700', name: 'text-indigo-800', countBg: 'bg-indigo-100', countText: 'text-indigo-500', rowHover: 'hover:bg-indigo-100', taskText: 'text-indigo-700' };
  const displayName = personDisplayName(user.name);
  const initials = displayName.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const label = red ? 'overdue' : 'due today';

  return (
    <details data-testid={`risk-person-${accent}-${user.id}`} className={`group ${c.bg} rounded-2xl border ${c.border}`}>
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 [&::-webkit-details-marker]:hidden">
        <span className={`w-6 h-6 rounded-full ${c.avatar} flex items-center justify-center shrink-0`}>
          <span className={`${c.avatarText} font-black text-[10px]`}>{initials}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-bold break-words ${c.name}`}>{displayName}</span>
          {isOnLeave && <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">On Leave</span>}
        </span>
        <span aria-label={`${tasks.length} pending ${label} tasks`} className={`shrink-0 text-[10px] font-bold ${c.countText} ${c.countBg} px-2 py-1 rounded-full`}>
          {tasks.length} pending
        </span>
        <ChevronDown aria-hidden="true" size={14} className={`shrink-0 transition-transform group-open:rotate-180 ${c.countText}`} />
      </summary>
      <div className="space-y-1 px-2 pb-3">
        {tasks.map(t => (
          <button key={`${t._clientId}-${t.id}`} type="button" onClick={() => onTaskClick(t)}
            className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-xl ${c.rowHover} transition-colors min-h-[44px]`}>
            {red ? <AlertTriangle size={10} className="text-red-400 shrink-0" /> : <Clock size={10} className="text-indigo-400 shrink-0" />}
            <span className={`text-xs ${c.taskText} font-medium flex-1 min-w-0 truncate`}>{t.name || t.comment}</span>
            {t._clientName && <span className={`text-[10px] ${c.countText} shrink-0 truncate max-w-[80px]`}>{t._clientName}</span>}
          </button>
        ))}
      </div>
    </details>
  );
}
