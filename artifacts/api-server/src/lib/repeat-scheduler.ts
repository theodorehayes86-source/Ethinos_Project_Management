import cron from "node-cron";
import { parse, isValid, startOfDay, addDays, addMonths, format } from "date-fns";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { logger } from "./logger";

interface TaskLog {
  id: string | number;
  name?: string;
  comment?: string;
  date?: string;
  dueDate?: string | null;
  repeatFrequency?: string;
  repeatEnd?: string | null;
  lastSpawnedDate?: string | null;
  status?: string;
  archived?: boolean;
  parentTaskId?: string | number;
  repeatGroupId?: string;
  [key: string]: unknown;
}

function parseDateStr(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const formats = ["do MMM yyyy", "d MMM yyyy", "dd MMM yyyy", "yyyy-MM-dd"];
  for (const fmt of formats) {
    try {
      const d = parse(raw, fmt, new Date());
      if (isValid(d)) return d;
    } catch { /* continue */ }
  }
  return null;
}

function getNextDate(frequency: string, fromDate: Date): Date | null {
  switch (frequency) {
    case "Daily":       return startOfDay(addDays(fromDate, 1));
    case "Weekly":      return startOfDay(addDays(fromDate, 7));
    case "Fortnightly": return startOfDay(addDays(fromDate, 14));
    case "Monthly":     return startOfDay(addMonths(fromDate, 1));
    case "Quarterly":   return startOfDay(addMonths(fromDate, 3));
    case "Yearly":      return startOfDay(addMonths(fromDate, 12));
    default:            return null;
  }
}

function shouldSpawn(task: TaskLog, today: Date): boolean {
  const freq = task.repeatFrequency;
  if (!freq || freq === "Once" || freq === "One-time") return false;
  if (task.archived) return false;

  if (task.repeatEnd) {
    const end = parseDateStr(task.repeatEnd);
    if (end && today > end) return false;
  }

  if (task.lastSpawnedDate) {
    const last = parseDateStr(task.lastSpawnedDate);
    if (!last) return false;
    const next = getNextDate(freq, last);
    return next !== null && today >= next;
  }

  // First spawn: trigger once today >= dueDate
  if (!task.dueDate) return false;
  const due = parseDateStr(task.dueDate);
  return due !== null && today >= due;
}

function buildChild(parent: TaskLog, today: Date): TaskLog {
  const freq = parent.repeatFrequency!;

  // New task's dueDate is one interval after the spawn date
  let newDueDate: Date | null = null;
  if (parent.lastSpawnedDate) {
    const last = parseDateStr(parent.lastSpawnedDate)!;
    const spawnBase = getNextDate(freq, last)!;
    newDueDate = getNextDate(freq, spawnBase);
  } else if (parent.dueDate) {
    const origDue = parseDateStr(parent.dueDate)!;
    newDueDate = getNextDate(freq, origDue);
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    ...parent,
    id,
    date: format(today, "do MMM yyyy"),
    dueDate: newDueDate ? format(newDueDate, "do MMM yyyy") : null,
    status: "Pending",
    timerState: "idle",
    timerStartedAt: null,
    elapsedMs: 0,
    timeTaken: null,
    result: "",
    qcStatus: null,
    qcRating: null,
    qcFeedback: null,
    qcReviewedAt: null,
    messages: [],
    links: [],
    steps: parent.steps ? [...(parent.steps as unknown[])] : [],
    assignmentRequests: [],
    repeatFrequency: "Once",
    repeatEnd: null,
    lastSpawnedDate: null,
    parentTaskId: parent.id,
    repeatGroupId: String(parent.repeatGroupId || parent.id),
  };
}

export async function runRepeatCheck(): Promise<void> {
  logger.info("[Repeat] Running repeat-task check");

  try {
    const clientLogsRaw = await readFirebasePath<Record<string, unknown>>("clientLogs");

    if (!clientLogsRaw) {
      logger.info("[Repeat] No clientLogs in Firebase — nothing to check");
      return;
    }

    const today = startOfDay(new Date());
    let spawned = 0;

    for (const [clientId, logsRaw] of Object.entries(clientLogsRaw)) {
      const logsArr: TaskLog[] = Array.isArray(logsRaw)
        ? (logsRaw as TaskLog[])
        : Object.values(logsRaw as Record<string, TaskLog>);

      let modified = false;
      const newChildren: TaskLog[] = [];

      for (let i = 0; i < logsArr.length; i++) {
        const task = logsArr[i];
        if (!task?.id || !shouldSpawn(task, today)) continue;

        const child = buildChild(task, today);
        newChildren.push(child);

        logsArr[i] = {
          ...task,
          lastSpawnedDate: today.toISOString().slice(0, 10),
        };
        modified = true;
        spawned++;

        logger.info(
          { parentId: task.id, childId: child.id, clientId, freq: task.repeatFrequency },
          "[Repeat] Spawned new task instance"
        );
      }

      if (modified) {
        await writeFirebasePath(`clientLogs/${clientId}`, [...logsArr, ...newChildren]);
      }
    }

    logger.info({ spawned }, "[Repeat] Check complete");
  } catch (err) {
    logger.error({ err }, "[Repeat] Error during repeat check");
  }
}

export function startRepeatScheduler(): void {
  // Run at 06:00 daily — one hour before the reminder check at 07:00
  cron.schedule("0 6 * * *", () => {
    runRepeatCheck().catch((err) =>
      logger.error({ err }, "[Repeat] Unhandled error")
    );
  });

  // Also run on startup to catch any missed spawns
  runRepeatCheck().catch((err) =>
    logger.error({ err }, "[Repeat] Error on startup check")
  );

  logger.info("[Repeat] Scheduler started — runs daily at 06:00");
}
