import React, { useState, useRef, useEffect } from 'react';
import { X, Star, CheckCircle, XCircle, Clock, Tag, Calendar, Loader2, Send, MessageCircle, ListChecks, Check, Square, AlertTriangle } from 'lucide-react';
import { updateTaskInFirebase } from '../hooks/useFirebaseData.js';
import { isTaskOverdue } from '../utils/taskUtils.js';

const STATUS_OPTIONS = ['Pending', 'WIP', 'Done'];
const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TaskDetailSheet({ task, onClose, clientLogs, currentUser, readOnly }) {
  const [status, setStatus] = useState(task.status || 'Pending');
  const [steps, setSteps] = useState(() => Array.isArray(task.steps) ? task.steps : []);
  const [messages, setMessages] = useState(() => Array.isArray(task.messages) ? task.messages : []);
  const [newMessage, setNewMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('details');
  const messagesEndRef = useRef(null);

  const canEdit = !readOnly && currentUser && String(task.assigneeId) === String(currentUser.id);
  const canChat = !!currentUser;
  const isOverdue = isTaskOverdue(task, status);

  useEffect(() => {
    if (activeSection === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeSection]);

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

  const handleToggleStep = async (stepId) => {
    if (!canEdit) return;
    const updated = steps.map(s =>
      String(s.id) === String(stepId) ? { ...s, done: !s.done } : s
    );
    setSteps(updated);
    await persistUpdate({ steps: updated });
  };

  const handleSendMessage = async () => {
    const text = newMessage.trim();
    if (!text || !currentUser) return;
    const msg = {
      id: `msg-${Date.now()}`,
      text,
      author: currentUser.name || 'You',
      authorId: currentUser.id,
      timestamp: new Date().toISOString(),
    };
    const updated = [...messages, msg];
    setMessages(updated);
    setNewMessage('');
    await persistUpdate({ messages: updated });
  };

  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[90vh] flex flex-col">

        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
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

        <div className="flex border-b border-slate-100 px-5">
          {[
            { id: 'details', label: 'Details' },
            { id: 'steps', label: `Checklist${steps.length ? ` (${doneCount}/${steps.length})` : ''}` },
            { id: 'chat', label: `Chat${messages.length ? ` (${messages.length})` : ''}` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
                activeSection === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {activeSection === 'details' && (
            <div className="px-5 py-4 space-y-5">
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
                  {status}
                </span>
                {isOverdue && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600 flex items-center gap-1">
                    <AlertTriangle size={10} /> Overdue
                  </span>
                )}
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
                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : ''}`}>
                    <Calendar size={11} /> Due {task.dueDate}
                  </span>
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
          )}

          {activeSection === 'steps' && (
            <div className="px-5 py-4">
              {steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ListChecks size={32} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-medium">No checklist items</p>
                  <p className="text-xs text-slate-300 mt-1">Checklist items can be added from the desktop app</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {doneCount} of {steps.length} complete
                    </p>
                    <div className="flex-1 ml-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  {steps.map(step => (
                    <button
                      key={step.id}
                      onClick={() => handleToggleStep(step.id)}
                      disabled={!canEdit}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all min-h-[48px] ${
                        step.done
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-white border-slate-200'
                      } ${canEdit ? 'active:scale-[0.98]' : 'cursor-default'}`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        step.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                      }`}>
                        {step.done && <Check size={12} className="text-white" />}
                      </div>
                      <span className={`text-sm font-medium flex-1 ${step.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {step.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'chat' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 px-5 py-4 space-y-3 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-medium">No messages yet</p>
                    {canChat && <p className="text-xs text-slate-300 mt-1">Be the first to send a message</p>}
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = currentUser && String(msg.authorId) === String(currentUser.id);
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-slate-400 font-medium mb-1 px-1">
                          {msg.author} · {formatTime(msg.timestamp)}
                        </span>
                        <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {canChat && (
                <div className="px-4 py-3 border-t border-slate-100 flex gap-2 items-end">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    placeholder="Write a message…"
                    className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
                  >
                    <Send size={16} className="text-white" />
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
