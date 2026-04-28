import React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

const LeaveConflictModal = ({ conflict, userName, onProceed, onCancel }) => {
  if (!conflict) return null;

  const isHard = conflict.type === 'full-leave' || conflict.type === 'holiday';
  const name = userName || 'The assignee';

  let title = '';
  let message = '';
  let detail = '';

  if (conflict.type === 'holiday') {
    title = 'Public Holiday';
    message = `${name} has a public holiday on this date.`;
    detail = conflict.holidayName || 'Public Holiday';
  } else if (conflict.type === 'full-leave') {
    title = 'Employee on Leave';
    message = `${name} is on ${conflict.leaveType || 'leave'} for the full day.`;
    detail = conflict.leaveType || 'Leave';
  } else {
    title = 'Half-Day Leave';
    message = `${name} has a half-day leave on this date.`;
    const sessionLabel =
      conflict.session === 'first-half' ? 'morning (first half)' :
      conflict.session === 'second-half' ? 'afternoon (second half)' : 'part of the day';
    detail = `${conflict.leaveType || 'Leave'} — ${sessionLabel} unavailable`;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-t-3xl w-full shadow-2xl overflow-hidden">
        <div className={`px-5 py-4 flex items-start gap-3 ${isHard ? 'bg-red-50 border-b border-red-100' : 'bg-amber-50 border-b border-amber-100'}`}>
          {isHard
            ? <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            : <Info size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />}
          <div className="flex-1">
            <h3 className={`text-sm font-bold ${isHard ? 'text-red-900' : 'text-amber-900'}`}>{title}</h3>
            <p className={`text-xs mt-0.5 leading-relaxed ${isHard ? 'text-red-700' : 'text-amber-700'}`}>{message}</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-full active:bg-black/10">
            <X size={14} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold mb-3 ${isHard ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {detail}
          </span>
          <p className="text-sm text-slate-600 leading-relaxed">
            {isHard
              ? 'This task may not be actionable on this date. You can proceed anyway or pick a different date.'
              : 'The assignee is available for part of the day. You can proceed or adjust the due date.'}
          </p>
        </div>

        <div className="px-5 pb-6 pt-2 flex flex-col gap-2.5">
          <button
            onClick={onProceed}
            className={`w-full py-3 rounded-2xl text-sm font-bold text-white transition-colors ${isHard ? 'bg-red-600 active:bg-red-700' : 'bg-amber-500 active:bg-amber-600'}`}
          >
            {isHard ? 'Proceed anyway' : 'Acknowledge & proceed'}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-2xl text-sm font-bold bg-slate-100 text-slate-700 active:bg-slate-200 transition-colors"
          >
            Cancel — change date
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveConflictModal;
