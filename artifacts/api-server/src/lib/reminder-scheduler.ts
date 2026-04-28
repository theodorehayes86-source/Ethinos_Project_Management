import cron from "node-cron";
import { parse, isValid, startOfDay, addDays, differenceInCalendarDays, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { sendEmail, isEmailConfigured } from "./microsoft-graph";
import { logger } from "./logger";
import { isDateLeaveOrHoliday } from "./keka-scheduler";

interface TaskLog {
  id: string | number;
  name: string;
  comment?: string;
  dueDate?: string | null;
  status?: string;
  assigneeId?: string | number;
  assigneeName?: string;
  assigneeEmail?: string;
  qcAssigneeId?: string | number | null;
  qcAssigneeName?: string | null;
  qcAssigneeEmail?: string | null;
  qcEnabled?: boolean;
  reminderOffsets?: string[];
  archived?: boolean;
  lastOverdueNotifiedAt?: string | null;
  lastDueSoonNotifiedAt?: string | null;
}

interface User {
  id: string | number;
  name?: string;
  email?: string;
}

function parseDueDate(raw: string): Date | null {
  if (!raw) return null;
  const formats = ["do MMM yyyy", "d MMM yyyy", "dd MMM yyyy", "yyyy-MM-dd"];
  for (const fmt of formats) {
    try {
      const d = parse(raw, fmt, new Date());
      if (isValid(d)) return d;
    } catch {
      /* continue */
    }
  }
  return null;
}

function makeSentKey(offset: string, reminderDate: Date): string {
  const safe = offset.replace("+", "plus").replace("-", "minus");
  const dateStr = reminderDate.toISOString().slice(0, 10);
  return `${safe}_${dateStr}`;
}

function buildReminderEmailHtml(
  task: TaskLog,
  isOverdue: boolean,
  offsetNum: number
): string {
  const headerColor = isOverdue ? "#dc2626" : "#2563eb";
  const statusLabel =
    isOverdue
      ? `Overdue by ${offsetNum} day${offsetNum !== 1 ? "s" : ""}`
      : offsetNum === 0
        ? "Due Today"
        : `Due in ${Math.abs(offsetNum)} day${Math.abs(offsetNum) !== 1 ? "s" : ""}`;

  const taskName = task.name || "Untitled Task";
  const comment = task.comment ? `<p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">${task.comment}</p>` : "";
  const qcRow = task.qcEnabled && task.qcAssigneeName
    ? `<tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;width:130px;">QC Manager</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;">${task.qcAssigneeName}</td></tr>`
    : "";

  const footerNote = isOverdue
    ? "This task is overdue. Please update its status in the PMT or reach out to your manager if you need assistance."
    : offsetNum === 0
      ? "This task is due today. Please log in to the PMT and update your progress."
      : "This is an automated reminder from the Ethinos PMT. Please ensure the task is on track.";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:${headerColor};padding:28px 32px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);">${isOverdue ? "Overdue Task Alert" : "Task Reminder"}</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${taskName}</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);font-weight:500;">${statusLabel}</p>
    </div>
    <div style="padding:32px;">
      ${comment}
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;width:130px;border-bottom:1px solid #f1f5f9;">Assigned to</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9;">${task.assigneeName || "—"}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Due date</td><td style="padding:8px 0;font-size:13px;color:${isOverdue ? "#dc2626" : "#1e293b"};font-weight:600;border-bottom:1px solid #f1f5f9;">${task.dueDate}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Status</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9;">${task.status || "Pending"}</td></tr>
        ${qcRow}
      </table>
      <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid ${headerColor};">
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">${footerNote}</p>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Ethinos PMT &middot; Automated Reminder</p>
      <p style="margin:0;font-size:12px;color:#cbd5e1;">Do not reply to this email</p>
    </div>
  </div>
</body>
</html>`;
}

export async function runReminderCheck(): Promise<void> {
  logger.info("[Reminders] Running scheduled reminder check");

  try {
    const [clientLogsRaw, usersRaw, sentRemindersRaw] = await Promise.all([
      readFirebasePath<Record<string, unknown>>("clientLogs"),
      readFirebasePath<unknown>("users"),
      readFirebasePath<Record<string, Record<string, string>>>("sentReminders"),
    ]);

    if (!clientLogsRaw) {
      logger.info("[Reminders] No clientLogs in Firebase — nothing to check");
      return;
    }

    const users: User[] = usersRaw
      ? (Array.isArray(usersRaw)
          ? (usersRaw as User[])
          : Object.values(usersRaw as Record<string, User>)
        ).filter(Boolean)
      : [];

    const sentReminders: Record<string, Record<string, string>> =
      sentRemindersRaw || {};

    const today = startOfDay(new Date());
    const todayStr = today.toISOString().slice(0, 10);
    let emailsSent = 0;
    let emailsSkipped = 0;

    const emailConfigured = isEmailConfigured();
    if (!emailConfigured) {
      logger.warn("[Reminders] Email not configured — will log but not send");
    }

    for (const [, logsRaw] of Object.entries(clientLogsRaw)) {
      const logs: TaskLog[] = Array.isArray(logsRaw)
        ? (logsRaw as TaskLog[])
        : Object.values(logsRaw as Record<string, TaskLog>);

      for (const task of logs) {
        if (!task?.id || !task.dueDate || !task.reminderOffsets?.length)
          continue;
        if (task.status === "Done" || task.archived) continue;

        const dueDate = parseDueDate(task.dueDate);
        if (!dueDate) continue;

        const taskId = String(task.id);
        const taskSentMap = sentReminders[taskId] || {};

        for (const offset of task.reminderOffsets) {
          const offsetNum = parseInt(offset, 10);
          if (isNaN(offsetNum)) continue;

          const reminderDate = startOfDay(addDays(dueDate, offsetNum));
          const reminderDateStr = reminderDate.toISOString().slice(0, 10);

          if (reminderDateStr !== todayStr) continue;

          const sentKey = makeSentKey(offset, reminderDate);
          if (taskSentMap[sentKey]) {
            emailsSkipped++;
            continue;
          }

          const isOverdue = offsetNum > 0;

          const assigneeEmail =
            task.assigneeEmail ||
            users.find((u) => String(u.id) === String(task.assigneeId))?.email;

          if (!assigneeEmail) {
            logger.warn(
              { taskId, offset },
              "[Reminders] No assignee email — skipping"
            );
            continue;
          }

          const subject = isOverdue
            ? `[Ethinos PMT] Overdue: "${task.name}" was due on ${task.dueDate}`
            : offsetNum === 0
              ? `[Ethinos PMT] Due Today: "${task.name}"`
              : `[Ethinos PMT] Reminder: "${task.name}" is due on ${task.dueDate}`;

          const bodyHtml = buildReminderEmailHtml(task, isOverdue, offsetNum);

          try {
            if (emailConfigured) {
              await sendEmail({ to: assigneeEmail, subject, bodyHtml });

              if (isOverdue && task.qcEnabled && task.qcAssigneeId) {
                const qcEmail =
                  task.qcAssigneeEmail ||
                  users.find(
                    (u) => String(u.id) === String(task.qcAssigneeId)
                  )?.email;

                if (qcEmail && qcEmail !== assigneeEmail) {
                  const qcSubject = `[Ethinos PMT] QC Alert — Overdue: "${task.name}" (assigned to ${task.assigneeName || "unknown"})`;
                  await sendEmail({ to: qcEmail, subject: qcSubject, bodyHtml });
                }
              }
            } else {
              logger.info(
                { to: assigneeEmail, subject },
                "[Reminders] (dry-run) Would have sent reminder"
              );
            }

            await writeFirebasePath(
              `sentReminders/${taskId}/${sentKey}`,
              new Date().toISOString()
            );
            emailsSent++;
          } catch (err) {
            logger.error({ err, taskId, offset }, "[Reminders] Failed to send reminder email");
          }
        }
      }
    }

    logger.info(
      { emailsSent, emailsSkipped, today: todayStr },
      "[Reminders] Check complete"
    );
  } catch (err) {
    logger.error({ err }, "[Reminders] Error during reminder check");
  }
}

/* ─── Task overdue / due-soon checks ─── */

function buildOverdueHtml(task: TaskLog): string {
  const taskName = task.name || "Untitled Task";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#d97706;padding:28px 32px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Overdue Task</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${taskName}</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">Hi${task.assigneeName ? ` ${task.assigneeName}` : ""},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">The following task is <strong>overdue</strong>. Please log in to the PMT to update its status or reach out to your manager if you need assistance.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;width:130px;border-bottom:1px solid #f1f5f9;">Task</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9;">${taskName}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Due date</td><td style="padding:8px 0;font-size:13px;color:#dc2626;font-weight:600;border-bottom:1px solid #f1f5f9;">${task.dueDate || "—"}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;">Status</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;">${task.status || "Pending"}</td></tr>
      </table>
      <a href="https://pmt.ethinos.com" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Ethinos PMT &middot; Automated Notification</p>
    </div>
  </div>
</body>
</html>`;
}

