import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Send, Link, Check, ExternalLink, AtSign, MessageSquare, CheckCircle, XCircle, CornerDownLeft, Pencil } from 'lucide-react';
import { format, parse, isBefore } from 'date-fns';
import { sendNotification } from '../utils/notify';
import DueDateInput from './DueDateInput';

const statusColors = {
  Done: 'bg-emerald-100 text-emerald-700',
  WIP: 'bg-blue-100 text-blue-700',
  Pending: 'bg-orange-100 text-orange-700',
};

const parseMentions = (text, userList = []) => {
  return userList.filter(u => u.name && text.includes(`@${u.name}`));
};

const renderMessageText = (text) => {
  const parts = text.split(/(@\S[\w\s]*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="font-semibold text-blue-300 bg-blue-900/30 px-0.5 rounded">
          {part}
        </span>
      );
    }
    return part;
  });
};

function buildFeedbackThread(task) {
  const thread = Array.isArray(task.feedbackThread) ? [...task.feedbackThread] : [];
  if (thread.length === 0) {
    if (task.qcComment) thread.push({ id: 'legacy-approved', authorName: task.qcReviewerName || 'Reviewer', text: task.qcComment, type: 'approved', timestamp: task.qcReviewedAt });
    if (task.qcFeedback) thread.push({ id: 'legacy-rejected', authorName: task.qcReviewerName || 'Reviewer', text: task.qcFeedback, type: 'rejected', timestamp: task.qcReviewedAt });
  }
  return thread;
}

