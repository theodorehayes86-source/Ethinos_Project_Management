import React, { useMemo, useState } from 'react';
import { Clock3, Users, Briefcase, Star, ThumbsUp, ThumbsDown } from 'lucide-react';
import {
  parseISO,
  isValid,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths
} from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getOwnerScope, scopeClientLogs } from './shared/clientScope';
import {
  formatDuration,
  filterLogsByDepartments,
  makeIsWithinRange,
  computeMetrics,
} from './shared/reportingAggregation';

const rangeLabels = {
  last7: 'Last 7 Days',
  last15: 'Last 15 Days',
  last30: 'Last 30 Days',
  currentMonth: 'Current Month',
  lastMonth: 'Last Month',
  custom: 'Custom Date Range'
};

const TABS = [
  { id: 'performance', label: 'Performance' },
  { id: 'quality', label: 'Quality' },
];

const UserMetricsView = ({ users = [], clients = [], clientLogs = {}, currentUser = null, departments = [], canSeeAllData = false }) => {
  const [rangePreset, setRangePreset] = useState('last7');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [activeTab, setActiveTab] = useState('performance');
  const [qcClientFilter, setQcClientFilter] = useState('');
  const [qcCategoryFilter, setQcCategoryFilter] = useState('');
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(''); // '' = all permitted clients (owner-scoped roles only)

  const toggleDept = (dept) => {
    setSelectedDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  };

  const effectiveAllData = canSeeAllData || currentUser?.department === 'All';

  // BH/CSM: client-scoped across ALL departments (Aug 2026 policy). Null for other roles.
  const ownerScope = useMemo(() => getOwnerScope(currentUser, users, clients), [currentUser, users, clients]);
  const permittedClients = useMemo(
    () => (ownerScope ? [...ownerScope.clients].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : []),
    [ownerScope]
  );

  const effectiveLogs = useMemo(() => {
    if (ownerScope) {
      // Scope the DATA to permitted clients before any aggregation. A selected
      // client is only honored if it is inside the permitted set.
      const ids = selectedClientId && ownerScope.clientIds.has(String(selectedClientId))
        ? new Set([String(selectedClientId)])
        : ownerScope.clientIds;
      return scopeClientLogs(clientLogs, ids);
    }
    return filterLogsByDepartments(clientLogs, {
      effectiveAllData,
      selectedDepts,
      userDept: currentUser?.department,
    });
  }, [clientLogs, ownerScope, selectedClientId, effectiveAllData, selectedDepts, currentUser]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    if (rangePreset === 'last7') return { rangeStart: startOfDay(subDays(now, 6)), rangeEnd: endOfDay(now) };
    if (rangePreset === 'last15') return { rangeStart: startOfDay(subDays(now, 14)), rangeEnd: endOfDay(now) };
    if (rangePreset === 'last30') return { rangeStart: startOfDay(subDays(now, 29)), rangeEnd: endOfDay(now) };
    if (rangePreset === 'currentMonth') return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
    if (rangePreset === 'lastMonth') {
      const lastMonthDate = subMonths(now, 1);
      return { rangeStart: startOfMonth(lastMonthDate), rangeEnd: endOfMonth(lastMonthDate) };
    }
    if (rangePreset === 'custom' && customRange.start && customRange.end) {
      const parsedStart = parseISO(customRange.start);
      const parsedEnd = parseISO(customRange.end);
      if (isValid(parsedStart) && isValid(parsedEnd)) {
        return { rangeStart: startOfDay(parsedStart), rangeEnd: endOfDay(parsedEnd) };
      }
    }
    return { rangeStart: null, rangeEnd: null };
  }, [rangePreset, customRange]);

  const isWithinRange = makeIsWithinRange(rangeStart, rangeEnd);

  const metrics = useMemo(
    () => computeMetrics({ clientLogs: effectiveLogs, clients, users, rangeStart, rangeEnd }),
    [users, clients, effectiveLogs, rangeStart, rangeEnd]
  );


  const qcMetrics = useMemo(() => {
    const clientNameById = Object.fromEntries(clients.map(c => [c.id, c.name]));
    const employeeMap = new Map();

    let totalRated = 0;
    let totalRatingSum = 0;
    let totalApproved = 0;
    let totalReturned = 0;

    Object.entries(effectiveLogs || {}).forEach(([clientId, logs]) => {
      const clientName = clientNameById[clientId] || clientId;
      if (qcClientFilter && clientId !== qcClientFilter) return;

      Object.values(logs || {}).forEach(log => {
        if (!isWithinRange(log.date)) return;
        if (!log.qcEnabled) return;
        if (qcCategoryFilter && log.category !== qcCategoryFilter) return;

        const userId = log.creatorId || log.assignee?.id || null;
        const userName = log.creatorName || log.assignee?.name || 'Unassigned';

        const key = userId || userName;
        if (!employeeMap.has(key)) {
          employeeMap.set(key, {
            id: key,
            name: userName,
            totalQcTasks: 0,
            ratedCount: 0,
            ratingSum: 0,
            approved: 0,
            returned: 0,
          });
        }
        const emp = employeeMap.get(key);
        emp.totalQcTasks += 1;

        if (log.qcStatus === 'approved') {
          emp.approved += 1;
          totalApproved += 1;
        } else if (log.qcStatus === 'rejected') {
          emp.returned += 1;
          totalReturned += 1;
        }

        if (log.qcRating != null && !isNaN(Number(log.qcRating))) {
          const rating = Number(log.qcRating);
          emp.ratingSum += rating;
          emp.ratedCount += 1;
          totalRatingSum += rating;
          totalRated += 1;
        }
      });
    });

    const employeeRows = Array.from(employeeMap.values())
      .map(emp => ({
        ...emp,
        avgRating: emp.ratedCount > 0 ? Math.round((emp.ratingSum / emp.ratedCount) * 10) / 10 : null,
        approvalRate: emp.totalQcTasks > 0 ? Math.round((emp.approved / emp.totalQcTasks) * 100) : null,
      }))
      .filter(emp => emp.totalQcTasks > 0)
      .sort((a, b) => {
        if (b.avgRating === null && a.avgRating === null) return 0;
        if (b.avgRating === null) return -1;
        if (a.avgRating === null) return 1;
        return b.avgRating - a.avgRating;
      });

    const overallAvgRating = totalRated > 0 ? Math.round((totalRatingSum / totalRated) * 10) / 10 : null;
    const totalReviewed = totalApproved + totalReturned;
    const overallApprovalRate = totalReviewed > 0 ? Math.round((totalApproved / totalReviewed) * 100) : null;

    const topRated = employeeRows.filter(e => e.avgRating !== null).slice(0, 3);
    const lowestRated = employeeRows.filter(e => e.avgRating !== null).slice(-3).reverse();

    const allCategories = [...new Set(
      Object.values(effectiveLogs || {}).flatMap(logs =>
        (logs || []).filter(l => l.qcEnabled).map(l => l.category).filter(Boolean)
      )
    )].sort();

    return {
      employeeRows,
      overallAvgRating,
      overallApprovalRate,
      totalApproved,
      totalReturned,
      totalReviewed,
      topRated,
      lowestRated,
      allCategories,
    };
  }, [clients, effectiveLogs, rangeStart, rangeEnd, qcClientFilter, qcCategoryFilter]);

  const ratingBar = (rating) => {
    if (rating === null) return <span className="text-slate-400 text-xs">N/A</span>;
    const pct = (rating / 10) * 100;
    const color = rating >= 7 ? 'bg-emerald-500' : rating >= 5 ? 'bg-amber-400' : 'bg-red-400';
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden" style={{ minWidth: '60px' }}>
          <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-slate-700">{rating}/10</span>
      </div>
    );
  };

  return (
    <div className="min-h-full p-4 space-y-4 text-left animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {ownerScope && (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none min-w-[180px]"
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
              <option value="" style={{ backgroundColor: '#ffffff', color: '#000000' }}>All My Clients</option>
              {permittedClients.map(c => (
                <option key={c.id} value={c.id} style={{ backgroundColor: '#ffffff', color: '#000000' }}>{c.name}</option>
              ))}
            </select>
          )}
          {!ownerScope && effectiveAllData && departments.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDeptPickerOpen(o => !o)}
                className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 min-w-[160px] hover:border-blue-400 transition-all"
              >
                <span className="flex-1 text-left truncate">
                  {selectedDepts.length === 0 ? 'All Departments' : selectedDepts.length === 1 ? selectedDepts[0] : `${selectedDepts.length} Departments`}
                </span>
                <span className="text-slate-400">▾</span>
              </button>
              {deptPickerOpen && (
                <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 min-w-[180px]">
                  <button type="button" onClick={() => setSelectedDepts([])} className="w-full text-left px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-all">
                    Clear (All)
                  </button>
                  {departments.map(dept => (
                    <label key={dept} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selectedDepts.includes(dept)} onChange={() => toggleDept(dept)} className="w-3.5 h-3.5 accent-blue-600" />
                      <span className="text-xs font-medium text-slate-700">{dept}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <select
            value={rangePreset}
            onChange={(e) => setRangePreset(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none min-w-[190px]"
            style={{ backgroundColor: '#ffffff', color: '#000000' }}
          >
            <option value="last7" style={{ backgroundColor: '#ffffff', color: '#000000' }}>Last 7 Days</option>
            <option value="last15" style={{ backgroundColor: '#ffffff', color: '#000000' }}>Last 15 Days</option>
            <option value="last30" style={{ backgroundColor: '#ffffff', color: '#000000' }}>Last 30 Days</option>
            <option value="currentMonth" style={{ backgroundColor: '#ffffff', color: '#000000' }}>Current Month</option>
            <option value="lastMonth" style={{ backgroundColor: '#ffffff', color: '#000000' }}>Last Month</option>
            <option value="custom" style={{ backgroundColor: '#ffffff', color: '#000000' }}>Custom Date Range</option>
          </select>

          {rangePreset === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:min-w-[320px]">
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
              />
              <input
                type="date"
                value={customRange.end}
                min={customRange.start || undefined}
                onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {activeTab === 'performance' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Tasks</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{metrics.totalTasks}</p>
              </div>
              <div className="p-2 bg-orange-50 rounded-lg"><Briefcase size={14} className="text-orange-600" /></div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Time / User</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{formatDuration(metrics.avgUserSeconds)}</p>
              </div>
              <div className="p-2 bg-orange-50 rounded-lg"><Users size={14} className="text-orange-600" /></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Project View</p>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                    <th className="px-4 py-2 text-left">Project Name</th>
                    <th className="px-4 py-2 text-left">Time Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.projectRows.length > 0 ? (
                    metrics.projectRows.map(row => (
                      <tr key={row.name} className="hover:bg-slate-50 transition-all">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{row.name}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-blue-700">{formatDuration(row.seconds)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                        No project time data for selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Task Category View</p>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                    <th className="px-4 py-2 text-left">Task Category</th>
                    <th className="px-4 py-2 text-right">Tasks</th>
                    <th className="px-4 py-2 text-left">Total Time</th>
                    <th className="px-4 py-2 text-left">Avg / Task</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.categoryRows.length > 0 ? (
                    metrics.categoryRows.map(row => (
                      <tr key={row.name} className="hover:bg-slate-50 transition-all">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{row.name}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-right">{row.taskCount}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700">{formatDuration(row.seconds)}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-indigo-600">{formatDuration(row.avgSeconds)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                        No category time data for selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm lg:col-span-2">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">{rangeLabels[rangePreset]} - Daily Avg Time/User</p>
              </div>
              <div className="p-3" style={{ minHeight: '220px' }}>
                {metrics.trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={metrics.trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        style={{ fontSize: '11px' }}
                      />
                      <YAxis
                        stroke="#64748b"
                        style={{ fontSize: '11px' }}
                        tickFormatter={(value) => `${Math.floor(value / 3600)}h`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }}
                        formatter={(value) => formatDuration(Number(value) || 0)}
                        labelStyle={{ color: '#1e293b' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgSeconds"
                        name="Avg Time/User"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-xs font-medium text-slate-500">
                    No trend data for selected date range.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'quality' && (
        <>
          <div className="flex flex-wrap gap-2 items-center mb-1">
            <select
              value={qcClientFilter}
              onChange={e => setQcClientFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
              <option value="">All Clients</option>
              {(ownerScope ? permittedClients : clients).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={qcCategoryFilter}
              onChange={e => setQcCategoryFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
              <option value="">All Categories</option>
              {qcMetrics.allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg QC Rating</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">
                  {qcMetrics.overallAvgRating !== null ? `${qcMetrics.overallAvgRating}/10` : 'N/A'}
                </p>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg"><Star size={14} className="text-amber-500" /></div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Approved</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">
                  {qcMetrics.totalApproved}
                  {qcMetrics.overallApprovalRate !== null && (
                    <span className="text-sm font-semibold text-slate-400 ml-1">({qcMetrics.overallApprovalRate}%)</span>
                  )}
                </p>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg"><ThumbsUp size={14} className="text-emerald-600" /></div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Returned</p>
                <p className="text-lg font-bold text-red-600 mt-0.5">
                  {qcMetrics.totalReturned}
                  {qcMetrics.overallApprovalRate !== null && (
                    <span className="text-sm font-semibold text-slate-400 ml-1">({100 - qcMetrics.overallApprovalRate}%)</span>
                  )}
                </p>
              </div>
              <div className="p-2 bg-red-50 rounded-lg"><ThumbsDown size={14} className="text-red-500" /></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-100 flex items-center gap-2">
                <Star size={12} className="text-amber-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Top Rated Employees</p>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                    <th className="px-4 py-2 text-left">Employee</th>
                    <th className="px-4 py-2 text-left">Avg Rating</th>
                    <th className="px-4 py-2 text-left">Tasks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qcMetrics.topRated.length > 0 ? (
                    qcMetrics.topRated.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50 transition-all">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{emp.name}</td>
                        <td className="px-4 py-2.5 min-w-[130px]">{ratingBar(emp.avgRating)}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-500">{emp.totalQcTasks}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                        No QC rating data for selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-100 flex items-center gap-2">
                <ThumbsDown size={12} className="text-red-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Lowest Rated Employees</p>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                    <th className="px-4 py-2 text-left">Employee</th>
                    <th className="px-4 py-2 text-left">Avg Rating</th>
                    <th className="px-4 py-2 text-left">Tasks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qcMetrics.lowestRated.length > 0 ? (
                    qcMetrics.lowestRated.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50 transition-all">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{emp.name}</td>
                        <td className="px-4 py-2.5 min-w-[130px]">{ratingBar(emp.avgRating)}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-500">{emp.totalQcTasks}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                        No QC rating data for selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm lg:col-span-2">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Per-Employee QC Summary</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                      <th className="px-4 py-2 text-left">Employee</th>
                      <th className="px-4 py-2 text-left">QC Tasks</th>
                      <th className="px-4 py-2 text-left">Avg Rating</th>
                      <th className="px-4 py-2 text-left">Approved</th>
                      <th className="px-4 py-2 text-left">Returned</th>
                      <th className="px-4 py-2 text-left">Approval Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {qcMetrics.employeeRows.length > 0 ? (
                      qcMetrics.employeeRows.map(emp => (
                        <tr key={emp.id} className="hover:bg-slate-50 transition-all">
                          <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{emp.name}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{emp.totalQcTasks}</td>
                          <td className="px-4 py-2.5 min-w-[130px]">{ratingBar(emp.avgRating)}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700">{emp.approved}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-red-600">{emp.returned}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">
                            {emp.approvalRate !== null ? `${emp.approvalRate}%` : 'N/A'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                          No QC data found for the selected filters and date range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default UserMetricsView;
