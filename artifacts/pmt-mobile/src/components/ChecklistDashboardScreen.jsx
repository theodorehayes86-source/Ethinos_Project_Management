import React, { useMemo, useState } from 'react';
import {
  X, Check, AlertTriangle, Clock, BarChart2, Filter,
} from 'lucide-react';

// ── Date helpers (mirrors desktop ChecklistDashboard) ────────────────────────

function parseTaskDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/(\d+)(st|nd|rd|th)/, '$1');
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function toYMD(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function todayYMD() { return toYMD(new Date()); }

function startOfWeekYMD() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toYMD(d);
}

function startOfMonthYMD() {
  const d = new Date();
  d.setDate(1);
  return toYMD(d);
}

function resolveTaskDateYMD(task) {
  if (task.createdAt) {
    const d = toYMD(new Date(task.createdAt));
    if (d) return d;
  }
  if (task.date) {
    const d = toYMD(parseTaskDate(task.date));
    if (d) return d;
  }
  return null;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CadencePill({ cadence }) {
  const colors = {
    Daily:   'bg-rose-100 text-rose-700',
    Weekly:  'bg-amber-100 text-amber-700',
    Monthly: 'bg-blue-100 text-blue-700',
    Once:    'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[cadence] || 'bg-slate-100 text-slate-600'}`}>
      {cadence}
    </span>
  );
}

function StatusPill({ status }) {
  if (status === 'done') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
      <Check size={9} /> Submitted
    </span>
  );
  if (status === 'overdue') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
      <AlertTriangle size={9} /> Overdue
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
      <Clock size={9} /> Pending
    </span>
  );
}

function AnswerBadge({ answer }) {
  if (answer === 'yes') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Yes</span>
  );
  if (answer === 'no') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">No</span>
  );
  if (answer === 'na') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">N/A</span>
  );
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400">—</span>;
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className={`flex-1 rounded-2xl border bg-white p-3.5 shadow-sm ${accent || 'border-slate-100'}`}>
      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
      <div className="text-xl font-black text-slate-800 leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}

// ── Question detail bottom sheet ─────────────────────────────────────────────