const tryParseDate = (str) => {
  if (!str) return null;
  try {
    const d = parse(str, 'do MMM yyyy', new Date());
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const TaskDetailPanel = ({ task, currentUser, users = [], canEdit = true, canEditDueDate = true, setNotifications = () => {}, onClose, onUpdate, seriesCount = 0 }) => {
  const [steps, setSteps] = useState(() => task.steps || []);
  const [messages, setMessages] = useState(() => task.messages || []);
  const [localDueDate, setLocalDueDate] = useState(() => tryParseDate(task.dueDate));
  const [links, setLinks] = useState(() => task.links || []);
  const [feedbackThread, setFeedbackThread] = useState(() => buildFeedbackThread(task));
  const [newFeedback, setNewFeedback] = useState('');
  const [replyingToFeedbackId, setReplyingToFeedbackId] = useState(null);
  const feedbackInputRef = useRef(null);
  const [seriesScope, setSeriesScope] = useState('one');

  // Edit/delete state for messages
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editMsgText, setEditMsgText] = useState('');

  // Edit/delete state for feedback thread entries
  const [editingFbEntryId, setEditingFbEntryId] = useState(null);
  const [editFbEntryText, setEditFbEntryText] = useState('');

  const [newStepLabel, setNewStepLabel] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');

  // @mention state
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState(null);
  const msgInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setLocalDueDate(tryParseDate(task.dueDate));
  }, [task.id, task.dueDate]);

  const saveUpdate = (updatedTask) => onUpdate(updatedTask, seriesScope);

  const handleDueDateChange = (date) => {
    setLocalDueDate(date);
    saveUpdate({ ...task, steps, messages, links, dueDate: date ? format(date, 'do MMM yyyy') : null });
  };

  // --- Mention helpers ---
  const mentionableUsers = users.filter(u => String(u.id) !== String(currentUser?.id));
  const filteredMentions = mentionQuery
    ? mentionableUsers.filter(u => u.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : mentionableUsers;

  const handleMessageChange = (e) => {
    const val = e.target.value;
    setNewMessage(val);

    const cursor = e.target.selectionStart;
    const textUpToCursor = val.slice(0, cursor);
    const atIdx = textUpToCursor.lastIndexOf('@');

    if (atIdx !== -1) {
      const query = textUpToCursor.slice(atIdx + 1);
      if (/^[\w\s]*$/.test(query)) {
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

  const handleSelectMention = (user) => {
    const before = newMessage.slice(0, mentionStartIndex);
    const after = newMessage.slice(mentionStartIndex + 1 + mentionQuery.length);
    const inserted = `@${user.name} `;
    setNewMessage(before + inserted + after);
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(null);
    setTimeout(() => msgInputRef.current?.focus(), 0);
  };

  // --- Steps ---
  const handleAddStep = () => {
    const label = newStepLabel.trim();
    if (!label) return;
    const updated = [...steps, { id: `step-${Date.now()}`, label, checked: false }];
    setSteps(updated);
    setNewStepLabel('');
    saveUpdate({ ...task, steps: updated, messages, links });
  };

  const handleToggleStep = (stepId) => {
    const updated = steps.map(s => s.id === stepId ? { ...s, checked: !s.checked } : s);
    setSteps(updated);
    saveUpdate({ ...task, steps: updated, messages, links });
  };

  const handleDeleteStep = (stepId) => {
    const updated = steps.filter(s => s.id !== stepId);
    setSteps(updated);
    saveUpdate({ ...task, steps: updated, messages, links });
  };

  // --- Messages ---
  const handleSendMessage = () => {
    const text = newMessage.trim();
    if (!text) return;
    const msgId = `msg-${Date.now()}`;
    const msg = {
      id: msgId,
      authorId: currentUser?.id || null,
      authorName: currentUser?.name || 'Anonymous',
      text,
      timestamp: new Date().toISOString(),
    };
    const updated = [...messages, msg];
    setMessages(updated);
    setNewMessage('');
    setShowMentionMenu(false);
    saveUpdate({ ...task, steps, messages: updated, links });

    // Fire notifications for @mentioned users
    const mentionedUsers = parseMentions(text, users).filter(u => String(u.id) !== String(currentUser?.id));
    mentionedUsers.forEach(mentioned => {
      setNotifications(prev => [{
        id: `mention-${msgId}-${mentioned.id}`,
        type: 'mention',
        recipientId: mentioned.id,
        text: `${currentUser?.name || 'Someone'} mentioned you in "${task.name || task.comment}": "${text.length > 60 ? text.slice(0, 60) + '…' : text}"`,
        time: 'Just now',
        read: false,
        taskId: task.id,
        clientId: task.cid,
      }, ...prev]);

      const recipientEmail = mentioned.email || mentioned.emailAddress;
      if (recipientEmail) {
        sendNotification('mention', {
          recipientEmail,
          recipientName: mentioned.name,
          mentionerName: currentUser?.name,
          taskName: task.name || task.comment,
          clientName: task.clientName || task.cid || '',
          messageText: text,
        });
      }
    });
  };

  // --- Message edit / delete ---
  const handleSaveEditMsg = (msgId) => {
    const text = editMsgText.trim();
    if (!text) return;
    const updated = messages.map(m => m.id === msgId ? { ...m, text, edited: true } : m);
    setMessages(updated);
    setEditingMsgId(null);
    setEditMsgText('');
    saveUpdate({ ...task, steps, messages: updated, links });
  };

  const handleDeleteMsg = (msgId) => {
    const updated = messages.filter(m => m.id !== msgId);
    setMessages(updated);
    saveUpdate({ ...task, steps, messages: updated, links });
  };

  // --- Feedback thread entry edit / delete ---
  const handleSaveEditFbEntry = (entryId) => {
    const text = editFbEntryText.trim();
    if (!text) return;
    const updated = feedbackThread.map(e => e.id === entryId ? { ...e, text, edited: true } : e);
    setFeedbackThread(updated);
    setEditingFbEntryId(null);
    setEditFbEntryText('');
    saveUpdate({ ...task, steps, messages, links, feedbackThread: updated });
  };

  const handleDeleteFbEntry = (entryId) => {
    // Remove entry and any children that reply to it
    const removeIds = new Set([entryId]);
    let changed = true;
    while (changed) {
      changed = false;
      feedbackThread.forEach(e => { if (e.replyToId && removeIds.has(e.replyToId) && !removeIds.has(e.id)) { removeIds.add(e.id); changed = true; } });
    }
    const updated = feedbackThread.filter(e => !removeIds.has(e.id));
    setFeedbackThread(updated);
    saveUpdate({ ...task, steps, messages, links, feedbackThread: updated });
  };

  // --- Feedback Thread ---
  useEffect(() => {
    if (replyingToFeedbackId !== null) feedbackInputRef.current?.focus();
  }, [replyingToFeedbackId]);

  const handleAddFeedback = (replyToId) => {
    const text = newFeedback.trim();
    if (!text) return;
    const entry = {
      id: `fb-${Date.now()}`,
      authorId: currentUser?.id || null,
      authorName: currentUser?.name || 'Anonymous',
      text,
      type: 'comment',
      timestamp: new Date().toISOString(),
      ...(replyToId && replyToId !== '__new__' ? { replyToId } : {}),
    };
    const updated = [...feedbackThread, entry];
    setFeedbackThread(updated);
    setNewFeedback('');
    setReplyingToFeedbackId(null);
    saveUpdate({ ...task, steps, messages, links, feedbackThread: updated });
  };

  // --- Links ---
  const handleAddLink = () => {
    const url = newLinkUrl.trim();
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const updated = [...links, { id: `link-${Date.now()}`, url: normalized, label: newLinkLabel.trim() || normalized }];
    setLinks(updated);
    setNewLinkUrl('');
    setNewLinkLabel('');
    saveUpdate({ ...task, steps, messages, links: updated });
  };

  const handleDeleteLink = (linkId) => {
    const updated = links.filter(l => l.id !== linkId);
    setLinks(updated);
    saveUpdate({ ...task, steps, messages, links: updated });
  };

  const checkedCount = steps.filter(s => s.checked).length;
  const progressPct = steps.length > 0 ? Math.round((checkedCount / steps.length) * 100) : 0;

  const isOverdue = (() => {
    if (!task.dueDate || task.status === 'Done') return false;
    try {
      const due = parse(task.dueDate, 'do MMM yyyy', new Date());
      return isBefore(due, new Date());
    } catch { return false; }
  })();

  return (
    <div className="fixed inset-0 z-[800] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative flex flex-col bg-white shadow-2xl w-full max-w-lg h-full overflow-hidden animate-in slide-in-from-right duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-900 leading-snug truncate">
                {task.name || task.comment || 'Task Detail'}
              </h2>
              {task.name && task.comment && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.comment}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[task.status] || 'bg-slate-100 text-slate-600'}`}>
                  {task.status}
                </span>
                {task.assigneeName && (
                  <span className="text-[10px] font-medium text-slate-500">
                    Assigned to <span className="text-slate-700 font-semibold">{task.assigneeName}</span>
                  </span>
                )}
              </div>
              {task.repeatGroupId && canEdit && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Update:</span>
                  {[
                    { id: 'one', label: 'This task only' },
                    { id: 'all', label: seriesCount > 0 ? `All tasks in this series (${seriesCount})` : 'All tasks in this series' },
                  ].map(opt => (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg cursor-pointer text-xs font-semibold transition-all select-none ${
                        seriesScope === opt.id
                          ? opt.id === 'all'
                            ? 'border-amber-400 bg-amber-50 text-amber-800'
                            : 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="detailPanelSeriesScope"
                        value={opt.id}
                        checked={seriesScope === opt.id}
                        onChange={() => setSeriesScope(opt.id)}
                        className="w-3.5 h-3.5 accent-blue-600"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
              title="Close panel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Due Date */}
          {canEdit && canEditDueDate && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Due Date</h3>
                {isOverdue && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Overdue</span>
                )}
              </div>
              <DueDateInput
                key={task.id}
                startDate={tryParseDate(task.date)}
                value={localDueDate}
                onChange={handleDueDateChange}
                minDate={tryParseDate(task.date) || new Date()}
              />
              {localDueDate && (
                <button
                  type="button"
                  onClick={() => handleDueDateChange(null)}
                  className="mt-1.5 text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                >
                  Clear due date
                </button>
              )}
            </section>
          )}
          {((!canEdit) || (!canEditDueDate)) && task.dueDate && (
            <section>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Due Date</h3>
                {isOverdue && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Overdue</span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-700">{task.dueDate}</p>
            </section>
          )}

          {/* Steps */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Steps
                {steps.length > 0 && (
                  <span className="ml-1.5 text-slate-400 font-normal normal-case">
                    {checkedCount}/{steps.length}
                  </span>
                )}
              </h3>
            </div>

            {steps.length > 0 && (
              <div className="mb-2">
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5 mb-3">
              {steps.map(step => (
                <div
                  key={step.id}
                  className="flex items-center gap-2.5 group bg-slate-50 rounded-lg px-3 py-2 border border-slate-100"
                >
                  <button
                    onClick={() => handleToggleStep(step.id)}
                    className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      step.checked
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-300 bg-white hover:border-emerald-400'
                    }`}
                    title={step.checked ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {step.checked && <Check size={10} strokeWidth={3} />}
                  </button>
                  <span className={`flex-1 text-xs ${step.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                    {step.label}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => handleDeleteStep(step.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Delete step"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
              {steps.length === 0 && (
                <p className="text-xs text-slate-400 italic">No steps added yet.</p>
              )}
            </div>

            {canEdit && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStepLabel}
                  onChange={e => setNewStepLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(); } }}
                  placeholder="Add a step..."
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                />
                <button
                  onClick={handleAddStep}
                  disabled={!newStepLabel.trim()}
                  className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  title="Add step"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </section>

          {/* Messages */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Messages
                {messages.length > 0 && (
                  <span className="ml-1.5 text-slate-400 font-normal normal-case">{messages.length}</span>
                )}
              </h3>
              <span className="text-[9px] text-slate-400 font-medium flex items-center gap-0.5">
                <AtSign size={9} /> to mention a teammate
              </span>
            </div>

            <div className="space-y-2 mb-3 max-h-52 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <p className="text-xs text-slate-400 italic">No messages yet. Start the conversation.</p>
              )}
              {messages.map(msg => {
                const isMine = String(msg.authorId) === String(currentUser?.id);
                const isEditing = editingMsgId === msg.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group`}>
                    {isEditing ? (
                      <div className="w-full max-w-[85%] space-y-1.5">
                        <textarea
                          value={editMsgText}
                          onChange={e => setEditMsgText(e.target.value)}
                          autoFocus
                          rows={2}
                          className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none"
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEditMsg(msg.id); } if (e.key === 'Escape') { setEditingMsgId(null); } }}
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => setEditingMsgId(null)} className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">Cancel</button>
                          <button onClick={() => handleSaveEditMsg(msg.id)} disabled={!editMsgText.trim()} className="px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1"><Send size={9}/> Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`relative max-w-[85%] rounded-xl px-3 py-2 ${isMine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        <p className="text-xs leading-relaxed">{renderMessageText(msg.text)}</p>
                        {isMine && (
                          <div className="absolute -top-5 right-0 hidden group-hover:flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-sm px-1 py-0.5">
                            <button onClick={() => { setEditingMsgId(msg.id); setEditMsgText(msg.text); }} className="p-0.5 text-slate-400 hover:text-blue-500 transition-colors" title="Edit"><Pencil size={10}/></button>
                            <button onClick={() => handleDeleteMsg(msg.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={10}/></button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 px-1">
                      <span className="text-[9px] font-semibold text-slate-500">{msg.authorName}</span>
                      <span className="text-[9px] text-slate-400">
                        {format(new Date(msg.timestamp), 'dd MMM, h:mm a')}{msg.edited ? ' · edited' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input with @mention */}
            <div className="relative">
              {showMentionMenu && filteredMentions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-44 overflow-y-auto">
                  <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-1.5">
                    <AtSign size={10} className="text-slate-400" />
                    <span className="text-[10px] font-semibold text-slate-500">Mention a teammate</span>
                  </div>
                  {filteredMentions.map(user => (
                    <button
                      key={user.id}
                      onMouseDown={e => { e.preventDefault(); handleSelectMention(user); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
                    >
                      <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] font-black text-indigo-600">
                          {(user.name || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="truncate">{user.name}</span>
                      {user.role && <span className="text-[9px] text-slate-400 ml-auto flex-shrink-0">{user.role}</span>}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={msgInputRef}
                  type="text"
                  value={newMessage}
                  onChange={handleMessageChange}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setShowMentionMenu(false); return; }
                    if (showMentionMenu && e.key === 'Enter') { e.preventDefault(); if (filteredMentions[0]) handleSelectMention(filteredMentions[0]); return; }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                  }}
                  onBlur={() => setTimeout(() => setShowMentionMenu(false), 150)}
                  placeholder="Write a message… type @ to mention"
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  title="Send message"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </section>

          {/* Feedback Thread */}
          {(feedbackThread.length > 0 || task.qcEnabled) && (() => {
            const fbEntryColors = (entry) => {
              const isMine = String(entry.authorId) === String(currentUser?.id);
              const bg = entry.type === 'approved' ? 'bg-emerald-50 border border-emerald-100'
                : entry.type === 'rejected' ? 'bg-red-50 border border-red-100'
                : isMine ? 'bg-blue-50 border border-blue-100'
                : 'bg-slate-100 border border-slate-100';
              const text = entry.type === 'approved' ? 'text-emerald-800'
                : entry.type === 'rejected' ? 'text-red-800'
                : 'text-slate-800';
              return { bg, text };
            };

            const renderFbCompose = (entryId, authorName) => {
              if (replyingToFeedbackId !== entryId) return null;
              return (
                <div className="mt-1.5 space-y-1.5">
                  <textarea
                    ref={feedbackInputRef}
                    value={newFeedback}
                    onChange={e => setNewFeedback(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddFeedback(entryId); }
                      if (e.key === 'Escape') { setNewFeedback(''); setReplyingToFeedbackId(null); }
                    }}
                    placeholder={authorName ? `Reply to ${authorName}…` : 'Write a comment…'}
                    rows={2}
                    className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setNewFeedback(''); setReplyingToFeedbackId(null); }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-all">Cancel</button>
                    <button onClick={() => handleAddFeedback(entryId)} disabled={!newFeedback.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      <Send size={11} /> Send
                    </button>
                  </div>
                </div>
              );
            };

            const renderFbEntry = (entry, allEntries, depth = 0) => {
              const { bg, text: textColor } = fbEntryColors(entry);
              const children = allEntries.filter(e => e.replyToId === entry.id);
              const parentEntry = entry.replyToId ? allEntries.find(e => e.id === entry.replyToId) : null;
              const indent = depth === 1 ? 'ml-4' : depth >= 2 ? 'ml-6' : '';
              const isMine = String(entry.authorId) === String(currentUser?.id);
              const isLegacy = entry.id?.startsWith('legacy-');
              const isEditingEntry = editingFbEntryId === entry.id;
              return (
                <div key={entry.id} className="group/fb">
                  <div className={`rounded-xl px-3 py-2.5 ${bg} ${indent}`}>
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {parentEntry && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400 mr-0.5">
                          <CornerDownLeft size={8} /> {parentEntry.authorName}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold ${textColor}`}>{entry.authorName}</span>
                      {entry.type === 'approved' && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <CheckCircle size={8} /> Approved
                        </span>
                      )}
                      {entry.type === 'rejected' && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                          <XCircle size={8} /> Returned
                        </span>
                      )}
                      {entry.timestamp && (
                        <span className="text-[9px] text-slate-400 ml-auto">
                          {format(new Date(entry.timestamp), 'dd MMM, h:mm a')}{entry.edited ? ' · edited' : ''}
                        </span>
                      )}
                      {isMine && !isLegacy && !isEditingEntry && (
                        <div className="hidden group-hover/fb:flex items-center gap-0.5 ml-1">
                          <button onClick={() => { setEditingFbEntryId(entry.id); setEditFbEntryText(entry.text); }} className="p-0.5 text-slate-400 hover:text-blue-500 transition-colors" title="Edit"><Pencil size={10}/></button>
                          <button onClick={() => handleDeleteFbEntry(entry.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={10}/></button>
                        </div>
                      )}
                    </div>
                    {isEditingEntry ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editFbEntryText}
                          onChange={e => setEditFbEntryText(e.target.value)}
                          autoFocus
                          rows={2}
                          className="w-full bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none"
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEditFbEntry(entry.id); } if (e.key === 'Escape') setEditingFbEntryId(null); }}
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => setEditingFbEntryId(null)} className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">Cancel</button>
                          <button onClick={() => handleSaveEditFbEntry(entry.id)} disabled={!editFbEntryText.trim()} className="px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1"><Send size={9}/> Save</button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-xs leading-relaxed ${textColor}`}>{entry.text}</p>
                    )}
                    {!isEditingEntry && replyingToFeedbackId !== entry.id && (
                      <button
                        onClick={() => { setReplyingToFeedbackId(entry.id); setNewFeedback(''); }}
                        className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-blue-500 transition-colors"
                      >
                        <CornerDownLeft size={10} /> Reply
                      </button>
                    )}
                  </div>
                  {renderFbCompose(entry.id, entry.authorName)}
                  {children.length > 0 && (
                    <div className="mt-1 space-y-1.5">
                      {children.map(child => renderFbEntry(child, allEntries, depth + 1))}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    QC Feedback
                    {feedbackThread.length > 0 && (
                      <span className="ml-1.5 text-slate-400 font-normal normal-case">{feedbackThread.length}</span>
                    )}
                  </h3>
                </div>
                <div className="space-y-2 mb-3 max-h-64 overflow-y-auto pr-1">
                  {feedbackThread.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No feedback yet.</p>
                  )}
                  {feedbackThread.filter(e => !e.replyToId).map(entry => renderFbEntry(entry, feedbackThread))}
                </div>
                {replyingToFeedbackId !== '__new__' ? (
                  <button
                    onClick={() => { setReplyingToFeedbackId('__new__'); setNewFeedback(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                  >
                    <MessageSquare size={12} /> Add comment
                  </button>
                ) : renderFbCompose('__new__', null)}
              </section>
            );
          })()}

          {/* Links */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">Links</h3>

            <div className="space-y-1.5 mb-3">
              {links.length === 0 && (
                <p className="text-xs text-slate-400 italic">No links added yet.</p>
              )}
              {links.map(link => (
                <div key={link.id} className="flex items-center gap-2 group bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <Link size={11} className="flex-shrink-0 text-slate-400" />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline truncate flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink size={9} className="flex-shrink-0 opacity-60" />
                  </a>
                  {canEdit && (
                    <button
                      onClick={() => handleDeleteLink(link.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                      title="Remove link"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newLinkLabel}
                  onChange={e => setNewLinkLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                />
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={e => setNewLinkUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
                    placeholder="Paste URL..."
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                  />
                  <button
                    onClick={handleAddLink}
                    disabled={!newLinkUrl.trim()}
                    className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    title="Save link"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailPanel;
