/**
 * Pure reporting/metrics aggregation shared by UserMetricsView, ReportsView,
 * and the reporting-integrity test suite. Keeping the math here means the UI
 * and the tests exercise the exact same code path — there is no separate,
 * undocumented calculation anywhere else.
 */
import { parse, isValid, startOfDay, format, eachDayOfInterval } from 'date-fns';

/* ─── Duration helpers ─── */

export const formatDuration = (seconds = 0) => {
  const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
};

export const parseTimeTakenSeconds = (timeTaken = '') => {
  if (!timeTaken || typeof timeTaken !== 'string') return 0;
  const parts = timeTaken.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
};

export const parseTimeTakenToHours = (timeTaken) => {
  if (!timeTaken || typeof timeTaken !== 'string') return 0;
  const parts = timeTaken.split(':').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return 0;
  const [hours, minutes, seconds] = parts;
  return hours + (minutes / 60) + (seconds / 3600);
};

/* ─── Date helpers ─── */

export const parseTaskDateToISO = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const ordinal = clean.replace(/(\d+)(st|nd|rd|th)/, '$1');
  const d = new Date(ordinal);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

/** Metrics-style range check on the "do MMM yyyy" log date format. */
export const makeIsWithinRange = (rangeStart, rangeEnd) => (logDate) => {
  const parsedDate = parse(logDate || '', 'do MMM yyyy', new Date());
  if (!isValid(parsedDate)) return false;
  const normalizedDate = startOfDay(parsedDate);
  if (!rangeStart || !rangeEnd) return false;
  if (normalizedDate < rangeStart) return false;
  if (normalizedDate > startOfDay(rangeEnd)) return false;
  return true;
};

/* ─── Department filtering (unchanged behavior for non-owner-scoped roles) ─── */

export function filterLogsByDepartments(clientLogs, { effectiveAllData, selectedDepts = [], userDept }) {
  if (effectiveAllData) {
    if (selectedDepts.length === 0) return clientLogs;
    return Object.fromEntries(
      Object.entries(clientLogs || {}).map(([clientId, logs]) => [
        clientId,
        (logs || []).filter(log => {
          if (!Array.isArray(log.departments) || log.departments.length === 0) return true;
          return log.departments.some(d => selectedDepts.includes(d));
        })
      ])
    );
  }
  return Object.fromEntries(
    Object.entries(clientLogs || {}).map(([clientId, logs]) => [
      clientId,
      (logs || []).filter(log => !Array.isArray(log.departments) || log.departments.length === 0 || log.departments.includes(userDept))
    ])
  );
}

/* ─── Metrics aggregation (UserMetricsView "Performance" tab) ─── */

