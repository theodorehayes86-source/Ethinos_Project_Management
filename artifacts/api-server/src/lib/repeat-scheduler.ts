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

interface GroupQuestion {
  id: string;
  text: string;
  requiresInput: boolean;
  inputLabel: string;
  order: number;
}

interface TaskGroup {
  id: string;
  name?: string;
  clientId?: string;
  clientName?: string;
  templateId?: string;
  templateName?: string;
  questions?: GroupQuestion[];
  date?: string;
  dueDate?: string | null;
  repeatFrequency?: string;
  repeatEnd?: string | null;
  lastSpawnedDate?: string | null;
  repeatGroupId?: string;
  assigneeId?: string | number;
  assigneeName?: string;
  creatorId?: string | number;
  creatorName?: string;
  creatorRole?: string;
  status?: string;
  archived?: boolean;
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

function shouldSpawnGroup(group: TaskGroup, today: Date): boolean {
  const freq = group.repeatFrequency;
  if (!freq || freq === "Once" || freq === "One-time") return false;
  if (group.archived) return false;
  // Note: completed groups (status === "done") still spawn future instances based on cadence.
  // The status reflects whether the current instance is finished, not whether the recurrence ends.

  if (group.repeatEnd) {
    const end = parseDateStr(group.repeatEnd);
    if (end && today > end) return false;
  }

  if (group.lastSpawnedDate) {
    const last = parseDateStr(group.lastSpawnedDate);
    if (!last) return false;
    const next = getNextDate(freq, last);
    return next !== null && today >= next;
  }

  // First spawn: trigger once today > group date (next interval from creation)
  if (!group.date) return false;
  const groupDate = parseDateStr(group.date);
  if (!groupDate) return false;
  const next = getNextDate(freq, groupDate);
  return next !== null && today >= next;
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
          repeatGroupId: task.repeatGroupId || String(task.id),
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

export async function runGroupRepeatCheck(): Promise<void> {
  logger.info("[GroupRepeat] Running task-group repeat check");

  try {
    const groupsRaw = await readFirebasePath<Record<string, unknown>>("taskGroups");
    if (!groupsRaw) {
      logger.info("[GroupRepeat] No taskGroups in Firebase — nothing to check");
      return;
    }

    const today = startOfDay(new Date());
    let spawned = 0;

    const groupsArr: TaskGroup[] = Array.isArray(groupsRaw)
      ? (groupsRaw as TaskGroup[])
      : Object.values(groupsRaw as Record<string, TaskGroup>);

    const updatedGroups = [...groupsArr];
    const newGroups: TaskGroup[] = [];
    // checklist items to add per client (built from questions template)
    const checklistTasksByClient: Record<string, TaskLog[]> = {};
    // track which parent groups spawned into which new group ids, per client (for standard task replication)
    const standardSpawnsByClient: Record<string, Array<{ parentGroupId: string; newGroupId: string }>> = {};

    for (let i = 0; i < groupsArr.length; i++) {
      const group = groupsArr[i];
      if (!group?.id || !shouldSpawnGroup(group, today)) continue;

      const newGroupId = `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const questions: GroupQuestion[] = Array.isArray(group.questions) ? group.questions : [];

      const newGroup: TaskGroup = {
        ...group,
        id: newGroupId,
        date: format(today, "do MMM yyyy"),
        status: "Pending",
        archived: false,
        lastSpawnedDate: null,
        repeatFrequency: "Once",
        repeatEnd: null,
        repeatGroupId: String(group.repeatGroupId || group.id),
      };
      newGroups.push(newGroup);

      const clientId = group.clientId;
      if (clientId) {
        // 1. Recreate checklist items from the group's questions template
        if (!checklistTasksByClient[clientId]) checklistTasksByClient[clientId] = [];
        questions.forEach((q, idx) => {
          checklistTasksByClient[clientId].push({
            id: `${newGroupId}-q${idx}-${Date.now() + idx}`,
            taskGroupId: newGroupId,
            taskType: "checklist",
            questionText: q.text,
            requiresInput: q.requiresInput || false,
            inputLabel: q.inputLabel || "",
            name: q.text,
            comment: "",
            date: format(today, "do MMM yyyy"),
            status: "Pending",
            assigneeId: group.assigneeId,
            assigneeName: group.assigneeName,
            creatorId: group.creatorId,
            creatorName: group.creatorName,
            creatorRole: group.creatorRole,
            category: "Checklist",
            repeatFrequency: "Once",
            checklistAnswer: null,
            checklistNote: null,
            timerState: "idle",
            timerStartedAt: null,
            elapsedMs: 0,
            billable: false,
          });
        });

        // 2. Track standard (non-checklist) children to replicate from existing clientLogs
        if (!standardSpawnsByClient[clientId]) standardSpawnsByClient[clientId] = [];
        standardSpawnsByClient[clientId].push({ parentGroupId: String(group.id), newGroupId });
      }

      // Mark the parent group as spawned (keep existing status — the parent stays in its current state
      // so it can continue generating future instances based on cadence)
      updatedGroups[i] = {
        ...group,
        lastSpawnedDate: today.toISOString().slice(0, 10),
        repeatGroupId: String(group.repeatGroupId || group.id),
      };
      spawned++;

      logger.info(
        { parentGroupId: group.id, newGroupId, freq: group.repeatFrequency },
        "[GroupRepeat] Spawned new group instance"
      );
    }

    if (spawned > 0) {
      await writeFirebasePath("taskGroups", [...updatedGroups, ...newGroups]);

      // Collect all clients that need writes (from checklist or standard replication)
      const allClients = new Set([
        ...Object.keys(checklistTasksByClient),
        ...Object.keys(standardSpawnsByClient),
      ]);

      for (const clientId of allClients) {
        const existingRaw = await readFirebasePath<unknown>(`clientLogs/${clientId}`);
        const existing: TaskLog[] = Array.isArray(existingRaw)
          ? (existingRaw as TaskLog[])
          : existingRaw ? Object.values(existingRaw as Record<string, TaskLog>) : [];

        const newChecklistTasks = checklistTasksByClient[clientId] || [];

        // Replicate standard (non-checklist) children from the parent group
        const newStandardTasks: TaskLog[] = [];
        const spawns = standardSpawnsByClient[clientId] || [];
        for (const { parentGroupId, newGroupId } of spawns) {
          const parentStandardChildren = existing.filter(
            (t) => t.taskGroupId === parentGroupId && t.taskType !== "checklist"
          );
          parentStandardChildren.forEach((t, idx) => {
            newStandardTasks.push({
              ...t,
              id: `${newGroupId}-std${idx}-${Date.now() + idx}`,
              taskGroupId: newGroupId,
              date: format(today, "do MMM yyyy"),
              status: "Pending",
              timerState: "idle",
              timerStartedAt: null,
              elapsedMs: 0,
              timeTaken: null,
              result: "",
              checklistAnswer: null,
              checklistNote: null,
            });
          });
        }

        await writeFirebasePath(`clientLogs/${clientId}`, [
          ...newChecklistTasks,
          ...newStandardTasks,
          ...existing,
        ]);
      }
    }

    logger.info({ spawned }, "[GroupRepeat] Check complete");
  } catch (err) {
    logger.error({ err }, "[GroupRepeat] Error during group repeat check");
  }
}

export function startRepeatScheduler(): void {
  // Run at 06:00 daily — one hour before the reminder check at 07:00
  cron.schedule("0 6 * * *", () => {
    runRepeatCheck().catch((err) =>
      logger.error({ err }, "[Repeat] Unhandled error")
    );
    runGroupRepeatCheck().catch((err) =>
      logger.error({ err }, "[GroupRepeat] Unhandled error")
    );
  });

  // Also run on startup to catch any missed spawns
  runRepeatCheck().catch((err) =>
    logger.error({ err }, "[Repeat] Error on startup check")
  );
  runGroupRepeatCheck().catch((err) =>
    logger.error({ err }, "[GroupRepeat] Error on startup check")
  );

  logger.info("[Repeat] Scheduler started — runs daily at 06:00");
}
