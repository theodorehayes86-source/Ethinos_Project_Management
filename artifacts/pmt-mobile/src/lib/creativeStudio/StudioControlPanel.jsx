// Control Center -> Creative Studio: enablement, studio settings, email automation,
// previews; delivery log lives in StudioReminderLog. Server enforces scope. Duplicated in pmt-mobile.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings2, Mail, Eye, Save, Power, Search, Clock } from 'lucide-react';
import { createStudioApi, TIMEZONES } from './core.js';
import { inputCls, btnPrimary, btnGhost, Field, ErrorBanner, SkeletonList, EmptyState, Sheet } from './StudioUI.jsx';

export const PHASE_DEFAULTS = {
  reference: {
    enabled: true, escalationDays: 5,
    subject: 'Action needed: approve references for {{post}}',
    body: 'Hi {{recipientName}}, references for {{post}} going live on {{date}} are ready. Review the moodboard and thumbnail on SharePoint and approve in Creative Studio.',
  },
  final: {
    enabled: true, escalationDays: 2,
    subject: 'Final approval needed: {{post}} goes live {{date}}',
    body: 'Hi {{recipientName}}, the final {{type}} for {{post}} is ready. Approve by {{deadline}} so the team can schedule it on time.',
  },
};
export const PHASES = [
  { id: 'reference', title: 'Reference approval reminder', blurb: 'Sent when references or moodboards need sign-off', trigger: 'Reference uploaded' },
  { id: 'final', title: 'Final post approval reminder', blurb: 'Sent when the final creative is ready to go live', trigger: 'Final post uploaded' },
];
export const PLACEHOLDERS = ['{{recipientName}}', '{{firstName}}', '{{lastName}}', '{{client}}', '{{post}}', '{{date}}', '{{type}}', '{{deadline}}'];
export const PLACEHOLDER_MEANINGS = {
  '{{recipientName}}': 'Recipient first and last name', '{{firstName}}': 'Recipient first name', '{{lastName}}': 'Recipient last name',
  '{{client}}': 'Client company name', '{{post}}': 'Post name', '{{date}}': 'Posting date',
  '{{type}}': 'Story, Reel or Post', '{{deadline}}': 'Deadline time and date',
};
const DEFAULT_AUTO = { enabled: false, sendTime: '09:00', timezone: 'Asia/Kolkata', cadenceDays: 1, reference: PHASE_DEFAULTS.reference, final: PHASE_DEFAULTS.final };

