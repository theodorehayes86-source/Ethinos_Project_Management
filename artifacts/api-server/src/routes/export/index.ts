import { Router, type IRouter } from "express";
import { readFirebasePath } from "../../lib/firebase-admin";
import { parse, isValid, parseISO } from "date-fns";

const router: IRouter = Router();

/* ─── Types matching the PMT Firebase structure ─── */

interface TaskLog {
  id: string;
  date: string;
  comment: string;
  result: string;
  status: string;
  category: string;
  elapsedMs: number;
  timeTaken: string | null;
  creatorName: string;
  assignee?: { id: string; name: string } | string;
  timerState?: string;
  timerStartedAt?: number;
  qcEnabled?: boolean;
  qcStatus?: string | null;
  qcRating?: number | null;
  qcFeedback?: string | null;
  qcAssigneeName?: string | null;
  qcReviewerName?: string | null;
  qcReviewedAt?: string | null;
}

interface Client {
  id: string;
  name: string;
  industry?: string;
  region?: string;
}

/* ─── Helpers ─── */

const MS_PER_HOUR = 3_600_000;

function parseTaskDate(raw: string): Date | null {
  if (!raw) return null;
  const formats = [
    "do MMM yyyy",
    "dd MMM yyyy",
    "yyyy-MM-dd",
    "MM/dd/yyyy",
  ];
  for (const fmt of formats) {
    try {
      const d = parse(raw, fmt, new Date());
      if (isValid(d)) return d;
    } catch {
      // continue
    }
  }
  const iso = parseISO(raw);
  return isValid(iso) ? iso : null;
}

function parseOptionalDate(param: unknown): Date | null {
  if (typeof param !== "string" || !param) return null;
  const d = parseISO(param);
  return isValid(d) ? d : null;
}

function hoursFromMs(ms: number): number {
  return Math.round((ms / MS_PER_HOUR) * 100) / 100;
}

interface FilteredTask extends TaskLog {
  clientId: string;
  clientName: string;
}

async function fetchFilteredTasks(
  fromDate: Date | null,
  toDate: Date | null,
  clientId: string | null,
  category: string | null,
): Promise<FilteredTask[]> {
  const [clientLogsRaw, clientsRaw] = await Promise.all([
    readFirebasePath<Record<string, TaskLog[] | Record<string, TaskLog>>>("clientLogs"),
    readFirebasePath<Client[] | Record<string, Client>>("clients"),
  ]);

  const clientMap = new Map<string, string>();
  if (clientsRaw) {
    const clientArr = Array.isArray(clientsRaw)
      ? clientsRaw
      : Object.values(clientsRaw);
    for (const c of clientArr) {
      if (c?.id) clientMap.set(c.id, c.name || c.id);
    }
  }

  const tasks: FilteredTask[] = [];

  if (!clientLogsRaw) return tasks;

  for (const [cid, logsRaw] of Object.entries(clientLogsRaw)) {
    if (clientId && cid !== clientId) continue;

    const clientName = clientMap.get(cid) || cid;
    const logsArr = Array.isArray(logsRaw) ? logsRaw : Object.values(logsRaw);

    for (const log of logsArr) {
      if (!log || !log.id) continue;
      if (category && log.category !== category) continue;

      const taskDate = parseTaskDate(log.date);
      if (fromDate && taskDate && taskDate < fromDate) continue;
      if (toDate && taskDate) {
        const toEnd = new Date(toDate);
        toEnd.setHours(23, 59, 59, 999);
        if (taskDate > toEnd) continue;
      }

      tasks.push({ ...log, clientId: cid, clientName });
    }
  }

  return tasks;
}

/* ─── Middleware: API key check ─── */

