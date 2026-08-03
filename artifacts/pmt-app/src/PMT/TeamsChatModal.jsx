/**
 * TeamsChatModal — bidirectional 1:1 Teams chat embedded in Flow Pro.
 *
 * Messages sent from Flow Pro appear immediately (written to Firebase + sent to Graph).
 * Replies from Teams arrive via Graph change notifications → Firebase → onValue listener.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, MessageSquare, AlertTriangle, RefreshCw } from 'lucide-react';
import { ref, onValue } from 'firebase/database';
import { db, auth } from '../firebase.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/** Minimal Microsoft Teams "T" icon reproduced as an inline SVG. */
function TeamsIcon({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Purple background pill for the "T" */}
      <rect x="1" y="5" width="14" height="14" rx="3" fill="#5B5EA6" />
      <text
        x="8"
        y="15.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="bold"
        fill="white"
        fontFamily="sans-serif"
      >T</text>
      {/* Small person silhouette to the right, suggesting a group/Teams feel */}
      <circle cx="19" cy="9" r="3" fill="#7B83EB" />
      {/* Path clamped so rightmost point = x24, stays inside 24×24 viewBox */}
      <path d="M13 19c0-3.038 2.462-5.5 5.5-5.5S24 15.962 24 19H13z" fill="#7B83EB" />
    </svg>
  );
}

/** Badge shown on bubbles that arrived from Microsoft Teams. */
function ViaTeamsBadge({ mine = false }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-medium ${
        mine
          ? 'bg-indigo-500/30 text-indigo-100'
          : 'bg-slate-100 text-slate-500 border border-slate-200'
      }`}
      title={mine ? 'Sent via Microsoft Teams' : 'Received via Microsoft Teams'}
    >
      <TeamsIcon className="w-2.5 h-2.5 flex-shrink-0" />
      <span>via Teams</span>
    </span>
  );
}

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-rose-500',
  'bg-orange-500', 'bg-amber-500', 'bg-teal-500', 'bg-cyan-500',
];
function avatarBg(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

async function getToken() {
  return auth.currentUser?.getIdToken() ?? '';
}

export default function TeamsChatModal({ member, currentUser, onClose }) {
  const [chatKey, setChatKey] = useState(null);
  const [rawChatId, setRawChatId] = useState(null);
  const [senderObjectId, setSenderObjectId] = useState(null); // Entra OID of current user
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const memberEmail = member.email || member.emailAddress;
  const senderEmail = currentUser?.email || currentUser?.emailAddress;

  // ── Open chat ─────────────────────────────────────────────────────────────
  const openChat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const resp = await fetch(`${API_BASE}/teams-chat/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          senderId: String(currentUser.id),
          senderEmail,
          senderName: currentUser.name,
          recipientId: String(member.id),
          recipientEmail: memberEmail,
          recipientName: member.name,
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
      setError(err.message || 'Failed to open chat');
    } finally {
      setLoading(false);
    }
  }, [member.id, memberEmail, currentUser.id, senderEmail, currentUser.name, member.name]);

  useEffect(() => {
    if (!memberEmail) { setError('This user has no email on record'); setLoading(false); return; }
    if (!senderEmail) { setError('Your account has no email'); setLoading(false); return; }
    openChat();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firebase realtime listener ────────────────────────────────────────────
  useEffect(() => {
    if (!chatKey) return;
    const msgRef = ref(db, `teamsDMs/chats/${chatKey}/messages`);
    const unsub = onValue(msgRef, snap => {
      const val = snap.val();
      const sorted = val
        ? Object.values(val).sort((a, b) => a.sentAt - b.sentAt)
        : [];
      setMessages(sorted);
    });
    return () => unsub();
  }, [chatKey]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'auto' });
  }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const msg = text.trim();
    if (!msg || !rawChatId || sending) return;
    setText('');
    setSending(true);
    try {
      const token = await getToken();
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
      setText(msg); // restore on failure
    } finally {
      setSending(false);
    }
  }, [text, rawChatId, chatKey, currentUser, senderObjectId, sending]);

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── "Mine" check ──────────────────────────────────────────────────────────
  // Flow Pro messages store the PMT user ID in fromId.
  // Teams messages store the Entra Object ID in fromObjectId.
  const isMine = msg =>
    (msg.source === 'flowpro' && String(msg.fromId) === String(currentUser.id)) ||
    (msg.source === 'teams' && senderObjectId && msg.fromObjectId === senderObjectId);

  const fmtTime = ts =>
    new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden mx-4"
        style={{ width: 440, height: 580 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className={`w-9 h-9 rounded-full ${avatarBg(member.name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
            {initials(member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm">{member.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <p className="text-xs text-slate-400">Teams ↔ Flow Pro</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0"
          >
            <X size={14} className="text-slate-600" />
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-slate-50/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-7 h-7 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Opening conversation…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <AlertTriangle size={28} className="text-amber-400" />
              <p className="text-sm font-semibold text-slate-700">Couldn't open chat</p>
              <p className="text-xs text-slate-400">{error}</p>
              <button
                onClick={openChat}
                className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <MessageSquare size={32} className="text-slate-200" />
              <p className="text-sm text-slate-400">No messages yet</p>
              <p className="text-xs text-slate-300">Messages you send appear here and in Teams</p>
            </div>
          ) : (
            messages.map(msg => {
              const mine = isMine(msg);
              return (
                <div
                  key={msg.id || msg.sentAt}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[76%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                    mine
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                  }`}>
                    {!mine && (
                      <p className="text-[10px] font-bold text-indigo-500 mb-0.5 truncate">
                        {msg.fromName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <div className={`flex items-center justify-end gap-1.5 mt-1 ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>
                      {msg.source === 'teams' && (
                        <ViaTeamsBadge mine={mine} />
                      )}
                      <span className="text-[9px]">{fmtTime(msg.sentAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Compose ── */}
        <div className="px-4 py-3 border-t border-slate-100 bg-white flex items-end gap-2 flex-shrink-0">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder={loading ? 'Opening chat…' : `Message ${member.name}…`}
            rows={1}
            disabled={loading || !!error}
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 disabled:opacity-40"
            style={{ lineHeight: '1.4', maxHeight: 112, overflowY: 'auto' }}
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending || loading || !!error}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Send size={14} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
