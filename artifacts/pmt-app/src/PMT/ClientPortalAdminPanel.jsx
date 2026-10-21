import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Mail, RefreshCw, Search, Check, X, Loader2, ShieldCheck, ShieldOff, Pencil, Ban, Trash2 } from 'lucide-react';
import { auth } from '../firebase.js';
import { createPortalApi, isRealClientId, isStaffEmail, inviteStatus } from '../lib/clientPortal/core.js';

const INVITE_BADGE = {
  pending: ['Invite pending', 'bg-amber-50 text-amber-700'],
  expired: ['Invite expired', 'bg-red-50 text-red-700'],
  revoked: ['Invite revoked', 'bg-slate-100 text-slate-600'],
  accepted: ['Joined', 'bg-indigo-50 text-indigo-700'],
};
const fmtExpiry = (ms) => (ms ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : '');

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function ClientPicker({ clients, selected, onChange }) {
  const [q, setQ] = useState('');
  const shown = clients.filter(c => (c.name || '').toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      <div className="relative border-b border-slate-100">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients" className="w-full pl-8 pr-3 py-2 text-xs outline-none rounded-t-lg" />
      </div>
      <div className="max-h-44 overflow-y-auto p-1">
        {shown.length === 0 && <p className="text-xs text-slate-400 p-2">No clients</p>}
        {shown.map(c => {
          const on = selected.includes(String(c.id));
          return (
            <button type="button" key={c.id} data-testid={`toggle-portal-client-${c.id}`} onClick={() => toggle(String(c.id))} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left ${on ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>{on && <Check size={9} className="text-white" />}</span>
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ClientPortalAdminPanel({ clients = [] }) {
  const api = useMemo(() => createPortalApi({ base: API_BASE, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }), []);
  const realClients = useMemo(() => clients.filter(c => isRealClientId(c.id) && !c.synthetic).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [clients]);
  const clientName = useCallback((id) => realClients.find(c => String(c.id) === String(id))?.name || 'Unknown client', [realClients]);
  const validIds = useMemo(() => new Set(realClients.map(c => String(c.id))), [realClients]);

  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newClientIds, setNewClientIds] = useState([]);
  const [editing, setEditing] = useState(null); // { uid, clientIds }

  const load = useCallback(async () => {
    setError('');
    try { const d = await api.adminListUsers(); setUsers(Array.isArray(d?.users) ? d.users : []); }
    catch (e) { setUsers([]); setError(e.message); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn, okMsg) => {
    setBusy(key); setError(''); setNotice('');
    try { const r = await fn(); if (okMsg) setNotice(typeof okMsg === 'function' ? okMsg(r) : okMsg); await load(); return r; }
    catch (e) { await load(); setError(e.message); return null; }
    finally { setBusy(''); }
  };

  const create = async (e) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setError('Enter a valid client email.'); return; }
    if (isStaffEmail(email)) { setError('Ethinos staff accounts cannot be portal users.'); return; }
    if (!firstName.trim() || !lastName.trim()) { setError('Enter the contact’s first and last name.'); return; }
    const ids = newClientIds.filter(id => validIds.has(id));
    if (ids.length === 0) { setError('Select at least one client.'); return; }
    const r = await run('create', () => api.adminCreateUser(email, ids, { firstName: firstName.trim(), lastName: lastName.trim() }), (res) => res?.invitationSent ? `Invitation link sent to ${email}.` : `${email} added. The invitation email was not sent; use Resend invite.`);
    if (r) { setNewEmail(''); setNewClientIds([]); setFirstName(''); setLastName(''); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Permanently delete ${user.email}?\n\nThis deletes their login account, removes access to every assigned client and Creative Studio, and invalidates all invitations. This cannot be undone.\n\nClient companies, tasks and creative work will not be deleted.`)) return;
    const result = await run(`del-${user.uid}`, () => api.adminDeleteUser(user.uid), `${user.email} and their portal access have been permanently deleted.`);
    if (result?.deleted && editing?.uid === user.uid) setEditing(null);
  };

  return (
    <div className="space-y-4" data-testid="panel-client-portal-admin">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Client portal access</h3>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">Inviting emails a single setup link. Clients create their account from it (or sign in if they already have one) and only see tasks explicitly marked Client on the clients assigned here. Links expire; resending replaces the previous link.</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"><RefreshCw size={12} /> Refresh</button>
        </div>
        <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_auto] items-start">
          <div className="space-y-2">
            <label className="block text-xs text-slate-600">First name<input data-testid="input-portal-admin-first-name" required maxLength={50} autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" /></label>
            <label className="block text-xs text-slate-600">Last name<input data-testid="input-portal-admin-last-name" required maxLength={50} autoComplete="family-name" value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" /></label>
            <label className="block text-xs text-slate-600">Email<input aria-label="Client email" data-testid="input-portal-admin-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="client@company.com" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 ring-indigo-500/20 bg-slate-50" /></label>
          </div>
          <ClientPicker clients={realClients} selected={newClientIds} onChange={setNewClientIds} />
          <button data-testid="button-portal-admin-create" type="submit" disabled={!!busy} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
            {busy === 'create' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Invite client
          </button>
        </form>
        {error && <p data-testid="text-portal-admin-error" className="mt-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {notice && <p className="mt-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{notice}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1.4fr_2fr_auto] gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>Contact / Email</span><span>Clients</span><span>Actions</span>
        </div>
        {users === null ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : users.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">No client portal users yet.</p>
        ) : users.map(u => {
          const isEditing = editing?.uid === u.uid;
          const st = inviteStatus(u);
          const exp = Number(u.invitationExpiresAt || 0);
          return (
            <div key={u.uid} data-testid={`row-portal-user-${u.uid}`} className="grid grid-cols-[1.4fr_2fr_auto] gap-3 px-4 py-3 border-b border-slate-100 last:border-0 items-start">
              <div className="min-w-0">
                {isEditing ? <div className="space-y-2 mb-2">
                  <label className="block text-xs text-slate-600">First name<input data-testid={`input-portal-first-name-${u.uid}`} maxLength={50} value={editing.firstName} onChange={e => setEditing({ ...editing, firstName: e.target.value })} className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" /></label>
                  <label className="block text-xs text-slate-600">Last name<input data-testid={`input-portal-last-name-${u.uid}`} maxLength={50} value={editing.lastName} onChange={e => setEditing({ ...editing, lastName: e.target.value })} className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" /></label>
                </div> : <p data-testid={`text-portal-name-${u.uid}`} className="text-sm font-semibold text-slate-900 truncate">{[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Name not set'}</p>}
                <p className="text-sm font-semibold text-slate-800 truncate">{u.email}</p>
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${u.disabled ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{u.disabled ? 'Disabled' : 'Active'}</span>
                  {st && <span data-testid={`status-portal-invite-${u.uid}`} className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${INVITE_BADGE[st][1]}`}>{INVITE_BADGE[st][0]}</span>}
                </div>
                {st === 'pending' && exp ? <p className="text-[10px] text-slate-400 mt-0.5">Expires {fmtExpiry(exp)}</p> : null}
                {st === 'expired' && exp ? <p className="text-[10px] text-red-600 mt-0.5">Expired {fmtExpiry(exp)}</p> : null}
              </div>
              <div>
                {isEditing ? (
                  <div className="space-y-2">
                    <ClientPicker clients={realClients} selected={editing.clientIds} onChange={ids => setEditing({ ...editing, clientIds: ids })} />
                    <div className="flex gap-2">
                      <button data-testid={`button-portal-user-save-${u.uid}`} disabled={!!busy} onClick={async () => {
                        const ids = editing.clientIds.filter(id => validIds.has(id));
                        if (!editing.firstName.trim() || !editing.lastName.trim()) { setError('Enter the contact’s first and last name.'); return; }
                        const r = await run(`save-${u.uid}`, () => api.adminUpdateUser(u.uid, { clientIds: ids, disabled: !!u.disabled, firstName: editing.firstName.trim(), lastName: editing.lastName.trim() }), 'Contact and access updated.');
                        if (r) setEditing(null);
                      }} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">Save</button>
                      <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"><X size={12} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(u.clientIds || []).length === 0 && <span className="text-xs text-slate-400">None</span>}
                    {(u.clientIds || []).map(id => <span key={id} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{clientName(id)}</span>)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button title="Edit contact and clients" data-testid={`button-portal-user-edit-${u.uid}`} disabled={!!busy} onClick={() => setEditing({ uid: u.uid, firstName: u.firstName || '', lastName: u.lastName || '', clientIds: (u.clientIds || []).map(String) })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-40"><Pencil size={13} /></button>
                <button title="Resend invite" data-testid={`button-portal-user-invite-${u.uid}`} disabled={!!busy} onClick={() => {
                  if (st === 'pending' && !window.confirm(`Send a new invitation link to ${u.email}? The previous link will stop working.`)) return;
                  run(`inv-${u.uid}`, () => api.adminInvite(u.uid), (res) => (res?.invitationSent === false ? `New link created for ${u.email}, but the email was not sent.` : `Invitation sent to ${u.email}.`));
                }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-40">{busy === `inv-${u.uid}` ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}</button>
                {st === 'pending' && (
                  <button title="Revoke invite" data-testid={`button-portal-user-revoke-${u.uid}`} disabled={!!busy} onClick={() => {
                    if (!window.confirm(`Revoke the pending invitation for ${u.email}? The link will stop working immediately.`)) return;
                    run(`rev-${u.uid}`, () => api.adminRevokeInvite(u.uid), 'Invitation revoked.');
                  }} className="p-1.5 rounded-lg hover:bg-slate-100 text-red-500 disabled:opacity-40">{busy === `rev-${u.uid}` ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}</button>
                )}
                <button title={u.disabled ? 'Enable' : 'Disable'} data-testid={`button-portal-user-toggle-${u.uid}`} disabled={!!busy} onClick={() => {
                  if (!u.disabled && !window.confirm(`Disable portal access for ${u.email}? They will lose access immediately.`)) return;
                  run(`dis-${u.uid}`, () => api.adminUpdateUser(u.uid, { clientIds: (u.clientIds || []).map(String), disabled: !u.disabled }), u.disabled ? 'Access enabled.' : 'Access disabled.');
                }} className={`p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 ${u.disabled ? 'text-emerald-600' : 'text-red-500'}`}>{u.disabled ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}</button>
                <button title={`Permanently delete ${u.email}`} data-testid={`button-portal-user-delete-${u.uid}`}
                  disabled={!!busy} onClick={() => deleteUser(u)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
                  {busy === `del-${u.uid}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Delete permanently
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