router.use((req, res, next) => {
  const apiKey =
    req.headers["x-api-key"] ||
    req.query["apiKey"];

  const expected = process.env.PMT_EXPORT_API_KEY;
  if (!expected) {
    res.status(503).json({ error: "Export API is not configured (PMT_EXPORT_API_KEY missing)" });
    return;
  }
  if (!apiKey || apiKey !== expected) {
    res.status(401).json({ error: "Invalid or missing API key. Pass it as the x-api-key header." });
    return;
  }
  next();
});

/* ─── GET /api/export/hours ─── */

/**
 * Returns task hours grouped by category (tag).
 *
 * Query params:
 *   from       ISO date (e.g. 2026-04-01)  optional
 *   to         ISO date (e.g. 2026-04-30)  optional
 *   clientId   filter to a specific client  optional
 *   category   filter to a specific tag     optional
 *   detail     "true" to include raw task list
 */
router.get("/hours", async (req, res): Promise<void> => {
  const fromDate = parseOptionalDate(req.query.from);
  const toDate = parseOptionalDate(req.query.to);
  const clientIdFilter = typeof req.query.clientId === "string" ? req.query.clientId : null;
  const categoryFilter = typeof req.query.category === "string" ? req.query.category : null;
  const includeDetail = req.query.detail === "true";

  req.log.info({ fromDate, toDate, clientIdFilter, categoryFilter }, "Fetching export hours");

  const tasks = await fetchFilteredTasks(fromDate, toDate, clientIdFilter, categoryFilter);

  const byCategory = new Map<string, { hours: number; taskCount: number; tasks: FilteredTask[] }>();

  for (const task of tasks) {
    const cat = task.category || "Uncategorised";
    if (!byCategory.has(cat)) {
      byCategory.set(cat, { hours: 0, taskCount: 0, tasks: [] });
    }
    const entry = byCategory.get(cat)!;
    entry.hours = Math.round((entry.hours + hoursFromMs(task.elapsedMs || 0)) * 100) / 100;
    entry.taskCount += 1;
    entry.tasks.push(task);
  }

  const buildQcSummary = (taskList: FilteredTask[]) => {
    const qcTasks = taskList.filter(t => t.qcEnabled);
    const rated = qcTasks.filter(t => t.qcRating != null);
    const approved = qcTasks.filter(t => t.qcStatus === "approved").length;
    const returned = qcTasks.filter(t => t.qcStatus === "rejected").length;
    const avgRating = rated.length > 0
      ? Math.round((rated.reduce((s, t) => s + (t.qcRating ?? 0), 0) / rated.length) * 10) / 10
      : null;
    return {
      qcTaskCount: qcTasks.length,
      qcApproved: approved,
      qcReturned: returned,
      qcAvgRating: avgRating,
    };
  };

  const categoryRows = [...byCategory.entries()]
    .map(([category, data]) => ({
      category,
      hours: data.hours,
      taskCount: data.taskCount,
      ...buildQcSummary(data.tasks),
      ...(includeDetail ? {
        tasks: data.tasks.map(t => ({
          ...t,
          qcStatus: t.qcStatus ?? null,
          qcRating: t.qcRating ?? null,
          qcFeedback: t.qcFeedback ?? null,
        })),
      } : {}),
    }))
    .sort((a, b) => b.hours - a.hours);

  const totalHours = categoryRows.reduce((s, r) => s + r.hours, 0);
  const totalTasks = categoryRows.reduce((s, r) => s + r.taskCount, 0);

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDate?.toISOString().slice(0, 10) ?? null,
      to: toDate?.toISOString().slice(0, 10) ?? null,
    },
    filters: {
      clientId: clientIdFilter,
      category: categoryFilter,
    },
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalTasks,
      categories: categoryRows.length,
    },
    byCategory: categoryRows,
  });
});

/* ─── GET /api/export/hours/by-client ─── */

/**
 * Returns task hours grouped first by client, then by category.
 *
 * Same query params as /export/hours.
 */
