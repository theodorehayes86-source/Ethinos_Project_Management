import React, { useState } from 'react';
import { X, Star, CheckCircle, XCircle, Clock, Tag, Calendar, Loader2 } from 'lucide-react';
import { updateTaskInFirebase } from '../hooks/useFirebaseData.js';

const STATUS_OPTIONS = ['Pending', 'WIP', 'Done'];
const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

export default function TaskDetailSheet({ task, onClose, clientLogs, currentUser, readOnly }) {
  const [status, setStatus] = useState(task.status || 'Pending');
  const [saving, setSaving] = useState(false);

  const persistUpdate = async (updates) => {
    setSaving(true);
    try {
      await updateTaskInFirebase(task._clientId, task.id, updates, clientLogs);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    await persistUpdate({ status: newStatus });
  };

  const canEdit = !readOnly && currentUser && String(task.assigneeId) === String(currentUser.id);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 truncate pr-4 flex-1">
            {task.name || task.comment || 'Task'}
          </h2>
          <div className="flex items-center gap-2">
            {saving && <Loader2 size={16} className="text-indigo-400 animate-spin" />}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <X size={16} className="text-slate-600" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
              {status}
            </span>
            {task.category && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 flex items-center gap-1">
                <Tag size={10} /> {task.category}
              </span>
            )}
          </div>

          {task.comment && task.name && (
            <p className="text-sm text-slate-600 leading-relaxed">{task.comment}</p>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            {task._clientName && (
              <span className="flex items-center gap-1"><Tag size={11} /> {task._clientName}</span>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1"><Calendar size={11} /> Due {task.dueDate}</span>
            )}
          </div>

          {canEdit && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Update Status</p>
              <div className="flex gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all min-h-[44px] ${
                      status === s
                        ? s === 'Done' ? 'bg-emerald-600 text-white border-emerald-600'
                          : s === 'WIP' ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {task.qcStatus && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">QC Review</p>
              <div className={`rounded-xl p-4 border ${
                task.qcStatus === 'approved' ? 'bg-emerald-50 border-emerald-100' :
                task.qcStatus === 'rejected' ? 'bg-red-50 border-red-100' :
                'bg-amber-50 border-amber-100'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {task.qcStatus === 'approved' && <CheckCircle size={16} className="text-emerald-600" />}
                  {task.qcStatus === 'rejected' && <XCircle size={16} className="text-red-600" />}
                  {task.qcStatus === 'sent' && <Clock size={16} className="text-amber-600" />}
                  <span className={`text-sm font-bold ${
                    task.qcStatus === 'approved' ? 'text-emerald-700' :
                    task.qcStatus === 'rejected' ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    {task.qcStatus === 'approved' ? 'Approved' : task.qcStatus === 'rejected' ? 'Returned for revision' : 'Pending QC review'}
                  </span>
                  {task.qcRating && (
                    <span className="ml-auto flex items-center gap-1 text-amber-500 font-bold text-sm">
                      <Star size={13} className="fill-amber-400 text-amber-400" /> {task.qcRating}/10
                    </span>
                  )}
                </div>
                {(task.qcComment || task.qcFeedback) && (
                  <p className="text-xs text-slate-600 mt-1">{task.qcComment || task.qcFeedback}</p>
                )}
              </div>
            </div>
          )}

          {task.repeatFrequency && task.repeatFrequency !== 'Once' && (
            <p className="text-xs text-slate-400">Repeats: {task.repeatFrequency}</p>
          )}
        </div>
      </div>
    </div>
  );
}
