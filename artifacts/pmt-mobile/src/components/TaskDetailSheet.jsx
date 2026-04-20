import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Star, CheckCircle, XCircle, Clock, Tag, Calendar, Loader2, Send, MessageCircle, ListChecks, Check, AlertTriangle, CornerUpLeft, Pencil, Trash2, Smile, Archive } from 'lucide-react';
import { updateTaskInFirebase } from '../hooks/useFirebaseData.js';
import { isTaskOverdue } from '../utils/taskUtils.js';

const STATUS_OPTIONS = ['Pending', 'WIP', 'Done'];
const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

const EMOJIS = ['👍','👎','❤️','😊','😂','🎉','🙏','👏','🔥','✅','⚠️','💪','😅','🤔','💡','🚀','✨','👋','😍','🤝','👀','💯','🫡','😬','🙌'];

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMentions(text) {
  if (!text) return text;
  const parts = text.split(/(@\w[\w\s]*)/g);
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-indigo-500 font-semibold">{part}</span>
      : part
  );
}

export default function TaskDetailSheet({ task, onClose, clientLogs, currentUser, readOnly, users = [], clients = [] }) {
  const [status, setStatus] = useState(task.status || 'Pending');
  const [steps, setSteps] = useState(() => Array.isArray(task.steps) ? task.steps : []);
  const [messages, setMessages] = useState(() => Array.isArray(task.messages) ? task.messages : []);
  const [newMessage, setNewMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('details');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState(null);

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const canEdit = !readOnly && currentUser && String(task.assigneeId) === String(currentUser.id);
  const canChat = !!currentUser;
  const isOverdue = isTaskOverdue(task, status);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await updateTaskInFirebase(task._clientId, task.id, { archived: true }, clientLogs);
      onClose();
    } finally {
      setArchiving(false);
    }
  };

  const taskClient = (clients || []).find(c => String(c.id) === String(task._clientId));
  const mentionableUsers = (users || []).filter(u => String(u.id) !== String(currentUser?.id));
  const projectUsers = taskClient
    ? mentionableUsers.filter(u => (u.assignedProjects || []).includes(taskClient.name))
    : [];
  const projectUserIds = new Set(projectUsers.map(u => u.id));
  const otherUsers = mentionableUsers.filter(u => !projectUserIds.has(u.id));
  const orderedUsers = [...projectUsers, ...otherUsers];

  const filteredMentions = mentionQuery
    ? orderedUsers.filter(u => u.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : orderedUsers;

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

  const handleInputChange = (e) => {
    const val = e.target.value;
    setNewMessage(val);

    const cursor = e.target.selectionStart;
    const upToCursor = val.slice(0, cursor);
    const atIdx = upToCursor.lastIndexOf('@');
    if (atIdx !== -1) {
      const query = upToCursor.slice(atIdx + 1);
      if (/^[\w\s]*$/.test(query) && !query.includes('  ')) {
        setMentionQuery(query);
        setMentionStartIndex(atIdx);
        setShowMentionMenu(true);
        return;
      }
    }
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(null);
  };

  const insertMention = (user) => {
    const before = newMessage.slice(0, mentionStartIndex);
    const after = newMessage.slice(mentionStartIndex + 1 + mentionQuery.length);
    setNewMessage(before + '@' + user.name + ' ' + after);
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const insertEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSendMessage = async () => {
    const text = newMessage.trim();
    if (!text || !currentUser) return;
    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      author: currentUser.name || 'You',
      authorId: String(currentUser.id),
      timestamp: new Date().toISOString(),
      ...(replyingTo ? { replyTo: { id: replyingTo.id, author: replyingTo.author, text: replyingTo.text } } : {}),
    };
    const updated = [...messages, msg];
    setMessages(updated);
    setNewMessage('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    await persistUpdate({ messages: updated });
  };

  const handleEditSave = async (msgId) => {
    const text = editText.trim();
    if (!text) return;
    const updated = messages.map(m =>
      m.id === msgId ? { ...m, text, edited: true } : m
    );
    setMessages(updated);
    setEditingMsgId(null);
    setEditText('');
    await persistUpdate({ messages: updated });
  };

  const handleDelete = async (msgId) => {
    const updated = messages.map(m =>
      m.id === msgId ? { ...m, deleted: true, text: '' } : m
    );
    setMessages(updated);
    setActiveMenu(null);
    await persistUpdate({ messages: updated });
  };

  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => { setActiveMenu(null); setShowEmojiPicker(false); }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between rounded-t-3xl">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-slate-900 truncate">
              {task.name || task.comment || 'Task'}
            </h2>
            {isOverdue && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={10} /> Overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saving && <Loader2 size={16} className="text-indigo-400 animate-spin" />}
            {canEdit && (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"
                title="Archive task"
              >
                <Archive size={15} className="text-slate-500" />
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <X size={16} className="text-slate-600" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-100 px-5">
          {[
            { id: 'details', label: 'Details' },
            { id: 'steps', label: `Checklist${steps.length ? ` (${doneCount}/${steps.length})` : ''}` },
            { id: 'chat', label: `Chat${messages.length ? ` (${messages.filter(m => !m.deleted).length})` : ''}` },
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

        <div className="flex-1 overflow-y-auto min-h-0">

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
                        step.done ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-200'
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
              <div className="flex-1 px-4 py-3 space-y-3 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(90vh - 240px)' }}>
                {messages.filter(m => !m.deleted || activeMenu === m.id).length === 0 && messages.every(m => m.deleted) ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-medium">No messages yet</p>
                    {canChat && <p className="text-xs text-slate-300 mt-1">Be the first to send a message</p>}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-medium">No messages yet</p>
                    {canChat && <p className="text-xs text-slate-300 mt-1">Be the first to send a message</p>}
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = currentUser && String(msg.authorId) === String(currentUser.id);
                    const isMenuOpen = activeMenu === msg.id;
                    const isEditing = editingMsgId === msg.id;

                    if (msg.deleted) {
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-xs italic text-slate-300 px-3 py-1.5">Message deleted</span>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-slate-400 font-medium mb-1 px-1">
                          {msg.author} · {formatTime(msg.timestamp)}{msg.edited ? ' · edited' : ''}
                        </span>

                        {msg.replyTo && (
                          <div className={`max-w-[80%] mb-1 px-3 py-1.5 rounded-xl border-l-2 border-indigo-300 bg-indigo-50/60 ${isMe ? 'mr-1' : 'ml-1'}`}>
                            <p className="text-[10px] font-semibold text-indigo-500 mb-0.5">{msg.replyTo.author}</p>
                            <p className="text-[11px] text-slate-500 truncate">{msg.replyTo.text}</p>
                          </div>
                        )}

                        {isEditing ? (
                          <div className="max-w-[85%] w-full space-y-1.5">
                            <textarea
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              autoFocus
                              rows={2}
                              className="w-full px-3 py-2 rounded-xl border border-indigo-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-white resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingMsgId(null)} className="text-xs text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold">Cancel</button>
                              <button onClick={() => handleEditSave(msg.id)} className="text-xs text-white bg-indigo-600 px-3 py-1.5 rounded-lg font-semibold">Save</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setActiveMenu(isMenuOpen ? null : msg.id)}
                            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed text-left transition-opacity active:opacity-70 ${
                              isMe
                                ? 'bg-indigo-600 text-white rounded-br-sm'
                                : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                            }`}
                          >
                            {renderMentions(msg.text)}
                          </button>
                        )}

                        {isMenuOpen && !isEditing && (
                          <div className={`flex items-center gap-1 mt-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                            {canChat && (
                              <button
                                onClick={() => { setReplyingTo({ id: msg.id, author: msg.author, text: msg.text }); setActiveMenu(null); setTimeout(() => inputRef.current?.focus(), 100); }}
                                className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2.5 py-1 shadow-sm"
                              >
                                <CornerUpLeft size={10} /> Reply
                              </button>
                            )}
                            {isMe && (
                              <>
                                <button
                                  onClick={() => { setEditingMsgId(msg.id); setEditText(msg.text); setActiveMenu(null); }}
                                  className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2.5 py-1 shadow-sm"
                                >
                                  <Pencil size={10} /> Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(msg.id)}
                                  className="flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-white border border-red-100 rounded-full px-2.5 py-1 shadow-sm"
                                >
                                  <Trash2 size={10} /> Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {canChat && (
                <div className="flex-shrink-0 border-t border-slate-100">
                  {replyingTo && (
                    <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                      <div className="flex-1 flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 min-w-0">
                        <CornerUpLeft size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold text-indigo-500">{replyingTo.author}</p>
                          <p className="text-[11px] text-slate-500 truncate">{replyingTo.text}</p>
                        </div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="p-1 text-slate-400 hover:text-slate-600 flex-shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {showMentionMenu && filteredMentions.length > 0 && (
                    <div className="mx-4 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {(() => {
                        const visibleFiltered = filteredMentions.slice(0, 8);
                        const visibleProjectIds = new Set(projectUsers.map(u => u.id));
                        const hasProjectSection = !mentionQuery && projectUsers.length > 0;
                        const hasOtherSection = !mentionQuery && otherUsers.length > 0 && projectUsers.length > 0;
                        return visibleFiltered.map((u, idx) => {
                          const isProjectUser = visibleProjectIds.has(u.id);
                          const showProjectHeader = hasProjectSection && idx === 0;
                          const showOtherHeader = hasOtherSection && !isProjectUser &&
                            (idx === 0 || visibleProjectIds.has(visibleFiltered[idx - 1].id));
                          return (
                            <React.Fragment key={u.id}>
                              {showProjectHeader && (
                                <div className="px-3 py-1 bg-indigo-50 border-b border-indigo-100">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-500">
                                    {taskClient?.name || 'Project'} Team
                                  </p>
                                </div>
                              )}
                              {showOtherHeader && (
                                <div className="px-3 py-1 bg-slate-50 border-b border-slate-100">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Others</p>
                                </div>
                              )}
                              <button
                                onClick={() => insertMention(u)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0"
                              >
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isProjectUser ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                                  <span className={`text-[10px] font-black ${isProjectUser ? 'text-indigo-600' : 'text-slate-500'}`}>{(u.name || '?')[0].toUpperCase()}</span>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-800">{u.name}</p>
                                  {u.role && <p className="text-[10px] text-slate-400">{u.role}</p>}
                                </div>
                              </button>
                            </React.Fragment>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {showEmojiPicker && (
                    <div className="mx-4 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5">
                      <div className="grid grid-cols-5 gap-1">
                        {EMOJIS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => insertEmoji(emoji)}
                            className="text-xl p-1.5 rounded-lg hover:bg-slate-100 transition-colors min-h-[40px] flex items-center justify-center"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="px-4 py-3 flex gap-2 items-end">
                    <button
                      onClick={() => { setShowEmojiPicker(p => !p); setShowMentionMenu(false); }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors ${showEmojiPicker ? 'bg-indigo-50 border-indigo-200 text-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                    >
                      <Smile size={18} />
                    </button>
                    <input
                      ref={inputRef}
                      type="text"
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder={replyingTo ? 'Write a reply…' : 'Write a message… (@ to mention)'}
                      className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50 min-h-[44px]"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim()}
                      className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
                    >
                      <Send size={16} className="text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {showArchiveConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/50 rounded-t-3xl">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Archive size={18} className="text-amber-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Archive this task?</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Archived tasks are hidden from your mobile view. You can only view and restore them from the <span className="font-semibold text-slate-700">desktop app</span>. This task will no longer appear in your mobile task lists.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 active:bg-slate-200 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-sm font-bold text-white active:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
              >
                {archiving ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
