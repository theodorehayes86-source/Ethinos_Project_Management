import React, { useMemo, useState } from 'react';
import { X, Search, ChevronLeft, Eye, Lock, Calendar, Building2 } from 'lucide-react';
import TaskDetailSheet from './TaskDetailSheet.jsx';
import { clientPreviewTasks, isRealClientId } from '../lib/clientPortal/core.js';

const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

/**
 * Staff client surface for mobile: pick an authorised client, then switch
 * between Internal (all visible staff tasks) and Client preview (exactly the
 * client-safe projection, no checklists/templates/internal descriptions).
 */
export default function ClientPreviewSheet({ clients, clientLogs, currentUser, users, isManager, canSeeTask = () => true, onClose }) {
  const [q, setQ] = useState('');
  const [client, setClient] = useState(null);
  const [mode, setMode] = useState('internal');
  const [selectedTask, setSelectedTask] = useState(null);

  const realClients = useMemo(
    () => (clients || []).filter(c => isRealClientId(c.id) && !c.synthetic)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [clients],
  );
  const shown = realClients.filter(c => (c.name || '').toLowerCase().includes(q.toLowerCase()));

  const internalTasks = useMemo(() => {
    if (!client) return [];
    const logs = clientLogs[String(client.id)] || {};
    return Object.entries(logs)
      .map(([key, t]) => ({ ...t, id: t?.id ?? key, _clientId: String(client.id), _clientName: client.name }))
      .filter(t => t && !t.taskGroupId && t.taskType !== 'checklist' && !t.archived && canSeeTask(t, client));
  }, [client, clientLogs, canSeeTask]);
  const previewTasks = useMemo(() => (client ? clientPreviewTasks(clientLogs[String(client.id)] || {}) : []), [client, clientLogs]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col" style={{ marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)' }}>
        <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-slate-100">
          {client && (
            <button data-testid="button-client-back" onClick={() => { setClient(null); setMode('internal'); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
          )}
          <h2 className="flex-1 text-base font-bold text-slate-900 truncate">{client ? client.name : 'Clients'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
            <X size={16} className="text-slate-600" />
          </button>
        </div>

        {!client ? (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-slate-50" />
            </div>
            {shown.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No clients available</p>}
            {shown.map(c => (
              <button key={c.id} data-testid={`button-client-${c.id}`} onClick={() => setClient(c)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white text-left min-h-[48px]">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-black flex items-center justify-center">{(c.name || '?').slice(0, 2).toUpperCase()}</div>
                <span className="flex-1 text-sm font-bold text-slate-800 truncate">{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="px-5 py-3 flex items-center justify-between gap-2">
              <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded-xl">
                {[['internal', 'Internal', Lock], ['client', 'Client preview', Eye]].map(([id, label, Icon]) => (
                  <button key={id} data-testid={`button-mobile-view-mode-${id}`} onClick={() => setMode(id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === id ? (id === 'client' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800 shadow-sm') : 'text-slate-500'}`}>
                    <Icon size={11} /> {label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-bold text-slate-400">{mode === 'client' ? previewTasks.length : internalTasks.length} tasks</span>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2">
              {mode === 'client' && (
                <p className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">Read-only: exactly what the client sees in the portal.</p>
              )}
              {(mode === 'client' ? previewTasks : internalTasks).length === 0 && (
                <div className="text-center py-10">
                  <Building2 size={28} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-medium">{mode === 'client' ? 'Nothing shared with this client' : 'No tasks'}</p>
                </div>
              )}
              {mode === 'client' ? previewTasks.map(t => (
                <div key={t.id} className="px-4 py-3 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <p className="text-sm font-bold text-slate-800">{t.title}</p>
                  <p data-testid={`preview-date-${t.id}`} className="text-xs text-slate-600 break-words"><span className="font-semibold">Date:</span> {t.date || 'No date'}</p>
                  <p data-testid={`preview-category-${t.id}`} className="text-xs text-slate-600 break-words"><span className="font-semibold">Category:</span> {t.category || 'Uncategorised'}</p>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={`font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status}</span>
                    <span className="flex items-center gap-1 text-slate-500"><Calendar size={10} />{t.dueDate || 'No due date'}</span>
                  </div>
                  <p className="text-xs text-slate-500 whitespace-pre-wrap">{t.description || 'No client description'}</p>
                </div>
              )) : internalTasks.map(t => (
                <button key={t.id} onClick={() => setSelectedTask(t)} className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 bg-white space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-sm font-bold text-slate-800 truncate">{t.name || t.comment || 'Task'}</p>
                    {t.visibility === 'client' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center gap-0.5"><Eye size={8} /> Client</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className={`font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status || 'Pending'}</span>
                    {t.assigneeName && <span className="truncate">{t.assigneeName}</span>}
                    {t.dueDate && <span>Due {t.dueDate}</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          clientLogs={clientLogs}
          currentUser={currentUser}
          isManager={isManager}
          users={users}
          clients={clients}
        />
      )}
    </div>
  );
}