router.get("/hours/by-client", async (req, res): Promise<void> => {
  const fromDate = parseOptionalDate(req.query.from);
  const toDate = parseOptionalDate(req.query.to);
  const clientIdFilter = typeof req.query.clientId === "string" ? req.query.clientId : null;
  const categoryFilter = typeof req.query.category === "string" ? req.query.category : null;
  const includeDetail = req.query.detail === "true";

  req.log.info({ fromDate, toDate }, "Fetching export hours by-client");

  const tasks = await fetchFilteredTasks(fromDate, toDate, clientIdFilter, categoryFilter);

  type ClientEntry = {
    clientId: string;
    clientName: string;
    totalHours: number;
    totalTasks: number;
    byCategory: Record<string, { hours: number; taskCount: number; tasks?: FilteredTask[] }>;
  };

  const byClient = new Map<string, ClientEntry>();

  for (const task of tasks) {
    if (!byClient.has(task.clientId)) {
      byClient.set(task.clientId, {
        clientId: task.clientId,
        clientName: task.clientName,
        totalHours: 0,
        totalTasks: 0,
        byCategory: {},
      });
    }
    const entry = byClient.get(task.clientId)!;
    const cat = task.category || "Uncategorised";
    if (!entry.byCategory[cat]) {
      entry.byCategory[cat] = { hours: 0, taskCount: 0, ...(includeDetail ? { tasks: [] } : {}) };
    }
    const h = hoursFromMs(task.elapsedMs || 0);
    entry.byCategory[cat].hours = Math.round((entry.byCategory[cat].hours + h) * 100) / 100;
    entry.byCategory[cat].taskCount += 1;
    if (includeDetail) entry.byCategory[cat].tasks!.push(task);
    entry.totalHours = Math.round((entry.totalHours + h) * 100) / 100;
    entry.totalTasks += 1;
  }

  const clientRows = [...byClient.values()]
    .map((c) => ({
      ...c,
      byCategory: Object.entries(c.byCategory)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.hours - a.hours),
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const totalHours = clientRows.reduce((s, r) => s + r.totalHours, 0);
  const totalTasks = clientRows.reduce((s, r) => s + r.totalTasks, 0);

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDate?.toISOString().slice(0, 10) ?? null,
      to: toDate?.toISOString().slice(0, 10) ?? null,
    },
    filters: {
      clientId: clientIdFilter,
      category: categoryFilter,
    },
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalTasks,
      clients: clientRows.length,
    },
    byClient: clientRows,
  });
});

/* ─── GET /api/export/hours/by-date ─── */

/**
 * Returns task hours grouped by calendar date (YYYY-MM-DD), sorted chronologically.
 * Each date entry also contains a breakdown by category and, optionally, by client.
 *
 * Query params:
 *   from       ISO date (e.g. 2026-04-01)  optional
 *   to         ISO date (e.g. 2026-04-30)  optional
 *   clientId   filter to a specific client  optional
 *   category   filter to a specific tag     optional
 *   groupBy    "category" (default) | "client" | "both"
 *   detail     "true" to include raw task list per group
 */