export function computeMetrics({ clientLogs, clients = [], users = [], rangeStart, rangeEnd }) {
  const isWithinRange = makeIsWithinRange(rangeStart, rangeEnd);
  const clientNameById = Object.fromEntries(clients.map(client => [client.id, client.name]));
  const userMap = new Map();
  const projectMap = new Map();
  const categoryMap = new Map();
  const categoryTaskCountMap = new Map();

  const filteredLogs = [];

  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const projectName = clientNameById[clientId] || 'Unknown Project';

    Object.values(logs || {}).forEach(log => {
      if (!isWithinRange(log.date)) return;
      const durationInSeconds = Math.floor((log.elapsedMs || 0) / 1000) || parseTimeTakenSeconds(log.timeTaken);
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
    categoryTaskCountMap.set(categoryName, (categoryTaskCountMap.get(categoryName) || 0) + 1);

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
    .map(([name, seconds]) => ({
      name,
      seconds,
      taskCount: categoryTaskCountMap.get(name) || 0,
      avgSeconds: categoryTaskCountMap.get(name) ? Math.round(seconds / categoryTaskCountMap.get(name)) : 0,
    }))
    .sort((left, right) => right.seconds - left.seconds);

  const totalSeconds = rows.reduce((total, row) => total + row.totalSeconds, 0);
  const totalTasks = rows.reduce((total, row) => total + row.taskCount, 0);
  const avgTaskSeconds = totalTasks > 0 ? Math.round(totalSeconds / totalTasks) : 0;
  const totalUsers = rows.length;
  const avgUserSeconds = totalUsers > 0 ? Math.round(totalSeconds / totalUsers) : 0;

  const dailyMap = new Map();
  filteredLogs.forEach(log => {
    const dateKey = format(log.date, 'yyyy-MM-dd');
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, { totalSeconds: 0, taskCount: 0, users: new Set() });
    }
    const item = dailyMap.get(dateKey);
    item.totalSeconds += log.durationInSeconds;
    item.taskCount += 1;
    item.users.add(log.userId || `${log.userName}-${log.userRole}`);
  });

  let trendData = [];
  if (rangeStart && rangeEnd && rangeStart <= rangeEnd) {
    trendData = eachDayOfInterval({ start: rangeStart, end: startOfDay(rangeEnd) }).map(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const daily = dailyMap.get(dateKey);
      const userCount = daily?.users.size || 0;
      const avgSeconds = userCount > 0 ? Math.floor(daily.totalSeconds / userCount) : 0;
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
    avgUserSeconds,
    trendData
  };
}

/* ─── Reports aggregation (ReportsView) ─── */

export function buildReportRows({ clientLogs, clientsById, usersById, dateFrom = '', dateTo = '' }) {
  const rows = [];

  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const clientRecord = clientsById.get(String(clientId));
    const entityName = clientRecord?.entityName || '-';
    const clientName = clientRecord?.name || 'Unknown Client';

    Object.values(logs || {}).forEach((log) => {
      const isoDate = parseTaskDateToISO(log?.date);
      if (dateFrom && isoDate && isoDate < dateFrom) return;
      if (dateTo && isoDate && isoDate > dateTo) return;

      const elapsedMs = Number(log?.elapsedMs || 0);
      const fromMsHours = elapsedMs > 0 ? elapsedMs / 3600000 : 0;
      const fromTimeTakenHours = parseTimeTakenToHours(log?.timeTaken);
      const hoursSpent = fromMsHours > 0 ? fromMsHours : fromTimeTakenHours;

      const assigneeId = log?.assigneeId != null ? String(log.assigneeId) : '';
      const assigneeFromMap = assigneeId ? usersById.get(assigneeId) : null;
      const employeeName = assigneeFromMap?.name || log?.assigneeName || log?.creatorName || 'Unassigned';

      const estimatedMs = Number(log?.estimatedMs || 0);
      const estimatedHours = estimatedMs > 0 ? estimatedMs / 3600000 : 0;

      rows.push({
        clientId,
        entityName,
        clientName,
        employeeName,
        category: log?.category || 'Uncategorized',
        taskDescription: log?.comment || '',
        taskName: log?.name || '',
        status: log?.status || '',
        date: log?.date || '',
        hoursSpent: Number(hoursSpent.toFixed(2)),
        billable: log?.billable !== false,
        estimatedHours: Number(estimatedHours.toFixed(2)),
        hasEstimate: estimatedMs > 0,
      });
    });
  });

  return rows;
}

