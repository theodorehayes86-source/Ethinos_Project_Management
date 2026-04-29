import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";
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
  estimatedMs?: number | null;
  timeTaken: string | null;
  creatorName: string;
  assignee?: { id: string; name: string } | string;
  timerState?: string;
  timerStartedAt?: number;
  billable?: boolean;
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

/** Tasks default to billable; only explicitly false means non-billable. */
function isBillable(task: { billable?: boolean }): boolean {
  return task.billable !== false;
}

interface BillableSummary {
  billableHours: number;
  billableCount: number;
  nonBillableHours: number;
  nonBillableCount: number;
}

function buildBillableSummary(taskList: FilteredTask[]): BillableSummary {
  let billableHours = 0, billableCount = 0;
  let nonBillableHours = 0, nonBillableCount = 0;
  for (const t of taskList) {
    const h = hoursFromMs(t.elapsedMs || 0);
    if (isBillable(t)) {
      billableHours = Math.round((billableHours + h) * 100) / 100;
      billableCount += 1;
    } else {
      nonBillableHours = Math.round((nonBillableHours + h) * 100) / 100;
      nonBillableCount += 1;
    }
  }
  return { billableHours, billableCount, nonBillableHours, nonBillableCount };
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
  billableFilter: boolean | null,
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

      // Billable filter: null = all, true = billable only, false = non-billable only
      if (billableFilter !== null && isBillable(log) !== billableFilter) continue;

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

function parseBillableFilter(param: unknown): boolean | null {
  if (param === "true") return true;
  if (param === "false") return false;
  return null;
}

/* ─── Middleware: API key check ─── */

const expected = process.env.PMT_EXPORT_API_KEY;
if (!expected) {
  console.warn("[Export] PMT_EXPORT_API_KEY is not set — all export requests will be rejected");
}

function apiKeyMatches(provided: string, secret: string): boolean {
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.use((req, res, next) => {
  const apiKey = req.header("x-admin-api-key");

  if (!expected) {
    res.status(503).json({ error: "Export API is not configured (PMT_EXPORT_API_KEY missing)" });
    return;
  }
  if (!apiKey || !apiKeyMatches(apiKey, expected)) {
    res.status(401).json({ error: "Invalid or missing API key. Pass it as the x-admin-api-key header." });
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
 *   billable   "true" = billable only | "false" = non-billable only  optional
 *   detail     "true" to include raw task list
 */
router.get("/hours", async (req, res): Promise<void> => {
  const fromDate = parseOptionalDate(req.query.from);
  const toDate = parseOptionalDate(req.query.to);
  const clientIdFilter = typeof req.query.clientId === "string" ? req.query.clientId : null;
  const categoryFilter = typeof req.query.category === "string" ? req.query.category : null;
  const billableFilter = parseBillableFilter(req.query.billable);
  const includeDetail = req.query.detail === "true";

  req.log.info({ fromDate, toDate, clientIdFilter, categoryFilter, billableFilter }, "Fetching export hours");

  const tasks = await fetchFilteredTasks(fromDate, toDate, clientIdFilter, categoryFilter, billableFilter);

  type CategoryEntry = {
    hours: number;
    taskCount: number;
    billableHours: number;
    billableCount: number;
    nonBillableHours: number;
    nonBillableCount: number;
    tasks: FilteredTask[];
  };

  const byCategory = new Map<string, CategoryEntry>();

  for (const task of tasks) {
    const cat = task.category || "Uncategorised";
    if (!byCategory.has(cat)) {
      byCategory.set(cat, { hours: 0, taskCount: 0, billableHours: 0, billableCount: 0, nonBillableHours: 0, nonBillableCount: 0, tasks: [] });
    }
    const entry = byCategory.get(cat)!;
    const h = hoursFromMs(task.elapsedMs || 0);
    entry.hours = Math.round((entry.hours + h) * 100) / 100;
    entry.taskCount += 1;
    if (isBillable(task)) {
      entry.billableHours = Math.round((entry.billableHours + h) * 100) / 100;
      entry.billableCount += 1;
    } else {
      entry.nonBillableHours = Math.round((entry.nonBillableHours + h) * 100) / 100;
      entry.nonBillableCount += 1;
    }
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
      billableHours: data.billableHours,
      billableCount: data.billableCount,
      nonBillableHours: data.nonBillableHours,
      nonBillableCount: data.nonBillableCount,
      ...buildQcSummary(data.tasks),
      ...(includeDetail ? {
        tasks: data.tasks.map(t => ({
          ...t,
          billable: isBillable(t),
          qcStatus: t.qcStatus ?? null,
          qcRating: t.qcRating ?? null,
          qcFeedback: t.qcFeedback ?? null,
        })),
      } : {}),
    }))
    .sort((a, b) => b.hours - a.hours);

  const totalHours = categoryRows.reduce((s, r) => s + r.hours, 0);
  const totalTasks = categoryRows.reduce((s, r) => s + r.taskCount, 0);
  const totalBillable = buildBillableSummary(tasks);

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDate?.toISOString().slice(0, 10) ?? null,
      to: toDate?.toISOString().slice(0, 10) ?? null,
    },
    filters: {
      clientId: clientIdFilter,
      category: categoryFilter,
      billable: billableFilter,
    },
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalTasks,
      categories: categoryRows.length,
      ...totalBillable,
    },
    byCategory: categoryRows,
  });
});

