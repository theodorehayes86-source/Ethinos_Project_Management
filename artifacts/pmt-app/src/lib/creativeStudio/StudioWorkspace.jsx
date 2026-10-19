// Staff Creative Studio workspace: content plan, deliverables tracker and detail.
// All data via /api/creative-studio. Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, CalendarDays, LayoutList, Eye, Users, Copy, Archive, ArchiveRestore,
  Pencil, Share2, EyeOff, CalendarCheck, Undo2, BellRing, ExternalLink, Link2, CheckCircle2,
  AlertTriangle, Sparkles, X, Clock, RefreshCw, Lock, Activity, Settings2,
} from 'lucide-react';
import {
  createStudioApi, TYPES, PLATFORMS, ASSET_KINDS, TIMEZONES, stageLabel, isHttps, localToUtc, utcToLocal,
  dayKey, monthKey, urgency, relativeDay, fmtInstant, fmtStamp, tzShort, summarize, clientVisible, STAGES, peekStudioLink, writeStudioLink,
} from './core.js';
import { STUDIO_CONFIG_CHANGED } from './access.js';
import {
  inputCls, btnPrimary, btnAccent, btnGhost, StageBadge, UrgencyTag, Field, Sheet, ErrorBanner,
  SkeletonList, EmptyState, ThreadPanel,
} from './StudioUI.jsx';

const nowMonth = () => utcToLocal(new Date().toISOString(), 'Asia/Kolkata').date.slice(0, 7);
const shiftMonth = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
const monthTitle = (m) => { const [y, mo] = m.split('-').map(Number); return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1))); };
const dayTitle = (k) => { const [y, m, d] = k.split('-').map(Number); return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); };
const PREF_KEY = 'flowpro_creative_studio_view';