export function buildClientSummary(allRows) {
  const summaryMap = new Map();

  allRows.forEach((row) => {
    const groupKey = `${row.entityName}::${row.clientName}`;
    if (!summaryMap.has(groupKey)) {
      summaryMap.set(groupKey, {
        entityName: row.entityName,
        clientName: row.clientName,
        totalHours: 0,
        totalEstimatedHours: 0,
        estimatedActualHours: 0,
        estimatedTaskCount: 0,
        taskCount: 0,
        billableHours: 0,
        billableCount: 0,
        nonBillableHours: 0,
        nonBillableCount: 0,
        categories: new Map()
      });
    }

    const current = summaryMap.get(groupKey);
    current.totalHours += row.hoursSpent;
    current.taskCount += 1;
    if (row.billable) {
      current.billableHours += row.hoursSpent;
      current.billableCount += 1;
    } else {
      current.nonBillableHours += row.hoursSpent;
      current.nonBillableCount += 1;
    }
    if (row.hasEstimate) {
      current.totalEstimatedHours += row.estimatedHours;
      current.estimatedActualHours += row.hoursSpent;
      current.estimatedTaskCount += 1;
    }
    current.categories.set(row.category, (current.categories.get(row.category) || 0) + row.hoursSpent);
  });

  return Array.from(summaryMap.values()).map((item) => {
    const avgHours = item.taskCount ? item.totalHours / item.taskCount : 0;
    const categoriesArr = Array.from(item.categories.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, hours]) => ({ name, hours: Number(hours.toFixed(2)) }));
    const variance = item.estimatedTaskCount > 0 ? item.estimatedActualHours - item.totalEstimatedHours : null;

    return {
      entityName: item.entityName,
      clientName: item.clientName,
      avgHours: Number(avgHours.toFixed(2)),
      totalHours: Number(item.totalHours.toFixed(2)),
      totalEstimatedHours: item.estimatedTaskCount > 0 ? Number(item.totalEstimatedHours.toFixed(2)) : null,
      variance: variance !== null ? Number(variance.toFixed(2)) : null,
      taskCount: item.taskCount,
      billableHours: Number(item.billableHours.toFixed(2)),
      billableCount: item.billableCount,
      nonBillableHours: Number(item.nonBillableHours.toFixed(2)),
      nonBillableCount: item.nonBillableCount,
      categories: categoriesArr
    };
  }).sort((a, b) => b.totalHours - a.totalHours);
}

export function buildEmployeeSummary(allRows) {
  const summaryMap = new Map();

  allRows.forEach((row) => {
    if (!summaryMap.has(row.employeeName)) {
      summaryMap.set(row.employeeName, {
        employeeName: row.employeeName,
        totalHours: 0,
        totalEstimatedHours: 0,
        estimatedActualHours: 0,
        estimatedTaskCount: 0,
        taskCount: 0,
        billableHours: 0,
        billableCount: 0,
        nonBillableHours: 0,
        nonBillableCount: 0,
        clients: new Map(),
        categories: new Map()
      });
    }

    const current = summaryMap.get(row.employeeName);
    current.totalHours += row.hoursSpent;
    current.taskCount += 1;
    if (row.billable) {
      current.billableHours += row.hoursSpent;
      current.billableCount += 1;
    } else {
      current.nonBillableHours += row.hoursSpent;
      current.nonBillableCount += 1;
    }
    if (row.hasEstimate) {
      current.totalEstimatedHours += row.estimatedHours;
      current.estimatedActualHours += row.hoursSpent;
      current.estimatedTaskCount += 1;
    }
    const clientLabel = row.entityName && row.entityName !== '-' ? `${row.entityName} - ${row.clientName}` : row.clientName;
    current.clients.set(clientLabel, (current.clients.get(clientLabel) || 0) + row.hoursSpent);
    current.categories.set(row.category, (current.categories.get(row.category) || 0) + row.hoursSpent);
  });

  return Array.from(summaryMap.values()).map((item) => {
    const avgHours = item.taskCount ? item.totalHours / item.taskCount : 0;
    const clientBreakdown = Array.from(item.clients.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, hours]) => ({ name, hours: Number(hours.toFixed(2)) }));

    const taskBreakdown = Array.from(item.categories.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, hours]) => ({ name, hours: Number(hours.toFixed(2)) }));

    const variance = item.estimatedTaskCount > 0 ? item.estimatedActualHours - item.totalEstimatedHours : null;

    return {
      employeeName: item.employeeName,
      avgHours: Number(avgHours.toFixed(2)),
      totalHours: Number(item.totalHours.toFixed(2)),
      totalEstimatedHours: item.estimatedTaskCount > 0 ? Number(item.totalEstimatedHours.toFixed(2)) : null,
      variance: variance !== null ? Number(variance.toFixed(2)) : null,
      taskCount: item.taskCount,
      billableHours: Number(item.billableHours.toFixed(2)),
      billableCount: item.billableCount,
      nonBillableHours: Number(item.nonBillableHours.toFixed(2)),
      nonBillableCount: item.nonBillableCount,
      clientsWorked: item.clients.size,
      clientBreakdown,
      taskBreakdown
    };
  }).sort((a, b) => b.totalHours - a.totalHours);
}
