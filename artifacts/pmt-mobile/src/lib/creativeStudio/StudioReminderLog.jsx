// Reminder log: approval email delivery history for clients the viewer manages.
// Read-only; automation settings stay in Control Center. The API remains
// manager-scoped, this component only avoids asking for clients outside it.
// Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText, RefreshCw, Lock } from 'lucide-react';
import { fmtStamp } from './core.js';
import { btnGhost, ErrorBanner, SkeletonList, EmptyState } from './StudioUI.jsx';

export const DELIVERY_KIND = { request: 'Approval request', reminder: 'Pending reminder', decision: 'Decision notice', escalation: 'Near-post escalation' };
export const DELIVERY_TONE = { sent: 'bg-emerald-50 text-emerald-700 border-emerald-200', failed: 'bg-red-50 text-red-700 border-red-200', unconfirmed: 'bg-red-50 text-red-700 border-red-200', queued: 'bg-amber-50 text-amber-700 border-amber-200', sending: 'bg-amber-50 text-amber-700 border-amber-200', suppressed: 'bg-slate-100 text-slate-600 border-slate-200', cancelled: 'bg-slate-100 text-slate-600 border-slate-200', expired: 'bg-slate-100 text-slate-600 border-slate-200' };

export const DELIVERY_TONE_SCHEDULED = 'bg-blue-50 text-blue-700 border-blue-200';
const PHASE_LABEL = { reference: 'Reference approval', final: 'Final approval' };
// Normalise the API's { deliveries, upcoming } into one list. Scheduled rows only
// come from the backend's upcoming list; nothing is invented client-side.
export function reminderRows(payload, client) {
  const base = (x) => ({ ...x, clientId: client.id, clientName: client.name });
  const upcoming = (payload?.upcoming || []).map(x => ({ ...base(x), status: 'scheduled', upcoming: true, when: x.scheduledAt }));
  const sent = (payload?.deliveries || []).map(x => ({ ...base(x), upcoming: false, when: x.sentAt || x.createdAt }));
  return { upcoming, sent };
}
const ts = (v) => (typeof v === 'number' ? v : Date.parse(v) || 0);
export const phaseLabel = (d) => PHASE_LABEL[d.approvalPhase] || DELIVERY_KIND[d.kind] || d.kind || 'Email';

export const peopleIndex = (boot) => {
  const m = new Map();
  for (const u of boot?.staffCandidates || []) m.set(String(u.id), u.name);
  for (const u of boot?.owners || []) m.set(String(u.id), u.name);
  for (const a of boot?.approvers || []) m.set(String(a.uid), a.name);
  return m;
};

// Clients whose log the viewer may request: enabled AND accessible AND manageable.
export function reminderLogClients(boot, clientFilter = 'all') {
  const manageable = new Set(boot?.capabilities?.manageableClientIds || []);
  const list = (boot?.clients || []).filter(c => boot?.configs?.[c.id]?.enabled === true && manageable.has(c.id));
  return clientFilter === 'all' ? list : list.filter(c => c.id === clientFilter);
}
export const canSeeReminderLog = (boot) => reminderLogClients(boot).length > 0;