function buildDueSoonHtml(task: TaskLog): string {
  const taskName = task.name || "Untitled Task";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#f59e0b;padding:28px 32px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Due Soon</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${taskName}</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">Hi${task.assigneeName ? ` ${task.assigneeName}` : ""},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">This is a reminder that the following task is <strong>due in 2 days</strong>. Please ensure it's on track.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;width:130px;border-bottom:1px solid #f1f5f9;">Task</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9;">${taskName}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Due date</td><td style="padding:8px 0;font-size:13px;color:#d97706;font-weight:600;border-bottom:1px solid #f1f5f9;">${task.dueDate || "—"}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;">Status</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;">${task.status || "Pending"}</td></tr>
      </table>
      <a href="https://pmt.ethinos.com" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Ethinos PMT &middot; Automated Notification</p>
    </div>
  </div>
</body>
</html>`;
}

interface SchedulerNotifSetting {
  enabled?: boolean;
  customSubject?: string;
  customIntroText?: string;
  bccEmails?: string[];
}

function applyCustomSubjectScheduler(subject: string, customSubject?: string): string {
  if (!customSubject?.trim()) return subject;
  return `${customSubject.trim()} — ${subject}`;
}

function applyCustomIntroTextScheduler(html: string, customIntroText?: string): string {
  if (!customIntroText?.trim()) return html;
  const introBlock = `<div style="background:#eff6ff;border-left:3px solid #2563eb;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;"><p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${customIntroText.trim()}</p></div>`;
  const marker = '<div style="padding:32px;">';
  const idx = html.indexOf(marker);
  if (idx === -1) return html;
  return html.slice(0, idx + marker.length) + introBlock + html.slice(idx + marker.length);
}

export async function runOverdueDueSoonCheck(): Promise<void> {
  logger.info("[Overdue/DueSoon] Running check");

  try {
    const [notifSettingsRaw, clientLogsRaw, usersRaw, cooldownsRaw] = await Promise.all([
      readFirebasePath<Record<string, SchedulerNotifSetting | null>>("settings/notifications"),
      readFirebasePath<Record<string, unknown>>("clientLogs"),
      readFirebasePath<unknown>("users"),
      readFirebasePath<Record<string, { lastOverdueNotifiedAt?: string; lastDueSoonNotifiedAt?: string }>>("notificationCooldowns"),
    ]);

    const overdueSetting: SchedulerNotifSetting = notifSettingsRaw?.["task-overdue"] || {};
    const dueSoonSetting: SchedulerNotifSetting = notifSettingsRaw?.["task-due-soon"] || {};

    const overdueEnabled = overdueSetting.enabled === true;
    const dueSoonEnabled = dueSoonSetting.enabled === true;

    if (!overdueEnabled && !dueSoonEnabled) {
      logger.info("[Overdue/DueSoon] Both events disabled — skipping");
      return;
    }

    if (!clientLogsRaw) {
      logger.info("[Overdue/DueSoon] No clientLogs — nothing to check");
      return;
    }

    const users: User[] = usersRaw
      ? (Array.isArray(usersRaw) ? (usersRaw as User[]) : Object.values(usersRaw as Record<string, User>)).filter(Boolean)
      : [];

    const cooldowns: Record<string, { lastOverdueNotifiedAt?: string; lastDueSoonNotifiedAt?: string }> = cooldownsRaw || {};
    const today = startOfDay(new Date());
    const todayStr = today.toISOString().slice(0, 10);
    const emailConfigured = isEmailConfigured();

    for (const [, logsRaw] of Object.entries(clientLogsRaw)) {
      const logs: TaskLog[] = Array.isArray(logsRaw)
        ? (logsRaw as TaskLog[])
        : Object.values(logsRaw as Record<string, TaskLog>);

      for (const task of logs) {
        if (!task?.id || !task.dueDate || task.status === "Done" || task.archived) continue;

        const dueDate = parseDueDate(task.dueDate);
        if (!dueDate) continue;

        const taskId = String(task.id);
        const cooldown = cooldowns[taskId] || {};
        const dueDateStart = startOfDay(dueDate);
        const diffDays = differenceInCalendarDays(dueDateStart, today);

        const assigneeEmail =
          task.assigneeEmail ||
          users.find((u) => String(u.id) === String(task.assigneeId))?.email;

        if (!assigneeEmail) continue;

        if (overdueEnabled && diffDays < 0) {
          if (cooldown.lastOverdueNotifiedAt === todayStr) continue;

          if (task.assigneeId) {
            const dueDateKey = format(dueDateStart, "yyyy-MM-dd");
            const onLeave = await isDateLeaveOrHoliday(String(task.assigneeId), dueDateKey);
            if (onLeave) {
              logger.info({ taskId, dueDateKey }, "[Overdue/DueSoon] Skipping overdue — due date is a leave/holiday day");
              continue;
            }
          }

          try {
            if (emailConfigured) {
              const subject = applyCustomSubjectScheduler(
                `[PMT] Overdue: "${task.name}"`,
                overdueSetting.customSubject
              );
              let html = buildOverdueHtml(task);
              html = applyCustomIntroTextScheduler(html, overdueSetting.customIntroText);
              const bcc = Array.isArray(overdueSetting.bccEmails)
                ? overdueSetting.bccEmails.filter(Boolean)
                : [];
              await sendEmail({ to: assigneeEmail, subject, bodyHtml: html, bcc });
              await writeFirebasePath(`notificationCooldowns/${taskId}/lastOverdueNotifiedAt`, todayStr);
              logger.info({ taskId, assigneeEmail }, "[Overdue/DueSoon] Sent overdue notification");
            } else {
              logger.info({ taskId, assigneeEmail }, "[Overdue/DueSoon] (dry-run) Would send overdue notification");
            }
          } catch (err) {
            logger.error({ err, taskId }, "[Overdue/DueSoon] Failed to send overdue email");
          }
        }

        if (dueSoonEnabled && diffDays === 2) {
          if (cooldown.lastDueSoonNotifiedAt === todayStr) continue;
          try {
            if (emailConfigured) {
              const subject = applyCustomSubjectScheduler(
                `[PMT] Due in 2 days: "${task.name}"`,
                dueSoonSetting.customSubject
              );
              let html = buildDueSoonHtml(task);
              html = applyCustomIntroTextScheduler(html, dueSoonSetting.customIntroText);
              const bcc = Array.isArray(dueSoonSetting.bccEmails)
                ? dueSoonSetting.bccEmails.filter(Boolean)
                : [];
              await sendEmail({ to: assigneeEmail, subject, bodyHtml: html, bcc });
              await writeFirebasePath(`notificationCooldowns/${taskId}/lastDueSoonNotifiedAt`, todayStr);
              logger.info({ taskId, assigneeEmail }, "[Overdue/DueSoon] Sent due-soon notification");
            } else {
              logger.info({ taskId, assigneeEmail }, "[Overdue/DueSoon] (dry-run) Would send due-soon notification");
            }
          } catch (err) {
            logger.error({ err, taskId }, "[Overdue/DueSoon] Failed to send due-soon email");
          }
        }
      }
    }

    logger.info("[Overdue/DueSoon] Check complete");
  } catch (err) {
    logger.error({ err }, "[Overdue/DueSoon] Error during check");
  }
}

/**
 * Read the configured timezone + hour from Firebase, then run both checks
 * only if the current local time matches. Called every hour by the cron.
 */
async function runScheduledChecks(): Promise<void> {
  try {
    const schedRaw = await readFirebasePath<{
      scheduleTimezone?: string;
      scheduleHour?: number;
    }>("settings/notifications/reminders-schedule");

    const tz = schedRaw?.scheduleTimezone || "Europe/London";
    const targetHour =
      typeof schedRaw?.scheduleHour === "number" ? schedRaw.scheduleHour : 7;

    const nowInTz = toZonedTime(new Date(), tz);
    const currentHour = nowInTz.getHours();

    if (currentHour !== targetHour) {
      logger.debug(
        { currentHour, targetHour, tz },
        "[Reminders] Hourly tick — not the configured send hour, skipping"
      );
      return;
    }

    logger.info(
      { targetHour, tz },
      "[Reminders] Hourly tick matches configured send time — running checks"
    );

    await runReminderCheck();
    await runOverdueDueSoonCheck();
  } catch (err) {
    logger.error({ err }, "[Reminders] Error reading schedule config");
  }
}

export function startReminderScheduler(): void {
  // Run every hour. Timezone + hour gate is applied inside runScheduledChecks()
  // by reading settings/notifications/reminders-schedule from Firebase.
  cron.schedule("0 * * * *", () => {
    runScheduledChecks().catch((err) =>
      logger.error({ err }, "[Reminders] Unhandled scheduler error")
    );
  });

  // Startup checks run immediately (cooldowns prevent duplicate sends)
  runReminderCheck().catch((err) =>
    logger.error({ err }, "[Reminders] Error on startup check")
  );
  runOverdueDueSoonCheck().catch((err) =>
    logger.error({ err }, "[Overdue/DueSoon] Error on startup check")
  );

  logger.info(
    "[Reminders] Scheduler started — checks every hour (timezone & hour read from Firebase settings)"
  );
}