/* ─── GET /api/export/hours/by-client ─── */

/**
 * Returns task hours grouped first by client, then by category.
 *
 * Query params:
 *   from       ISO date (e.g. 2026-04-01)  optional
 *   to         ISO date (e.g. 2026-04-30)  optional
 *   clientId   filter to a specific client  optional
 *   category   filter to a specific tag     optional
 *   billable   "true" = billable only | "false" = non-billable only  optional
 *   detail     "true" to include raw task list per category
 */
router.get("/hours/by-client", async (req, res): Promise<void> => {
  const fromDate = parseOptionalDate(req.query.from);
  const toDate = parseOptionalDate(req.query.to);
  const clientIdFilter = typeof req.query.clientId === "string" ? req.query.clientId : null;
  const categoryFilter = typeof req.query.category === "string" ? req.query.category : null;
  const billableFilter = parseBillableFilter(req.query.billable);
  const includeDetail = req.query.detail === "true";

  req.log.info({ fromDate, toDate, billableFilter }, "Fetching export hours by-client");

  const tasks = await fetchFilteredTasks(fromDate, toDate, clientIdFilter, categoryFilter, billableFilter);

  type CatEntry = {
    hours: number;
    taskCount: number;
    billableHours: number;
    billableCount: number;
    nonBillableHours: number;
    nonBillableCount: number;
    tasks?: FilteredTask[];
  };

  type ClientEntry = {
    clientId: string;
    clientName: string;
    totalHours: number;
    totalTasks: number;
    billableHours: number;
    billableCount: number;
    nonBillableHours: number;
    nonBillableCount: number;
    byCategory: Record<string, CatEntry>;
  };

  const byClient = new Map<string, ClientEntry>();

  for (const task of tasks) {
    if (!byClient.has(task.clientId)) {
      byClient.set(task.clientId, {
        clientId: task.clientId,
        clientName: task.clientName,
        totalHours: 0,
        totalTasks: 0,
        billableHours: 0,
        billableCount: 0,
        nonBillableHours: 0,
        nonBillableCount: 0,
        byCategory: {},
      });
    }
    const entry = byClient.get(task.clientId)!;
    const cat = task.category || "Uncategorised";
    if (!entry.byCategory[cat]) {
      entry.byCategory[cat] = {
        hours: 0, taskCount: 0,
        billableHours: 0, billableCount: 0,
        nonBillableHours: 0, nonBillableCount: 0,
        ...(includeDetail ? { tasks: [] } : {}),
      };
    }
    const h = hoursFromMs(task.elapsedMs || 0);
    const catEntry = entry.byCategory[cat];
    catEntry.hours = Math.round((catEntry.hours + h) * 100) / 100;
    catEntry.taskCount += 1;
    entry.totalHours = Math.round((entry.totalHours + h) * 100) / 100;
    entry.totalTasks += 1;
    if (isBillable(task)) {
      catEntry.billableHours = Math.round((catEntry.billableHours + h) * 100) / 100;
      catEntry.billableCount += 1;
      entry.billableHours = Math.round((entry.billableHours + h) * 100) / 100;
      entry.billableCount += 1;
    } else {
      catEntry.nonBillableHours = Math.round((catEntry.nonBillableHours + h) * 100) / 100;
      catEntry.nonBillableCount += 1;
      entry.nonBillableHours = Math.round((entry.nonBillableHours + h) * 100) / 100;
      entry.nonBillableCount += 1;
    }
    if (includeDetail) catEntry.tasks!.push(task);
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
  const totalBillable = buildBillableSummary(tasks);

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDate?.toISOString().slice(0, 10) ?? null,
      to: toDate?.toISOString().slice(0, 10) ?? null,
    },
    filters: {
      clientId: clientIdFilter,
      category: categoryFilter,
      billable: billableFilter,
    },
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalTasks,
      clients: clientRows.length,
      ...totalBillable,
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
 *   billable   "true" = billable only | "false" = non-billable only  optional
 *   groupBy    "category" (default) | "client" | "both"
 *   detail     "true" to include raw task list per group
 */
router.get("/hours/by-date", async (req, res): Promise<void> => {
  const fromDate = parseOptionalDate(req.query.from);
  const toDate = parseOptionalDate(req.query.to);
  const clientIdFilter = typeof req.query.clientId === "string" ? req.query.clientId : null;
  const categoryFilter = typeof req.query.category === "string" ? req.query.category : null;
  const billableFilter = parseBillableFilter(req.query.billable);
  const includeDetail = req.query.detail === "true";
  const groupBy = typeof req.query.groupBy === "string" ? req.query.groupBy : "category";

  req.log.info({ fromDate, toDate, groupBy, billableFilter }, "Fetching export hours by-date");

  const tasks = await fetchFilteredTasks(fromDate, toDate, clientIdFilter, categoryFilter, billableFilter);

  type SubGroup = {
    hours: number;
    taskCount: number;
    billableHours: number;
    billableCount: number;
    nonBillableHours: number;
    nonBillableCount: number;
    tasks?: FilteredTask[];
  };

  type DateEntry = {
    date: string;
    totalHours: number;
    totalTasks: number;
    billableHours: number;
    billableCount: number;
    nonBillableHours: number;
    nonBillableCount: number;
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
        billableHours: 0,
        billableCount: 0,
        nonBillableHours: 0,
        nonBillableCount: 0,
        ...(groupBy === "category" || groupBy === "both" ? { byCategory: {} } : {}),
        ...(groupBy === "client" || groupBy === "both" ? { byClient: {} } : {}),
      });
    }
    const entry = byDate.get(dateKey)!;
    const h = hoursFromMs(task.elapsedMs || 0);
    const billable = isBillable(task);

    entry.totalHours = Math.round((entry.totalHours + h) * 100) / 100;
    entry.totalTasks += 1;
    if (billable) {
      entry.billableHours = Math.round((entry.billableHours + h) * 100) / 100;
      entry.billableCount += 1;
    } else {
      entry.nonBillableHours = Math.round((entry.nonBillableHours + h) * 100) / 100;
      entry.nonBillableCount += 1;
    }

    if (entry.byCategory !== undefined) {
      const cat = task.category || "Uncategorised";
      if (!entry.byCategory[cat]) {
        entry.byCategory[cat] = {
          hours: 0, taskCount: 0,
          billableHours: 0, billableCount: 0,
          nonBillableHours: 0, nonBillableCount: 0,
          ...(includeDetail ? { tasks: [] } : {}),
        };
      }
      const sg = entry.byCategory[cat];
      sg.hours = Math.round((sg.hours + h) * 100) / 100;
      sg.taskCount += 1;
      if (billable) {
        sg.billableHours = Math.round((sg.billableHours + h) * 100) / 100;
        sg.billableCount += 1;
      } else {
        sg.nonBillableHours = Math.round((sg.nonBillableHours + h) * 100) / 100;
        sg.nonBillableCount += 1;
      }
      if (includeDetail) sg.tasks!.push(task);
    }

    if (entry.byClient !== undefined) {
      const cid = task.clientId;
      if (!entry.byClient[cid]) {
        entry.byClient[cid] = {
          clientName: task.clientName,
          hours: 0, taskCount: 0,
          billableHours: 0, billableCount: 0,
          nonBillableHours: 0, nonBillableCount: 0,
          ...(includeDetail ? { tasks: [] } : {}),
        };
      }
      const sg = entry.byClient[cid];
      sg.hours = Math.round((sg.hours + h) * 100) / 100;
      sg.taskCount += 1;
      if (billable) {
        sg.billableHours = Math.round((sg.billableHours + h) * 100) / 100;
        sg.billableCount += 1;
      } else {
        sg.nonBillableHours = Math.round((sg.nonBillableHours + h) * 100) / 100;
        sg.nonBillableCount += 1;
      }
      if (includeDetail) sg.tasks!.push(task);
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
  const totalBillable = buildBillableSummary(tasks);

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDate?.toISOString().slice(0, 10) ?? null,
      to: toDate?.toISOString().slice(0, 10) ?? null,
    },
    filters: {
      clientId: clientIdFilter,
      category: categoryFilter,
      billable: billableFilter,
      groupBy,
    },
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalTasks,
      days: dateRows.length,
      ...totalBillable,
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
