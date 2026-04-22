import cron from "node-cron";
import {
  parse, isValid, startOfISOWeek, endOfISOWeek, subWeeks,
  addDays, format, getISOWeek, isWithinInterval, startOfDay,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { sendEmail, isEmailConfigured } from "./microsoft-graph";
import { logger } from "./logger";

const DEFAULT_TZ = "Europe/London";
const DEFAULT_HOUR = 8;

interface User {
  id: string | number;
  name?: string;
  email?: string;
  weeklyDigestEnabled?: boolean;
}

interface Client {
  id: string | number;
  name?: string;
}

interface TaskLog {
  id?: string | number;
  date?: string;
  assigneeId?: string | number;
  elapsedMs?: number;
}

function parseTaskDate(raw: string): Date | null {
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

function formatMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function buildWeeklyDigestHtml(data: {
  userName: string;
  weekNumber: number;
  weekLabel: string;
  days: Date[];
  dayTotals: number[];
  projects: Array<{ name: string; dayMs: number[] }>;
}): string {
  const { userName, weekNumber, weekLabel, days, dayTotals, projects } = data;

  const navy = "#1e2a4a";
  const dayColStyle = `padding:10px 14px;font-size:12px;font-weight:700;color:#ffffff;text-align:center;border-left:1px solid rgba(255,255,255,0.15);white-space:nowrap;`;
  const dayValStyle = `padding:9px 14px;font-size:13px;font-weight:600;color:#1e293b;text-align:center;border-left:1px solid #e2e8f0;background:#ffffff;`;
  const projDayStyle = `padding:8px 14px;font-size:12px;color:#475569;text-align:center;border-left:1px solid #e2e8f0;`;

  const dayHeaderCells = days
    .map(d => `<td style="${dayColStyle}">${format(d, "d-MMM")}</td>`)
    .join("");

  const dayTotalCells = dayTotals
    .map(ms => `<td style="${dayValStyle}">${formatMs(ms)}</td>`)
    .join("");

  const projectRows =
    projects.length === 0
      ? `<tr><td colspan="${days.length + 1}" style="padding:14px;font-size:12px;color:#94a3b8;text-align:center;font-style:italic;">No time logged this week</td></tr>`
      : projects
          .map(
            p => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 14px;font-size:12px;font-weight:600;color:#1e293b;">${p.name}</td>
            ${p.dayMs.map(ms => `<td style="${projDayStyle}">${formatMs(ms)}</td>`).join("")}
          </tr>`
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px 16px;">
  <div style="max-width:700px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Name + Logo -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding:22px 24px 16px;">
          <span style="display:inline-block;background:#fde8e8;border:2px solid #f9a8a8;color:#b91c1c;font-size:15px;font-weight:700;padding:8px 22px;border-radius:6px;">${userName}</span>
        </td>
        <td style="padding:22px 24px 16px;text-align:right;vertical-align:middle;">
          <span style="font-size:24px;font-weight:800;color:#e85d1e;letter-spacing:-0.5px;font-family:Georgia,serif;">ethinos</span>
        </td>
      </tr>
    </table>

    <!-- Week totals table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr style="background:${navy};">
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap;">
          Week ${weekNumber}&nbsp;&nbsp;|&nbsp;&nbsp;${weekLabel}
        </td>
        ${dayHeaderCells}
      </tr>
      <tr style="border-bottom:2px solid #e2e8f0;">
        <td style="padding:9px 16px;font-size:12px;font-weight:700;color:#374151;background:#f8fafc;">Total Hours</td>
        ${dayTotalCells}
      </tr>
    </table>

    <div style="height:18px;"></div>

    <!-- Projects table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr style="background:${navy};">
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#ffffff;">Projects</td>
        ${dayHeaderCells}
      </tr>
      ${projectRows}
    </table>

    <!-- Footer -->
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;margin-top:16px;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
        Automated weekly hours report — Ethinos PMT. Do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}

interface DigestSetting {
  enabled?: boolean;
  scheduleTimezone?: string;
  scheduleHour?: number;
  lastSentIsoWeek?: string;
}

export async function runWeeklyDigest(opts?: { force?: boolean; toEmail?: string }): Promise<void> {
  const force = opts?.force ?? false;
  const overrideEmail = opts?.toEmail ?? null;
  logger.info({ force, overrideEmail: overrideEmail ?? undefined }, "[WeeklyDigest] Running weekly hours digest check");

  try {
    // Read digest settings first to check timezone / hour / cooldown
    const digestSetting = await readFirebasePath<DigestSetting | null>(
      "settings/notifications/weekly-digest"
    );

    if (!force && digestSetting && digestSetting.enabled === false) {
      logger.info("[WeeklyDigest] Globally disabled — skipping");
      return;
    }

    const configuredTz = digestSetting?.scheduleTimezone || DEFAULT_TZ;
    const configuredHour = typeof digestSetting?.scheduleHour === "number"
      ? digestSetting.scheduleHour
      : DEFAULT_HOUR;

    // Evaluate the current moment in the configured timezone
    const nowInTz = toZonedTime(new Date(), configuredTz);
    const localHour = nowInTz.getHours();
    const localDow = nowInTz.getDay(); // 0 = Sunday, 1 = Monday

    if (!force) {
      // Only proceed if it's Monday and the right hour in the configured timezone
      if (localDow !== 1) {
        logger.debug({ localDow, configuredTz }, "[WeeklyDigest] Not Monday in configured timezone — skipping");
        return;
      }
      if (localHour !== configuredHour) {
        logger.debug({ localHour, configuredHour, configuredTz }, "[WeeklyDigest] Not send hour — skipping");
        return;
      }
    }

    // Cooldown: skip if already sent this ISO week (bypassed when force=true)
    const isoWeekKey = `${format(nowInTz, "yyyy")}-W${String(getISOWeek(nowInTz)).padStart(2, "0")}`;
    if (!force && digestSetting?.lastSentIsoWeek === isoWeekKey) {
      logger.info({ isoWeekKey }, "[WeeklyDigest] Already sent this ISO week — skipping");
      return;
    }

    if (!isEmailConfigured()) {
      logger.warn("[WeeklyDigest] Email not configured — skipping");
      return;
    }

    logger.info({ configuredTz, configuredHour, isoWeekKey }, "[WeeklyDigest] Conditions met — sending digest");

    const [clientLogsRaw, usersRaw, clientsRaw] = await Promise.all([
      readFirebasePath<Record<string, unknown>>("clientLogs"),
      readFirebasePath<unknown>("users"),
      readFirebasePath<unknown>("clients"),
    ]);

    const users: User[] = usersRaw
      ? (Array.isArray(usersRaw)
          ? (usersRaw as User[])
          : Object.values(usersRaw as Record<string, User>)
        ).filter(Boolean)
      : [];

    const clients: Client[] = clientsRaw
      ? (Array.isArray(clientsRaw)
          ? (clientsRaw as Client[])
          : Object.values(clientsRaw as Record<string, Client>)
        ).filter(Boolean)
      : [];

    const clientNameMap: Record<string, string> = {
      __personal__: "Personal",
      __ethinos__: "Ethinos Internal",
    };
    for (const c of clients) {
      clientNameMap[String(c.id)] = c.name || String(c.id);
    }

    // Compute previous ISO week boundaries in the configured timezone
    const prevMonday = startOfISOWeek(subWeeks(nowInTz, 1));
    const prevSunday = endOfISOWeek(subWeeks(nowInTz, 1));
    const days = [0, 1, 2, 3, 4].map(i => addDays(prevMonday, i)); // Mon–Fri
    const weekNumber = getISOWeek(prevMonday);
    const weekLabel = `${format(prevMonday, "d MMM yyyy")} – ${format(days[4], "d MMM yyyy")}`;
    const dayKeys = days.map(d => format(d, "yyyy-MM-dd"));

    const allTasks: Array<TaskLog & { clientId: string }> = [];
    if (clientLogsRaw) {
      for (const [clientId, logsRaw] of Object.entries(clientLogsRaw)) {
        const logs: TaskLog[] = Array.isArray(logsRaw)
          ? (logsRaw as TaskLog[])
          : Object.values(logsRaw as Record<string, TaskLog>);
        // Include all tasks regardless of archived status — hours already worked count
        for (const task of logs) {
          if (task) allTasks.push({ ...task, clientId });
        }
      }
    }

    let emailsSent = 0;
    let emailsSkipped = 0;

    for (const user of users) {
      if (!user.weeklyDigestEnabled || !user.email) {
        emailsSkipped++;
        continue;
      }

      const userId = String(user.id);

      const userTasks = allTasks.filter(task => {
        if (String(task.assigneeId) !== userId) return false;
        if (!task.date || !task.elapsedMs || task.elapsedMs <= 0) return false;
        const d = parseTaskDate(task.date);
        if (!d) return false;
        return isWithinInterval(startOfDay(d), { start: prevMonday, end: prevSunday });
      });

      const dayTotals = [0, 0, 0, 0, 0];
      const projectDayMs: Record<string, number[]> = {};

      for (const task of userTasks) {
        const ms = task.elapsedMs!;
        const d = parseTaskDate(task.date!)!;
        const key = format(d, "yyyy-MM-dd");
        const dayIdx = dayKeys.indexOf(key);
        if (dayIdx < 0) continue;

        dayTotals[dayIdx] += ms;

        const clientName = clientNameMap[task.clientId] || task.clientId;
        if (!projectDayMs[clientName]) projectDayMs[clientName] = [0, 0, 0, 0, 0];
        projectDayMs[clientName][dayIdx] += ms;
      }

      const projects = Object.entries(projectDayMs)
        .map(([name, dayMs]) => ({ name, dayMs }))
        .sort((a, b) => b.dayMs.reduce((s, v) => s + v, 0) - a.dayMs.reduce((s, v) => s + v, 0));

      const bodyHtml = buildWeeklyDigestHtml({
        userName: user.name || user.email,
        weekNumber,
        weekLabel,
        days,
        dayTotals,
        projects,
      });

      const sendTo = overrideEmail ?? user.email;
      const subjectBase = `[Ethinos PMT] Week ${weekNumber} hours summary — ${format(prevMonday, "d MMM")}–${format(days[4], "d MMM yyyy")}`;
      const subject = overrideEmail ? `[PREVIEW → ${user.name || user.email}] ${subjectBase}` : subjectBase;

      try {
        await sendEmail({ to: sendTo, subject, bodyHtml });
        emailsSent++;
        logger.info({ to: sendTo, user: user.name, weekNumber }, "[WeeklyDigest] Sent");
      } catch (err) {
        logger.error({ err, to: sendTo }, "[WeeklyDigest] Failed to send");
      }
    }

    logger.info({ emailsSent, emailsSkipped }, "[WeeklyDigest] Complete");

    // Write cooldown so subsequent hourly ticks skip this week
    if (emailsSent > 0 || emailsSkipped > 0) {
      try {
        await writeFirebasePath(
          "settings/notifications/weekly-digest/lastSentIsoWeek",
          isoWeekKey
        );
        logger.info({ isoWeekKey }, "[WeeklyDigest] Cooldown written");
      } catch (err) {
        logger.warn({ err }, "[WeeklyDigest] Failed to write cooldown — may re-send next tick");
      }
    }
  } catch (err) {
    logger.error({ err }, "[WeeklyDigest] Error during digest run");
  }
}

export function startWeeklyDigestScheduler(): void {
  // Run every hour on Mondays (UTC). Timezone + hour gate is applied inside
  // runWeeklyDigest() by reading the configured scheduleTimezone/scheduleHour
  // from Firebase so the digest fires at the right local time for any timezone.
  cron.schedule("0 * * * 1", () => {
    runWeeklyDigest().catch(err =>
      logger.error({ err }, "[WeeklyDigest] Unhandled error")
    );
  });

  logger.info("[WeeklyDigest] Scheduler started — checks every hour on Mondays (timezone read from Firebase settings)");
}
