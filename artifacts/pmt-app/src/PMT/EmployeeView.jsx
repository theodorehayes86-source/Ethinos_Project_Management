import React, { useMemo, useState } from 'react';
import {
  parse,
  parseISO,
  isValid,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths
} from 'date-fns';

const EXECUTION_ROLES = ['Snr Executive', 'Executive', 'Intern'];

const parseTimeTaken = (timeTaken = '') => {
  if (!timeTaken || typeof timeTaken !== 'string') return 0;
  const parts = timeTaken.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
};

const formatHours = (seconds = 0) => `${(seconds / 3600).toFixed(1)}h`;

const EmployeeView = ({ users = [], regions = [], clients = [], clientLogs = {} }) => {
  const [rangePreset, setRangePreset] = useState('last7');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [selectedDirector, setSelectedDirector] = useState('All');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchOptions = useMemo(() => {
    const executionUsers = users.filter(user => EXECUTION_ROLES.includes(user.role));
    const baseUsers = executionUsers.length ? executionUsers : users;

    return [...new Set([
      ...baseUsers.map(user => user.name).filter(Boolean),
      ...clients.map(client => client.name).filter(Boolean)
    ])].sort((left, right) => left.localeCompare(right));
  }, [users, clients]);

  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return searchOptions
      .filter(option => option.toLowerCase().startsWith(query))
      .slice(0, 12);
  }, [searchOptions, searchQuery]);

  const analytics = useMemo(() => {
    const clientNameById = Object.fromEntries(clients.map(client => [client.id, client.name]));
    const usersById = new Map(users.map(user => [user.id, user]));
    const usersByName = new Map(users.map(user => [user.name?.toLowerCase(), user]));
    const directorUsers = users.filter(user => user.role === 'Director' || user.role === 'Business Head');
    const directorProjectsMap = new Map(
      directorUsers.map(director => [
        director.id,
        new Set((director.assignedProjects || []).map(project => project?.toLowerCase()).filter(Boolean))
      ])
    );

    const executionUsers = users.filter(user => EXECUTION_ROLES.includes(user.role));
    const targetUsers = executionUsers.length ? executionUsers : users;

    const allRegions = regions.length ? regions : [...new Set(users.map(user => user.region).filter(Boolean))];

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

    if (!rangeStart || !rangeEnd) {
      return {
        totalAvgSeconds: 0,
        totalDone: 0,
        totalPending: 0,
        lowHourEmployees: [],
        regionRows: allRegions.map(region => ({
          region,
          employeeCount: 0,
          avgSeconds: 0,
          done: 0,
          pending: 0
          })),
          directorRows: directorUsers.map(director => ({
            director: director.name,
            employeeCount: 0,
            avgSeconds: 0,
            done: 0,
            pending: 0
          })),
          categoryRows: []
      };
    }

      const normalizedSearch = searchQuery.trim().toLowerCase();
      const selectedDirectorProjects = selectedDirector === 'All'
        ? null
        : (directorProjectsMap.get(Number(selectedDirector)) || new Set());

    const selectedRegionUsers = selectedRegion === 'All'
      ? targetUsers
      : targetUsers.filter(user => user.region === selectedRegion);

    const userSearchMatchedIds = new Set(
      selectedRegionUsers
        .filter(user => {
          if (!normalizedSearch) return true;
          const matchesName = user.name?.toLowerCase().includes(normalizedSearch);
          const matchesAssignedClient = (user.assignedProjects || []).some(project =>
            project?.toLowerCase().includes(normalizedSearch)
          );
          return matchesName || matchesAssignedClient;
        })
        .map(user => user.id)
    );

    const selectedIds = new Set(selectedRegionUsers.map(user => user.id));

    const perEmployee = new Map(
      selectedRegionUsers.map(user => [user.id, {
        id: user.id,
        name: user.name,
        region: user.region || 'Unassigned',
        totalSeconds: 0,
        done: 0,
        pending: 0,
        dates: new Set()
      }])
    );

    const perRegion = new Map();
    allRegions.forEach(region => {
      perRegion.set(region, { region, totalSeconds: 0, done: 0, pending: 0, userIds: new Set(), daySet: new Set() });
    });
    const perDirector = new Map();
    directorUsers.forEach(director => {
      perDirector.set(director.id, {
        director: director.name,
        totalSeconds: 0,
        done: 0,
        pending: 0,
        userIds: new Set(),
        daySet: new Set()
      });
    });
    const perCategory = new Map();

    Object.entries(clientLogs || {}).forEach(([clientId, logs = []]) => {
      const projectName = clientNameById[clientId] || '';
      const projectNameLower = projectName.toLowerCase();
      const projectMatchesSearch = !normalizedSearch || projectNameLower.includes(normalizedSearch);
      if (selectedDirectorProjects && !selectedDirectorProjects.has(projectNameLower)) return;

      logs.forEach(log => {
        const parsedDate = parse(log.date || '', 'do MMM yyyy', new Date());
        if (!isValid(parsedDate)) return;
        const day = startOfDay(parsedDate);
        if (day < rangeStart || day > startOfDay(rangeEnd)) return;

        let user = null;
        if (log.creatorId && usersById.has(log.creatorId)) {
          user = usersById.get(log.creatorId);
        } else if (log.creatorName && usersByName.has(log.creatorName.toLowerCase())) {
          user = usersByName.get(log.creatorName.toLowerCase());
        }
        if (!user) return;
        if (!selectedIds.has(user.id)) return;
        if (normalizedSearch && !userSearchMatchedIds.has(user.id) && !projectMatchesSearch) return;

        const durationInSeconds = Math.floor((log.elapsedMs || 0) / 1000) || parseTimeTaken(log.timeTaken);
        const status = log.status || 'Pending';
        const categoryName = log.category || 'General';

        const item = perEmployee.get(user.id);
        if (!item) return;

        item.totalSeconds += durationInSeconds;
        item.dates.add(day.getTime());
        if (status === 'Done') item.done += 1;
        if (status === 'Pending') item.pending += 1;

        const regionKey = user.region || 'Unassigned';
        if (!perRegion.has(regionKey)) {
          perRegion.set(regionKey, { region: regionKey, totalSeconds: 0, done: 0, pending: 0, userIds: new Set(), daySet: new Set() });
        }
        const regionItem = perRegion.get(regionKey);
        regionItem.totalSeconds += durationInSeconds;
        if (status === 'Done') regionItem.done += 1;
        if (status === 'Pending') regionItem.pending += 1;
        regionItem.userIds.add(user.id);
        regionItem.daySet.add(day.getTime());

        directorUsers.forEach(director => {
          const projects = directorProjectsMap.get(director.id) || new Set();
          if (!projects.has(projectNameLower)) return;

          const directorItem = perDirector.get(director.id);
          if (!directorItem) return;
          directorItem.totalSeconds += durationInSeconds;
          if (status === 'Done') directorItem.done += 1;
          if (status === 'Pending') directorItem.pending += 1;
          directorItem.userIds.add(user.id);
          directorItem.daySet.add(day.getTime());
        });

        if (!perCategory.has(categoryName)) {
          perCategory.set(categoryName, { category: categoryName, totalSeconds: 0, taskCount: 0 });
        }
        const categoryItem = perCategory.get(categoryName);
        categoryItem.totalSeconds += durationInSeconds;
        categoryItem.taskCount += 1;
      });
    });

    const employeeRows = Array.from(perEmployee.values()).map(item => {
      const activeDays = item.dates.size || 1;
      const avgDailySeconds = Math.floor(item.totalSeconds / activeDays);
      return { ...item, avgDailySeconds };
    });

    const scopedEmployeeRows = employeeRows.filter(item => {
      if (!normalizedSearch) return true;
      return item.totalSeconds > 0 || userSearchMatchedIds.has(item.id);
    });

    const totalDone = scopedEmployeeRows.reduce((sum, item) => sum + item.done, 0);
    const totalPending = scopedEmployeeRows.reduce((sum, item) => sum + item.pending, 0);

    const totalAvgSeconds = scopedEmployeeRows.length
      ? Math.floor(scopedEmployeeRows.reduce((sum, item) => sum + item.avgDailySeconds, 0) / scopedEmployeeRows.length)
      : 0;

    const lowHourEmployees = scopedEmployeeRows
      .filter(item => item.avgDailySeconds > 0 && item.avgDailySeconds < 4 * 3600)
      .sort((a, b) => a.avgDailySeconds - b.avgDailySeconds)
      .slice(0, 10);

    const regionRows = Array.from(perRegion.values())
      .map(item => {
        const activeDays = item.daySet.size || 1;
        const employeeCount = item.userIds.size;
        const avgSeconds = employeeCount > 0
          ? Math.floor(item.totalSeconds / employeeCount / activeDays)
          : 0;

        return {
          region: item.region,
          employeeCount,
          avgSeconds,
          done: item.done,
          pending: item.pending
        };
      })
      .filter(row => row.region)
      .sort((a, b) => b.avgSeconds - a.avgSeconds);

    const directorRows = Array.from(perDirector.values())
      .map(item => {
        const activeDays = item.daySet.size || 1;
        const employeeCount = item.userIds.size;
        const avgSeconds = employeeCount > 0
          ? Math.floor(item.totalSeconds / employeeCount / activeDays)
          : 0;

        return {
          director: item.director,
          employeeCount,
          avgSeconds,
          done: item.done,
          pending: item.pending
        };
      })
      .filter(row => row.director)
      .sort((a, b) => b.avgSeconds - a.avgSeconds);

    const categoryRows = Array.from(perCategory.values())
      .map(item => ({
        category: item.category,
        taskCount: item.taskCount,
        avgSeconds: item.taskCount > 0 ? Math.floor(item.totalSeconds / item.taskCount) : 0
      }))
      .sort((a, b) => b.avgSeconds - a.avgSeconds);

    return {
      totalAvgSeconds,
      totalDone,
      totalPending,
      lowHourEmployees,
      regionRows,
      directorRows,
      categoryRows
    };
  }, [users, regions, clients, clientLogs, rangePreset, customRange, selectedDirector, selectedRegion, searchQuery]);

  const availableRegions = ['All', ...(regions.length ? regions : [...new Set(users.map(user => user.region).filter(Boolean))])];
  const availableDirectors = users.filter(user => user.role === 'Director' || user.role === 'Business Head');

  return (
    <div className="min-h-full p-4 space-y-4 text-left animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Employee Insights</h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              placeholder="Search employee or client"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                {filteredSuggestions.map(option => (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={() => {
                      setSearchQuery(option);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={selectedDirector}
            onChange={(e) => setSelectedDirector(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            style={{ backgroundColor: '#ffffff', color: '#000000' }}
          >
            <option value="All" style={{ backgroundColor: '#ffffff', color: '#000000' }}>All Directors</option>
            {availableDirectors.map(director => (
              <option key={director.id} value={director.id} style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                {director.name}
              </option>
            ))}
          </select>

          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            style={{ backgroundColor: '#ffffff', color: '#000000' }}
          >
            {availableRegions.map(region => (
              <option key={region} value={region} style={{ backgroundColor: '#ffffff', color: '#000000' }}>{region}</option>
            ))}
          </select>

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
            <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Working Hours</p>
          <p className="text-lg font-bold text-slate-900 mt-1">{formatHours(analytics.totalAvgSeconds)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tasks Done</p>
          <p className="text-lg font-bold text-emerald-700 mt-1">{analytics.totalDone}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tasks Pending</p>
          <p className="text-lg font-bold text-orange-700 mt-1">{analytics.totalPending}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Task Category View</p>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                <th className="px-4 py-2 text-left">Task Category</th>
                <th className="px-4 py-2 text-left">Tasks</th>
                <th className="px-4 py-2 text-left">Avg Time Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.categoryRows.length > 0 ? (
                analytics.categoryRows.map(row => (
                  <tr key={row.category} className="hover:bg-slate-50 transition-all">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{row.category}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{row.taskCount}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-blue-700">{formatHours(row.avgSeconds)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                    No task category data for selected range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Region-wise View</p>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                  <th className="px-4 py-2 text-left">Region</th>
                  <th className="px-4 py-2 text-left">Employees</th>
                  <th className="px-4 py-2 text-left">Avg Hours</th>
                  <th className="px-4 py-2 text-left">Done</th>
                  <th className="px-4 py-2 text-left">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.regionRows.length > 0 ? (
                  analytics.regionRows.map(row => (
                    <tr key={row.region} className="hover:bg-slate-50 transition-all">
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{row.region}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{row.employeeCount}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-blue-700">{formatHours(row.avgSeconds)}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700">{row.done}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-orange-700">{row.pending}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                      No regional data for selected range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Directors View</p>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                  <th className="px-4 py-2 text-left">Director</th>
                  <th className="px-4 py-2 text-left">Employees</th>
                  <th className="px-4 py-2 text-left">Avg Hours</th>
                  <th className="px-4 py-2 text-left">Done</th>
                  <th className="px-4 py-2 text-left">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.directorRows.length > 0 ? (
                  analytics.directorRows.map(row => (
                    <tr key={row.director} className="hover:bg-slate-50 transition-all">
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{row.director}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{row.employeeCount}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-blue-700">{formatHours(row.avgSeconds)}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700">{row.done}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-orange-700">{row.pending}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs font-medium text-slate-500">
                      No director data for selected range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
};

export default EmployeeView;