function loadPrefs() { try { return JSON.parse(sessionStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } }

export default function StudioWorkspace({ auth, apiBase, currentUser }) {
  const api = useMemo(() => createStudioApi({ base: apiBase, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }), [auth, apiBase]);
  const prefs = useRef(loadPrefs()).current;
  const [boot, setBoot] = useState(null);
  const [bootError, setBootError] = useState('');
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState(prefs.view || 'plan');
  const [mode, setMode] = useState('team');
  const [month, setMonth] = useState(prefs.month || nowMonth());
  const [type, setType] = useState(prefs.type || 'All');
  const [clientF, setClientF] = useState(prefs.clientF || 'all');
  const [stageF, setStageF] = useState(prefs.stageF || 'all');
  const [ownerF, setOwnerF] = useState(prefs.ownerF || 'all');
  const [deadlineF, setDeadlineF] = useState(prefs.deadlineF || 'all');
  const [showArchived, setShowArchived] = useState(false);
  const initialLink = useRef(peekStudioLink()).current;
  const [selectedId, setSelectedId] = useState(() => initialLink?.item || null);
  const [editing, setEditing] = useState(null); // {} for create, item for edit

  // Reveal a deep-linked record: no saved filter, month or preview mode may hide it.
  const linkRevealed = useRef(!initialLink);
  useEffect(() => {
    if (linkRevealed.current || !items) return;
    const it = items.find(i => i.id === initialLink.item);
    linkRevealed.current = true;
    if (!it) return;
    setMode('team');
    setType('All'); setStageF('all'); setOwnerF('all'); setDeadlineF('all');
    setClientF(c => (c === 'all' || c === it.clientId ? c : 'all'));
    if (it.archived) setShowArchived(true);
    if (it.plannedAt) { setView('plan'); setMonth(monthKey(it.plannedAt, it.timezone)); } else setView('tracker');
  }, [items, initialLink]);
  useEffect(() => {
    if (!items) return; // keep a pending deep link until records load
    const sel = items.find(i => i.id === selectedId);
    writeStudioLink(selectedId ? { item: selectedId, client: sel?.clientId || initialLink?.client } : null);
  }, [selectedId, items, initialLink]);
  useEffect(() => () => writeStudioLink(null), []);
  useEffect(() => {
    sessionStorage.setItem(PREF_KEY, JSON.stringify({ view, month, type, clientF, stageF, ownerF, deadlineF }));
  }, [view, month, type, clientF, stageF, ownerF, deadlineF]);

  const enabledClients = useMemo(() => (boot?.clients || []).filter(c => boot.configs?.[c.id]?.enabled === true), [boot]);
  const editable = useMemo(() => new Set(boot?.capabilities?.editableClientIds || []), [boot]);

  // Keep bootstrap fresh: enablement/revocation must reach a mounted workspace.
  const bootSeq = useRef(0);
  const loadBoot = useCallback(async () => {
    const seq = ++bootSeq.current;
    try {
      const b = await api.bootstrap();
      if (seq !== bootSeq.current) return;
      setBoot(b); setBootError('');
    } catch (e) {
      if (seq !== bootSeq.current) return;
      setBootError(e.message);
      // Scope lost: drop every cached record rather than showing stale private data.
      if (e.status === 401 || e.status === 403) { setBoot(null); setItems(null); setSelectedId(null); }
    }
  }, [api]);
  useEffect(() => {
    loadBoot();
    const t = setInterval(loadBoot, 45000);
    const onFocus = () => loadBoot();
    window.addEventListener('focus', onFocus);
    window.addEventListener(STUDIO_CONFIG_CHANGED, onFocus);
    return () => { bootSeq.current += 1; clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener(STUDIO_CONFIG_CHANGED, onFocus); };
  }, [loadBoot]);

  const loadItems = useCallback(async () => {
    if (!boot) return;
    const seq = ++itemsSeq.current;
    const results = await Promise.allSettled(enabledClients.map(c => api.list(c.id).then(d => ({ id: c.id, list: d.deliverables || [] }))));
    if (seq !== itemsSeq.current) return;
    const failed = results.filter(r => r.status === 'rejected');
    const okIds = new Set(results.filter(r => r.status === 'fulfilled').map(r => r.value.id));
    const fresh = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value.list);
    setItems(prev => {
      // Keep previous rows only for clients whose failure was a transient network error.
      const transient = new Set(enabledClients.filter((c, idx) => results[idx].status === 'rejected' && results[idx].reason?.status === 0).map(c => c.id));
      const kept = (prev || []).filter(i => transient.has(i.clientId) && !okIds.has(i.clientId));
      return [...fresh, ...kept];
    });
    setLoadError(failed.length ? failed[0].reason?.message || 'Some clients could not be loaded.' : '');
    if (failed.some(r => r.reason?.status === 401 || r.reason?.status === 403)) loadBoot();
  }, [api, boot, enabledClients, loadBoot]);
  const itemsSeq = useRef(0);
  useEffect(() => {
    if (!boot) return undefined;
    loadItems();
    const t = setInterval(loadItems, 45000);
    const onFocus = () => loadItems();
    window.addEventListener('focus', onFocus);
    return () => { itemsSeq.current += 1; clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [loadItems, boot]);

  const upsert = useCallback((d) => setItems(list => {
    const l = list || [];
    return l.some(i => i.id === d.id) ? l.map(i => (i.id === d.id ? d : i)) : [...l, d];
  }), []);

  const clientName = useCallback((id) => boot?.clients?.find(c => c.id === id)?.name || 'Client', [boot]);
  const ownerName = useCallback((id) => boot?.owners?.find(o => o.id === id)?.name || (id ? 'Unassigned staff' : 'Unassigned'), [boot]);

  // One authorized filtered dataset feeds counts, plan and tracker.
  const filtered = useMemo(() => (items || []).filter(i => {
    if (!enabledClients.some(c => c.id === i.clientId)) return false;
    if (mode === 'client' && !clientVisible(i)) return false;
    if (!showArchived && i.archived) return false;
    if (type !== 'All' && i.type !== type) return false;
    if (clientF !== 'all' && i.clientId !== clientF) return false;
    if (stageF !== 'all' && i.stage !== stageF) return false;
    if (ownerF !== 'all' && i.ownerId !== ownerF) return false;
    if (deadlineF !== 'all') {
      const today = utcToLocal(new Date().toISOString(), 'Asia/Kolkata').date;
      if (deadlineF === 'none' && i.productionDueDate) return false;
      if (deadlineF === 'overdue' && !(i.productionDueDate && i.productionDueDate < today && i.stage !== 'final_approved')) return false;
      if (deadlineF === 'week') {
        const wk = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        if (!(i.productionDueDate && i.productionDueDate >= today && i.productionDueDate <= wk)) return false;
      }
    }
    return true;
  }), [items, enabledClients, mode, showArchived, type, clientF, stageF, ownerF, deadlineF]);

  const counts = useMemo(() => summarize(filtered), [filtered]);
  const monthItems = useMemo(() => filtered.filter(i => i.plannedAt && monthKey(i.plannedAt, i.timezone) === month)
    .sort((a, b) => Date.parse(a.plannedAt) - Date.parse(b.plannedAt)), [filtered, month]);
  const groups = useMemo(() => {
    const g = new Map();
    for (const i of monthItems) { const k = dayKey(i.plannedAt, i.timezone); if (!g.has(k)) g.set(k, []); g.get(k).push(i); }
    return [...g.entries()];
  }, [monthItems]);
  const unscheduled = useMemo(() => filtered.filter(i => !i.plannedAt), [filtered]);
  const selected = (items || []).find(i => i.id === selectedId) || null;
  const missingLink = !!(selectedId && items && !selected && !loadError);

  if (bootError && !boot) return <div className="p-6 max-w-lg"><ErrorBanner message={bootError} onRetry={loadBoot} /></div>;
  if (!boot) return <div className="p-4 md:p-6 space-y-4"><div className="h-24 rounded-3xl bg-slate-100 animate-pulse" /><SkeletonList /></div>;
  if (enabledClients.length === 0) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        {boot.capabilities?.canManageSettings ? (
          <EmptyState icon={<Settings2 size={20} />} title="Creative Studio is not enabled for any client yet"
            body="You manage studio settings for existing clients. Open Control Center, then the Creative Studio tab, select a client and switch on Studio enabled. Assign creative owners or editors from that client's project members, then return here to plan content. Enabling does not create clients, send invitations or change project membership." />
        ) : (
          <EmptyState icon={<Lock size={20} />} title="No studio clients available"
            body="Creative Studio has not been enabled for any client you can access. Ask the client's Business Head, CSM or an administrator to enable it in Control Center." />
        )}
      </div>
    );
  }

  const canCreate = enabledClients.some(c => editable.has(c.id));
  const cards = [
    { k: 'approved', label: 'Approved', v: counts.approved, box: 'bg-white border-slate-200', chip: 'bg-emerald-50 text-emerald-600', Icon: CheckCircle2 },
    { k: 'wip', label: 'WIP / Awaiting approval', v: counts.wip, box: 'bg-white border-slate-200', chip: 'bg-amber-50 text-amber-600', Icon: Activity },
    { k: 'soon', label: 'Close to post date', v: counts.soon, box: 'bg-white border-slate-200', chip: 'bg-red-50 text-red-600', Icon: AlertTriangle, sub: counts.overdue ? `${counts.overdue} overdue` : null },
    { k: 'scheduled', label: 'Scheduled', v: counts.scheduled, box: 'bg-white border-slate-200', chip: 'bg-blue-50 text-blue-600', Icon: Clock },
    { k: 'ans', label: 'Approved, not scheduled', v: counts.approvedNotScheduled, box: 'bg-white border-slate-200', chip: 'bg-slate-100 text-slate-500', Icon: CalendarDays },
  ];
  const seg = (on) => `px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${on ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'}`;

  return (
    <div className="cs-root min-h-full p-3 md:p-6 text-left text-slate-900 font-sans">
      <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-black tracking-tight uppercase">Creative Studio</h2>
          <span className="text-xs text-slate-400">/ {view === 'plan' ? 'Content calendar' : 'Deliverables tracker'}</span>
        </div>
        <div role="tablist" aria-label="Viewing as" className="flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
          <span className="text-[11px] text-slate-400 px-2">Viewing as</span>
          {[['team', 'Ethinos team'], ['client', 'Client']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} data-testid={`button-mode-${id}`} onClick={() => setMode(id)} className={seg(mode === id)}>{label}</button>
          ))}
        </div>
      </div>

      {mode === 'client' && (
        <div data-testid="status-client-preview" className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 flex items-center gap-2">
          <Eye size={13} /> Preview only: shared, non-draft records as a client member sees them. Your identity and permissions are unchanged.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {cards.map((c, idx) => (
          <div key={c.k} data-testid={`card-count-${c.k}`} className={`rounded-2xl border p-4 ${c.box} ${idx === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-slate-700">{c.label}</p>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.chip}`}><c.Icon size={15} /></span>
            </div>
            <p className="text-3xl font-bold mt-2 tabular-nums">{c.v}</p>
            {c.sub && <p className="text-[11px] font-semibold text-red-600 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex p-1 rounded-xl bg-white border border-slate-200">
          {[['plan', 'Content plan'], ['tracker', 'Deliverables']].map(([id, label]) => (
            <button key={id} data-testid={`button-view-${id}`} onClick={() => setView(id)} className={seg(view === id)}>{label}</button>
          ))}
        </div>
        <div className="flex p-1 rounded-xl bg-white border border-slate-200">
          {['All', ...TYPES].map(t => (
            <button key={t} data-testid={`filter-type-${t}`} onClick={() => setType(t)} className={seg(type === t)}>{t === 'All' ? 'All' : `${t}s`}</button>
          ))}
        </div>
        <select data-testid="select-filter-client" value={clientF} onChange={e => setClientF(e.target.value)} className={`${inputCls} !w-auto !py-2`} aria-label="Client filter">
          <option value="all">All clients</option>
          {enabledClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select data-testid="select-filter-stage" value={stageF} onChange={e => setStageF(e.target.value)} className={`${inputCls} !w-auto !py-2`} aria-label="Stage filter">
          <option value="all">All stages</option>
          {Object.keys(STAGES).map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
        </select>
        {mode === 'team' && (
          <>
            <select data-testid="select-filter-owner" value={ownerF} onChange={e => setOwnerF(e.target.value)} className={`${inputCls} !w-auto !py-2`} aria-label="Owner filter">
              <option value="all">All owners</option>
              {(boot.owners || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select data-testid="select-filter-deadline" value={deadlineF} onChange={e => setDeadlineF(e.target.value)} className={`${inputCls} !w-auto !py-2`} aria-label="Deadline filter">
              <option value="all">Any deadline</option>
              <option value="week">Due within 7 days</option>
              <option value="overdue">Production overdue</option>
              <option value="none">No deadline</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input data-testid="checkbox-show-archived" type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Archived
            </label>
          </>
        )}
        <button data-testid="button-refresh-studio" onClick={loadItems} className={btnGhost} aria-label="Refresh"><RefreshCw size={13} /></button>
        {mode === 'team' && canCreate && (
          <button data-testid="button-add-content" onClick={() => setEditing({})} className={`${btnPrimary} md:ml-auto`}><Plus size={14} /> Add content</button>
        )}
      </div>

      {missingLink && (
        <div className="mb-3"><ErrorBanner message="That deliverable is not available. It may be archived elsewhere, disabled, or outside your access." onRetry={() => setSelectedId(null)} /></div>
      )}
      {bootError && <div className="mb-3"><ErrorBanner message={`Could not refresh access: ${bootError}`} onRetry={loadBoot} /></div>}
      {loadError && <div className="mb-3"><ErrorBanner message={loadError} onRetry={loadItems} /></div>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <div className="min-w-0 bg-white rounded-2xl border border-slate-200 p-3 md:p-5">
          {items === null ? <SkeletonList /> : view === 'plan' ? (
            <section aria-label="Content calendar">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button data-testid="button-month-prev" onClick={() => setMonth(m => shiftMonth(m, -1))} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Previous month"><ChevronLeft size={16} /></button>
                <h3 data-testid="text-month" className="text-xl font-bold">{monthTitle(month)}</h3>
                <button data-testid="button-month-next" onClick={() => setMonth(m => shiftMonth(m, 1))} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Next month"><ChevronRight size={16} /></button>
                <span data-testid="text-month-count" className="text-xs text-slate-400">{monthItems.length} item{monthItems.length === 1 ? '' : 's'}</span>
                <button data-testid="button-month-today" onClick={() => setMonth(nowMonth())} className="text-xs font-semibold text-indigo-600 hover:underline">Today</button>
                <div className="hidden xl:flex items-center gap-3 ml-auto text-xs text-slate-600">
                  <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-emerald-500" />Approved</span>
                  <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-amber-500" />WIP / Awaiting approval</span>
                  <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-red-500" />Within 3 days of posting</span>
                  <span className="flex items-center gap-1.5"><Clock size={11} className="text-blue-500" />Scheduled</span>
                </div>
              </div>
              {groups.length === 0 ? (
                <EmptyState icon={<CalendarDays size={20} />} title="Nothing planned this month" body={unscheduled.length ? `${unscheduled.length} deliverable(s) still need a posting date. See the Deliverables view.` : 'Adjust filters or add content.'} />
              ) : (
                <>
                  <div className="hidden md:grid grid-cols-[120px_minmax(0,1fr)_160px_150px] gap-3 px-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span /><span className="pl-3">Content · Stage</span><span>Platform · Time</span><span>Status · Schedule</span>
                  </div>
                  <div className="space-y-3">
                    {groups.map(([k, list]) => (
                      <div key={k} className="md:grid md:grid-cols-[120px_minmax(0,1fr)] gap-3">
                        <DateBadge dayKeyStr={k} item={list[0]} count={list.length} />
                        <div className="space-y-2 mt-2 md:mt-0">
                          {list.map(i => <Row key={i.id} i={i} active={i.id === selectedId} onOpen={() => setSelectedId(i.id)} clientName={clientName(i.clientId)} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          ) : (
            <section aria-label="Deliverables tracker" className="space-y-4">
              {filtered.length === 0 ? (
                <EmptyState icon={<LayoutList size={20} />} title="No deliverables match" body="Change filters, or add content to start tracking." />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white/70 overflow-hidden">
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1.3fr] gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
                    <span>Deliverable</span><span>Owner</span><span>Production due</span><span>Posting</span><span>Stage</span>
                  </div>
                  {[...filtered].sort((a, b) => String(a.productionDueDate || '9').localeCompare(String(b.productionDueDate || '9'))).map(i => (
                    <button key={i.id} data-testid={`row-deliverable-${i.id}`} onClick={() => setSelectedId(i.id)}
                      className={`w-full text-left grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1.3fr] gap-1 md:gap-2 px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-indigo-50 transition-colors ${i.id === selectedId ? 'bg-indigo-50' : ''} ${i.archived ? 'opacity-60' : ''}`}>
                      <span className="min-w-0"><span className="block text-sm font-bold truncate">{i.title}</span><span className="text-[11px] text-slate-500">{clientName(i.clientId)} · {i.type}</span></span>
                      <span className="text-xs text-slate-600">{mode === 'team' ? ownerName(i.ownerId) : ''}</span>
                      <span className="text-xs text-slate-600">{mode === 'team' ? (i.productionDueDate || 'Not set') : ''}</span>
                      <span className="text-xs text-slate-600">{i.plannedAt ? `${fmtInstant(i.plannedAt, i.timezone)} ${tzShort(i.timezone)}` : 'Unscheduled'}</span>
                      <span className="flex items-center gap-1.5 flex-wrap"><StageBadge stage={i.stage} />{i.scheduled && <CalendarCheck size={13} className="text-emerald-600" aria-label="Scheduled" />}<UrgencyTag u={urgency(i)} /></span>
                    </button>
                  ))}
                </div>
              )}
              <div>
                <h3 className="cs-display text-xl mb-2">Without a posting date <span className="text-sm text-slate-400">({unscheduled.length})</span></h3>
                {unscheduled.length === 0 ? <p className="text-xs text-slate-400">Every deliverable has a planned post time.</p> : (
                  <div className="space-y-1.5">{unscheduled.map(i => <Row key={i.id} i={i} active={i.id === selectedId} onOpen={() => setSelectedId(i.id)} clientName={clientName(i.clientId)} />)}</div>
                )}
              </div>
            </section>
          )}
        </div>

        {selected ? (
          <div className="fixed inset-0 z-[110] bg-white overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible lg:sticky lg:top-4">
            <Detail key={selected.id} item={selected} api={api} boot={boot} mode={mode} editable={editable.has(selected.clientId)}
              clientName={clientName(selected.clientId)} ownerName={ownerName} currentUser={currentUser}
              onClose={() => setSelectedId(null)} onChange={upsert} onEdit={() => setEditing(selected)}
              onDuplicated={(d) => { upsert(d); setSelectedId(d.id); }} onReload={loadItems} />
          </div>
        ) : (
          <div className="hidden lg:block rounded-3xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
            <Sparkles size={18} className="mx-auto mb-2 text-indigo-600" /> Select a deliverable to see assets, approvals and conversations.
          </div>
        )}
      </div>

      {editing && (
        <Editor api={api} boot={boot} item={editing.id ? editing : null}
          clients={enabledClients.filter(c => editable.has(c.id))}
          defaultClient={clientF !== 'all' && editable.has(clientF) ? clientF : null}
          onClose={() => setEditing(null)}
          onSaved={(d) => { upsert(d); setEditing(null); setSelectedId(d.id); }} />
      )}
    </div>
  );
}

const rowTone = (i) => {
  const u = urgency(i);
  // Rows stay neutral; urgency is a thin left accent only.
  if (u === 'overdue' || u === 'soon') return 'bg-white border-slate-200 border-l-4 border-l-red-400';
  return 'bg-white border-slate-200';
};
const typeChip = { Post: 'bg-indigo-50 text-indigo-600', Reel: 'bg-slate-100 text-slate-600', Story: 'bg-slate-100 text-slate-600' };

function DateBadge({ dayKeyStr, item, count }) {
  const [y, m, d] = dayKeyStr.split('-').map(Number);
  const wd = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))).toUpperCase();
  const u = urgency(item);
  const tone = u === 'overdue' || u === 'soon' ? 'border-slate-200 text-red-600' : 'border-slate-200 text-slate-700';
  return (
    <div className="flex items-start gap-2">
      <div className={`w-11 shrink-0 rounded-xl border bg-white text-center py-1 ${tone}`}>
        <p className="text-[9px] font-bold">{wd}</p>
        <p className="text-lg font-bold leading-tight">{d}</p>
      </div>
      <div className="pt-1">
        <p className="text-xs font-semibold text-slate-800">{relativeDay(item.plannedAt, item.timezone)}</p>
        <p className="text-[10px] text-slate-400">{count} item{count === 1 ? '' : 's'}</p>
      </div>
    </div>
  );
}

function StatusPill({ i }) {
  const u = urgency(i);
  if (u === 'overdue') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-200 bg-white text-[10px] font-semibold text-red-600"><i className="w-1.5 h-1.5 rounded-full bg-red-500" />Overdue</span>;
  if (u === 'soon') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-200 bg-white text-[10px] font-semibold text-red-600"><i className="w-1.5 h-1.5 rounded-full bg-red-500" />Close to post date</span>;
  if (i.stage === 'final_approved') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-200 bg-white text-[10px] font-semibold text-emerald-600"><i className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Approved</span>;
  if (i.stage === 'internal_draft') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500"><i className="w-1.5 h-1.5 rounded-full bg-slate-400" />Draft</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-white text-[10px] font-semibold text-amber-600"><i className="w-1.5 h-1.5 rounded-full bg-amber-500" />WIP / Awaiting</span>;
}

function Row({ i, active, onOpen, clientName }) {
  return (
    <button data-testid={`card-content-${i.id}`} onClick={onOpen}
      className={`w-full text-left grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_160px_150px] items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 transition-colors ${rowTone(i)} ${active ? '!bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'} ${i.archived ? 'opacity-60' : ''}`}>
      <span className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center ${typeChip[i.type] || 'bg-slate-100 text-slate-600'}`}>{(i.type || '?')[0]}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold truncate">{i.title}</span>
        <span className="block text-[11px] text-slate-500 truncate">{clientName} · {stageLabel(i.stage)}</span>
      </span>
      <span className="col-start-2 md:col-start-auto min-w-0">
        <span className="block text-xs text-slate-700 truncate">{(i.platforms || []).join(' · ') || 'No platforms'}</span>
        <span className="block text-[11px] text-slate-400">{i.plannedAt ? `${fmtInstant(i.plannedAt, i.timezone, { day: undefined, month: undefined })} ${tzShort(i.timezone)}` : 'No posting date'}</span>
      </span>
      <span className="col-start-2 md:col-start-auto flex md:flex-col items-start gap-1">
        <StatusPill i={i} />
        <span className={`inline-flex items-center gap-1 text-[10px] ${i.scheduled ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}><Clock size={10} />{i.scheduled ? 'Scheduled' : 'Not scheduled'}</span>
      </span>
    </button>
  );
}

function Detail({ item, api, boot, mode, editable, clientName, ownerName, currentUser, onClose, onChange, onEdit, onDuplicated, onReload }) {
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');
  const [dialog, setDialog] = useState(null);
  const preview = mode === 'client';
  const canAct = editable && !preview;
  const visibleToClient = clientVisible(item);

  const run = async (label, body, after) => {
    setBusy(label); setError(''); setNotice(''); setWarning('');
    try {
      const d = await api.action(item.clientId, item.id, { revision: item.revision, ...body });
      if (body.action === 'duplicate') onDuplicated(d.deliverable); else onChange(d.deliverable);
      after?.(d.deliverable);
      // Saved, but notification enqueue failed: warn; never retry the saved mutation.
      if (d.emailError) setWarning(d.emailError);
      return true;
    } catch (e) {
      setError(e.message);
      if (e.status === 409) onReload();
      return false;
    } finally { setBusy(''); }
  };

  const tabs = preview ? [['overview', 'Overview'], ['assets', 'Assets'], ['approvals', 'Approvals'], ['chat', 'Client chat']]
    : [['overview', 'Overview'], ['assets', 'Assets'], ['approvals', 'Approvals'], ['chat', 'Chat'], ['history', 'History']];

  return (
    <article data-testid="panel-deliverable-detail" className="cs-rise lg:rounded-2xl lg:border border-slate-200 bg-white lg:shadow-sm min-h-full lg:min-h-0">
      <header className="p-4 border-b border-slate-200">
        <div className="flex items-start gap-2">
          <button data-testid="button-close-detail" onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-slate-100" aria-label="Close detail"><X size={16} /></button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{item.type} · {clientName} · rev {item.revision}</p>
            <h3 data-testid="text-detail-title" className="cs-display text-2xl leading-tight break-words">{item.title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <StageBadge stage={item.stage} testid="status-detail-stage" />
              {item.archived && <span className="text-[10px] font-bold uppercase text-slate-500">Archived</span>}
              {item.shared ? <span className="text-[10px] font-bold uppercase text-slate-900">Shared</span> : <span className="text-[10px] font-bold uppercase text-slate-400">Not shared</span>}
              <UrgencyTag u={urgency(item)} />
            </div>
          </div>
        </div>
        {preview && !visibleToClient && (
          <p data-testid="status-hidden-from-client" className="mt-3 text-xs rounded-xl bg-slate-100 text-slate-600 px-3 py-2 flex gap-2 items-center"><EyeOff size={13} /> Client members cannot see this record.</p>
        )}
        {canAct && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {!item.archived && <button data-testid="button-edit-deliverable" onClick={onEdit} className={btnGhost}><Pencil size={12} /> Edit</button>}
            <button data-testid="button-duplicate-deliverable" disabled={!!busy} onClick={() => run('dup', { action: 'duplicate' })} className={btnGhost}><Copy size={12} /> Duplicate</button>
            {!item.archived && (item.shared
              ? <button data-testid="button-unshare" disabled={!!busy} onClick={() => setDialog('unshare')} className={btnGhost}><EyeOff size={12} /> Unshare</button>
              : <button data-testid="button-share" disabled={!!busy} onClick={() => run('share', { action: 'share' })} className={btnGhost}><Share2 size={12} /> Share</button>)}
            {item.archived
              ? <button data-testid="button-restore" disabled={!!busy} onClick={() => run('restore', { action: 'restore' })} className={btnGhost}><ArchiveRestore size={12} /> Restore</button>
              : <button data-testid="button-archive" disabled={!!busy} onClick={() => setDialog('archive')} className={btnGhost}><Archive size={12} /> Archive</button>}
          </div>
        )}
        {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
        {warning && <p data-testid="status-email-warning" role="status" className="mt-3 text-xs font-semibold text-amber-800 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{warning} Do not repeat the action; check the delivery log in Control Center.</p>}
        {notice && !warning && <p data-testid="status-detail-notice" className="mt-3 text-xs font-semibold text-emerald-700">{notice}</p>}
      </header>

      <nav className="flex gap-1 px-3 pt-3 overflow-x-auto" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-detail-${id}`} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${tab === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>{label}</button>
        ))}
      </nav>

      <div className="p-4 space-y-4">
        {tab === 'overview' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Planned post" value={item.plannedAt ? `${fmtInstant(item.plannedAt, item.timezone, { weekday: 'short' })} ${tzShort(item.timezone)}` : 'Not set'} />
              <Info label="When" value={relativeDay(item.plannedAt, item.timezone)} />
              <Info label="Platforms" value={(item.platforms || []).join(', ') || 'None'} />
              <Info label="Timezone" value={item.timezone || 'Asia/Kolkata'} />
              {!preview && <Info label="Owner" value={ownerName(item.ownerId)} />}
              {!preview && <Info label="Production due" value={item.productionDueDate || 'Not set'} />}
            </dl>
            {!preview && item.brief && <Block label="Internal brief" text={item.brief} />}
            <Block label="Client-facing caption" text={item.caption || 'No caption yet.'} />

            <div className="rounded-2xl border border-slate-200 p-3 bg-white/70">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 mb-2">Scheduling</p>
              {item.scheduled ? (
                <div className="space-y-2">
                  <p data-testid="status-scheduled" className="text-sm font-bold text-emerald-700 flex items-center gap-1.5"><CalendarCheck size={14} /> Marked scheduled {fmtStamp(item.scheduled.at)}</p>
                  {item.scheduled.link && isHttps(item.scheduled.link) && <a data-testid="link-schedule" href={item.scheduled.link} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-900 underline inline-flex items-center gap-1">Scheduling link <ExternalLink size={11} /></a>}
                  {canAct && <button data-testid="button-unschedule" disabled={!!busy} onClick={() => run('unsch', { action: 'unschedule' })} className={btnGhost}><Undo2 size={12} /> Undo scheduled</button>}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Tracking only. Flow Pro never publishes to social platforms.</p>
                  {canAct && (
                    <button data-testid="button-mark-scheduled" disabled={!!busy || item.stage !== 'final_approved' || !item.plannedAt || !(item.platforms || []).length} onClick={() => setDialog('schedule')} className={btnPrimary}>
                      <CalendarCheck size={12} /> Mark scheduled
                    </button>
                  )}
                  {canAct && item.stage !== 'final_approved' && <p className="text-[11px] text-slate-400">Requires current final approval, a posting time and platforms.</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'assets' && <Assets item={item} api={api} canAct={canAct && !item.archived} onChange={onChange} onReload={onReload} ownerName={ownerName} preview={preview} />}

        {tab === 'approvals' && (
          <div className="space-y-3">
            {['reference', 'final'].map(phase => {
              const a = item.approvals?.[phase];
              const approver = boot.approvers?.find(x => x.uid === a?.approverUid);
              return (
                <div key={phase} data-testid={`card-approval-${phase}`} className="rounded-2xl border border-slate-200 p-3 bg-white/70">
                  <div className="flex items-center justify-between">
                    <p className="cs-display text-lg capitalize">{phase === 'reference' ? 'Reference approval' : 'Final post approval'}</p>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${a?.status === 'approved' ? 'text-emerald-700' : a?.status === 'changes_requested' ? 'text-red-600' : a ? 'text-amber-700' : 'text-slate-400'}`}>
                      {a ? (a.status === 'changes_requested' ? 'Changes requested' : a.status) : 'Not requested'}
                    </span>
                  </div>
                  {a && (
                    <div className="mt-2 text-xs text-slate-600 space-y-1">
                      <p>Approver: <b>{approver?.name || 'Designated client member'}</b> · revision {a.revision}</p>
                      {a.requestedAt && <p>Requested {fmtStamp(a.requestedAt)}{a.decidedAt ? `, decided ${fmtStamp(a.decidedAt)}` : ''}</p>}
                      {a.feedback && <p className="rounded-xl bg-red-50 text-red-800 px-2.5 py-1.5 whitespace-pre-wrap">{a.feedback}</p>}
                      {a.snapshot?.assets?.length > 0 && <p className="text-slate-400">Snapshot: {a.snapshot.assets.map(s => `${s.label} r${s.revision}`).join(', ')}</p>}
                    </div>
                  )}
                  {canAct && !item.archived && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <button data-testid={`button-request-${phase}`} disabled={!!busy || (phase === 'final' && item.approvals?.reference?.status !== 'approved')} onClick={() => setDialog(`request:${phase}`)} className={btnPrimary}>
                        <Share2 size={12} /> {a ? 'Resubmit for approval' : 'Share and request approval'}
                      </button>
                      {a?.status === 'pending' && item.stage === `awaiting_${phase}` && (
                        <button data-testid={`button-remind-${phase}`} disabled={!!busy} onClick={() => run('remind', { action: 'remind' }, () => setNotice('Reminder queued. Recipient, cooldown and delivery rules are enforced by the server.'))} className={btnGhost}>
                          <BellRing size={12} /> Send reminder
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Clock size={11} /> Automatic reminders follow Control Center settings (default daily 9:00 AM IST). Only the assigned approver can decide.</p>
          </div>
        )}

        {tab === 'chat' && (
          <div className="space-y-3">
            {(!preview || visibleToClient) && <ThreadPanel api={api} clientId={item.clientId} itemId={item.id} thread="client" readOnly={preview || !editable} myName={currentUser?.name} />}
            {!preview && <ThreadPanel api={api} clientId={item.clientId} itemId={item.id} thread="internal" readOnly={!editable} myName={currentUser?.name} />}
          </div>
        )}

        {tab === 'history' && !preview && <ActivityList api={api} item={item} ownerName={ownerName} boot={boot} />}
      </div>

      {dialog === 'archive' && (
        <Confirm title="Archive deliverable?" body="Archived items leave the plan and stop pending reminders. You can restore it later." cta="Archive" onClose={() => setDialog(null)}
          onConfirm={() => run('arch', { action: 'archive' }, () => setDialog(null))} busy={!!busy} />
      )}
      {dialog === 'unshare' && (
        <Confirm title="Stop sharing?" body="Client members lose access, approvals reset and reminders stop." cta="Unshare" onClose={() => setDialog(null)}
          onConfirm={() => run('unsh', { action: 'unshare' }, () => setDialog(null))} busy={!!busy} />
      )}
      {dialog === 'schedule' && <ScheduleDialog busy={!!busy} onClose={() => setDialog(null)} onSubmit={(link) => run('sch', { action: 'schedule', ...(link ? { link } : {}) }, () => setDialog(null))} />}
      {dialog?.startsWith('request:') && (
        <RequestDialog phase={dialog.split(':')[1]} approvers={(boot.approvers || []).filter(a => a.clientIds.includes(item.clientId))} item={item} busy={!!busy}
          onClose={() => setDialog(null)} onSubmit={(approverUid) => run('req', { action: 'request_approval', phase: dialog.split(':')[1], approverUid }, () => setDialog(null))} />
      )}
    </article>
  );
}

const Info = ({ label, value }) => (
  <div><dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</dt><dd className="text-sm font-semibold text-slate-900 mt-0.5 break-words">{value}</dd></div>
);
const Block = ({ label, text }) => (
  <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 mb-1">{label}</p><p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{text}</p></div>
);

function Confirm({ title, body, cta, onClose, onConfirm, busy }) {
  return (
    <Sheet title={title} onClose={onClose} footer={<><button data-testid="button-confirm-cancel" onClick={onClose} className={btnGhost}>Cancel</button><button data-testid="button-confirm" disabled={busy} onClick={onConfirm} className={btnAccent}>{cta}</button></>}>
      <p className="text-sm text-slate-600">{body}</p>
    </Sheet>
  );
}

function ScheduleDialog({ onClose, onSubmit, busy }) {
  const [link, setLink] = useState('');
  const bad = link && !isHttps(link);
  return (
    <Sheet title="Mark scheduled" onClose={onClose} footer={<><button onClick={onClose} className={btnGhost}>Cancel</button><button data-testid="button-confirm-schedule" disabled={busy || bad} onClick={() => onSubmit(link.trim())} className={btnPrimary}>Mark scheduled</button></>}>
      <p className="text-sm text-slate-600 mb-3">Records that someone scheduled this post in an external tool. Nothing is published.</p>
      <Field label="Scheduling link (optional)" error={bad ? 'Use an https:// link.' : ''}><input data-testid="input-schedule-link" value={link} onChange={e => setLink(e.target.value)} className={inputCls} placeholder="https://" /></Field>
    </Sheet>
  );
}

function RequestDialog({ phase, approvers, item, onClose, onSubmit, busy }) {
  const [uid, setUid] = useState(item.approvals?.[phase]?.approverUid || approvers[0]?.uid || '');
  const hasAssets = (item.assets || []).some(a => a.phase === phase);
  return (
    <Sheet title={phase === 'reference' ? 'Request reference approval' : 'Request final approval'} onClose={onClose}
      footer={<><button onClick={onClose} className={btnGhost}>Cancel</button><button data-testid="button-confirm-request" disabled={busy || !uid || !hasAssets} onClick={() => onSubmit(uid)} className={btnPrimary}>Share and request</button></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Shares revision {item.revision} with one designated client approver. The current caption and {phase} assets are snapshotted.</p>
        {!hasAssets && <ErrorBanner message={`Add at least one ${phase} asset first.`} />}
        {approvers.length === 0 ? (
          <ErrorBanner message="No verified active client members for this client. Invite members through Control Center, Client Portal." />
        ) : (
          <Field label="Approver">
            <select data-testid="select-approver" value={uid} onChange={e => setUid(e.target.value)} className={inputCls}>
              {approvers.map(a => <option key={a.uid} value={a.uid}>{a.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Sheet>
  );
}

function Assets({ item, api, canAct, onChange, onReload, ownerName, preview }) {
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.label.trim() || !isHttps(form.url)) { setError('Label and an https:// link are required.'); return; }
    setBusy(true); setError('');
    try {
      const d = await api.asset(item.clientId, item.id, { revision: item.revision, ...(form.assetId ? { assetId: form.assetId } : {}), phase: form.phase, kind: form.kind, label: form.label.trim(), url: form.url.trim() });
      onChange(d.deliverable); setForm(null);
    } catch (err) { setError(err.message); if (err.status === 409) onReload(); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500 rounded-xl bg-slate-50 px-3 py-2 flex gap-2"><Link2 size={12} className="mt-0.5 shrink-0" /> Links only. SharePoint and file access is controlled by the underlying file permissions, not Flow Pro. Replacing an asset invalidates affected approvals.</p>
      {['reference', 'final'].map(phase => {
        const list = (item.assets || []).filter(a => a.phase === phase);
        return (
          <div key={phase}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="cs-display text-lg capitalize">{phase} assets</p>
              {canAct && <button data-testid={`button-add-asset-${phase}`} onClick={() => setForm({ phase, kind: 'main', label: '', url: '' })} className="text-[11px] font-bold text-indigo-600 inline-flex items-center gap-1"><Plus size={12} /> Add link</button>}
            </div>
            {list.length === 0 ? <p className="text-xs text-slate-400">No {phase} assets.</p> : (
              <ul className="space-y-1.5">
                {list.map(a => (
                  <li key={a.id} data-testid={`asset-${a.id}`} className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{ASSET_KINDS.find(k => k.id === a.kind)?.label || a.kind}</span>
                      <span className="text-sm font-semibold truncate flex-1">{a.label}</span>
                      <span className="text-[10px] text-slate-400">r{a.revision}</span>
                      {isHttps(a.url) && <a data-testid={`link-asset-${a.id}`} href={a.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-slate-100" aria-label={`Open ${a.label}`}><ExternalLink size={13} /></a>}
                    </div>
                    {!preview && a.updatedAt && <p className="text-[10px] text-slate-400 mt-0.5">Updated {fmtStamp(a.updatedAt)}{a.updatedBy ? ` by ${ownerName(a.updatedBy)}` : ''}</p>}
                    {!preview && (
                      <div className="flex gap-3 mt-1">
                        {canAct && <button data-testid={`button-replace-asset-${a.id}`} onClick={() => setForm({ assetId: a.id, phase: a.phase, kind: a.kind, label: a.label, url: '' })} className="text-[11px] font-bold text-slate-900 hover:underline">New revision</button>}
                        {a.history?.length > 0 && <button data-testid={`button-asset-history-${a.id}`} onClick={() => setOpen(open === a.id ? null : a.id)} className="text-[11px] font-bold text-slate-500 hover:underline">{open === a.id ? 'Hide' : 'Show'} history ({a.history.length})</button>}
                      </div>
                    )}
                    {open === a.id && (
                      <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-2">
                        {a.history.map((h, idx) => <li key={idx} className="text-[11px] text-slate-500 break-all">r{h.revision ?? '?'} · {h.label || a.label} · {h.updatedAt ? fmtStamp(h.updatedAt) : ''} · {h.url}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {form && (
        <Sheet title={form.assetId ? 'New asset revision' : `Add ${form.phase} asset`} onClose={() => { setForm(null); setError(''); }}
          footer={<><button onClick={() => setForm(null)} className={btnGhost}>Cancel</button><button data-testid="button-save-asset" form="asset-form" type="submit" disabled={busy} className={btnPrimary}>Save link</button></>}>
          <form id="asset-form" onSubmit={submit} className="space-y-3">
            {!form.assetId && (
              <Field label="Kind">
                <select data-testid="select-asset-kind" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className={inputCls}>
                  {ASSET_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Label"><input data-testid="input-asset-label" value={form.label} maxLength={120} onChange={e => setForm({ ...form, label: e.target.value })} className={inputCls} /></Field>
            <Field label="HTTPS link" error={form.url && !isHttps(form.url) ? 'Use an https:// link.' : ''}><input data-testid="input-asset-url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} className={inputCls} placeholder="https://" /></Field>
            {error && <ErrorBanner message={error} />}
          </form>
        </Sheet>
      )}
    </div>
  );
}

function ActivityList({ api, item, ownerName, boot }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { const d = await api.activity(item.clientId, item.id); setList(d.activity || []); } catch (e) { setError(e.message); }
  }, [api, item.clientId, item.id]);
  useEffect(() => { load(); }, [load, item.revision]);
  const who = (uid) => boot.approvers?.find(a => a.uid === uid)?.name || ownerName(uid);
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!list) return <SkeletonList rows={3} />;
  if (!list.length) return <p className="text-xs text-slate-400">No activity yet.</p>;
  return (
    <ol className="relative border-l-2 border-slate-200 ml-1 space-y-3" data-testid="list-activity">
      {[...list].reverse().map((a, idx) => (
        <li key={idx} className="pl-4 relative">
          <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-indigo-600" />
          <p className="text-xs font-bold text-slate-900 capitalize">{String(a.action || '').replace(/_/g, ' ')}</p>
          <p className="text-[11px] text-slate-500">{who(a.actor)} · {fmtStamp(a.at)} · rev {a.revision}</p>
        </li>
      ))}
    </ol>
  );
}

function Editor({ api, boot, item, clients, defaultClient, onClose, onSaved }) {
  const tz0 = item?.timezone || boot.configs?.[item?.clientId || defaultClient]?.timezone || 'Asia/Kolkata';
  const local = utcToLocal(item?.plannedAt, tz0);
  const [f, setF] = useState({
    clientId: item?.clientId || defaultClient || clients[0]?.id || '',
    title: item?.title || '', type: item?.type || 'Post', ownerId: item?.ownerId || '', brief: item?.brief || '',
    caption: item?.caption || '', platforms: item?.platforms || [], productionDueDate: item?.productionDueDate || '',
    date: local.date, time: local.time || '09:00', timezone: tz0,
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const owners = (boot.owners || []).filter(o => o.clientIds.includes(f.clientId));
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const togglePlat = (p) => set('platforms', f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p]);

  const save = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.clientId) er.clientId = 'Choose a studio client.';
    if (!f.title.trim()) er.title = 'Title is required.';
    if (!f.ownerId) er.ownerId = 'Choose an internal owner.';
    if (!f.brief.trim()) er.brief = 'Brief is required.';
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      title: f.title.trim(), type: f.type, ownerId: f.ownerId, brief: f.brief.trim(), caption: f.caption,
      platforms: f.platforms, productionDueDate: f.productionDueDate || null,
      plannedAt: f.date ? localToUtc(f.date, f.time, f.timezone) : null, timezone: f.timezone,
    };
    setBusy(true); setError('');
    try {
      const d = item ? await api.update(item.clientId, item.id, { revision: item.revision, ...body }) : await api.create(f.clientId, body);
      onSaved(d.deliverable);
    } catch (err) { setError(err.status === 409 ? `${err.message} Close and reopen to edit the latest version.` : err.message); } finally { setBusy(false); }
  };

  return (
    <Sheet wide testid="dialog-deliverable-editor" title={item ? 'Edit deliverable' : 'Add content'} onClose={onClose}
      footer={<><button data-testid="button-cancel-editor" onClick={onClose} className={btnGhost}>Cancel</button><button data-testid="button-save-deliverable" type="submit" form="deliverable-form" disabled={busy} className={btnAccent}>{busy ? 'Saving' : item ? 'Save changes' : 'Create draft'}</button></>}>
      <form id="deliverable-form" onSubmit={save} className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label="Title" error={errors.title}><input data-testid="input-title" value={f.title} maxLength={200} onChange={e => set('title', e.target.value)} className={inputCls} /></Field></div>
        <Field label="Studio client" error={errors.clientId}>
          <select data-testid="select-client" disabled={!!item} value={f.clientId} onChange={e => { set('clientId', e.target.value); set('ownerId', ''); }} className={inputCls}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <div className="flex gap-1">{TYPES.map(t => <button type="button" key={t} data-testid={`button-type-${t}`} onClick={() => set('type', t)} className={`flex-1 py-2 rounded-xl text-xs font-bold border ${f.type === t ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white border-slate-200'}`}>{t}</button>)}</div>
        </Field>
        <Field label="Internal owner" error={errors.ownerId}>
          <select data-testid="select-owner" value={f.ownerId} onChange={e => set('ownerId', e.target.value)} className={inputCls}>
            <option value="">Select owner</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Production due" hint="Separate from posting date."><input data-testid="input-due" type="date" value={f.productionDueDate} onChange={e => set('productionDueDate', e.target.value)} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Internal brief" error={errors.brief}><textarea data-testid="input-brief" rows={3} value={f.brief} onChange={e => set('brief', e.target.value)} className={inputCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Client-facing caption"><textarea data-testid="input-caption" rows={3} value={f.caption} onChange={e => set('caption', e.target.value)} className={inputCls} /></Field></div>
        <div className="sm:col-span-2">
          <Field label="Platforms">
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => <button type="button" key={p} data-testid={`button-platform-${p}`} aria-pressed={f.platforms.includes(p)} onClick={() => togglePlat(p)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${f.platforms.includes(p) ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white border-slate-200'}`}>{p}</button>)}
              <button type="button" data-testid="button-platform-all" onClick={() => set('platforms', [...PLATFORMS])} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-900 underline">All platforms</button>
            </div>
          </Field>
        </div>
        <Field label="Posting date" hint="Optional for drafts; required before scheduling."><input data-testid="input-post-date" type="date" value={f.date} onChange={e => set('date', e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Time"><input data-testid="input-post-time" type="time" value={f.time} onChange={e => set('time', e.target.value)} className={inputCls} /></Field>
          <Field label="Timezone">
            <select data-testid="select-timezone" value={f.timezone} onChange={e => set('timezone', e.target.value)} className={inputCls}>
              {[...new Set([f.timezone, ...TIMEZONES])].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        {item && (item.stage !== 'internal_draft' || item.scheduled) && (
          <p className="sm:col-span-2 text-[11px] text-amber-700 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5" /> Material changes can invalidate existing approvals and the scheduled marker.</p>
        )}
        {error && <div className="sm:col-span-2"><ErrorBanner message={error} /></div>}
        {f.clientId && owners.length === 0 && <p className="sm:col-span-2 text-[11px] text-slate-500 flex gap-1.5"><CheckCircle2 size={12} /> No eligible creative owners for this client. Assign editors in Control Center.</p>}
      </form>
    </Sheet>
  );
}