export default function StudioReminderLog({ api, boot, clientFilter = 'all' }) {
  const clients = useMemo(() => reminderLogClients(boot, clientFilter), [boot, clientFilter]);
  const people = useMemo(() => peopleIndex(boot), [boot]);
  const key = clients.map(c => c.id).join('|');
  const [rows, setRows] = useState(null); // { upcoming, sent }
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const s = ++seq.current;
    setError('');
    const results = await Promise.allSettled(clients.map(c => api.deliveries(c.id).then(d => reminderRows(d, c))));
    if (s !== seq.current) return; // stale response for an earlier client selection
    const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    setRows({
      upcoming: ok.flatMap(x => x.upcoming).sort((a, b) => ts(a.when) - ts(b.when)),
      sent: ok.flatMap(x => x.sent).sort((a, b) => ts(b.when) - ts(a.when)),
    });
    const bad = results.find(r => r.status === 'rejected');
    if (bad) setError(bad.reason?.status === 403 ? 'You no longer manage one or more of these clients.' : (bad.reason?.message || 'Could not load the reminder log.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key]);

  useEffect(() => {
    setRows(null); // never show a previous client's log while the new one loads
    if (!clients.length) return undefined;
    load();
    return () => { seq.current += 1; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  if (!clients.length) {
    return <EmptyState icon={<Lock size={20} />} title="Reminder log not available"
      body={clientFilter === 'all' ? 'The reminder log is shown to people who manage studio settings for an enabled client.' : 'You do not manage studio settings for this client, so its reminder log is hidden.'} />;
  }

  return (
    <section aria-label="Reminder log" data-testid="section-reminder-log">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ScrollText size={15} className="text-indigo-600" />
        <h3 className="text-xl font-bold flex-1">Reminder log</h3>
        <span className="text-xs text-slate-400">{clients.length === 1 ? clients[0].name : `${clients.length} clients`}</span>
        <button data-testid="button-refresh-deliveries" onClick={load} className={btnGhost} aria-label="Refresh reminder log"><RefreshCw size={13} /></button>
      </div>
      <p className="text-xs text-slate-500 mb-3">Approval request, reminder and decision emails. Change schedules and recipients in Control Center.</p>
      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}
      {rows === null ? <SkeletonList rows={3} /> : (rows.upcoming.length + rows.sent.length === 0) ? (
        !error && <EmptyState icon={<ScrollText size={20} />} title="No reminders yet" body="Scheduled and sent approval emails appear here once approvals are requested with automation enabled." />
      ) : (
        <div className="space-y-4">
          <LogTable title="Upcoming" testid="table-upcoming" rows={rows.upcoming} people={people} multi={clients.length > 1} empty="Nothing scheduled." />
          <LogTable title="Sent and history" testid="table-deliveries" rows={rows.sent} people={people} multi={clients.length > 1} empty="No emails sent yet." />
        </div>
      )}
    </section>
  );
}

function LogTable({ title, testid, rows, people, multi, empty }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">{title} <span className="text-slate-300">({rows.length})</span></p>
      {rows.length === 0 ? <p className="text-xs text-slate-400 px-1">{empty}</p> : (
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-xs" data-testid={testid}>
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50">
              <th className="py-2 px-3">Type</th><th className="px-3">Content</th>{multi && <th className="px-3">Client</th>}<th className="px-3">Recipient</th><th className="px-3">When</th><th className="px-3">Status</th>
            </tr></thead>
            <tbody>
              {rows.map(d => (
                <tr key={`${d.clientId}-${d.upcoming ? 'u' : 's'}-${d.id}`} data-testid={`row-${d.upcoming ? 'upcoming' : 'delivery'}-${d.id}`} className="border-t border-slate-100 align-top text-slate-700">
                  <td className={`py-2 px-3 whitespace-nowrap font-semibold ${d.approvalPhase === 'final' ? 'text-emerald-700' : d.approvalPhase === 'reference' ? 'text-amber-700' : 'text-slate-700'}`}>{phaseLabel(d)}</td>
                  <td className="px-3 font-semibold text-slate-900">{d.itemTitle || <span className="font-normal text-slate-500">Item {String(d.itemId || '').slice(0, 8)}</span>}{d.revision ? <span className="font-normal text-slate-400"> r{d.revision}</span> : null}</td>
                  {multi && <td className="px-3 whitespace-nowrap">{d.clientName}</td>}
                  <td className="px-3">{people.get(String(d.recipientUid)) || d.recipientName || 'Recipient no longer listed'}</td>
                  <td className="px-3 whitespace-nowrap">{d.when ? fmtStamp(ts(d.when)) : 'Not set'}</td>
                  <td className="px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${d.upcoming ? DELIVERY_TONE_SCHEDULED : (DELIVERY_TONE[d.status] || 'bg-slate-100 text-slate-600 border-slate-200')}`}>{d.status}</span>
                    {d.attempts ? <span className="text-slate-400"> x{d.attempts}</span> : null}
                    {d.error && <p className="text-[10px] text-red-600 mt-0.5">{d.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
