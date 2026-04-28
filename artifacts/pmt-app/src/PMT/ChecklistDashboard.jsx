import React, { useMemo, useState, useEffect } from 'react';
import { X, ChevronDown, Check, AlertTriangle, Clock, BarChart2, TrendingUp, Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { getUserLeaveAndHolidayData, isFullDayLeaveOrHoliday } from '../utils/leaveConflict';

// ─── Date Helpers ─────────────────────────────────────────────────────────────

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayYMD() {
  return toYMD(new Date());
}

function startOfWeekYMD() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toYMD(d);
}

function startOfMonthYMD() {
  const d = new Date();
  d.setDate(1);
  return toYMD(d);
}

function weekLabel(date) {
  const d = new Date(date);
  const month = d.toLocaleString('default', { month: 'short' });
  return `${month} ${d.getDate()}`;
}

function getISOWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Resolve a task's canonical date: prefer createdAt (ms timestamp), fall back to date string
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

// ─── Sub-Components ───────────────────────────────────────────────────────────

const CadencePill = ({ cadence }) => {
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
};

const StatusPill = ({ status }) => {
  if (status === 'done') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
      <Check size={10} /> Submitted
    </span>
  );
  if (status === 'overdue') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
      <AlertTriangle size={10} /> Overdue
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
      <Clock size={10} /> Pending
    </span>
  );
};

const AnswerBadge = ({ answer }) => {
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
};

