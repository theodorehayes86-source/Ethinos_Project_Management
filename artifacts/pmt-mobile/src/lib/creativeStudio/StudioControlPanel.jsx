// Control Center -> Creative Studio: enablement, studio settings, email automation,
// previews and delivery logs. Server enforces scope. Duplicated in pmt-mobile.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings2, Mail, Eye, ScrollText, Save, Power, Search, Clock } from 'lucide-react';
import { createStudioApi, TIMEZONES, fmtStamp } from './core.js';
import { inputCls, btnPrimary, btnGhost, Field, ErrorBanner, SkeletonList, EmptyState, Sheet } from './StudioUI.jsx';

const DEFAULT_AUTO = { enabled: false, sendTime: '09:00', timezone: 'Asia/Kolkata', cadenceDays: 1 };

// Owners/editors are chosen from server-computed staffCandidates (existing project
// members via assignedProjects, or client managers) - never from the raw user list.
export const staffCandidatesFor = (boot, clientId) => (boot?.staffCandidates || []).filter(u => (u.clientIds || []).includes(clientId));
export const peopleIndex = (boot) => {
  const m = new Map();
  for (const u of boot?.staffCandidates || []) m.set(String(u.id), u.name);
  for (const u of boot?.owners || []) m.set(String(u.id), u.name);
  for (const a of boot?.approvers || []) m.set(String(a.uid), a.name);
  return m;
};
export const DELIVERY_KIND = { request: 'Approval request', reminder: 'Pending reminder', decision: 'Decision notice', escalation: 'Near-post escalation' };
export const DELIVERY_TONE = { sent: 'text-emerald-700', failed: 'text-rose-600', unconfirmed: 'text-rose-600', queued: 'text-amber-700', sending: 'text-amber-700', suppressed: 'text-stone-500', cancelled: 'text-stone-500', expired: 'text-stone-500' };

