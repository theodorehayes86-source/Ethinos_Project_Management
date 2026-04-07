import React, { useMemo, useState } from 'react';
import { Clock3, Users, Briefcase, Star, ThumbsUp, ThumbsDown } from 'lucide-react';
import {
  parse,
  parseISO,
  isValid,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths,
  eachDayOfInterval,
  format
} from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const formatDuration = (seconds = 0) => {
  const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
};

const parseTimeTaken = (timeTaken = '') => {
  if (!timeTaken || typeof timeTaken !== 'string') return 0;
  const parts = timeTaken.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
};

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

  const toggleDept = (dept) => {
    setSelectedDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  };

  const effectiveLogs = useMemo(() => {
    if (canSeeAllData) {
      if (selectedDepts.length === 0) return clientLogs;
      return Object.fromEntries(
        Object.entries(clientLogs).map(([clientId, logs]) => [
          clientId,
          (logs || []).filter(log => {
            if (!Array.isArray(log.departments) || log.departments.length === 0) return true;
            return log.departments.some(d => selectedDepts.includes(d));
          })
        ])
      );
    }
    const userDept = currentUser?.department;
    return Object.fromEntries(
      Object.entries(clientLogs).map(([clientId, logs]) => [
        clientId,
        (logs || []).filter(log => !Array.isArray(log.departments) || log.departments.length === 0 || log.departments.includes(userDept))
      ])
    );
  }, [clientLogs, canSeeAllData, selectedDepts, currentUser]);

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

  const isWithinRange = (logDate) => {
    const parsedDate = parse(logDate || '', 'do MMM yyyy', new Date());
    if (!isValid(parsedDate)) return false;
    const normalizedDate = startOfDay(parsedDate);
    if (!rangeStart || !rangeEnd) return false;
    if (normalizedDate < rangeStart) return false;
    if (normalizedDate > startOfDay(rangeEnd)) return false;
    return true;
  };

  const metrics = useMemo(() => {
    const clientNameById = Object.fromEntries(clients.map(client => [client.id, client.name]));
    const userMap = new Map();
    const projectMap = new Map();
    const categoryMap = new Map();

    const filteredLogs = [];

    Object.entries(effectiveLogs || {}).forEach(([clientId, logs]) => {
      const projectName = clientNameById[clientId] || 'Unknown Project';

      (logs || []).forEach(log => {
        if (!isWithinRange(log.date)) return;
        const durationInSeconds = Math.floor((log.elapsedMs || 0) / 1000) || parseTimeTaken(log.timeTaken);
        if (!durationInSeconds) return;

        const parsedDate = parse(log.date || '', 'do MMM yyyy', new Date());
        if (!isValid(parsedDate)) return;

        const userId = log.creatorId || null;
        const userName = log.creatorName || users.find(user => user.id === userId)?.name || 'Unassigned';
        const userRole = log.creatorRole || users.find(user => user.id === userId)?.role || 'Unknown';

        filteredLogs.push({
          date: startOfDay(parsedDate),
          projectName,
          categoryName: log.category || 'General',
          durationInSeconds,
          userId,
          userName,
          userRole
        });
      });
    });

    filteredLogs.forEach(log => {
      const { projectName, categoryName, durationInSeconds, userId, userName, userRole } = log;

      projectMap.set(projectName, (projectMap.get(projectName) || 0) + durationInSeconds);
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + durationInSeconds);

      const key = userId || `${userName}-${userRole}`;

      if (!userMap.has(key)) {
        userMap.set(key, {
          id: key,
          name: userName,
          role: userRole,
          totalSeconds: 0,
          taskCount: 0,
          projects: {}
        });
      }

      const current = userMap.get(key);
      current.totalSeconds += durationInSeconds;
      current.taskCount += 1;
      current.projects[projectName] = (current.projects[projectName] || 0) + durationInSeconds;
    });

    const rows = Array.from(userMap.values())
      .sort((left, right) => right.totalSeconds - left.totalSeconds)
      .map(row => ({
        ...row,
        projectSummary: Object.entries(row.projects)
          .sort((left, right) => right[1] - left[1])
          .map(([project, seconds]) => `${project} (${formatDuration(seconds)})`)
          .join(', ')
      }));

    const projectRows = Array.from(projectMap.entries())
      .map(([name, seconds]) => ({ name, seconds }))
      .sort((left, right) => right.seconds - left.seconds);

    const categoryRows = Array.from(categoryMap.entries())
      .map(([name, seconds]) => ({ name, seconds }))
      .sort((left, right) => right.seconds - left.seconds);

    const totalSeconds = rows.reduce((total, row) => total + row.totalSeconds, 0);
    const totalTasks = rows.reduce((total, row) => total + row.taskCount, 0);
    const avgTaskSeconds = totalTasks > 0 ? Math.floor(totalSeconds / totalTasks) : 0;

    const dailyMap = new Map();
    filteredLogs.forEach(log => {
      const dateKey = format(log.date, 'yyyy-MM-dd');
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { totalSeconds: 0, users: new Set() });
      }
      const item = dailyMap.get(dateKey);
      item.totalSeconds += log.durationInSeconds;
      item.users.add(log.userId || `${log.userName}-${log.userRole}`);
    });

    let trendData = [];
    if (rangeStart && rangeEnd && rangeStart <= rangeEnd) {
      trendData = eachDayOfInterval({ start: rangeStart, end: startOfDay(rangeEnd) }).map(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const daily = dailyMap.get(dateKey);
        const activeUsers = daily?.users.size || 0;
        const avgSeconds = activeUsers > 0 ? Math.floor(daily.totalSeconds / activeUsers) : 0;
        return {
          date: format(day, 'dd MMM'),
          avgSeconds
        };
      });
    }

    return {
      rows,
      projectRows,
      categoryRows,
      totalSeconds,
      totalTasks,
      avgTaskSeconds,
      trendData
    };
  }, [users, clients, effectiveLogs, rangeStart, rangeEnd]);

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

      (logs || []).forEach(log => {
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
          {canSeeAllData && departments.length > 0 && (
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
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Time Logged</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{formatDuration(metrics.avgTaskSeconds)}</p>
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
                    <th className="px-4 py-2 text-left">Time Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.categoryRows.length > 0 ? (
                    metrics.categoryRows.map(row => (
                      <tr key={row.name} className="hover:bg-slate-50 transition-all">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{row.name}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700">{formatDuration(row.seconds)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
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
              {clients.map(c => (
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