const MetricCard = ({ label, value, sub, accent }) => (
  <div className={`flex-1 min-w-[130px] rounded-2xl border bg-white/80 backdrop-blur-sm p-4 shadow-sm ${accent || 'border-white/80'}`}>
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-2xl font-black text-slate-800">{value}</div>
    {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
  </div>
);

const GLOBAL_ROLES = ['Super Admin', 'Director', 'Business Head'];

// ─── Main Component ───────────────────────────────────────────────────────────

const ChecklistDashboard = ({
  clientLogs = {},
  taskGroups = [],
  clients = [],
  accessibleClients = null,
  checklistTemplates = [],
  departments = [],
  currentUser = null,
  users = [],
}) => {
  const today = todayYMD();
  const isGlobal = GLOBAL_ROLES.includes(currentUser?.role);

  // The set of clients this user can see — global roles see all, others see assigned
  const scopedClients = useMemo(() => {
    if (isGlobal || accessibleClients === null) return clients;
    return accessibleClients;
  }, [isGlobal, clients, accessibleClients]);

  const scopedClientIds = useMemo(() => new Set(scopedClients.map(c => String(c.id))), [scopedClients]);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [cadenceFilter, setCadenceFilter] = useState('All');
  const [templateFilter, setTemplateFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [leaveDataByUser, setLeaveDataByUser] = useState({});

  useEffect(() => {
    const assigneeIds = [...new Set(taskGroups.map(g => g.assigneeId).filter(Boolean).map(String))];
    if (!assigneeIds.length) return;
    let cancelled = false;
    Promise.all(assigneeIds.map(id => getUserLeaveAndHolidayData(id).then(data => ({ id, data })))).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ id, data }) => { map[id] = data; });
      setLeaveDataByUser(map);
    });
    return () => { cancelled = true; };
  }, [taskGroups]);


  // ── CSV export ────────────────────────────────────────────────────────────
  const [csvQuestionFilter, setCsvQuestionFilter] = useState('');

  // ── Detail panel ─────────────────────────────────────────────────────────
  const [detailGroup, setDetailGroup] = useState(null);
  const [trendGroup, setTrendGroup] = useState(null);

  const applyQuickRange = (range) => {
    if (range === 'today') { setDateFrom(today); setDateTo(today); }
    else if (range === 'week') { setDateFrom(startOfWeekYMD()); setDateTo(today); }
    else if (range === 'month') { setDateFrom(startOfMonthYMD()); setDateTo(today); }
  };

  const toggleClientId = (id) => {
    setSelectedClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ── Data Layer ────────────────────────────────────────────────────────────

  // Step 1: collect all checklist tasks from the scoped client set, indexed by groupId.
  // Filter by task date (createdAt or date field) within the selected date range.
  const tasksByGroupId = useMemo(() => {
    const map = {};
    Object.entries(clientLogs).forEach(([clientId, logs]) => {
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

  // Step 2: join taskGroups with their child tasks, apply remaining filters
  const filteredGroups = useMemo(() => {
    return taskGroups.filter(group => {
      if (group.archived) return false;
      // Only include groups that belong to accessible clients
      if (!scopedClientIds.has(String(group.clientId))) return false;
      // Only include groups that have at least one child task in the date window
      // (this is the primary date filter — based on task-level dates)
      if (!tasksByGroupId[group.id]) return false;

      // Client filter
      if (selectedClientIds.length > 0 && !selectedClientIds.includes(String(group.clientId))) return false;

      // Template/cadence context
      const tpl = checklistTemplates.find(t => t.id === group.templateId);
      const cadence = tpl?.cadence || group.repeatFrequency || 'Once';
      if (cadenceFilter !== 'All' && cadence !== cadenceFilter) return false;

      // Template filter
      if (templateFilter !== 'All' && group.templateId !== templateFilter) return false;

      // Department filter (via template's departmentId)
      if (departmentFilter !== 'All') {
        const tplDeptId = tpl?.departmentId || '';
        if (tplDeptId !== departmentFilter) return false;
      }

      // Assignee filter
      if (assigneeFilter !== 'All') {
        const resolvedAssignee = users.find(u => u.id === group.assigneeId)?.name || group.assigneeName || '—';
        if (resolvedAssignee !== assigneeFilter) return false;
      }

      return true;
    });
  }, [taskGroups, scopedClientIds, tasksByGroupId, selectedClientIds, cadenceFilter, templateFilter, departmentFilter, assigneeFilter, checklistTemplates, users]);

  // Step 3: enrich groups with computed stats
  const enrichedGroups = useMemo(() => {
    return filteredGroups.map(group => {
      const tasks = tasksByGroupId[group.id] || [];
      const ynTasks   = tasks.filter(t => !t.requiresInput);
      const textTasks = tasks.filter(t => t.requiresInput);
      const ynAnswered   = ynTasks.filter(t => t.checklistAnswer != null);
      const textAnswered = textTasks.filter(t => t.checklistNote?.trim());
      const answered  = [...ynAnswered, ...textAnswered];
      const yesCount  = ynAnswered.filter(t => t.checklistAnswer === 'yes').length;
      const noCount   = ynAnswered.filter(t => t.checklistAnswer === 'no').length;
      const naCount   = ynAnswered.filter(t => t.checklistAnswer === 'na').length;
      const yesPercent = ynAnswered.length > 0 ? Math.round((yesCount / ynAnswered.length) * 100) : null;

      const groupDate = parseTaskDate(group.date);
      const groupDateYMD = groupDate ? toYMD(groupDate) : null;
      const assigneeLeave = leaveDataByUser[String(group.assigneeId)] || {};
      const isOnLeave = groupDateYMD && isFullDayLeaveOrHoliday(assigneeLeave[groupDateYMD]);
      const isOverdue = group.status !== 'done' && groupDateYMD && groupDateYMD < today && !isOnLeave;
      const effectiveStatus = group.status === 'done' ? 'done' : isOverdue ? 'overdue' : 'pending';

      const tpl = checklistTemplates.find(t => t.id === group.templateId);
      const cadence = tpl?.cadence || group.repeatFrequency || 'Once';
      const client = scopedClients.find(c => String(c.id) === String(group.clientId));
      const assigneeUser = users.find(u => u.id === group.assigneeId);
      const assigneeName = assigneeUser?.name || group.assigneeName || '—';

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
        _assigneeName: assigneeName,
      };
    });
  }, [filteredGroups, tasksByGroupId, checklistTemplates, scopedClients, users, today, leaveDataByUser]);

  // Summary metrics
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

  // Historical trend for a selected group (8 weeks)
  const trendData = useMemo(() => {
    if (!trendGroup) return [];
    const weeks = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const ws = getISOWeekStart(ref);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      weeks.push({ start: ws, end: we });
    }
    return weeks.map(({ start, end }) => {
      const wsYMD = toYMD(start);
      const weYMD = toYMD(end);
      const weekGroups = taskGroups.filter(g => {
        if (g.templateId !== trendGroup.templateId || g.clientId !== trendGroup.clientId || g.archived) return false;
        const gd = toYMD(parseTaskDate(g.date));
        return gd && gd >= wsYMD && gd <= weYMD;
      });
      if (weekGroups.length === 0) return { week: weekLabel(start), score: null };
      let yes = 0, answered = 0;
      weekGroups.forEach(g => {
        const tasks = (clientLogs[g.clientId] || []).filter(t => t.taskGroupId === g.id && t.taskType === 'checklist');
        tasks.forEach(t => {
          if (t.checklistAnswer != null) { answered++; if (t.checklistAnswer === 'yes') yes++; }
        });
      });
      return { week: weekLabel(start), score: answered > 0 ? Math.round((yes / answered) * 100) : null };
    });
  }, [trendGroup, taskGroups, clientLogs]);

  // Templates that appear in accessible task groups
  const usedTemplates = useMemo(() => {
    const seen = new Set(taskGroups.filter(g => !g.archived && scopedClientIds.has(String(g.clientId))).map(g => g.templateId));
    return checklistTemplates.filter(t => seen.has(t.id));
  }, [taskGroups, scopedClientIds, checklistTemplates]);

  // Departments from used templates
  const usedDepartments = useMemo(() => {
    const deptIds = new Set(usedTemplates.map(t => t.departmentId).filter(Boolean));
    return departments.filter(d => deptIds.has(d) || deptIds.has(d));
  }, [usedTemplates, departments]);

  const filteredClientOptions = useMemo(() => {
    return scopedClients.filter(c =>
      !clientSearch.trim() || c.name.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [scopedClients, clientSearch]);

  // Unique assignees appearing in the current filtered+enriched groups
  const usedAssignees = useMemo(() => {
    const names = new Set(enrichedGroups.map(g => g._assigneeName).filter(n => n && n !== '—'));
    return [...names].sort();
  }, [enrichedGroups]);

  const hasActiveFilters = selectedClientIds.length > 0 || cadenceFilter !== 'All' || templateFilter !== 'All' || departmentFilter !== 'All' || assigneeFilter !== 'All';

  // ── CSV download ─────────────────────────────────────────────────────────
  const downloadCSV = () => {
    const qFilter = csvQuestionFilter.trim().toLowerCase();
    const rows = [];
    rows.push(['Client', 'Assignee', 'Template', 'Date', 'Cadence', 'Status', 'Q#', 'Question', 'Type', 'Answer', 'Notes']);
    [...enrichedGroups]
      .sort((a, b) => (a._templateName || '').localeCompare(b._templateName || '') || (a._clientName || '').localeCompare(b._clientName || ''))
      .forEach(group => {
        const sorted = [...group._tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        sorted.forEach((task, idx) => {
          const qText = (task.questionText || task.name || '').toLowerCase();
          if (qFilter && !qText.includes(qFilter)) return;
          const type = task.requiresInput ? 'Text' : 'Yes/No/NA';
          const answer = task.requiresInput
            ? (task.checklistNote?.trim() || '')
            : (task.checklistAnswer || '');
          const notes = task.requiresInput ? '' : (task.checklistNote || '');
          const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
          rows.push([
            escape(group._clientName),
            escape(group._assigneeName),
            escape(group._templateName),
            escape(group.date || ''),
            escape(group._cadence),
            escape(group._effectiveStatus),
            idx + 1,
            escape(task.questionText || task.name || ''),
            escape(type),
            escape(answer),
            escape(notes),
          ]);
        });
      });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checklist-responses-${toYMD(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Filters ── */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/80 shadow-sm p-4 flex flex-wrap gap-3 items-end">

        {/* Quick range buttons */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick</span>
          <div className="flex gap-1">
            {['today', 'week', 'month'].map(r => (
              <button key={r} onClick={() => applyQuickRange(r)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 transition-all capitalize"
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Client picker */}
        <div className="flex flex-col gap-1 relative">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client</span>
          <button onClick={() => setClientPickerOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white shadow-sm hover:border-indigo-300 min-w-[150px] text-left"
          >
            <span className="flex-1 truncate text-slate-600">
              {selectedClientIds.length === 0 ? 'All Clients' : `${selectedClientIds.length} selected`}
            </span>
            <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
          </button>
          {clientPickerOpen && (
            <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg w-56 max-h-56 overflow-y-auto">
              <div className="p-2 border-b border-slate-100">
                <input autoFocus value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                  placeholder="Search clients…"
                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>
              <div className="p-1">
                <button onClick={() => { setSelectedClientIds([]); setClientPickerOpen(false); }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 rounded-lg font-semibold text-slate-500"
                >All Clients</button>
                {filteredClientOptions.map(c => (
                  <button key={c.id} onClick={() => toggleClientId(String(c.id))}
                    className={`w-full px-3 py-1.5 text-left text-xs rounded-lg flex items-center gap-2 transition-all ${
                      selectedClientIds.includes(String(c.id))
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${selectedClientIds.includes(String(c.id)) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                      {selectedClientIds.includes(String(c.id)) && <Check size={9} className="text-white" />}
                    </div>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cadence toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cadence</span>
          <div className="flex gap-1">
            {['All', 'Daily', 'Weekly', 'Monthly'].map(c => (
              <button key={c} onClick={() => setCadenceFilter(c)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  cadenceFilter === c
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >{c}</button>
            ))}
          </div>
        </div>

        {/* Department filter */}
        {usedDepartments.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department</span>
            <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[180px]"
            >
              <option value="All">All Departments</option>
              {usedDepartments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}

        {/* Template filter */}
        {usedTemplates.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Template</span>
            <select value={templateFilter} onChange={e => setTemplateFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[200px]"
            >
              <option value="All">All Templates</option>
              {usedTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Assignee filter */}
        {usedAssignees.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assignee</span>
            <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[180px]"
            >
              <option value="All">All Assignees</option>
              {usedAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={() => { setSelectedClientIds([]); setCadenceFilter('All'); setTemplateFilter('All'); setDepartmentFilter('All'); setAssigneeFilter('All'); }}
            className="self-end flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 border border-slate-200 hover:border-red-300 hover:text-red-600 hover:bg-red-50 bg-white transition-all"
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* ── Summary Metrics ── */}
      <div className="flex flex-wrap gap-3">
        <MetricCard label="Completion Rate" value={`${summaryMetrics.completionPct}%`}
          sub={`${summaryMetrics.submitted} of ${summaryMetrics.total} submitted`} accent="border-indigo-100" />
        <MetricCard label="Overall Yes %" value={summaryMetrics.overallYesPct !== null ? `${summaryMetrics.overallYesPct}%` : '—'}
          sub="Across all answered questions" accent="border-emerald-100" />
        <MetricCard label="No / N/A %" value={summaryMetrics.overallNoNaPct !== null ? `${summaryMetrics.overallNoNaPct}%` : '—'}
          sub="Of all answered questions" accent="border-amber-100" />
        <MetricCard label="Flagged Nos" value={summaryMetrics.totalFlaggedNo}
          sub="Total 'No' answers in range" accent={summaryMetrics.totalFlaggedNo > 0 ? 'border-red-200' : 'border-white/80'} />
      </div>

      {/* ── Per-Client Breakdown Table ── */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/80 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <BarChart2 size={15} className="text-indigo-500" />
          <span className="text-sm font-black text-slate-800">Per-Client Breakdown</span>
          <span className="text-xs text-slate-400">{enrichedGroups.length} checklist{enrichedGroups.length !== 1 ? 's' : ''}</span>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="text"
              value={csvQuestionFilter}
              onChange={e => setCsvQuestionFilter(e.target.value)}
              placeholder="Filter questions in CSV…"
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44"
            />
            <button
              onClick={downloadCSV}
              disabled={enrichedGroups.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>

        {enrichedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <BarChart2 size={32} className="mb-2 opacity-30" />
            <p className="text-sm font-semibold">No checklist submissions found</p>
            <p className="text-xs mt-1">Adjust the filters or date range to see data</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Client</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Assignee</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Template</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Date</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Cadence</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Status</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Yes %</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]">No / N/A</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {enrichedGroups.map(group => (
                  <tr key={group.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{group._clientName}</td>
                    <td className="px-4 py-3 text-slate-600">{group._assigneeName}</td>
                    <td className="px-4 py-3 text-slate-600">{group._templateName}</td>
                    <td className="px-4 py-3 text-slate-500">{group.date || '—'}</td>
                    <td className="px-4 py-3"><CadencePill cadence={group._cadence} /></td>
                    <td className="px-4 py-3"><StatusPill status={group._effectiveStatus} /></td>
                    <td className="px-4 py-3">
                      {group._yesPercent !== null ? (
                        <span className={`font-bold ${group._yesPercent >= 80 ? 'text-emerald-600' : group._yesPercent >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                          {group._yesPercent}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${group._noCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {group._noCount} No{group._naCount > 0 ? ` / ${group._naCount} N/A` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setDetailGroup(group); setTrendGroup(null); }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-all"
                        >View</button>
                        <button onClick={() => { setTrendGroup(group); setDetailGroup(null); }}
                          title="View historical trend"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all"
                        ><TrendingUp size={11} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Question Detail Panel ── */}
      {detailGroup && (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/80 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-black text-slate-800 text-sm">{detailGroup._clientName}</div>
              <div className="text-xs text-slate-500 mt-0.5">{detailGroup._templateName} · {detailGroup.date}</div>
            </div>
            <StatusPill status={detailGroup._effectiveStatus} />
            <button onClick={() => setDetailGroup(null)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
            ><X size={15} /></button>
          </div>

          <div className="p-4 space-y-2">
            {detailGroup._tasks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No question data available for this submission.</p>
            ) : (
              [...detailGroup._tasks]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((task, idx) => {
                  if (task.requiresInput) {
                    // Text-input-only note — no yes/no/na badge
                    const hasFilled = !!task.checklistNote?.trim();
                    return (
                      <div key={task.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                          hasFilled ? 'bg-indigo-50/40 border-indigo-100' : 'bg-amber-50/40 border-amber-200'
                        }`}
                      >
                        <div className="text-[10px] font-black text-slate-400 mt-0.5 w-5 text-right flex-shrink-0">{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-slate-700 block mb-1.5">
                            {task.questionText || task.name}
                          </span>
                          {hasFilled ? (
                            <div className="text-[12px] text-slate-800 font-medium bg-white/80 rounded-lg px-3 py-2 border border-indigo-100 leading-relaxed whitespace-pre-wrap">
                              {task.checklistNote}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-600">Not filled in</span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  // Standard yes/no/na question
                  return (
                    <div key={task.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                        task.checklistAnswer === 'no'
                          ? 'bg-red-50/80 border-red-200'
                          : task.checklistAnswer === 'yes'
                            ? 'bg-emerald-50/40 border-emerald-100'
                            : 'bg-slate-50/60 border-slate-100'
                      }`}
                    >
                      <div className="text-[10px] font-black text-slate-400 mt-0.5 w-5 text-right flex-shrink-0">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700 flex-1 min-w-[200px]">
                            {task.questionText || task.name}
                          </span>
                          <AnswerBadge answer={task.checklistAnswer} />
                        </div>
                        {task.checklistNote && (
                          <div className="mt-1.5 text-[11px] text-slate-500 bg-white/70 rounded-lg px-2.5 py-1.5 border border-slate-100">
                            {task.checklistNote}
                          </div>
                        )}
                        {task.checklistAnswer === 'no' && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-red-500">
                            <AlertTriangle size={10} /> Flagged — No answer
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* ── Historical Trend Chart ── */}
      {trendGroup && (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/80 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
            <TrendingUp size={15} className="text-indigo-500" />
            <div className="flex-1 min-w-0">
              <div className="font-black text-slate-800 text-sm">Compliance Trend</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {trendGroup._clientName} · {trendGroup._templateName} · Past 8 weeks
              </div>
            </div>
            <button onClick={() => setTrendGroup(null)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
            ><X size={15} /></button>
          </div>

          <div className="p-5">
            {trendData.every(d => d.score === null) ? (
              <div className="text-center py-8 text-slate-400">
                <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold">No historical data for this client and template</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip formatter={(v) => v !== null ? [`${v}%`, 'Yes %'] : ['No data', '']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="score" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default ChecklistDashboard;