export default function StudioControlPanel({ auth, apiBase }) {
  const api = useMemo(() => createStudioApi({ base: apiBase, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }), [auth, apiBase]);
  const [boot, setBoot] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setBoot(await api.bootstrap()); } catch (e) { setError(e.message); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const manageable = useMemo(() => {
    const ids = new Set(boot?.capabilities?.manageableClientIds || []);
    return (boot?.clients || []).filter(c => ids.has(c.id) && c.name?.toLowerCase().includes(q.toLowerCase()));
  }, [boot, q]);

  if (error && !boot) return <div className="cs-root"><ErrorBanner message={error} onRetry={load} /></div>;
  if (!boot) return <div className="cs-root"><SkeletonList rows={4} /></div>;
  if (!boot.capabilities?.canManageSettings) return <div className="cs-root"><EmptyState icon={<Settings2 size={20} />} title="No studio clients to manage" body="Creative Studio settings are available to administrators and the owners of each client." /></div>;

  const current = manageable.find(c => c.id === selected) || null;
  const enabledCount = (boot.capabilities.manageableClientIds || []).filter(id => boot.configs?.[id]?.enabled).length;

  return (
    <div className="cs-root text-left text-[#1f2440] space-y-4">
      <div className="rounded-3xl bg-[#1f2440] text-[#fffaf3] p-5 flex flex-wrap items-end gap-4 justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff9b78]">Control Center</p>
          <h2 className="cs-display text-3xl leading-none mt-1">Creative Studio</h2>
          <p className="text-xs text-[#fffaf3]/70 mt-2 max-w-md">Enable existing clients, assign creative ownership and configure approval emails. Enabling creates no client, invitation or project membership.</p>
        </div>
        <div className="flex gap-4">
          <div><p className="cs-display text-3xl tabular-nums" data-testid="text-enabled-count">{enabledCount}</p><p className="text-[10px] uppercase font-bold tracking-wider opacity-70">Enabled</p></div>
          <div><p className="cs-display text-3xl tabular-nums">{boot.capabilities.manageableClientIds.length}</p><p className="text-[10px] uppercase font-bold tracking-wider opacity-70">Manageable</p></div>
        </div>
      </div>

      {boot.capabilities.canManageDefaults && <Defaults api={api} initial={boot.defaults || DEFAULT_AUTO} />}

      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        <div className="rounded-2xl border border-[#e7dfd2] bg-white/80 p-3">
          <div className="relative mb-2">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input data-testid="input-studio-client-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search existing clients" className={`${inputCls} pl-8`} />
          </div>
          <ul className="space-y-1 max-h-[480px] overflow-y-auto">
            {manageable.map(c => {
              const on = boot.configs?.[c.id]?.enabled === true;
              return (
                <li key={c.id}>
                  <button data-testid={`button-studio-client-${c.id}`} onClick={() => setSelected(c.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm transition-colors ${selected === c.id ? 'bg-[#1f2440] text-[#fffaf3]' : 'hover:bg-[#fff4ea]'}`}>
                    <span className={`w-2 h-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-stone-300'}`} aria-hidden />
                    <span className="flex-1 truncate font-semibold">{c.name}</span>
                    <span className="text-[10px] font-bold uppercase opacity-70">{on ? 'On' : 'Off'}</span>
                  </button>
                </li>
              );
            })}
            {manageable.length === 0 && <li className="text-xs text-stone-400 p-3">No matching clients.</li>}
          </ul>
        </div>
        {current ? (
          <ClientConfig key={current.id} api={api} client={current} config={boot.configs?.[current.id]}
            candidates={staffCandidatesFor(boot, current.id)} people={peopleIndex(boot)} defaults={boot.defaults || DEFAULT_AUTO}
            onSaved={(config) => setBoot(b => ({ ...b, configs: { ...b.configs, [current.id]: config } }))} />
        ) : (
          <EmptyState icon={<Power size={20} />} title="Select a client" body="Clients are created in the normal client directory. Pick one to configure studio participation." />
        )}
      </div>
    </div>
  );
}

function AutomationFields({ value, onChange, prefix }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid sm:grid-cols-4 gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-4">
        <input data-testid={`checkbox-${prefix}-auto-enabled`} type="checkbox" checked={!!value.enabled} onChange={e => set('enabled', e.target.checked)} /> Email reminders enabled
      </label>
      <Field label="Daily send time"><input data-testid={`input-${prefix}-send-time`} type="time" value={value.sendTime || '09:00'} onChange={e => set('sendTime', e.target.value)} className={inputCls} /></Field>
      <Field label="Timezone">
        <select data-testid={`select-${prefix}-auto-tz`} value={value.timezone || 'Asia/Kolkata'} onChange={e => set('timezone', e.target.value)} className={inputCls}>
          {[...new Set([value.timezone || 'Asia/Kolkata', ...TIMEZONES])].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Cadence (days)"><input data-testid={`input-${prefix}-cadence`} type="number" min={1} max={30} value={value.cadenceDays ?? 1} onChange={e => set('cadenceDays', Number(e.target.value))} className={inputCls} /></Field>
    </div>
  );
}

function Defaults({ api, initial }) {
  const [v, setV] = useState({ ...DEFAULT_AUTO, ...initial });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try { const d = await api.saveDefaults({ enabled: !!v.enabled, sendTime: v.sendTime, timezone: v.timezone, cadenceDays: Number(v.cadenceDays) }); setV({ ...DEFAULT_AUTO, ...d.defaults }); setMsg('Global defaults saved.'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-[#e7dfd2] bg-white/80 p-4 space-y-3">
      <div className="flex items-center gap-2"><Mail size={15} /><h3 className="cs-display text-xl">Global email defaults</h3><span className="text-[10px] font-bold uppercase text-stone-400 ml-1">Administrators</span></div>
      <AutomationFields value={v} onChange={setV} prefix="defaults" />
      {error && <ErrorBanner message={error} />}
      <div className="flex items-center gap-3"><button data-testid="button-save-defaults" disabled={busy} onClick={save} className={btnPrimary}><Save size={12} /> Save defaults</button>{msg && <span className="text-xs text-emerald-700 font-semibold">{msg}</span>}</div>
    </section>
  );
}

function ClientConfig({ api, client, config, candidates, people, defaults, onSaved }) {
  const [v, setV] = useState({
    enabled: config?.enabled === true, ownerIds: config?.ownerIds || [], editorIds: config?.editorIds || [],
    timezone: config?.timezone || 'Asia/Kolkata', automation: { ...DEFAULT_AUTO, ...defaults, ...(config?.automation || {}) },
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [deliveries, setDeliveries] = useState(null);
  const [delError, setDelError] = useState('');
  const toggle = (k, id) => setV(p => ({ ...p, [k]: p[k].includes(id) ? p[k].filter(x => x !== id) : [...p[k], id] }));

  const loadDeliveries = useCallback(async () => {
    setDelError('');
    try { const d = await api.deliveries(client.id); setDeliveries(d.deliveries || []); } catch (e) { setDelError(e.message); }
  }, [api, client.id]);
  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const d = await api.saveConfig(client.id, {
        enabled: v.enabled, ownerIds: v.ownerIds, editorIds: v.editorIds, timezone: v.timezone,
        automation: { enabled: !!v.automation.enabled, sendTime: v.automation.sendTime, timezone: v.automation.timezone, cadenceDays: Number(v.automation.cadenceDays) },
      });
      onSaved(d.config); setMsg('Settings saved.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const runPreview = async () => {
    setError('');
    try { setPreview(await api.preview(client.id)); } catch (e) { setError(e.message); }
  };

  const Picker = ({ k, list, testid }) => (
    <div className="flex flex-wrap gap-1.5">
      {list.length === 0 && <span className="text-xs text-stone-400">No eligible staff.</span>}
      {list.map(u => (
        <button type="button" key={u.id} data-testid={`${testid}-${u.id}`} aria-pressed={v[k].includes(u.id)} onClick={() => toggle(k, u.id)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${v[k].includes(u.id) ? 'bg-[#1f2440] text-[#fffaf3] border-[#1f2440]' : 'bg-white border-[#e7dfd2]'}`}>{u.name}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e7dfd2] bg-white/80 p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 data-testid="text-config-client" className="cs-display text-2xl flex-1">{client.name}</h3>
          <button data-testid="button-toggle-studio-enabled" role="switch" aria-checked={v.enabled} onClick={() => setV(p => ({ ...p, enabled: !p.enabled }))}
            className={`relative w-12 h-7 rounded-full transition-colors ${v.enabled ? 'bg-emerald-500' : 'bg-stone-300'}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${v.enabled ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-xs font-bold">{v.enabled ? 'Studio enabled' : 'Studio disabled'}</span>
        </div>
        {!v.enabled && config?.enabled && <p className="text-[11px] text-amber-700">Disabling preserves deliverables, ordinary tasks and portal access, but stops studio access and reminders.</p>}
        <Field label="Creative owners" hint="Grants creative editing to existing project members only. Does not grant Control Center access."><Picker k="ownerIds" list={candidates} testid="button-owner" /></Field>
        <Field label="Creative editors" hint="Only existing project members of this client are eligible."><Picker k="editorIds" list={candidates} testid="button-editor" /></Field>
        <Field label="Default posting timezone">
          <select data-testid="select-studio-tz" value={v.timezone} onChange={e => setV(p => ({ ...p, timezone: e.target.value }))} className={`${inputCls} sm:max-w-xs`}>
            {[...new Set([v.timezone, ...TIMEZONES])].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </section>

      <section className="rounded-2xl border border-[#e7dfd2] bg-white/80 p-4 space-y-3">
        <div className="flex items-center gap-2"><Mail size={15} /><h3 className="cs-display text-xl">Email automation</h3></div>
        <p className="text-xs text-stone-500">Approval requests, daily pending-approval reminders, near-post-date escalation to the internal owner and decision notices. Recipients are always the verified designated approver or internal owner; reminders stop after a decision, archive, unsharing or revoked access.</p>
        <AutomationFields value={v.automation} onChange={(a) => setV(p => ({ ...p, automation: a }))} prefix="client" />
        <p className="text-[11px] text-stone-400 flex items-center gap-1"><Clock size={11} /> Missed runs are not replayed as a backlog.</p>
      </section>

      {error && <ErrorBanner message={error} />}
      <div className="flex flex-wrap items-center gap-2">
        <button data-testid="button-save-studio-config" disabled={busy} onClick={save} className={btnPrimary}><Save size={12} /> Save settings</button>
        <button data-testid="button-preview-email" onClick={runPreview} className={btnGhost}><Eye size={12} /> Preview email</button>
        {msg && <span data-testid="status-config-saved" className="text-xs text-emerald-700 font-semibold">{msg}</span>}
      </div>

      <section className="rounded-2xl border border-[#e7dfd2] bg-white/80 p-4">
        <div className="flex items-center gap-2 mb-2"><ScrollText size={15} /><h3 className="cs-display text-xl flex-1">Delivery log</h3><button data-testid="button-refresh-deliveries" onClick={loadDeliveries} className="text-[11px] font-bold text-[#ff6b3d]">Refresh</button></div>
        {delError ? <ErrorBanner message={delError} onRetry={loadDeliveries} /> : deliveries === null ? <SkeletonList rows={2} /> : deliveries.length === 0 ? (
          <p className="text-xs text-stone-400">No deliveries recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-deliveries">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-stone-400"><th className="py-1 pr-3">Created</th><th className="pr-3">Type</th><th className="pr-3">Recipient</th><th className="pr-3">Item / rev</th><th className="pr-3">Status</th><th>Detail</th></tr></thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} data-testid={`row-delivery-${d.id}`} className="border-t border-[#f3ece1] align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{fmtStamp(d.createdAt)}</td>
                    <td className="pr-3">{DELIVERY_KIND[d.kind] || d.kind}</td>
                    <td className="pr-3">{people.get(String(d.recipientUid)) || 'Recipient no longer listed'}</td>
                    <td className="pr-3 text-stone-500 whitespace-nowrap">{String(d.itemId || '').slice(0, 8)} r{d.revision}</td>
                    <td className={`pr-3 font-bold capitalize ${DELIVERY_TONE[d.status] || 'text-stone-600'}`}>{d.status}{d.attempts ? <span className="font-normal text-stone-400"> x{d.attempts}</span> : null}</td>
                    <td className="text-stone-500">{d.error || (d.sentAt ? `Sent ${fmtStamp(d.sentAt)}` : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview && (
        <Sheet title="Email preview" onClose={() => setPreview(null)} testid="dialog-email-preview">
          <p className={`text-[11px] font-bold mb-3 ${preview.deliveryEnabled ? 'text-amber-700' : 'text-stone-500'}`}>{preview.deliveryEnabled ? 'Server delivery is enabled.' : 'Server delivery is suppressed. No email is sent.'} This preview sends nothing.</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Subject</p>
          <p data-testid="text-preview-subject" className="text-sm font-bold mb-3">{preview.subject}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Body</p>
          <p data-testid="text-preview-body" className="text-sm whitespace-pre-wrap">{preview.body}</p>
        </Sheet>
      )}
    </div>
  );
}
