import React, { useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { getOwnerScope, scopeClientLogs } from './shared/clientScope';
import {
  filterLogsByDepartments,
  buildReportRows,
  buildClientSummary,
  buildEmployeeSummary,
} from './shared/reportingAggregation';

const ReportsView = ({ users = [], clients = [], clientLogs = {}, currentUser = null, departments = [], canSeeAllData = false }) => {
  const [activeView, setActiveView] = useState('client');
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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

  const filteredClientLogs = useMemo(() => {
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
  }, [clientLogs, currentUser, ownerScope, selectedClientId, effectiveAllData, selectedDepts]);

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((user) => map.set(String(user.id), user));
    return map;
  }, [users]);

  const clientsById = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => map.set(String(client.id), client));
    return map;
  }, [clients]);

  const allRows = useMemo(
    () => buildReportRows({ clientLogs: filteredClientLogs, clientsById, usersById, dateFrom, dateTo }),
    [filteredClientLogs, clientsById, usersById, dateFrom, dateTo]
  );

  const clientSummary = useMemo(() => buildClientSummary(allRows), [allRows]);

  const employeeSummary = useMemo(() => buildEmployeeSummary(allRows), [allRows]);


  const combinedSummary = useMemo(() => {
    return allRows
      .slice()
      .sort((a, b) => b.hoursSpent - a.hoursSpent)
      .map((row) => ({
        entityName: row.entityName,
        clientName: row.clientName,
        employeeName: row.employeeName,
        category: row.category,
        taskDescription: row.taskDescription || '-',
        taskName: row.taskName || '-',
        date: row.date || '-',
        status: row.status || '-',
        hoursSpent: row.hoursSpent,
        billable: row.billable,
        estimatedHours: row.hasEstimate ? row.estimatedHours : null,
        variance: row.hasEstimate ? Number((row.hoursSpent - row.estimatedHours).toFixed(2)) : null,
      }));
  }, [allRows]);

  const escapeCsvCell = (value) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadCsv = (filename, headers, rows) => {
    const csvLines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(','))
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const dateRangeSuffix = () => {
    if (dateFrom && dateTo) return `_${dateFrom}_to_${dateTo}`;
    if (dateFrom) return `_from_${dateFrom}`;
    if (dateTo) return `_to_${dateTo}`;
    return '';
  };

  const handleDownload = () => {
    const suffix = dateRangeSuffix();
    if (activeView === 'client') {
      const headers = ['Entity Name', 'Client Name', 'Avg Hours Spent', 'Total Hours', 'Estimated Hours', 'Variance (Actual - Est)', 'Task Count', 'Billable Hours', 'Billable Tasks', 'Non-Billable Hours', 'Non-Billable Tasks', 'Category Breakdown'];
      const rows = clientSummary.map((row) => [row.entityName, row.clientName, row.avgHours, row.totalHours, row.totalEstimatedHours ?? '', row.variance ?? '', row.taskCount, row.billableHours, row.billableCount, row.nonBillableHours, row.nonBillableCount, row.categories.map(c => `${c.name} (${c.hours}h)`).join('; ')]);
      downloadCsv(`client-reports${suffix}.csv`, headers, rows);
      return;
    }

    if (activeView === 'employee') {
      const headers = ['Employee Name', 'Avg Hours', 'Total Hours', 'Estimated Hours', 'Variance (Actual - Est)', 'Task Count', 'Billable Hours', 'Billable Tasks', 'Non-Billable Hours', 'Non-Billable Tasks', 'Clients Worked', 'Time Per Client', 'Time Per Task Category'];
      const rows = employeeSummary.map((row) => [
        row.employeeName,
        row.avgHours,
        row.totalHours,
        row.totalEstimatedHours ?? '',
        row.variance ?? '',
        row.taskCount,
        row.billableHours,
        row.billableCount,
        row.nonBillableHours,
        row.nonBillableCount,
        row.clientsWorked,
        row.clientBreakdown.map(c => `${c.name} (${c.hours}h)`).join('; '),
        row.taskBreakdown.map(c => `${c.name} (${c.hours}h)`).join('; ')
      ]);
      downloadCsv(`employee-reports${suffix}.csv`, headers, rows);
      return;
    }

    const headers = ['Entity', 'Client', 'Employee', 'Category', 'Task', 'Description', 'Date', 'Status', 'Billable', 'Hours Spent', 'Estimated Hours', 'Variance (Actual - Est)'];
    const rows = combinedSummary.map((row) => [
      row.entityName,
      row.clientName,
      row.employeeName,
      row.category,
      row.taskName,
      row.taskDescription,
      row.date,
      row.status,
      row.billable ? 'Billable' : 'Non-Billable',
      row.hoursSpent,
      row.estimatedHours ?? '',
      row.variance ?? '',
    ]);
    downloadCsv(`combined-reports${suffix}.csv`, headers, rows);
  };

  return (
    <div className="min-h-full text-left space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Reports</h3>
          <p className="text-xs font-medium text-slate-500 mt-1">Client, employee, and combined performance views with CSV download.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range pickers */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all"
              title="Clear date filter"
            >
              <X size={11} /> Clear dates
            </button>
          )}

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
                <div className="absolute top-full mt-1 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 min-w-[180px]">
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
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
          >
            <Download size={14} /> Download CSV
          </button>
        </div>
      </div>

      <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
        {[
          { id: 'client', label: 'Client View' },
          { id: 'employee', label: 'Employee View' },
          { id: 'combined', label: 'Combined View' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveView(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${activeView === tab.id ? 'bg-white text-slate-900 border-slate-900' : 'bg-white text-slate-700 border-transparent hover:border-slate-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeView === 'client' && (
        <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Entity Name</th>
                  <th className="px-4 py-3 text-left">Client Name</th>
                  <th className="px-4 py-3 text-right">Avg Hours</th>
                  <th className="px-4 py-3 text-right">Total Hours</th>
                  <th className="px-4 py-3 text-right">Est. Hours</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-right">Tasks</th>
                  <th className="px-4 py-3 text-left">Billable / Non-Billable</th>
                  <th className="px-4 py-3 text-left">Category Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientSummary.map((row) => (
                  <tr key={`${row.entityName}-${row.clientName}`} className="bg-white hover:bg-slate-50 transition-all">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.entityName}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.clientName}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.avgHours}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.totalHours}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                      {row.totalEstimatedHours !== null ? row.totalEstimatedHours : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {row.variance !== null ? (
                        <span className={row.variance > 0 ? 'text-red-600' : row.variance < 0 ? 'text-emerald-600' : 'text-slate-700'}>
                          {row.variance > 0 ? `+${row.variance}` : row.variance}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.taskCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700 whitespace-nowrap">
                          Billable: {row.billableHours}h / {row.billableCount}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600 whitespace-nowrap">
                          Non-Bill: {row.nonBillableHours}h / {row.nonBillableCount}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.categories.length ? row.categories.map(({ name, hours }) => (
                          <span key={name} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 whitespace-nowrap">
                            {name} <span className="text-blue-600 font-semibold">{hours}h</span>
                          </span>
                        )) : <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!clientSummary.length && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm font-medium text-slate-500">No client task data available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'employee' && (
        <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Employee</th>
                  <th className="px-4 py-3 text-right">Avg Hours</th>
                  <th className="px-4 py-3 text-right">Total Hours</th>
                  <th className="px-4 py-3 text-right">Est. Hours</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-right">Clients</th>
                  <th className="px-4 py-3 text-left">Billable / Non-Billable</th>
                  <th className="px-4 py-3 text-left">Time Per Client</th>
                  <th className="px-4 py-3 text-left">Time Per Task Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeSummary.map((row) => (
                  <tr key={row.employeeName} className="bg-white hover:bg-slate-50 transition-all">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.employeeName}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.avgHours}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.totalHours}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                      {row.totalEstimatedHours !== null ? row.totalEstimatedHours : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {row.variance !== null ? (
                        <span className={row.variance > 0 ? 'text-red-600' : row.variance < 0 ? 'text-emerald-600' : 'text-slate-700'}>
                          {row.variance > 0 ? `+${row.variance}` : row.variance}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.clientsWorked}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700 whitespace-nowrap">
                          Billable: {row.billableHours}h / {row.billableCount}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600 whitespace-nowrap">
                          Non-Bill: {row.nonBillableHours}h / {row.nonBillableCount}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.clientBreakdown.length ? row.clientBreakdown.map(({ name, hours }) => (
                          <span key={name} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 whitespace-nowrap">
                            {name} <span className="text-emerald-600 font-semibold">{hours}h</span>
                          </span>
                        )) : <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.taskBreakdown.length ? row.taskBreakdown.map(({ name, hours }) => (
                          <span key={name} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 whitespace-nowrap">
                            {name} <span className="text-blue-600 font-semibold">{hours}h</span>
                          </span>
                        )) : <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!employeeSummary.length && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm font-medium text-slate-500">No employee task data available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'combined' && (
        <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Employee</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Task</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Billable</th>
                  <th className="px-4 py-3 text-right">Actual</th>
                  <th className="px-4 py-3 text-right">Est.</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {combinedSummary.map((row, index) => (
                  <tr key={`${row.entityName}-${row.clientName}-${row.employeeName}-${row.category}-${index}`} className="bg-white hover:bg-slate-50 transition-all">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.entityName}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.clientName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.employeeName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.category}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <p className="font-medium text-slate-800 truncate max-w-[120px]" title={row.taskName !== '-' ? row.taskName : undefined}>{row.taskName !== '-' ? row.taskName : row.taskDescription}</p>
                      {row.taskName !== '-' && <p className="text-xs text-slate-500 truncate max-w-[120px]">{row.taskDescription}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.status}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${row.billable ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        {row.billable ? 'Billable' : 'Non-Bill'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.hoursSpent}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                      {row.estimatedHours !== null ? row.estimatedHours : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {row.variance !== null ? (
                        <span className={row.variance > 0 ? 'text-red-600' : row.variance < 0 ? 'text-emerald-600' : 'text-slate-700'}>
                          {row.variance > 0 ? `+${row.variance}` : row.variance}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
                {!combinedSummary.length && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm font-medium text-slate-500">No combined report data available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;
