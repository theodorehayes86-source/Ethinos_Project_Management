import React, { useMemo, useState } from 'react';
import { Clock3, Users, Briefcase } from 'lucide-react';
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

const UserMetricsView = ({ users = [], clients = [], clientLogs = {} }) => {
  const [rangePreset, setRangePreset] = useState('last7');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  const metrics = useMemo(() => {
    const clientNameById = Object.fromEntries(clients.map(client => [client.id, client.name]));
    const userMap = new Map();
    const projectMap = new Map();
    const categoryMap = new Map();
    const now = new Date();

    let rangeStart = null;
    let rangeEnd = null;

    if (rangePreset === 'last7') {
      rangeStart = startOfDay(subDays(now, 6));
      rangeEnd = endOfDay(now);
    } else if (rangePreset === 'last15') {
      rangeStart = startOfDay(subDays(now, 14));
      rangeEnd = endOfDay(now);
    } else if (rangePreset === 'last30') {
      rangeStart = startOfDay(subDays(now, 29));
      rangeEnd = endOfDay(now);
    } else if (rangePreset === 'currentMonth') {
      rangeStart = startOfMonth(now);
      rangeEnd = endOfMonth(now);
    } else if (rangePreset === 'lastMonth') {
      const lastMonthDate = subMonths(now, 1);
      rangeStart = startOfMonth(lastMonthDate);
      rangeEnd = endOfMonth(lastMonthDate);
    } else if (rangePreset === 'custom' && customRange.start && customRange.end) {
      const parsedStart = parseISO(customRange.start);
      const parsedEnd = parseISO(customRange.end);
      if (isValid(parsedStart) && isValid(parsedEnd)) {
        rangeStart = startOfDay(parsedStart);
        rangeEnd = endOfDay(parsedEnd);
      }
    }

    const isWithinRange = (logDate) => {
      const parsedDate = parse(logDate || '', 'do MMM yyyy', new Date());
      if (!isValid(parsedDate)) return false;
      const normalizedDate = startOfDay(parsedDate);
      if (!rangeStart || !rangeEnd) return false;
      if (normalizedDate < rangeStart) return false;
      if (normalizedDate > startOfDay(rangeEnd)) return false;
      return true;
    };

    const filteredLogs = [];

    Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
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
  }, [users, clients, clientLogs, rangePreset, customRange]);

  return (
    <div className="min-h-full p-4 space-y-4 text-left animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-2">
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

        {/* Trend Chart */}
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
    </div>
  );
};

export default UserMetricsView;