// Deep-merge layers (built-in < global defaults < client config) so older configs
// without phase objects never yield undefined phases.
export function mergeAutomation(...layers) {
  const out = { ...DEFAULT_AUTO, reference: { ...PHASE_DEFAULTS.reference }, final: { ...PHASE_DEFAULTS.final } };
  for (const l of layers) {
    if (!l || typeof l !== 'object') continue;
    for (const [k, v] of Object.entries(l)) {
      if (k === 'reference' || k === 'final') { if (v && typeof v === 'object') out[k] = { ...out[k], ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== null)) }; }
      else if (v !== undefined && v !== null) out[k] = v;
    }
  }
  return out;
}
const phasePayload = (p) => ({ enabled: !!p.enabled, escalationDays: Number(p.escalationDays), subject: String(p.subject || ''), body: String(p.body || '') });
export const automationPayload = (a) => ({
  enabled: !!a.enabled, sendTime: a.sendTime, timezone: a.timezone, cadenceDays: Number(a.cadenceDays),
  reference: phasePayload(a.reference), final: phasePayload(a.final),
});
export const scheduleSummary = (a) => {
  const [h, m] = String(a.sendTime || '09:00').split(':').map(Number);
  const t = `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  const every = Number(a.cadenceDays) === 1 ? 'Daily' : `Every ${a.cadenceDays} days`;
  return `${every} ${t} until approved`;
};

// Owners/editors are chosen from server-computed staffCandidates (existing project
// members via assignedProjects, or client managers) - never from the raw user list.
export const staffCandidatesFor = (boot, clientId) => (boot?.staffCandidates || []).filter(u => (u.clientIds || []).includes(clientId));
// Log helpers moved to StudioReminderLog; re-exported for compatibility.
export { peopleIndex, DELIVERY_KIND, DELIVERY_TONE } from './StudioReminderLog.jsx';
import { peopleIndex } from './StudioReminderLog.jsx';

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
    <div className="cs-root text-left text-slate-900 space-y-4">
      <div className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-wrap items-end gap-4 justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Control Center</p>
          <h2 className="cs-display text-3xl leading-none mt-1">Creative Studio</h2>
          <p className="text-xs text-slate-500 mt-2 max-w-md">Enable existing clients, assign creative ownership and configure approval emails. Enabling creates no client, invitation or project membership.</p>
        </div>
        <div className="flex gap-4">
          <div><p className="cs-display text-3xl tabular-nums" data-testid="text-enabled-count">{enabledCount}</p><p className="text-[10px] uppercase font-bold tracking-wider opacity-70">Enabled</p></div>
          <div><p className="cs-display text-3xl tabular-nums">{boot.capabilities.manageableClientIds.length}</p><p className="text-[10px] uppercase font-bold tracking-wider opacity-70">Manageable</p></div>
        </div>
      </div>

      {boot.capabilities.canManageDefaults && <Defaults api={api} initial={boot.defaults || DEFAULT_AUTO} />}

      <div className="grid @4xl:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
          <div className="relative mb-2">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input data-testid="input-studio-client-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search existing clients" className={`${inputCls} pl-8`} />
          </div>
          <ul className="space-y-1 max-h-[480px] overflow-y-auto">
            {manageable.map(c => {
              const on = boot.configs?.[c.id]?.enabled === true;
              return (
                <li key={c.id}>
                  <button data-testid={`button-studio-client-${c.id}`} onClick={() => setSelected(c.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm transition-colors ${selected === c.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-indigo-50'}`}>
                    <span className={`w-2 h-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden />
                    <span className="flex-1 truncate font-semibold">{c.name}</span>
                    <span className="text-[10px] font-bold uppercase opacity-70">{on ? 'On' : 'Off'}</span>
                  </button>
                </li>
              );
            })}
            {manageable.length === 0 && <li className="text-xs text-slate-400 p-3">No matching clients.</li>}
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
    <div className="grid @xl:grid-cols-4 gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold @xl:col-span-4">
        <input data-testid={`checkbox-${prefix}-auto-enabled`} type="checkbox" checked={!!value.enabled} onChange={e => set('enabled', e.target.checked)} /> Email reminders enabled
      </label>
      <Field label="Daily send time"><input data-testid={`input-${prefix}-send-time`} type="time" value={value.sendTime || '09:00'} onChange={e => set('sendTime', e.target.value)} className={inputCls} /></Field>
      <Field label="Timezone">
        <select data-testid={`select-${prefix}-auto-tz`} value={value.timezone || 'Asia/Kolkata'} onChange={e => set('timezone', e.target.value)} className={inputCls}>
          {[...new Set([value.timezone || 'Asia/Kolkata', ...TIMEZONES])].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Cadence (days)"><input data-testid={`input-${prefix}-cadence`} type="number" min={1} max={30} value={value.cadenceDays ?? 1} onChange={e => set('cadenceDays', Number(e.target.value))} className={inputCls} /></Field>
      <div className="@xl:col-span-4 grid @4xl:grid-cols-2 gap-3">
        {PHASES.map(ph => <PhaseCard key={ph.id} phase={ph} master={value} value={value[ph.id]} onChange={(pv) => set(ph.id, pv)} prefix={prefix} />)}
      </div>
      <div className="@xl:col-span-4 text-[11px] text-slate-500 space-y-1">
        <p>Variables are replaced with the client and post details when the email is sent.</p>
        {PLACEHOLDERS.map(token => <span key={token} className="inline-block mr-3"><code className="font-semibold">{token}</code> = {PLACEHOLDER_MEANINGS[token]}</span>)}
        <p>Send time, timezone and cadence apply to both reminders.</p>
      </div>
    </div>
  );
}

function PhaseCard({ phase, master, value, onChange, prefix }) {
  const v = value || PHASE_DEFAULTS[phase.id];
  const set = (k, x) => onChange({ ...v, [k]: x });
  const id = `${prefix}-${phase.id}`;
  const active = master.enabled && v.enabled;
  return (
    <div data-testid={`card-phase-${id}`} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Mail size={15} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">{phase.title}</p>
          <p className="text-[11px] text-slate-500">{phase.blurb}</p>
        </div>
        <button type="button" data-testid={`toggle-${id}`} role="switch" aria-checked={!!v.enabled} aria-label={`${phase.title} enabled`} onClick={() => set('enabled', !v.enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${v.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${v.enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Trigger</p><p className="text-xs font-semibold">{phase.trigger}</p></div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cadence</p><p data-testid={`text-schedule-${id}`} className="text-xs font-semibold">{scheduleSummary(master)}</p></div>
        <label className="rounded-lg bg-slate-50 px-2.5 py-2 block"><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Escalate (days before post)</span>
          <input data-testid={`input-${id}-escalation`} type="number" min={0} max={30} value={v.escalationDays ?? ''} onChange={e => set('escalationDays', Number(e.target.value))} className="w-full bg-transparent text-xs font-semibold outline-none" />
        </label>
      </div>
      <Field label="Subject"><input data-testid={`input-${id}-subject`} value={v.subject || ''} maxLength={200} onChange={e => set('subject', e.target.value)} className={inputCls} /></Field>
      <Field label="Body"><textarea data-testid={`input-${id}-body`} rows={3} value={v.body || ''} maxLength={2000} onChange={e => set('body', e.target.value)} className={inputCls} /></Field>
      {!active && <p className="text-[11px] text-slate-500">{master.enabled ? 'This reminder is off.' : 'Email reminders are off for all phases.'}</p>}
    </div>
  );
}

function Defaults({ api, initial }) {
  const [v, setV] = useState(() => mergeAutomation(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try { const d = await api.saveDefaults(automationPayload(v)); setV(mergeAutomation(d.defaults)); setMsg('Global defaults saved.'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 space-y-3">
      <div className="flex items-center gap-2"><Mail size={15} /><h3 className="cs-display text-xl">Global email defaults</h3><span className="text-[10px] font-bold uppercase text-slate-400 ml-1">Administrators</span></div>
      <AutomationFields value={v} onChange={setV} prefix="defaults" />
      {error && <ErrorBanner message={error} />}
      <div className="flex items-center gap-3"><button data-testid="button-save-defaults" disabled={busy} onClick={save} className={btnPrimary}><Save size={12} /> Save defaults</button>{msg && <span className="text-xs text-emerald-700 font-semibold">{msg}</span>}</div>
    </section>
  );
}

function ClientConfig({ api, client, config, candidates, people, defaults, onSaved }) {
  const [v, setV] = useState({
    enabled: config?.enabled === true, ownerIds: config?.ownerIds || [], editorIds: config?.editorIds || [],
    timezone: config?.timezone || 'Asia/Kolkata', automation: mergeAutomation(defaults, config?.automation),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewPhase, setPreviewPhase] = useState('reference');
  const [dirty, setDirty] = useState(false);
  const edit = (fn) => { setDirty(true); setV(fn); };
  const toggle = (k, id) => edit(p => ({ ...p, [k]: p[k].includes(id) ? p[k].filter(x => x !== id) : [...p[k], id] }));


  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const d = await api.saveConfig(client.id, {
        enabled: v.enabled, ownerIds: v.ownerIds, editorIds: v.editorIds, timezone: v.timezone,
        automation: automationPayload(v.automation),
      });
      onSaved(d.config); setDirty(false); setMsg('Settings saved.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const runPreview = async () => {
    setError('');
    try { setPreview({ ...(await api.preview(client.id, { phase: previewPhase })), phase: previewPhase }); } catch (e) { setError(e.message); }
  };

  const Picker = ({ k, list, testid }) => (
    <div className="flex flex-wrap gap-1.5">
      {list.length === 0 && <span className="text-xs text-slate-400">No eligible staff.</span>}
      {list.map(u => (
        <button type="button" key={u.id} data-testid={`${testid}-${u.id}`} aria-pressed={v[k].includes(u.id)} onClick={() => toggle(k, u.id)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${v[k].includes(u.id) ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white border-slate-200 text-slate-600'}`}>{u.name}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 data-testid="text-config-client" className="cs-display text-2xl flex-1">{client.name}</h3>
          <button data-testid="button-toggle-studio-enabled" role="switch" aria-checked={v.enabled} onClick={() => edit(p => ({ ...p, enabled: !p.enabled }))}
            className={`relative w-12 h-7 rounded-full transition-colors ${v.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${v.enabled ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-xs font-bold">{v.enabled ? 'Studio enabled' : 'Studio disabled'}</span>
        </div>
        {!v.enabled && config?.enabled && <p className="text-[11px] text-amber-700">Disabling preserves deliverables, ordinary tasks and portal access, but stops studio access and reminders.</p>}
        <Field label="Creative owners" hint="Grants creative editing to existing project members only. Does not grant Control Center access."><Picker k="ownerIds" list={candidates} testid="button-owner" /></Field>
        <Field label="Creative editors" hint="Only existing project members of this client are eligible."><Picker k="editorIds" list={candidates} testid="button-editor" /></Field>
        <Field label="Default posting timezone">
          <select data-testid="select-studio-tz" value={v.timezone} onChange={e => edit(p => ({ ...p, timezone: e.target.value }))} className={`${inputCls} @xl:max-w-xs`}>
            {[...new Set([v.timezone, ...TIMEZONES])].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 space-y-3">
        <div className="flex items-center gap-2"><Mail size={15} /><h3 className="cs-display text-xl">Email automation</h3></div>
        <p className="text-xs text-slate-500">Approval requests, daily pending-approval reminders, near-post-date escalation to the internal owner and decision notices. Recipients are always the verified designated approver or internal owner; reminders stop after a decision, archive, unsharing or revoked access.</p>
        <AutomationFields value={v.automation} onChange={(a) => edit(p => ({ ...p, automation: a }))} prefix="client" />
        <p className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={11} /> Missed runs are not replayed as a backlog.</p>
      </section>

      {error && <ErrorBanner message={error} />}
      <div className="flex flex-wrap items-center gap-2">
        <button data-testid="button-save-studio-config" disabled={busy} onClick={save} className={btnPrimary}><Save size={12} /> Save settings</button>
        <select data-testid="select-preview-phase" value={previewPhase} onChange={e => setPreviewPhase(e.target.value)} className={`${inputCls} !w-auto !py-2`} aria-label="Preview phase">
          <option value="reference">Reference approval</option>
          <option value="final">Final post approval</option>
        </select>
        <button data-testid="button-preview-email" onClick={runPreview} className={btnGhost}><Eye size={12} /> Preview email</button>
        {msg && <span data-testid="status-config-saved" className="text-xs text-emerald-700 font-semibold">{msg}</span>}
      </div>
      <p data-testid="text-preview-note" className={`text-[11px] ${dirty ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>{dirty ? 'You have unsaved changes. Previews use saved settings, so save first to preview them.' : 'Previews use saved settings and never send email.'}</p>

      <p className="text-[11px] text-slate-500">Sent and failed reminder emails are listed in Creative Studio, Reminder log.</p>

      {preview && (
        <Sheet title={preview.phase === 'final' ? 'Final post approval preview' : 'Reference approval preview'} onClose={() => setPreview(null)} testid="dialog-email-preview">
          <p className={`text-[11px] font-bold mb-3 ${preview.deliveryEnabled ? 'text-amber-700' : 'text-slate-500'}`}>{preview.deliveryEnabled ? 'Server delivery is enabled.' : 'Server delivery is suppressed. No email is sent.'} This preview sends nothing.</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subject</p>
          <p data-testid="text-preview-subject" className="text-sm font-bold mb-3">{preview.subject}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Body</p>
          <p data-testid="text-preview-body" className="text-sm whitespace-pre-wrap">{preview.body}</p>
        </Sheet>
      )}
    </div>
  );
}
