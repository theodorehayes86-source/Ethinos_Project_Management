import React from 'react';
import { Users, ChevronRight, Link2, Link2Off, LogIn, LogOut, Star } from 'lucide-react';
import { personDisplayName } from './displayName.js';

export function MemberTaskFilter({ label, value, active, red, onClick }) {
  if (!value) return null;
  const colour = active ? (red ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white') : (red ? 'text-red-500 hover:bg-red-50' : 'text-indigo-600 hover:bg-indigo-50');
  return <button type="button" onClick={onClick} aria-pressed={!!active} className={`inline-flex items-center gap-1 min-h-[36px] px-1.5 py-1 rounded-lg transition-colors whitespace-nowrap ${colour}`}>
    <span className="text-sm font-black leading-none">{value}</span>
    <span className="text-[9px] uppercase tracking-wide leading-tight">{label}</span>
  </button>;
}

export default function MemberCardHeader({ user, stats, leaveStatus, leaveDate, attendanceStatus, taskFilter, onFilter, onOpenTasks, hasTeam, onDrillIn }) {
  const displayName = personDisplayName(user.name);
  const arrived = attendanceStatus && (attendanceStatus.hasArrived ?? (attendanceStatus.clockIn !== null));
  const fmt = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const initials = displayName.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const pill = 'inline-flex items-center gap-0.5 text-[9px] leading-4 font-bold px-1.5 rounded-full border whitespace-nowrap';
  const dot = leaveStatus === 'on_leave' ? 'bg-orange-400' : leaveStatus === 'leave_soon' ? 'bg-amber-300' : attendanceStatus?.isInOffice ? 'bg-emerald-400' : arrived ? 'bg-slate-400' : 'bg-red-400';
  const dotTitle = leaveStatus === 'on_leave' ? 'On Leave' : leaveStatus === 'leave_soon' ? 'Leave Soon' : attendanceStatus?.isInOffice ? 'In office' : arrived ? 'Left for day' : 'Not arrived';
  return (
    <div data-testid={`member-card-header-${user.id}`} className="px-3 pt-3 pb-2">
      <button type="button" onClick={onOpenTasks} className="flex items-start gap-2 w-full min-w-0 text-left rounded-lg active:bg-slate-50 focus-visible:ring-2 ring-indigo-400">
        <span className="w-7 h-7 mt-0.5 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 relative">
          <span className="text-indigo-700 font-black text-[10px]">{initials}</span>
          {(attendanceStatus || leaveStatus === 'on_leave' || leaveStatus === 'leave_soon') && <span title={dotTitle} className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${dot}`} />}
        </span>
        <span className="flex-1 min-w-0">
          <span data-testid="text-member-name" className="block text-sm leading-5 font-bold text-slate-900 break-words [overflow-wrap:anywhere]">{displayName}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
            <span className="text-[10px] text-slate-400">{user.role}</span>
            <span className={`${pill} ${user.kekaEmployeeId ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
              {user.kekaEmployeeId ? <Link2 size={8} /> : <Link2Off size={8} />}{user.kekaEmployeeId ? 'Keka' : 'No Keka'}
            </span>
            {leaveStatus === 'on_leave' && <span className={`${pill} bg-orange-100 text-orange-700 border-orange-200`}>On Leave</span>}
            {leaveStatus === 'leave_soon' && leaveDate && <span className={`${pill} bg-amber-100 text-amber-700 border-amber-200`}>Leave {new Date(`${leaveDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
            {leaveStatus !== 'on_leave' && attendanceStatus && (arrived
              ? <span className={`${pill} ${attendanceStatus.isInOffice ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}><LogIn size={8} />{fmt(attendanceStatus.clockIn)}{!attendanceStatus.isInOffice && attendanceStatus.clockOut && <>{' · '}<LogOut size={8} />{fmt(attendanceStatus.clockOut)}</>}</span>
              : <span className={`${pill} bg-red-50 text-red-500 border-red-200`}>Not Arrived</span>)}
            {stats.avgRating && <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 font-bold"><Star size={9} className="fill-amber-400" />{stats.avgRating.toFixed(1)}/10</span>}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-0.5 mt-1">
        <MemberTaskFilter label="Pending" value={stats.pending} active={taskFilter === 'pending'} onClick={() => onFilter('pending')} />
        <MemberTaskFilter label="Today" value={stats.today} active={taskFilter === 'today'} onClick={() => onFilter('today')} />
        <MemberTaskFilter label="Overdue" value={stats.overdue} red active={taskFilter === 'overdue'} onClick={() => onFilter('overdue')} />
        <MemberTaskFilter label="QC" value={stats.pendingQC} active={taskFilter === 'awaitingQC'} onClick={() => onFilter('awaitingQC')} />
        {hasTeam && <button type="button" onClick={() => onDrillIn(user)} aria-label={`View ${displayName}'s team`} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 min-h-[36px]">
          <Users size={10} className="text-indigo-500" /><span className="text-[9px] font-bold text-indigo-600 uppercase">Team</span><ChevronRight size={10} className="text-indigo-400" />
        </button>}
      </div>
    </div>
  );
}
