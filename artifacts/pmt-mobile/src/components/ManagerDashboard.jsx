import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronLeft, AlertTriangle, CheckCircle, Star, Users, Plus, Tag, Calendar, Clock, X, ChevronDown, ChevronUp, ShieldCheck, Info, Link2, Link2Off, LogIn, LogOut, MessageSquare, Send, ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { sendNotification } from '../utils/notify';
import { ref, onValue } from 'firebase/database';
import { db, auth } from '../firebase.js';
import ApproveSheet from './ApproveSheet.jsx';
import TaskDetailSheet from './TaskDetailSheet.jsx';
import AddTaskSheet from './AddTaskSheet.jsx';
import {
  getDirectReports,
  getSubtreeIds,
  getUserTaskStats,
  getSubtreeStats,
} from '../hooks/useFirebaseData.js';
import { isTaskOverdue, isTaskLeaveAwareOverdue, getLeaveAndHolidayData, getLeaveDataForUser, getLeaveStatus, getTodayAttendanceMap } from '../utils/taskUtils.js';
import TeamHeader from './team/TeamHeader.jsx';
import TeamFilterSheet from './team/TeamFilterSheet.jsx';
import CollapsibleSection from './team/CollapsibleSection.jsx';

const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function RollupBadge({ label, value, red }) {
  if (!value) return null;
  return (
    <div className="text-center">
      <p className={`text-base font-black ${red ? 'text-red-500' : 'text-indigo-600'}`}>{value}</p>
      <p className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function parseDueDateLocal(str) {
  if (!str) return null;
  try {
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const m = str.match(/(\d+)[a-z]*\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]));
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function toDateKey(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

const TASK_STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function getIdToken() {
  return auth.currentUser?.getIdToken() ?? '';
}

function PersonTaskSheet({ user, tasks, onClose, onTaskClick, currentUser }) {
  const [showChat, setShowChat] = useState(false);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatKey, setChatKey] = useState(null);
  const [rawChatId, setRawChatId] = useState(null);
  const [senderObjectId, setSenderObjectId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef(null);

  const userEmail = user.email || user.emailAddress;
  const senderEmail = currentUser?.email || currentUser?.emailAddress;

  // Open chat (resolve/create via API)
  const openChat = useCallback(async () => {
    setChatLoading(true);
    setChatError(null);
    try {
      const token = await getIdToken();
      const resp = await fetch(`${API_BASE}/teams-chat/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          senderId: String(currentUser.id),
          senderEmail,
          senderName: currentUser.name,
          recipientId: String(user.id),
          recipientEmail: userEmail,
          recipientName: user.name,
        }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `Server error ${resp.status}`);
      }
      const data = await resp.json();
      setChatKey(data.chatKey);
      setRawChatId(data.rawChatId);
      setSenderObjectId(data.senderObjectId || null);
    } catch (err) {
      setChatError(err.message || 'Failed to open chat');
    } finally {
      setChatLoading(false);
    }
  }, [user.id, userEmail, currentUser?.id, senderEmail, currentUser?.name, user.name]);

  // Trigger open when chat tab is shown
  useEffect(() => {
    if (showChat && !chatKey && !chatLoading) openChat();
  }, [showChat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Firebase listener
  useEffect(() => {
    if (!chatKey) return;
    const msgRef = ref(db, `teamsDMs/chats/${chatKey}/messages`);
    const unsub = onValue(msgRef, snap => {
      const val = snap.val();
      setChatMessages(val ? Object.values(val).sort((a, b) => a.sentAt - b.sentAt) : []);
    });
    return () => unsub();
  }, [chatKey]);

  // Auto-scroll
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Send
  const sendChatMessage = useCallback(async () => {
    const msg = chatText.trim();
    if (!msg || !rawChatId || chatSending) return;
    setChatText('');
    setChatSending(true);
    try {
      const token = await getIdToken();
      await fetch(`${API_BASE}/teams-chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rawChatId,
          chatKey,
          message: msg,
          fromId: String(currentUser.id),
          fromObjectId: senderObjectId || '',
          fromName: currentUser.name,
        }),
      });
    } catch {
      setChatText(msg);
    } finally {
      setChatSending(false);
    }
  }, [chatText, rawChatId, chatKey, currentUser, senderObjectId, chatSending]);

  const isMine = msg =>
    (msg.source === 'flowpro' && String(msg.fromId) === String(currentUser?.id)) ||
    (msg.source === 'teams' && senderObjectId && msg.fromObjectId === senderObjectId);

  const fmtTime = ts => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const today = tasks.filter(t => {
    const d = new Date(t.dueDate);
    const now = new Date(); now.setHours(0,0,0,0);
    const end = new Date(now); end.setHours(23,59,59,999);
    return d >= now && d <= end;
  });
  const overdue = tasks.filter(t => {
    const d = new Date(t.dueDate);
    const now = new Date(); now.setHours(0,0,0,0);
    return d < now && t.status !== 'Done';
  });

  const pending = tasks.filter(t => t.status === 'Pending' && !overdue.includes(t) && !today.includes(t));
  const sections = [
    { label: 'Overdue', items: overdue, accent: 'text-red-500', icon: <AlertTriangle size={12} className="text-red-400" /> },
    { label: 'Due Today', items: today, accent: 'text-indigo-600', icon: <Clock size={12} className="text-indigo-400" /> },
    { label: 'Pending', items: pending.slice(0, 10), accent: 'text-amber-600', icon: <Clock size={12} className="text-amber-400" /> },
    { label: 'All Tasks', items: tasks.filter(t => !today.includes(t) && !overdue.includes(t) && !pending.includes(t)).slice(0, 10), accent: 'text-slate-500', icon: <Calendar size={12} className="text-slate-400" /> },
  ].filter(s => s.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[80vh] flex flex-col" style={{ marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)' }}>

        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {showChat && (
              <button
                onClick={() => setShowChat(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"
              >
                <ArrowLeft size={14} className="text-slate-600" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">
                {showChat ? 'Teams Chat' : 'Tasks'}
              </p>
              <h2 className="text-base font-bold text-slate-900 truncate">{user.name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showChat && (user.email || user.emailAddress) && (
              <button
                onClick={() => setShowChat(true)}
                title="Open Teams chat"
                className="w-9 h-9 rounded-full border bg-indigo-50 border-indigo-100 active:bg-indigo-100 flex items-center justify-center transition-colors"
              >
                <MessageSquare size={16} className="text-indigo-600" />
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <X size={16} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* ── Chat view ── */}
        {showChat ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-slate-50/40">
              {chatLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="text-xs text-slate-400">Opening conversation…</p>
                </div>
              ) : chatError ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                  <AlertTriangle size={24} className="text-amber-400" />
                  <p className="text-sm font-semibold text-slate-700">Couldn't open chat</p>
                  <p className="text-xs text-slate-400">{chatError}</p>
                  <button
                    onClick={openChat}
                    className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-600"
                  >
                    <RefreshCw size={11} /> Retry
                  </button>
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                  <MessageSquare size={28} className="text-slate-200" />
                  <p className="text-sm text-slate-400">No messages yet</p>
                  <p className="text-xs text-slate-300">Replies from Teams appear here instantly</p>
                </div>
              ) : (
                chatMessages.map(msg => {
                  const mine = isMine(msg);
                  return (
                    <div key={msg.id || msg.sentAt} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                        mine
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                      }`}>
                        {!mine && (
                          <p className="text-[10px] font-bold text-indigo-500 mb-0.5 truncate">{msg.fromName}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <p className={`text-[9px] mt-1 text-right ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {fmtTime(msg.sentAt)}
                          {msg.source === 'teams' && !mine && <span className="ml-1 opacity-70">· Teams</span>}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>
            {/* Compose bar */}
            <div className="px-4 py-3 border-t border-slate-100 bg-white flex items-end gap-2 flex-shrink-0">
              <textarea
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                placeholder={chatLoading ? 'Opening chat…' : `Message ${user.name}…`}
                rows={1}
                disabled={chatLoading || !!chatError}
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 disabled:opacity-40"
                style={{ lineHeight: '1.4', maxHeight: 96, overflowY: 'auto' }}
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatText.trim() || chatSending || chatLoading || !!chatError}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {chatSending
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Send size={14} />
                }
              </button>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tasks.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No tasks assigned</p>
            </div>
          )}
          {sections.map(({ label, items, accent, icon }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 mb-2">
                {icon}
                <span className={`text-xs font-black uppercase tracking-widest ${accent}`}>{label}</span>
                <span className="ml-auto text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(t => {
                  const taskOverdue = isTaskOverdue(t);
                  return (
                    <button
                      key={`${t._clientId}-${t.id}`}
                      onClick={() => { onTaskClick(t); onClose(); }}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border bg-white hover:border-indigo-200 text-left transition-colors ${taskOverdue ? 'border-red-200' : 'border-slate-200'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{t.name || t.comment}</p>
                        {t._clientName && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Tag size={9} /> {t._clientName}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 mt-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                          {t.status || 'Pending'}
                        </span>
                        {taskOverdue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-0.5">
                            <AlertTriangle size={9} /> Overdue
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

function FilterBadge({ label, value, active, red, onClick }) {
  if (!value) return null;
  const base = active
    ? (red ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white')
    : (red ? 'text-red-500 hover:bg-red-50' : 'text-indigo-600 hover:bg-indigo-50');
  return (
    <button onClick={onClick} className={`text-center px-2 py-0.5 rounded-lg transition-colors ${base}`}>
      <p className="text-base font-black leading-none">{value}</p>
      <p className="text-[9px] uppercase tracking-wide leading-tight mt-0.5">{label}</p>
    </button>
  );
}

function TaskRow({ task, onTaskClick }) {
  const overdue = isTaskOverdue(task);
  return (
    <button
      onClick={() => onTaskClick(task)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border bg-white text-left active:bg-slate-50 transition-colors ${overdue ? 'border-red-200' : 'border-slate-100'}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === 'Done' ? 'bg-emerald-500' : task.status === 'WIP' ? 'bg-blue-500' : 'bg-amber-400'}`} />
      <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{task.name || task.comment}</span>
      {task._clientName && <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[80px]">· {task._clientName}</span>}
      {overdue && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
    </button>
  );
}

function PersonCard({ user, clientLogs, clients, users, allUsers, onDrillIn, onTaskClick, attendanceStatus, currentUser }) {
  const personal = getUserTaskStats(user.id, clientLogs, clients);
  const team     = getSubtreeStats(user.id, allUsers, clientLogs, clients);
  const reports  = getDirectReports(user.id, allUsers);
  const hasTeam  = reports.length > 0;
  const [showTaskSheet, setShowTaskSheet] = useState(false);
  const [taskFilter, setTaskFilter] = useState(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [leaveByDate, setLeaveByDate] = useState({});

  useEffect(() => {
    let cancelled = false;
    getLeaveAndHolidayData(String(user.id)).then(data => { if (!cancelled) setLeaveByDate(data); });
    return () => { cancelled = true; };
  }, [user.id]);

  const leaveAwareOverdueTasks = personal.overdueTasks.filter(t => isTaskLeaveAwareOverdue(t, undefined, leaveByDate));
  const leaveStatusInfo = getLeaveStatus(leaveByDate);
  const leaveStatus = leaveStatusInfo.status;
  const leaveDate = leaveStatusInfo.date;
  const overridePersonal = { ...personal, overdue: leaveAwareOverdueTasks.length, overdueTasks: leaveAwareOverdueTasks };

  const toggleFilter = (f) => setTaskFilter(v => v === f ? null : f);

  const filteredTasks = taskFilter === 'pending'
    ? overridePersonal.pendingTasks
    : taskFilter === 'today'
    ? overridePersonal.todayTasks
    : taskFilter === 'overdue'
    ? overridePersonal.overdueTasks
    : taskFilter === 'awaitingQC'
    ? overridePersonal.pendingQCTasks
    : null;

  const otherTasks = overridePersonal.allTasks.filter(t =>
    !overridePersonal.todayTasks.includes(t) &&
    !overridePersonal.overdueTasks.includes(t) &&
    !overridePersonal.pendingTasks.includes(t)
  );

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-stretch">
          <button
            type="button"
            className="flex items-center gap-3 px-4 py-4 flex-1 min-w-0 text-left active:bg-slate-50 transition-colors"
            onClick={() => setShowTaskSheet(true)}
          >
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 relative">
              <span className="text-indigo-700 font-black text-sm">{initials(user.name)}</span>
              {leaveStatus === 'on_leave' && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-orange-400 border-2 border-white" title="On Leave" />
              )}
              {leaveStatus === 'leave_soon' && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-300 border-2 border-white" title="Leave Soon" />
              )}
              {/* Attendance dot: green=in office, slate=left, red=not arrived, hidden=no Keka data */}
              {leaveStatus !== 'on_leave' && attendanceStatus && (() => {
                const arrived = attendanceStatus.hasArrived ?? (attendanceStatus.clockIn !== null);
                const dotClass = attendanceStatus.isInOffice ? 'bg-emerald-400'
                  : arrived ? 'bg-slate-400'
                  : 'bg-red-400';
                const dotTitle = attendanceStatus.isInOffice ? 'In office'
                  : arrived ? 'Left for day'
                  : 'Not arrived';
                return <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${dotClass}`} title={dotTitle} />;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                {leaveStatus === 'on_leave' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">On Leave</span>
                )}
                {leaveStatus === 'leave_soon' && leaveDate && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Leave {new Date(leaveDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <p className="text-xs text-slate-400">{user.role}</p>
                {user.kekaEmployeeId ? (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-200">
                    <Link2 size={8} strokeWidth={2.5} /> Keka
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">
                    <Link2Off size={8} strokeWidth={2.5} /> No Keka
                  </span>
                )}
                {leaveStatus !== 'on_leave' && attendanceStatus && (() => {
                  const arrived = attendanceStatus.hasArrived ?? (attendanceStatus.clockIn !== null);
                  const fmt = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                  if (!arrived) {
                    return (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">
                        ✕ Not Arrived
                      </span>
                    );
                  }
                  return (
                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                      attendanceStatus.isInOffice
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      <LogIn size={8} strokeWidth={2.5} />
                      {fmt(attendanceStatus.clockIn)}
                      {!attendanceStatus.isInOffice && attendanceStatus.clockOut && (
                        <>{' · '}<LogOut size={8} strokeWidth={2.5} className="ml-0.5" />{fmt(attendanceStatus.clockOut)}</>
                      )}
                    </span>
                  );
                })()}
              </div>
              {overridePersonal.avgRating && (
                <span className="flex items-center gap-0.5 text-[11px] text-amber-500 font-bold mt-0.5">
                  <Star size={10} className="fill-amber-400" /> {overridePersonal.avgRating.toFixed(1)}/10
                </span>
              )}
            </div>
          </button>
          <div className="flex items-center gap-1.5 pr-3 flex-shrink-0">
            <FilterBadge label="Pending" value={overridePersonal.pending} active={taskFilter === 'pending'} onClick={() => toggleFilter('pending')} />
            <FilterBadge label="Today"   value={overridePersonal.today}   active={taskFilter === 'today'}   onClick={() => toggleFilter('today')} />
            {overridePersonal.overdue > 0 && <FilterBadge label="Overdue" value={overridePersonal.overdue} red active={taskFilter === 'overdue'} onClick={() => toggleFilter('overdue')} />}
            {overridePersonal.pendingQC > 0 && <FilterBadge label="QC" value={overridePersonal.pendingQC} active={taskFilter === 'awaitingQC'} onClick={() => toggleFilter('awaitingQC')} />}
            {hasTeam && (
              <button
                type="button"
                onClick={() => onDrillIn(user)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 min-h-[44px]"
              >
                <Users size={12} className="text-indigo-500" />
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Team</span>
                <ChevronRight size={12} className="text-indigo-400" />
              </button>
            )}
          </div>
        </div>

        {filteredTasks && filteredTasks.length > 0 && (
          <div className="border-t border-slate-100 px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 mb-1">
              {taskFilter === 'pending' ? 'Pending Tasks' : taskFilter === 'today' ? 'Due Today' : taskFilter === 'awaitingQC' ? 'Awaiting QC' : 'Overdue Tasks'}
            </p>
            {filteredTasks.map(t => <TaskRow key={`${t._clientId}-${t.id}`} task={t} onTaskClick={onTaskClick} />)}
          </div>
        )}
        {filteredTasks && filteredTasks.length === 0 && (
          <div className="border-t border-slate-100 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">No {taskFilter} tasks</p>
          </div>
        )}

        {overridePersonal.allTasks.length > 0 && (
          <div className="border-t border-slate-100">
            <button
              onClick={() => setShowAllTasks(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">All Tasks</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{overridePersonal.allTasks.length}</span>
                {showAllTasks ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
              </div>
            </button>
            {showAllTasks && (
              <div className="px-3 pb-3 space-y-1.5">
                {overridePersonal.allTasks.map(t => <TaskRow key={`all-${t._clientId}-${t.id}`} task={t} onTaskClick={onTaskClick} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {showTaskSheet && (
        <PersonTaskSheet
          user={user}
          tasks={overridePersonal.allTasks}
          onClose={() => setShowTaskSheet(false)}
          onTaskClick={onTaskClick}
          currentUser={currentUser}
        />
      )}
    </>
  );
}

function KpiChipRow({ overdue, dueToday, awaitingQC, missingInfo, onScrollTo }) {
  const chips = [
    overdue > 0 && { label: 'Overdue', value: overdue, target: 'atRisk', bg: 'bg-red-50', border: 'border-red-100', valueCls: 'text-red-500', labelCls: 'text-red-400' },
    dueToday > 0 && { label: 'Due Today', value: dueToday, target: 'atRisk', bg: 'bg-indigo-50', border: 'border-indigo-100', valueCls: 'text-indigo-600', labelCls: 'text-indigo-400' },
    awaitingQC > 0 && { label: 'Awaiting QC', value: awaitingQC, target: 'atRisk', bg: 'bg-amber-50', border: 'border-amber-100', valueCls: 'text-amber-600', labelCls: 'text-amber-400' },
    missingInfo > 0 && { label: 'Missing Info', value: missingInfo, target: 'missingInfo', bg: 'bg-slate-50', border: 'border-slate-200', valueCls: 'text-slate-600', labelCls: 'text-slate-400' },
  ].filter(Boolean);

  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
      {chips.map(chip => (
        <button
          key={chip.label}
          onClick={() => onScrollTo(chip.target)}
          className={`flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl ${chip.bg} border ${chip.border} min-h-[44px] min-w-[76px] active:opacity-70 transition-opacity`}
        >
          <span className={`text-base font-black leading-none ${chip.valueCls}`}>{chip.value}</span>
          <span className={`text-[9px] uppercase tracking-wide mt-0.5 ${chip.labelCls}`}>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

function PersonAtRiskCard({ user, tasks, isOnLeave, accent, onTaskClick }) {
  const red = accent === 'red';
  const c = red
    ? { bg: 'bg-red-50', border: 'border-red-100', avatar: 'bg-red-200', avatarText: 'text-red-700', name: 'text-red-800', countBg: 'bg-red-100', countText: 'text-red-500', rowHover: 'hover:bg-red-100', taskText: 'text-red-700' }
    : { bg: 'bg-indigo-50', border: 'border-indigo-100', avatar: 'bg-indigo-200', avatarText: 'text-indigo-700', name: 'text-indigo-800', countBg: 'bg-indigo-100', countText: 'text-indigo-500', rowHover: 'hover:bg-indigo-100', taskText: 'text-indigo-700' };
  const icon = red
    ? <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />
    : <Clock size={10} className="text-indigo-400 flex-shrink-0" />;

  return (
    <div className={`${c.bg} rounded-2xl border ${c.border} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 rounded-full ${c.avatar} flex items-center justify-center flex-shrink-0`}>
          <span className={`${c.avatarText} font-black text-[10px]`}>{initials(user.name)}</span>
        </div>
        <p className={`text-xs font-bold ${c.name}`}>{user.name}</p>
        {isOnLeave && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">On Leave</span>
        )}
        <span className={`ml-auto text-[10px] font-bold ${c.countText} ${c.countBg} px-1.5 py-0.5 rounded-full`}>
          {tasks.length} {red ? 'overdue' : 'due today'}
        </span>
      </div>
      <div className="space-y-1">
        {tasks.map(t => (
          <button
            key={`${t._clientId}-${t.id}`}
            onClick={() => onTaskClick(t)}
            className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-xl ${c.rowHover} transition-colors min-h-[44px]`}
          >
            {icon}
            <span className={`text-xs ${c.taskText} font-medium flex-1 truncate`}>{t.name || t.comment}</span>
            {t._clientName && <span className={`text-[10px] ${c.countText} flex-shrink-0 truncate max-w-[80px]`}>{t._clientName}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Compute at-risk (overdue / due today) tasks grouped by person for a given
 * set of member ids. Pure helper — call from a useMemo in the container.
 */
function computeAtRisk(memberIds, users, clientLogs, clients, leaveByUser) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);

  const overdueByPerson = [];
  const dueTodayByPerson = [];

  memberIds.forEach(uid => {
    const user = users.find(u => String(u.id) === uid);
    if (!user) return;
    const stats = getUserTaskStats(uid, clientLogs, clients);
    const ld = leaveByUser[uid] || {};
    const isOnLeave = !!ld[todayKey];
    const filteredOverdue = stats.overdueTasks.filter(t => isTaskLeaveAwareOverdue(t, undefined, ld));
    if (filteredOverdue.length > 0) overdueByPerson.push({ user, tasks: filteredOverdue, isOnLeave });
    const filteredToday = stats.todayTasks.filter(t => t.status !== 'Done' && !t.archived);
    if (filteredToday.length > 0) dueTodayByPerson.push({ user, tasks: filteredToday, isOnLeave });
  });

  const totalCount = overdueByPerson.reduce((s, p) => s + p.tasks.length, 0)
    + dueTodayByPerson.reduce((s, p) => s + p.tasks.length, 0);

  return { overdueByPerson, dueTodayByPerson, totalCount };
}

function AtRiskBody({ overdueByPerson, dueTodayByPerson, totalCount, onTaskClick }) {
  return (
    <div>
      {totalCount === 0 && (
        <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-emerald-50 border border-emerald-100">
          <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
          <p className="text-xs text-emerald-600 font-medium">All team members are on track</p>
        </div>
      )}

      {overdueByPerson.length > 0 && (
        <div className={dueTodayByPerson.length > 0 ? 'mb-4' : ''}>
          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2 px-1">Overdue</p>
          <div className="space-y-2">
            {overdueByPerson.map(({ user, tasks, isOnLeave }) => (
              <PersonAtRiskCard key={user.id} user={user} tasks={tasks} isOnLeave={isOnLeave} accent="red" onTaskClick={onTaskClick} />
            ))}
          </div>
        </div>
      )}

      {dueTodayByPerson.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 px-1">Due Today</p>
          <div className="space-y-2">
            {dueTodayByPerson.map(({ user, tasks, isOnLeave }) => (
              <PersonAtRiskCard key={user.id} user={user} tasks={tasks} isOnLeave={isOnLeave} accent="indigo" onTaskClick={onTaskClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const MISSING_INFO_PAGE = 20;

/** Dedupe unassigned + no-due-date tasks. Shared by KPI count and section body. */
function computeMissingInfoTasks(subtreeTasks, unassignedTasks) {
  const noDueDate = subtreeTasks.filter(t => !t.archived && t.status !== 'Done' && !t.dueDate);
  const seen = new Set();
  return [...unassignedTasks, ...noDueDate].filter(t => {
    const key = `${t._clientId}-${t.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function MissingInfoBody({ missingTasks, onTaskClick }) {
  const [showAll, setShowAll] = useState(false);

  const visibleTasks = showAll ? missingTasks : missingTasks.slice(0, MISSING_INFO_PAGE);
  const hiddenCount = missingTasks.length - MISSING_INFO_PAGE;

  return (
    <div>
      {(
        missingTasks.length === 0 ? (
          <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-emerald-600 font-medium">All tasks have assignees and due dates</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleTasks.map(t => (
              <button
                key={`${t._clientId}-${t.id}`}
                onClick={() => onTaskClick(t)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-100 bg-amber-50 text-left active:bg-amber-100 transition-colors min-h-[44px]"
              >
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${!t.assigneeId ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                  {!t.assigneeId ? 'No Assignee' : 'No Due Date'}
                </span>
                <span className="text-xs text-slate-700 font-medium flex-1 truncate">{t.name || t.comment}</span>
                {t._clientName && <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[70px]">{t._clientName}</span>}
              </button>
            ))}
            {!showAll && hiddenCount > 0 && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-2.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl active:bg-amber-100 transition-colors min-h-[44px]"
              >
                Show {hiddenCount} more
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

/** Compute leave conflicts for the next 7 days. Pure helper for a useMemo. */
function computeLeaveConflicts(subtreeTasks, leaveByUser) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(today); sevenDaysLater.setDate(today.getDate() + 7);
  const todayKey = toDateKey(today);

  return subtreeTasks
    .filter(t => !t.archived && t.status !== 'Done' && t.dueDate && t.assigneeId)
    .map(t => {
      const due = parseDueDateLocal(t.dueDate);
      if (!due || due < today || due > sevenDaysLater) return null;
      const dueKey = toDateKey(due);
      const ld = leaveByUser[String(t.assigneeId)] || {};
      const conflictDate = Object.keys(ld)
        .filter(dk => dk >= todayKey && dk <= dueKey)
        .sort()
        .find(dk => {
          const rec = ld[dk];
          return rec && !rec.name && rec.status && rec.status !== 'pending';
        });
      if (!conflictDate) return null;
      const badge = conflictDate === dueKey ? 'Leave on Due Date' : 'On Leave';
      return { ...t, due, dueKey, badge };
    })
    .filter(Boolean)
    .sort((a, b) => a.due - b.due);
}

function LeaveConflictsBody({ conflicts, users, onTaskClick }) {
  return (
    <div>
      {(
        conflicts.length === 0 ? (
          <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-emerald-600 font-medium">No upcoming conflicts</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {conflicts.map(t => {
              const member = users.find(u => String(u.id) === String(t.assigneeId));
              const memberName = member?.name || 'Unknown';
              return (
                <button
                  key={`${t._clientId}-${t.id}`}
                  onClick={() => onTaskClick(t)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-100 bg-rose-50 text-left active:bg-rose-100 transition-colors min-h-[44px]"
                >
                  <div className="w-7 h-7 rounded-full bg-rose-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-rose-700 font-black text-[9px]">{initials(memberName)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight">{t.name || t.comment}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{memberName} · {t._clientName} · {t.dueKey}</p>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 flex-shrink-0 whitespace-nowrap">{t.badge}</span>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function ApprovalTaskCard({ task, onApprove }) {
  return (
    <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Star size={16} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{task.name || task.comment}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
            {task._clientName && <span className="flex items-center gap-1"><Tag size={10} />{task._clientName}</span>}
            {task.dueDate && <span className="flex items-center gap-1"><Calendar size={10} />{task.dueDate}</span>}
            {task.assigneeName && <span className="flex items-center gap-1"><Users size={10} />{task.assigneeName}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={() => onApprove(task)}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold min-h-[44px]"
      >
        <Star size={14} /> Review & Rate
      </button>
    </div>
  );
}

function ApprovalsTab({ pendingApprovals, isSuperAdmin, onApprove }) {
  const [collapsed, setCollapsed] = useState({});

  if (pendingApprovals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle size={44} className="text-emerald-300 mb-3" />
        <p className="text-slate-500 font-semibold">No pending approvals</p>
        <p className="text-xs text-slate-400 mt-1">All tasks have been reviewed</p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-3">
        {pendingApprovals.map((task, i) => (
          <ApprovalTaskCard key={`${task._clientId}-${task.id}-${i}`} task={task} onApprove={onApprove} />
        ))}
      </div>
    );
  }

  // Super Admin: group by approver
  const groups = {};
  pendingApprovals.forEach(task => {
    const key = String(task.qcAssigneeId || '__unassigned__');
    if (!groups[key]) groups[key] = { name: task.qcAssigneeName || 'Unassigned', tasks: [] };
    groups[key].tasks.push(task);
  });
  const groupList = Object.entries(groups).sort((a, b) => b[1].tasks.length - a[1].tasks.length);

  const toggle = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3">
      {groupList.map(([key, { name, tasks }]) => {
        const isOpen = !collapsed[key];
        return (
          <div key={key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[52px] active:bg-slate-50 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-black text-indigo-700">{(name || '?')[0].toUpperCase()}</span>
              </div>
              <span className="flex-1 text-sm font-bold text-slate-800 truncate">{name}</span>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full mr-1">
                {tasks.length}
              </span>
              {isOpen
                ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" />
                : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
              }
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 p-3 space-y-2.5">
                {tasks.map((task, i) => (
                  <ApprovalTaskCard key={`${task._clientId}-${task.id}-${i}`} task={task} onApprove={onApprove} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Confirmed policy (Aug 2026): only Super Admin sees the whole organization
// and the region filter. Director / Business Head see just their own
// reporting tree in Team View, matching the desktop app.
const GLOBAL_ROLES = ['Super Admin'];

export default function ManagerDashboard({
  currentUser, users, clients, clientLogs, categories,
  pendingApprovals, activeTab, onTabChange,
}) {
  const [drillStack, setDrillStack] = useState([]);
  const [approvingTask, setApprovingTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAllDrillTasks, setShowAllDrillTasks] = useState(false);
  const [leaveByUser, setLeaveByUser] = useState({});
  const [attendanceByUser, setAttendanceByUser] = useState({});
  const DEFAULT_FILTERS = { dept: 'All', region: 'All', attendance: 'all', sort: 'name' };
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedDept = filters.dept;
  const selectedRegion = filters.region;
  const attendanceFilter = filters.attendance;

  const isSuperAdmin = GLOBAL_ROLES.includes(currentUser?.role);

  const scrollContainerRef = useRef(null);
  const atRiskRef = useRef(null);
  const missingInfoRef = useRef(null);

  const viewUser = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;
  const displayUser = viewUser || currentUser;

  // Super Admins at the top level see every user; drilled-in view always uses direct reports
  const directReports = useMemo(() => {
    if (isSuperAdmin && drillStack.length === 0) {
      return users.filter(u => String(u.id) !== String(currentUser.id));
    }
    return getDirectReports(displayUser.id, users);
  }, [isSuperAdmin, drillStack.length, displayUser.id, users, currentUser.id]);

  // Departments derived from visible pool — exclude 'All' as a real dept name
  const departments = useMemo(() => {
    const pool = isSuperAdmin && drillStack.length === 0 ? directReports : users;
    const depts = [...new Set(pool.map(u => u.department).filter(d => d && d !== 'All'))].sort();
    return ['All', ...depts];
  }, [directReports, users, isSuperAdmin, drillStack.length]);

  // Regions derived from the visible pool — admin-only filter (GLOBAL_ROLES
  // already see across regions; the filter only narrows, never expands).
  const regions = useMemo(() => {
    const regs = [...new Set(directReports.map(u => u.region).filter(r => r && r !== 'All'))].sort();
    return ['All', ...regs];
  }, [directReports]);

  // Cards shown after search + department + attendance filter
  const visibleReports = useMemo(() => {
    let list = selectedDept === 'All' ? directReports : directReports.filter(u => u.department === selectedDept);
    if (isSuperAdmin && selectedRegion !== 'All') {
      list = list.filter(u => u.region === selectedRegion);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(u => u.name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q));
    }
    if (attendanceFilter !== 'all') {
      list = list.filter(u => {
        const as = attendanceByUser[String(u.id)];
        const arrived = as ? (as.hasArrived ?? (as.clockIn !== null)) : false;
        if (attendanceFilter === 'in_office')   return as?.isInOffice === true;
        if (attendanceFilter === 'left')        return arrived && !as?.isInOffice;
        if (attendanceFilter === 'not_arrived') return !arrived && !!as;
        return true;
      });
    }
    if (filters.sort === 'overdue') {
      list = [...list].sort((a, b) =>
        getUserTaskStats(b.id, clientLogs, clients).overdue - getUserTaskStats(a.id, clientLogs, clients).overdue
      );
    } else {
      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return list;
  }, [directReports, selectedDept, selectedRegion, isSuperAdmin, searchQuery, attendanceFilter, attendanceByUser, filters.sort, clientLogs, clients]);

  // Active applied filters (search shown separately in the header)
  const activeFilters = useMemo(() => {
    const chips = [];
    if (filters.dept !== 'All') chips.push({ key: 'dept', label: filters.dept });
    if (filters.region !== 'All') chips.push({ key: 'region', label: filters.region });
    if (filters.attendance !== 'all') {
      const lbl = { in_office: 'In Office', left: 'Left', not_arrived: 'Not Arrived' }[filters.attendance];
      chips.push({ key: 'attendance', label: lbl });
    }
    if (filters.sort !== 'name') chips.push({ key: 'sort', label: 'Most Overdue' });
    return chips;
  }, [filters]);

  const removeFilter = (key) => setFilters(f => ({ ...f, [key]: DEFAULT_FILTERS[key] }));

  const drillIn = (user) => {
    setDrillStack(s => [...s, user]);
    setShowAllDrillTasks(false);
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
  };
  const drillOut = () => {
    setDrillStack(s => s.slice(0, -1));
    setShowAllDrillTasks(false);
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
  };

  const drillPersonalStats = viewUser ? getUserTaskStats(viewUser.id, clientLogs, clients) : null;

  const subtreeIds = useMemo(() => {
    if (isSuperAdmin) {
      const ids = new Set(users.map(u => String(u.id)));
      ids.delete(String(currentUser.id));
      return ids;
    }
    const ids = getSubtreeIds(currentUser.id, users);
    ids.delete(String(currentUser.id));
    return ids;
  }, [currentUser.id, users, isSuperAdmin]);

  useEffect(() => {
    if (drillStack.length > 0 || subtreeIds.size === 0) return;
    let cancelled = false;
    Promise.all([
      Promise.all([...subtreeIds].map(uid => getLeaveAndHolidayData(uid).then(d => [uid, d]))),
      // Single Firebase read for the whole team's attendance today
      getTodayAttendanceMap(),
    ]).then(([leaveEntries, attendanceMap]) => {
      if (!cancelled) {
        setLeaveByUser(Object.fromEntries(leaveEntries));
        setAttendanceByUser(attendanceMap);
      }
    });
    return () => { cancelled = true; };
  }, [clientLogs, subtreeIds, drillStack.length]);

  // Member ids driving KPIs and secondary sections. With no filters this is
  // the full permitted subtree (existing behaviour). When any filter/search is
  // active it is EXACTLY the visible member cards, so every count matches the
  // list. Always intersected with the permitted subtree — never expands access.
  const filteredMemberIds = useMemo(() => {
    const hasFilters = selectedDept !== 'All' || selectedRegion !== 'All' || attendanceFilter !== 'all' || !!searchQuery.trim();
    if (!hasFilters) return subtreeIds;
    const ids = new Set();
    visibleReports.forEach(u => {
      const id = String(u.id);
      if (subtreeIds.has(id)) ids.add(id);
    });
    return ids;
  }, [visibleReports, subtreeIds, selectedDept, selectedRegion, attendanceFilter, searchQuery]);

  const subtreeTasks = useMemo(() => {
    if (drillStack.length > 0) return [];
    const tasks = [];
    Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
      const client = clients.find(c => String(c.id) === String(clientId));
      Object.values(logs || {}).forEach(task => {
        if (filteredMemberIds.has(String(task.assigneeId))) {
          tasks.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
        }
      });
    });
    return tasks;
  }, [clientLogs, clients, filteredMemberIds, drillStack.length]);

  const unassignedTasks = useMemo(() => {
    if (drillStack.length > 0) return [];
    // Non-admin managers only see unassigned tasks on clients their team
    // already works on; global roles see all unassigned tasks.
    let allowedClients = null;
    if (!isSuperAdmin) {
      allowedClients = new Set();
      Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
        const hasTeamTask = Object.values(logs || {}).some(t => subtreeIds.has(String(t.assigneeId)));
        if (hasTeamTask) allowedClients.add(clientId);
      });
    }
    const tasks = [];
    Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
      if (allowedClients && !allowedClients.has(clientId)) return;
      const client = clients.find(c => String(c.id) === String(clientId));
      Object.values(logs || {}).forEach(task => {
        if (!task.assigneeId && !task.archived && task.status !== 'Done') {
          tasks.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
        }
      });
    });
    return tasks;
  }, [clientLogs, clients, drillStack.length, isSuperAdmin, subtreeIds]);

  const atRisk = useMemo(() => {
    if (drillStack.length > 0) return { overdueByPerson: [], dueTodayByPerson: [], totalCount: 0 };
    return computeAtRisk(filteredMemberIds, users, clientLogs, clients, leaveByUser);
  }, [filteredMemberIds, users, clientLogs, clients, leaveByUser, drillStack.length]);

  const missingInfoTasks = useMemo(() => {
    if (drillStack.length > 0) return [];
    // Product rule: unassigned tasks have no member to match against, so they
    // are only included when NO member-level filter/search is active. When a
    // filter is applied, Missing Info shows only no-due-date tasks belonging
    // to the filtered visible members, keeping counts consistent with the list.
    const hasFilters = selectedDept !== 'All' || selectedRegion !== 'All' || attendanceFilter !== 'all' || !!searchQuery.trim();
    return computeMissingInfoTasks(subtreeTasks, hasFilters ? [] : unassignedTasks);
  }, [subtreeTasks, unassignedTasks, drillStack.length, selectedDept, selectedRegion, attendanceFilter, searchQuery]);

  const leaveConflicts = useMemo(() => {
    if (drillStack.length > 0) return [];
    return computeLeaveConflicts(subtreeTasks, leaveByUser);
  }, [subtreeTasks, leaveByUser, drillStack.length]);

  const kpiCounts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
    let overdue = 0, dueToday = 0, awaitingQC = 0;
    subtreeTasks.forEach(t => {
      if (t.archived || t.status === 'Done') return;
      const due = parseDueDateLocal(t.dueDate);
      if (due && due < today) overdue++;
      if (due && due >= today && due <= todayEnd) dueToday++;
      if (t.qcEnabled && t.qcStatus === 'sent') awaitingQC++;
    });
    return { overdue, dueToday, awaitingQC, missingInfo: missingInfoTasks.length };
  }, [subtreeTasks, missingInfoTasks]);

  const scrollTo = (target) => {
    const el = target === 'atRisk' ? atRiskRef.current : target === 'missingInfo' ? missingInfoRef.current : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {activeTab === 'team' && (
        <>
          {drillStack.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-100 flex-shrink-0">
              <button
                onClick={drillOut}
                className="flex items-center gap-1 text-indigo-600 text-sm font-bold min-h-[44px] px-2"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <div className="flex items-center gap-1 overflow-x-auto flex-1 text-xs text-slate-400 font-medium">
                <span className="truncate text-slate-500">You</span>
                {drillStack.map((u, i) => (
                  <React.Fragment key={u.id}>
                    <ChevronRight size={12} className="flex-shrink-0" />
                    <span className={`truncate ${i === drillStack.length - 1 ? 'text-slate-800 font-bold' : 'text-slate-500'}`}>
                      {u.name.split(' ')[0]}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          <div className="p-4 space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
            {drillStack.length === 0 && (
              <TeamHeader
                visibleCount={visibleReports.length}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                activeFilterCount={activeFilters.length}
                onOpenFilters={() => setShowFilterSheet(true)}
              />
            )}

            {/* Active filter chips — removable, with +N more overflow */}
            {drillStack.length === 0 && activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.slice(0, 3).map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => removeFilter(f.key)}
                    aria-label={`Remove ${f.label} filter`}
                    className="flex items-center gap-1 text-xs font-bold px-3 py-2 min-h-[36px] rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 max-w-full"
                  >
                    <span className="truncate">{f.label}</span>
                    <X size={11} className="flex-shrink-0" />
                  </button>
                ))}
                {activeFilters.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowFilterSheet(true)}
                    className="text-xs font-bold px-3 py-2 min-h-[36px] rounded-full bg-slate-100 text-slate-500"
                  >
                    +{activeFilters.length - 3} more
                  </button>
                )}
              </div>
            )}

            {drillStack.length === 0 && (
              <KpiChipRow
                overdue={kpiCounts.overdue}
                dueToday={kpiCounts.dueToday}
                awaitingQC={kpiCounts.awaitingQC}
                missingInfo={kpiCounts.missingInfo}
                onScrollTo={scrollTo}
              />
            )}

            {drillPersonalStats && (
              <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-700 font-black text-xs">{initials(viewUser.name)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-900">{viewUser.name}'s Tasks</p>
                    <p className="text-xs text-indigo-500">{viewUser.role}</p>
                  </div>
                  <div className="ml-auto flex gap-3">
                    <RollupBadge label="Pending" value={drillPersonalStats.pending} />
                    <RollupBadge label="Today" value={drillPersonalStats.today} />
                    <RollupBadge label="Overdue" value={drillPersonalStats.overdue} red />
                  </div>
                </div>
                {drillPersonalStats.allTasks.length > 0 ? (
                  <div className="space-y-1.5">
                    {(() => {
                      const prioritised = [...drillPersonalStats.todayTasks, ...drillPersonalStats.overdueTasks, ...drillPersonalStats.allTasks.filter(t => !drillPersonalStats.todayTasks.includes(t) && !drillPersonalStats.overdueTasks.includes(t))];
                      const visible = showAllDrillTasks ? prioritised : prioritised.slice(0, 4);
                      return visible.map(t => {
                        const taskOverdue = isTaskOverdue(t);
                        return (
                          <button
                            key={`${t._clientId}-${t.id}`}
                            onClick={() => setSelectedTask(t)}
                            className={`w-full flex items-center gap-2 px-3 py-2 bg-white rounded-xl border text-left hover:border-indigo-300 transition-colors ${taskOverdue ? 'border-red-200' : 'border-indigo-100'}`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'Done' ? 'bg-emerald-500' : t.status === 'WIP' ? 'bg-blue-500' : 'bg-amber-400'}`} />
                            <span className="text-xs text-indigo-800 font-medium flex-1 truncate">{t.name || t.comment}</span>
                            {t._clientName && <span className="text-[10px] text-indigo-400 flex-shrink-0 truncate max-w-[80px]">{t._clientName}</span>}
                          </button>
                        );
                      });
                    })()}
                    {drillPersonalStats.allTasks.length > 4 && (
                      <button
                        onClick={() => setShowAllDrillTasks(v => !v)}
                        className="w-full text-center text-xs text-indigo-500 font-semibold py-1.5 hover:text-indigo-700"
                      >
                        {showAllDrillTasks
                          ? 'Show less'
                          : `+${drillPersonalStats.allTasks.length - 4} more tasks`}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-indigo-400 text-center py-2">No tasks assigned</p>
                )}
              </div>
            )}

            {/* Drilled-in view keeps a simple inline search (no TeamHeader there) */}
            {drillStack.length > 0 && (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search employees…"
                  className="w-full pl-8 pr-9 py-2.5 min-h-[44px] text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                  >
                    <X size={12} className="text-slate-500" />
                  </button>
                )}
              </div>
            )}

            {/* At Risk — most important section, open by default */}
            {drillStack.length === 0 && (
              <CollapsibleSection
                icon={<AlertTriangle size={13} className={atRisk.totalCount > 0 ? 'text-red-400' : 'text-slate-300'} />}
                title="At Risk"
                count={atRisk.totalCount}
                critical={atRisk.totalCount > 0}
                accent="slate"
                defaultOpen
                sectionRef={atRiskRef}
              >
                <AtRiskBody
                  overdueByPerson={atRisk.overdueByPerson}
                  dueTodayByPerson={atRisk.dueTodayByPerson}
                  totalCount={atRisk.totalCount}
                  onTaskClick={setSelectedTask}
                />
              </CollapsibleSection>
            )}

            {/* Today's Attendance — collapsible summary */}
            {drillStack.length === 0 && filteredMemberIds.size > 0 && Object.keys(attendanceByUser).length > 0 && (() => {
              const teamIds = [...filteredMemberIds];
              const inOffice   = teamIds.filter(id => attendanceByUser[id]?.isInOffice).length;
              const leftToday  = teamIds.filter(id => attendanceByUser[id]?.clockIn && !attendanceByUser[id]?.isInOffice).length;
              const notArrived = teamIds.length - inOffice - leftToday;
              return (
                <CollapsibleSection
                  icon={<Clock size={13} className="text-emerald-400" />}
                  title="Today's Attendance"
                  count={teamIds.length}
                  accent="emerald"
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-black text-slate-900">{inOffice}</p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight">In Office</p>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-slate-100" />
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-black text-slate-900">{leftToday}</p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight">Left</p>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-slate-100" />
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-200 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-black text-slate-500">{notArrived}</p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight">Not In</p>
                      </div>
                    </div>
                    <p className="ml-auto text-[9px] text-slate-300">via Keka</p>
                  </div>
                </CollapsibleSection>
              );
            })()}

            {visibleReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  {searchQuery.trim() ? <Search size={28} className="text-slate-300" /> : <Users size={28} className="text-slate-300" />}
                </div>
                <p className="text-slate-500 font-semibold">
                  {searchQuery.trim()
                    ? 'No employees found'
                    : directReports.length === 0 ? 'No team members' : 'No members match this filter'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery.trim()
                    ? `No results for "${searchQuery.trim()}"`
                    : directReports.length === 0 ? 'No team members linked to this person' : 'Try selecting a different department'}
                </p>
                {searchQuery.trim() && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-3 text-xs font-bold text-indigo-600 px-3 py-1.5 rounded-lg bg-indigo-50"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                {drillStack.length > 0 && (
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                    {viewUser.name.split(' ')[0]}'s Team ({visibleReports.length})
                  </p>
                )}
                {isSuperAdmin && drillStack.length === 0 && (
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                    All Members ({visibleReports.length}{selectedDept !== 'All' ? ` · ${selectedDept}` : ''})
                  </p>
                )}
                {visibleReports.map(u => (
                  <PersonCard
                    key={u.id}
                    user={u}
                    clientLogs={clientLogs}
                    clients={clients}
                    users={users}
                    allUsers={users}
                    onDrillIn={drillIn}
                    onTaskClick={setSelectedTask}
                    attendanceStatus={attendanceByUser[String(u.id)] ?? null}
                    currentUser={currentUser}
                  />
                ))}
              </>
            )}

            {drillStack.length === 0 && (
              <CollapsibleSection
                icon={<Info size={13} className="text-amber-400" />}
                title="Missing Info"
                count={missingInfoTasks.length}
                accent="amber"
                sectionRef={missingInfoRef}
              >
                <MissingInfoBody missingTasks={missingInfoTasks} onTaskClick={setSelectedTask} />
              </CollapsibleSection>
            )}

            {drillStack.length === 0 && (
              <CollapsibleSection
                icon={<Calendar size={13} className="text-rose-400" />}
                title="Leave Conflicts"
                count={leaveConflicts.length}
                accent="rose"
              >
                <LeaveConflictsBody conflicts={leaveConflicts} users={users} onTaskClick={setSelectedTask} />
              </CollapsibleSection>
            )}
          </div>
          </div>

          {showFilterSheet && (
            <TeamFilterSheet
              departments={departments}
              deptCounts={Object.fromEntries(departments.filter(d => d !== 'All').map(d => [d, directReports.filter(u => u.department === d).length]))}
              regions={isSuperAdmin ? regions : []}
              regionCounts={Object.fromEntries(regions.filter(r => r !== 'All').map(r => [r, directReports.filter(u => u.region === r).length]))}
              showAttendance={Object.keys(attendanceByUser).length > 0}
              applied={filters}
              onApply={setFilters}
              onClose={() => setShowFilterSheet(false)}
            />
          )}
        </>
      )}

      {activeTab === 'team' && (
        <button
          onClick={() => setShowAddTask(true)}
          className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-indigo-600 shadow-lg flex items-center justify-center text-white z-30 active:scale-95 transition-transform"
        >
          <Plus size={24} />
        </button>
      )}

      {activeTab === 'approvals' && (
        <div className="flex-1 overflow-y-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
          <ApprovalsTab
            pendingApprovals={pendingApprovals}
            isSuperAdmin={isSuperAdmin}
            onApprove={setApprovingTask}
          />
        </div>
      )}

      {approvingTask && (
        <ApproveSheet
          task={approvingTask}
          onClose={() => setApprovingTask(null)}
          clientLogs={clientLogs}
          onDone={() => setApprovingTask(null)}
        />
      )}

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          clientLogs={clientLogs}
          currentUser={currentUser}
          isManager={true}
          users={users}
          clients={clients}
        />
      )}

      {showAddTask && (
        <AddTaskSheet
          currentUser={currentUser}
          users={users}
          clients={clients}
          clientLogs={clientLogs}
          categories={categories}
          onClose={() => setShowAddTask(false)}
          onCreated={() => setShowAddTask(false)}
        />
      )}
    </div>
  );
}
