import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react';
import TaskDetailSheet from './TaskDetailSheet.jsx';

export default function NotificationsPanel({ notifications, onClose, isManager, clientLogs, currentUser }) {
  const [selectedTask, setSelectedTask] = useState(null);

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-t-3xl max-h-[75vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Notifications</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <X size={16} className="text-slate-600" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle size={36} className="text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold text-sm">All clear!</p>
                <p className="text-xs text-slate-400 mt-1">No pending notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((item, i) => {
                  const isApproval = item._type === 'approved' || item.qcStatus === 'approved';
                  const isReturned = item._type === 'returned' || item.qcStatus === 'rejected';
                  const isPending  = item.qcStatus === 'sent';

                  return (
                    <button
                      key={`${item._clientId}-${item.id}-${i}`}
                      onClick={() => setSelectedTask(item)}
                      className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isApproval ? 'bg-emerald-100' : isReturned ? 'bg-red-100' : 'bg-amber-100'
                      }`}>
                        {isApproval && <CheckCircle size={16} className="text-emerald-600" />}
                        {isReturned && <XCircle size={16} className="text-red-600" />}
                        {isPending  && <Clock size={16} className="text-amber-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-snug">
                          {isApproval && 'Task approved'}
                          {isReturned && 'Task returned for revision'}
                          {isPending  && 'Task pending QC review'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{item.name || item.comment}</p>
                        {item._clientName && (
                          <p className="text-xs text-slate-400 mt-0.5">{item._clientName}</p>
                        )}
                        {item.qcRating && (
                          <p className="text-xs text-amber-500 font-semibold mt-0.5">★ {item.qcRating}/10</p>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          clientLogs={clientLogs}
          currentUser={currentUser}
        />
      )}
    </>
  );
}
