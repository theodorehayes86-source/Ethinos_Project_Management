import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';

const ReportsView = ({ users = [], clients = [], clientLogs = {} }) => {
  const [activeView, setActiveView] = useState('client');

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

  const parseTimeTakenToHours = (timeTaken) => {
    if (!timeTaken || typeof timeTaken !== 'string') return 0;
    const parts = timeTaken.split(':').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return 0;
    const [hours, minutes, seconds] = parts;
    return hours + (minutes / 60) + (seconds / 3600);
  };

  const allRows = useMemo(() => {
    const rows = [];

    Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
      const clientRecord = clientsById.get(String(clientId));
      const entityName = clientRecord?.entityName || '-';
      const clientName = clientRecord?.name || 'Unknown Client';

      (logs || []).forEach((log) => {
        const elapsedMs = Number(log?.elapsedMs || 0);
        const fromMsHours = elapsedMs > 0 ? elapsedMs / 3600000 : 0;
        const fromTimeTakenHours = parseTimeTakenToHours(log?.timeTaken);
        const hoursSpent = fromMsHours > 0 ? fromMsHours : fromTimeTakenHours;

        const assigneeId = log?.assigneeId != null ? String(log.assigneeId) : '';
        const assigneeFromMap = assigneeId ? usersById.get(assigneeId) : null;
        const employeeName = assigneeFromMap?.name || log?.assigneeName || log?.creatorName || 'Unassigned';

        rows.push({
          clientId,
          entityName,
          clientName,
          employeeName,
          category: log?.category || 'Uncategorized',
          taskDescription: log?.comment || '',
          status: log?.status || '',
          date: log?.date || '',
          hoursSpent: Number(hoursSpent.toFixed(2))
        });
      });
    });

    return rows;
  }, [clientLogs, clientsById, usersById]);

  const clientSummary = useMemo(() => {
    const summaryMap = new Map();

    allRows.forEach((row) => {
      const groupKey = `${row.entityName}::${row.clientName}`;
      if (!summaryMap.has(groupKey)) {
        summaryMap.set(groupKey, {
          entityName: row.entityName,
          clientName: row.clientName,
          totalHours: 0,
          taskCount: 0,
          categories: new Map()
        });
      }

      const current = summaryMap.get(groupKey);
      current.totalHours += row.hoursSpent;
      current.taskCount += 1;
      current.categories.set(row.category, (current.categories.get(row.category) || 0) + row.hoursSpent);
    });

    return Array.from(summaryMap.values()).map((item) => {
      const avgHours = item.taskCount ? item.totalHours / item.taskCount : 0;
      const categoryText = Array.from(item.categories.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, hours]) => `${name} (${hours.toFixed(2)}h)`)
        .join(', ');

      return {
        entityName: item.entityName,
        clientName: item.clientName,
        avgHours: Number(avgHours.toFixed(2)),
        totalHours: Number(item.totalHours.toFixed(2)),
        taskCount: item.taskCount,
        categories: categoryText || '-'
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [allRows]);

  const employeeSummary = useMemo(() => {
    const summaryMap = new Map();

    allRows.forEach((row) => {
      if (!summaryMap.has(row.employeeName)) {
        summaryMap.set(row.employeeName, {
          employeeName: row.employeeName,
          totalHours: 0,
          taskCount: 0,
          clients: new Map(),
          categories: new Map()
        });
      }

      const current = summaryMap.get(row.employeeName);
      current.totalHours += row.hoursSpent;
      current.taskCount += 1;
      const clientLabel = row.entityName && row.entityName !== '-' ? `${row.entityName} - ${row.clientName}` : row.clientName;
      current.clients.set(clientLabel, (current.clients.get(clientLabel) || 0) + row.hoursSpent);
      current.categories.set(row.category, (current.categories.get(row.category) || 0) + row.hoursSpent);
    });

    return Array.from(summaryMap.values()).map((item) => {
      const avgHours = item.taskCount ? item.totalHours / item.taskCount : 0;
      const clientBreakdown = Array.from(item.clients.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, hours]) => `${name} (${hours.toFixed(2)}h)`)
        .join(', ');

      const taskBreakdown = Array.from(item.categories.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, hours]) => `${name} (${hours.toFixed(2)}h)`)
        .join(', ');

      return {
        employeeName: item.employeeName,
        avgHours: Number(avgHours.toFixed(2)),
        totalHours: Number(item.totalHours.toFixed(2)),
        taskCount: item.taskCount,
        clientsWorked: item.clients.size,
        clientBreakdown: clientBreakdown || '-',
        taskBreakdown: taskBreakdown || '-'
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [allRows]);

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
        date: row.date || '-',
        status: row.status || '-',
        hoursSpent: row.hoursSpent
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

  const handleDownload = () => {
    if (activeView === 'client') {
      const headers = ['Entity Name', 'Client Name', 'Avg Hours Spent', 'Total Hours', 'Task Count', 'Category Breakdown'];
      const rows = clientSummary.map((row) => [row.entityName, row.clientName, row.avgHours, row.totalHours, row.taskCount, row.categories]);
      downloadCsv('client-reports.csv', headers, rows);
      return;
    }

    if (activeView === 'employee') {
      const headers = ['Employee Name', 'Avg Hours', 'Total Hours', 'Clients Worked', 'Task Count', 'Time Per Client', 'Time Per Task Category'];
      const rows = employeeSummary.map((row) => [
        row.employeeName,
        row.avgHours,
        row.totalHours,
        row.clientsWorked,
        row.taskCount,
        row.clientBreakdown,
        row.taskBreakdown
      ]);
      downloadCsv('employee-reports.csv', headers, rows);
      return;
    }

    const headers = ['Entity', 'Client', 'Employee', 'Category', 'Task', 'Date', 'Status', 'Hours Spent'];
    const rows = combinedSummary.map((row) => [
      row.entityName,
      row.clientName,
      row.employeeName,
      row.category,
      row.taskDescription,
      row.date,
      row.status,
      row.hoursSpent
    ]);
    downloadCsv('combined-reports.csv', headers, rows);
  };

  return (
    <div className="min-h-full text-left space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Reports</h3>
          <p className="text-xs font-medium text-slate-500 mt-1">Client, employee, and combined performance views with CSV download.</p>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
        >
          <Download size={14} /> Download CSV
        </button>
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
                  <th className="px-4 py-3 text-right">Tasks</th>
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
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.taskCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.categories}</td>
                  </tr>
                ))}
                {!clientSummary.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm font-medium text-slate-500">No client task data available yet.</td>
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
                  <th className="px-4 py-3 text-right">Clients</th>
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
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.clientsWorked}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.clientBreakdown}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.taskBreakdown}</td>
                  </tr>
                ))}
                {!employeeSummary.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm font-medium text-slate-500">No employee task data available yet.</td>
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
                  <th className="px-4 py-3 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {combinedSummary.map((row, index) => (
                  <tr key={`${row.entityName}-${row.clientName}-${row.employeeName}-${row.category}-${index}`} className="bg-white hover:bg-slate-50 transition-all">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.entityName}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.clientName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.employeeName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.category}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.taskDescription}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.status}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{row.hoursSpent}</td>
                  </tr>
                ))}
                {!combinedSummary.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm font-medium text-slate-500">No combined report data available yet.</td>
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