function QuestionDetailSheet({ group, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-t-3xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <div className="font-black text-slate-800 text-sm leading-tight">{group._clientName}</div>
            <div className="text-xs text-slate-500 mt-0.5">{group._templateName} · {group.date || '—'}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPill status={group._effectiveStatus} />
              <CadencePill cadence={group._cadence} />
              {group._yesPercent !== null && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  group._yesPercent >= 80 ? 'bg-emerald-100 text-emerald-700'
                  : group._yesPercent >= 60 ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {group._yesPercent}% Yes
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
          {group._tasks.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <BarChart2 size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">No question data available</p>
            </div>
          ) : (
            [...group._tasks]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((task, idx) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-2xl border ${
                    task.checklistAnswer === 'no'
                      ? 'bg-red-50 border-red-200'
                      : task.checklistAnswer === 'yes'
                        ? 'bg-emerald-50/50 border-emerald-100'
                        : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="text-[10px] font-black text-slate-400 mt-0.5 w-5 text-right flex-shrink-0">{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-700 flex-1">
                          {task.questionText || task.name}
                        </span>
                        <AnswerBadge answer={task.checklistAnswer} />
                      </div>
                      {task.checklistNote && (
                        <div className="mt-2 text-[11px] text-slate-500 bg-white rounded-xl px-2.5 py-2 border border-slate-100">
                          {task.checklistNote}
                        </div>
                      )}
                      {task.checklistAnswer === 'no' && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-500">
                          <AlertTriangle size={10} /> Flagged — No answer
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
          )}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}

// ── Checklist group card ─────────────────────────────────────────────────────

function ChecklistCard({ group, onTap }) {
  return (
    <button
      onClick={() => onTap(group)}
      className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 active:bg-slate-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm leading-tight truncate">{group._clientName}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{group._templateName}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={group._effectiveStatus} />
            <CadencePill cadence={group._cadence} />
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {group._yesPercent !== null ? (
            <div className={`text-xl font-black ${
              group._yesPercent >= 80 ? 'text-emerald-600'
              : group._yesPercent >= 60 ? 'text-amber-600'
              : 'text-red-600'
            }`}>{group._yesPercent}%</div>
          ) : (
            <div className="text-xl font-black text-slate-300">—</div>
          )}
          <div className="text-[10px] text-slate-400 font-semibold">Yes %</div>
          {group._noCount > 0 && (
            <div className="text-[10px] font-bold text-red-500 mt-0.5">{group._noCount} No</div>
          )}
        </div>
      </div>
      {group.date && (
        <div className="mt-2 text-[10px] text-slate-400 font-medium">{group.date}</div>
      )}
    </button>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ChecklistDashboardScreen({ clientLogs, taskGroups, checklistTemplates, accessibleClients = [] }) {
  const today = todayYMD();

  const scopedClients = accessibleClients;
  const scopedClientIds = useMemo(() => new Set(scopedClients.map(c => String(c.id))), [scopedClients]);

  const [dateFrom, setDateFrom] = useState(startOfWeekYMD());
  const [dateTo, setDateTo] = useState(today);
  const [cadenceFilter, setCadenceFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [detailGroup, setDetailGroup] = useState(null);

  const applyQuickRange = (range) => {
    if (range === 'today') { setDateFrom(today); setDateTo(today); }
    else if (range === 'week') { setDateFrom(startOfWeekYMD()); setDateTo(today); }
    else if (range === 'month') { setDateFrom(startOfMonthYMD()); setDateTo(today); }
  };

  const tasksByGroupId = useMemo(() => {
    const map = {};
    Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
      if (!scopedClientIds.has(String(clientId))) return;
      (logs || []).forEach(task => {
        if (task.taskType !== 'checklist' || !task.taskGroupId) return;
        const taskDate = resolveTaskDateYMD(task);
        if (taskDate) {
          if (dateFrom && taskDate < dateFrom) return;
          if (dateTo && taskDate > dateTo) return;
        }
        if (!map[task.taskGroupId]) map[task.taskGroupId] = [];
        map[task.taskGroupId].push(task);
      });
    });
    return map;
  }, [clientLogs, scopedClientIds, dateFrom, dateTo]);

  const enrichedGroups = useMemo(() => {
    return taskGroups
      .filter(group => {
        if (group.archived) return false;
        if (!scopedClientIds.has(String(group.clientId))) return false;
        if (!tasksByGroupId[group.id]) return false;
        const tpl = checklistTemplates.find(t => t.id === group.templateId);
        const cadence = tpl?.cadence || group.repeatFrequency || 'Once';
        if (cadenceFilter !== 'All' && cadence !== cadenceFilter) return false;
        return true;
      })
      .map(group => {
        const tasks = tasksByGroupId[group.id] || [];
        const answered = tasks.filter(t => t.checklistAnswer != null);
        const yesCount = answered.filter(t => t.checklistAnswer === 'yes').length;
        const noCount = answered.filter(t => t.checklistAnswer === 'no').length;
        const naCount = answered.filter(t => t.checklistAnswer === 'na').length;
        const yesPercent = answered.length > 0 ? Math.round((yesCount / answered.length) * 100) : null;
        const groupDate = parseTaskDate(group.date);
        const isOverdue = group.status !== 'done' && groupDate && toYMD(groupDate) < today;
        const effectiveStatus = group.status === 'done' ? 'done' : isOverdue ? 'overdue' : 'pending';
        const tpl = checklistTemplates.find(t => t.id === group.templateId);
        const cadence = tpl?.cadence || group.repeatFrequency || 'Once';
        const client = scopedClients.find(c => String(c.id) === String(group.clientId));
        return {
          ...group,
          _tasks: tasks,
          _yesCount: yesCount,
          _noCount: noCount,
          _naCount: naCount,
          _total: tasks.length,
          _answeredCount: answered.length,
          _yesPercent: yesPercent,
          _effectiveStatus: effectiveStatus,
          _cadence: cadence,
          _clientName: client?.name || group.clientName || group.clientId,
          _templateName: tpl?.name || group.templateName || '—',
        };
      });
  }, [taskGroups, scopedClientIds, tasksByGroupId, cadenceFilter, checklistTemplates, scopedClients, today]);

  const summaryMetrics = useMemo(() => {
    const total = enrichedGroups.length;
    const submitted = enrichedGroups.filter(g => g._effectiveStatus === 'done').length;
    const completionPct = total > 0 ? Math.round((submitted / total) * 100) : 0;
    let totalAnswered = 0, totalYes = 0, totalNo = 0, totalNa = 0;
    enrichedGroups.forEach(g => {
      totalAnswered += g._answeredCount;
      totalYes += g._yesCount;
      totalNo += g._noCount;
      totalNa += g._naCount;
    });
    const overallYesPct = totalAnswered > 0 ? Math.round((totalYes / totalAnswered) * 100) : null;
    const overallNoNaPct = totalAnswered > 0 ? Math.round(((totalNo + totalNa) / totalAnswered) * 100) : null;
    return { total, submitted, completionPct, overallYesPct, overallNoNaPct, totalFlaggedNo: totalNo };
  }, [enrichedGroups]);

  const isThisWeek = dateFrom === startOfWeekYMD() && dateTo === today;
  const isToday = dateFrom === today && dateTo === today;
  const isThisMonth = dateFrom === startOfMonthYMD() && dateTo === today;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <BarChart2 size={18} className="text-indigo-500 flex-shrink-0" />
        <h2 className="text-base font-black text-slate-800 flex-1">Checklist Dashboard</h2>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
            showFilters ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500'
          }`}
        >
          <Filter size={15} />
        </button>
      </div>

      {/* Quick range + filters */}
      <div className="px-4 pb-3 space-y-2.5">
        <div className="flex gap-2">
          {[
            { label: 'Today', fn: () => applyQuickRange('today'), active: isToday },
            { label: 'This Week', fn: () => applyQuickRange('week'), active: isThisWeek },
            { label: 'This Month', fn: () => applyQuickRange('month'), active: isThisMonth },
          ].map(({ label, fn, active }) => (
            <button
              key={label}
              onClick={fn}
              className={`flex-1 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                active
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">From</div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">To</div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Cadence</div>
              <div className="flex gap-1.5 flex-wrap">
                {['All', 'Daily', 'Weekly', 'Monthly', 'Once'].map(c => (
                  <button
                    key={c}
                    onClick={() => setCadenceFilter(c)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                      cadenceFilter === c
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metric cards 2x2 */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2.5">
        <MetricCard
          label="Completion Rate"
          value={`${summaryMetrics.completionPct}%`}
          sub={`${summaryMetrics.submitted} of ${summaryMetrics.total} submitted`}
          accent="border-indigo-100"
        />
        <MetricCard
          label="Overall Yes %"
          value={summaryMetrics.overallYesPct !== null ? `${summaryMetrics.overallYesPct}%` : '—'}
          sub="Across all answers"
          accent="border-emerald-100"
        />
        <MetricCard
          label="No / N/A %"
          value={summaryMetrics.overallNoNaPct !== null ? `${summaryMetrics.overallNoNaPct}%` : '—'}
          sub="Of all answered"
          accent="border-amber-100"
        />
        <MetricCard
          label="Flagged Nos"
          value={summaryMetrics.totalFlaggedNo}
          sub="Total 'No' answers"
          accent={summaryMetrics.totalFlaggedNo > 0 ? 'border-red-200' : 'border-slate-100'}
        />
      </div>

      {/* Per-client list */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-black text-slate-700">Per-Client Breakdown</span>
          <span className="text-[10px] text-slate-400 font-semibold ml-auto">
            {enrichedGroups.length} checklist{enrichedGroups.length !== 1 ? 's' : ''}
          </span>
        </div>

        {enrichedGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-14 text-slate-400">
            <BarChart2 size={32} className="mb-2 opacity-30" />
            <p className="text-sm font-semibold">No checklist data found</p>
            <p className="text-xs mt-1 text-center px-8">Adjust the date range or cadence filter to see data</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {enrichedGroups.map(group => (
              <ChecklistCard key={group.id} group={group} onTap={setDetailGroup} />
            ))}
          </div>
        )}
      </div>

      {detailGroup && (
        <QuestionDetailSheet group={detailGroup} onClose={() => setDetailGroup(null)} />
      )}
    </div>
  );
}
