import React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

/**
 * @param {{
 *  conflict: import('../utils/leaveConflict').LeaveConflict|null,
 *  userName?: string,
 *  onProceed: () => void,
 *  onCancel: () => void,
 * }} props
 */
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
    message = `${name} is on ${conflict.leaveType || 'leave'} for the full day on this date.`;
    detail = conflict.leaveType || 'Leave';
  } else {
    title = 'Half-Day Leave';
    message = `${name} has a half-day leave on this date.`;
    const sessionLabel =
      conflict.session === 'first-half'
        ? 'morning (first half)'
        : conflict.session === 'second-half'
          ? 'afternoon (second half)'
          : 'part of the day';
    detail = `${conflict.leaveType || 'Leave'} — ${sessionLabel} unavailable`;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className={`px-6 py-4 flex items-start gap-3 ${isHard ? 'bg-red-50 border-b border-red-200' : 'bg-amber-50 border-b border-amber-200'}`}>
          {isHard
            ? <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            : <Info size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />}
          <div className="flex-1">
            <h3 className={`text-sm font-bold ${isHard ? 'text-red-900' : 'text-amber-900'}`}>{title}</h3>
            <p className={`text-xs mt-0.5 ${isHard ? 'text-red-700' : 'text-amber-700'}`}>{message}</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-black/10 transition-colors">
            <X size={14} className="text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold mb-4 ${isHard ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {detail}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            {isHard
              ? 'Due to this conflict, the task may not be actionable on this date. You can proceed anyway or pick a different date or assignee.'
              : 'This is a soft warning. The assignee is available for part of the day. You can proceed or adjust the due date.'}
          </p>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel — change date
          </button>
          <button
            onClick={onProceed}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${isHard ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
          >
            {isHard ? 'Proceed anyway' : 'Acknowledge & proceed'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveConflictModal;
