import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Send, Link, Check, ExternalLink, AtSign } from 'lucide-react';
import { format } from 'date-fns';

const statusColors = {
  Done: 'bg-emerald-100 text-emerald-700',
  WIP: 'bg-blue-100 text-blue-700',
  Pending: 'bg-orange-100 text-orange-700',
};

const parseMentions = (text) => {
  const regex = /@(\w[\w\s]*?)(?=\s@|\s*$|[^a-zA-Z\s])/g;
  const matches = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
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

const TaskDetailPanel = ({ task, currentUser, users = [], setNotifications = () => {}, onClose, onUpdate }) => {
  const [steps, setSteps] = useState(() => task.steps || []);
  const [messages, setMessages] = useState(() => task.messages || []);
  const [links, setLinks] = useState(() => task.links || []);

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

  const saveUpdate = (updatedTask) => onUpdate(updatedTask);

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
    const mentionedNames = parseMentions(text);
    mentionedNames.forEach(name => {
      const mentioned = users.find(u => u.name?.toLowerCase() === name.toLowerCase());
      if (!mentioned || String(mentioned.id) === String(currentUser?.id)) return;
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
    });
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
                  <button
                    onClick={() => handleDeleteStep(step.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Delete step"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {steps.length === 0 && (
                <p className="text-xs text-slate-400 italic">No steps added yet.</p>
              )}
            </div>

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
                return (
                  <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 ${isMine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                      <p className="text-xs leading-relaxed">{renderMessageText(msg.text)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 px-1">
                      <span className="text-[9px] font-semibold text-slate-500">{msg.authorName}</span>
                      <span className="text-[9px] text-slate-400">
                        {format(new Date(msg.timestamp), 'dd MMM, h:mm a')}
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
                  <button
                    onClick={() => handleDeleteLink(link.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                    title="Remove link"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>

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
          </section>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailPanel;