router.get("/hours/by-date", async (req, res): Promise<void> => {
  const fromDate = parseOptionalDate(req.query.from);
  const toDate = parseOptionalDate(req.query.to);
  const clientIdFilter = typeof req.query.clientId === "string" ? req.query.clientId : null;
  const categoryFilter = typeof req.query.category === "string" ? req.query.category : null;
  const includeDetail = req.query.detail === "true";
  const groupBy = typeof req.query.groupBy === "string" ? req.query.groupBy : "category";

  req.log.info({ fromDate, toDate, groupBy }, "Fetching export hours by-date");

  const tasks = await fetchFilteredTasks(fromDate, toDate, clientIdFilter, categoryFilter);

  type SubGroup = { hours: number; taskCount: number; tasks?: FilteredTask[] };
  type DateEntry = {
    date: string;
    totalHours: number;
    totalTasks: number;
    byCategory?: Record<string, SubGroup>;
    byClient?: Record<string, { clientName: string } & SubGroup>;
  };

  const byDate = new Map<string, DateEntry>();

  for (const task of tasks) {
    const taskDate = parseTaskDate(task.date);
    const dateKey = taskDate ? taskDate.toISOString().slice(0, 10) : "unknown";

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, {
        date: dateKey,
        totalHours: 0,
        totalTasks: 0,
        ...(groupBy === "category" || groupBy === "both" ? { byCategory: {} } : {}),
        ...(groupBy === "client" || groupBy === "both" ? { byClient: {} } : {}),
      });
    }
    const entry = byDate.get(dateKey)!;
    const h = hoursFromMs(task.elapsedMs || 0);
    entry.totalHours = Math.round((entry.totalHours + h) * 100) / 100;
    entry.totalTasks += 1;

    if (entry.byCategory !== undefined) {
      const cat = task.category || "Uncategorised";
      if (!entry.byCategory[cat]) {
        entry.byCategory[cat] = { hours: 0, taskCount: 0, ...(includeDetail ? { tasks: [] } : {}) };
      }
      entry.byCategory[cat].hours = Math.round((entry.byCategory[cat].hours + h) * 100) / 100;
      entry.byCategory[cat].taskCount += 1;
      if (includeDetail) entry.byCategory[cat].tasks!.push(task);
    }

    if (entry.byClient !== undefined) {
      const cid = task.clientId;
      if (!entry.byClient[cid]) {
        entry.byClient[cid] = { clientName: task.clientName, hours: 0, taskCount: 0, ...(includeDetail ? { tasks: [] } : {}) };
      }
      entry.byClient[cid].hours = Math.round((entry.byClient[cid].hours + h) * 100) / 100;
      entry.byClient[cid].taskCount += 1;
      if (includeDetail) entry.byClient[cid].tasks!.push(task);
    }
  }

  const dateRows = [...byDate.entries()]
    .map(([, entry]) => ({
      ...entry,
      ...(entry.byCategory
        ? {
            byCategory: Object.entries(entry.byCategory)
              .map(([category, data]) => ({ category, ...data }))
              .sort((a, b) => b.hours - a.hours),
          }
        : {}),
      ...(entry.byClient
        ? {
            byClient: Object.entries(entry.byClient)
              .map(([clientId, data]) => ({ clientId, ...data }))
              .sort((a, b) => b.hours - a.hours),
          }
        : {}),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalHours = dateRows.reduce((s, r) => s + r.totalHours, 0);
  const totalTasks = dateRows.reduce((s, r) => s + r.totalTasks, 0);

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDate?.toISOString().slice(0, 10) ?? null,
      to: toDate?.toISOString().slice(0, 10) ?? null,
    },
    filters: {
      clientId: clientIdFilter,
      category: categoryFilter,
      groupBy,
    },
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalTasks,
      days: dateRows.length,
    },
    byDate: dateRows,
  });
});

/* ─── GET /api/export/categories ─── */

/**
 * Returns the list of unique task categories currently in the database.
 */
router.get("/categories", async (_req, res): Promise<void> => {
  const [categoriesRaw, clientLogsRaw] = await Promise.all([
    readFirebasePath<string[]>("taskCategories"),
    readFirebasePath<Record<string, TaskLog[] | Record<string, TaskLog>>>("clientLogs"),
  ]);

  const fromSettings = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const fromTasks = new Set<string>();
  if (clientLogsRaw) {
    for (const logsRaw of Object.values(clientLogsRaw)) {
      const arr = Array.isArray(logsRaw) ? logsRaw : Object.values(logsRaw);
      for (const log of arr) {
        if (log?.category) fromTasks.add(log.category);
      }
    }
  }

  const all = [...new Set([...fromSettings, ...fromTasks])].filter(Boolean).sort();

  res.json({ categories: all });
});

export default router;
