import { Router, type Request, type Response, type NextFunction } from "express";
import admin from "firebase-admin";
import { sendEmail, isEmailConfigured } from "../lib/microsoft-graph";
import { readFirebasePath } from "../lib/firebase-admin";
import { logger } from "../lib/logger";

const router = Router();

async function requireFirebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const idToken = authHeader.slice(7);
  try {
    await admin.auth().verifyIdToken(idToken);
    next();
  } catch (err) {
    logger.warn({ err }, "[Notify] Invalid Firebase ID token");
    res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

/* ─── Notification settings ─── */

const DEFAULT_OFF_EVENTS = new Set([
  "qc-approved",
  "task-overdue",
  "task-due-soon",
  "task-status-changed",
]);

interface NotificationSetting {
  enabled?: boolean;
  customSubject?: string;
  customIntroText?: string;
  bccEmails?: string[];
}

async function getNotificationSetting(type: string): Promise<NotificationSetting> {
  try {
    const setting = await readFirebasePath<NotificationSetting | null>(
      `settings/notifications/${type}`
    );
    return setting || {};
  } catch {
    return {};
  }
}

function isEventEnabled(setting: NotificationSetting, type: string): boolean {
  if (typeof setting.enabled === "boolean") return setting.enabled;
  return !DEFAULT_OFF_EVENTS.has(type);
}

function applyCustomSubject(subject: string, customSubject?: string): string {
  if (!customSubject?.trim()) return subject;
  return `${customSubject.trim()} — ${subject}`;
}

function applyCustomIntroText(html: string, customIntroText?: string): string {
  if (!customIntroText?.trim()) return html;
  const introBlock = `<div style="background:#eff6ff;border-left:3px solid #2563eb;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;"><p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${customIntroText.trim()}</p></div>`;
  const paddingIdx = html.indexOf('<div style="padding:32px;">');
  if (paddingIdx === -1) return html;
  const insertAt = paddingIdx + '<div style="padding:32px;">'.length;
  return html.slice(0, insertAt) + introBlock + html.slice(insertAt);
}

/* ─── HTML builders ─── */

function brandedWrapper(headerColor: string, headerTag: string, headerTitle: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:${headerColor};padding:28px 32px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);">${headerTag}</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${headerTitle}</h1>
    </div>
    <div style="padding:32px;">${body}</div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated notification from the Ethinos PMT. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#94a3b8;width:130px;border-bottom:1px solid #f1f5f9;">${label}</td>
    <td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9;">${value || "—"}</td>
  </tr>`;
}

function buildTaskAssignedHtml(d: {
  assigneeName?: string;
  taskName: string;
  taskDescription?: string;
  clientName?: string;
  dueDate?: string | null;
  creatorName?: string;
  steps?: Array<{ label: string; checked?: boolean }>;
}): string {
  const desc = d.taskDescription
    ? `<p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.6;">${d.taskDescription}</p>`
    : "";

  const stepsHtml =
    d.steps && d.steps.length > 0
      ? `<div style="margin-bottom:24px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Steps</p>
          <ol style="margin:0;padding-left:20px;">
            ${d.steps
              .map(
                (s) =>
                  `<li style="margin-bottom:6px;font-size:13px;color:#1e293b;line-height:1.5;">${s.label}</li>`
              )
              .join("")}
          </ol>
        </div>`
      : "";

  const tableBody = [
    row("Assigned to", d.assigneeName || ""),
    row("Client", d.clientName || ""),
    row("Due date", d.dueDate || "Not set"),
    row("Created by", d.creatorName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">You have been assigned a new task in the Ethinos PMT. Please log in to review the details and get started.</p>
    ${desc}
    ${stepsHtml}
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View in PMT</a>
  `;
  return brandedWrapper("#2563eb", "New Task Assignment", d.taskName, body);
}

function buildApprovalRequiredHtml(d: {
  requesterName: string;
  taskName: string;
  clientName?: string;
}): string {
  const tableBody = [
    row("Requested by", d.requesterName),
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;"><strong>${d.requesterName}</strong> has requested to be assigned to the following task. Please review and approve or decline in the PMT.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Review in PMT</a>
  `;
  return brandedWrapper("#7c3aed", "Assignment Request", `${d.requesterName} → "${d.taskName}"`, body);
}

function buildFeedbackResponseHtml(d: {
  recipientName?: string;
  feedbackText?: string;
  replyText: string;
  adminName?: string;
}): string {
  const original = d.feedbackText
    ? `<div style="background:#f8fafc;border-left:3px solid #cbd5e1;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;margin-bottom:6px;">Your feedback</p>
        <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">${d.feedbackText}</p>
      </div>`
    : "";
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.recipientName ? ` ${d.recipientName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Your feedback has received a response from <strong>${d.adminName || "the team"}</strong>.</p>
    ${original}
    <div style="background:#eff6ff;border-left:3px solid #2563eb;padding:12px 16px;margin-bottom:24px;border-radius:0 4px 4px 0;">
      <p style="margin:0;font-size:12px;color:#3b82f6;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;margin-bottom:6px;">Response</p>
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${d.replyText}</p>
    </div>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View in PMT</a>
  `;
  return brandedWrapper("#2563eb", "Feedback Response", "Your feedback has a new response", body);
}

function buildClientAddedHtml(d: {
  recipientName?: string;
  clientName: string;
  approverName?: string;
}): string {
  const tableBody = [
    row("Client / Project", d.clientName),
    row("Approved by", d.approverName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.recipientName ? ` ${d.recipientName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Your request to join <strong>${d.clientName}</strong> has been approved. You now have access to this client's tasks in the Ethinos PMT.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Open PMT</a>
  `;
  return brandedWrapper("#059669", "Client Access Granted", `You've been added to "${d.clientName}"`, body);
}

function buildAssignmentAcceptedHtml(d: {
  recipientName?: string;
  taskName: string;
  clientName?: string;
  approverName?: string;
}): string {
  const tableBody = [
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
    row("Approved by", d.approverName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.recipientName ? ` ${d.recipientName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Your request to be assigned to the following task has been approved. Please log in to get started.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
  `;
  return brandedWrapper("#2563eb", "Assignment Approved", `You've been assigned to "${d.taskName}"`, body);
}

function buildMentionHtml(d: {
  mentionedName?: string;
  mentionerName?: string;
  taskName?: string;
  clientName?: string;
  messageText: string;
}): string {
  const tableBody = [
    row("Task", d.taskName || ""),
    row("Client", d.clientName || ""),
    row("From", d.mentionerName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      <strong>${d.mentionerName || "A teammate"}</strong> mentioned you in a task message. Log in to view the full thread and reply.
    </p>
    <div style="background:#f8fafc;border-left:3px solid #7c3aed;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${d.messageText}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
  `;
  return brandedWrapper("#7c3aed", "You were mentioned", `${d.mentionerName || "Someone"} mentioned you`, body);
}

function buildQcSubmittedHtml(d: {
  reviewerName?: string;
  submitterName?: string;
  taskName: string;
  clientName?: string;
}): string {
  const tableBody = [
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
    row("Submitted by", d.submitterName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.reviewerName ? ` ${d.reviewerName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;"><strong>${d.submitterName || "A team member"}</strong> has submitted the following task for your QC review. Please log in to approve or return it.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Review in PMT</a>
  `;
  return brandedWrapper("#4f46e5", "QC Review Requested", `"${d.taskName}" needs your review`, body);
}

function buildQcReturnedHtml(d: {
  assigneeName?: string;
  reviewerName?: string;
  taskName: string;
  clientName?: string;
  feedbackText: string;
}): string {
  const tableBody = [
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
    row("Returned by", d.reviewerName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.assigneeName ? ` ${d.assigneeName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;"><strong>${d.reviewerName || "Your reviewer"}</strong> has returned this task for revision. Please review the feedback below, make the necessary changes, and resubmit for QC.</p>
    <div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#b91c1c;">Feedback</p>
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${d.feedbackText}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
  `;
  return brandedWrapper("#dc2626", "QC Returned", `"${d.taskName}" needs revision`, body);
}

function buildQcApprovedHtml(d: {
  assigneeName?: string;
  reviewerName?: string;
  taskName: string;
  clientName?: string;
  rating?: number | null;
}): string {
  const ratingRow = d.rating ? row("QC Rating", `${d.rating}/10`) : "";
  const tableBody = [
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
    row("Approved by", d.reviewerName || ""),
    ratingRow,
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.assigneeName ? ` ${d.assigneeName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Great work! <strong>${d.reviewerName || "Your reviewer"}</strong> has approved the quality check for your task.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View in PMT</a>
  `;
  return brandedWrapper("#059669", "QC Approved", `"${d.taskName}" passed quality check`, body);
}

function buildTaskOverdueHtml(d: {
  assigneeName?: string;
  taskName: string;
  clientName?: string;
  dueDate?: string;
}): string {
  const tableBody = [
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
    row("Due date", d.dueDate || ""),
    row("Assigned to", d.assigneeName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.assigneeName ? ` ${d.assigneeName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">The following task is <strong>overdue</strong>. Please log in to the PMT to update its status or reach out to your manager if you need assistance.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
  `;
  return brandedWrapper("#d97706", "Overdue Task", `"${d.taskName}" is overdue`, body);
}

function buildTaskDueSoonHtml(d: {
  assigneeName?: string;
  taskName: string;
  clientName?: string;
  dueDate?: string;
}): string {
  const tableBody = [
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
    row("Due date", d.dueDate || ""),
    row("Assigned to", d.assigneeName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.assigneeName ? ` ${d.assigneeName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">This is a reminder that the following task is <strong>due in 2 days</strong>. Please ensure it's on track.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
  `;
  return brandedWrapper("#d97706", "Task Due Soon", `"${d.taskName}" is due in 2 days`, body);
}

function buildTaskStatusChangedHtml(d: {
  assigneeName?: string;
  changerName?: string;
  taskName: string;
  clientName?: string;
  newStatus: string;
}): string {
  const statusColor = d.newStatus === "Done" ? "#059669" : "#2563eb";
  const tableBody = [
    row("Task", d.taskName),
    row("Client", d.clientName || ""),
    row("New Status", d.newStatus),
    row("Changed by", d.changerName || ""),
  ].join("");
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">Hi${d.assigneeName ? ` ${d.assigneeName}` : ""},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">The status of your task has been updated to <strong style="color:${statusColor};">${d.newStatus}</strong> by <strong>${d.changerName || "a team member"}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableBody}</table>
    <a href="https://pmt.ethinos.com" style="display:inline-block;background:#475569;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View Task</a>
  `;
  return brandedWrapper("#475569", "Task Status Updated", `"${d.taskName}" → ${d.newStatus}`, body);
}

/* ─── Test-mode redirect helper ─── */

function resolveRecipient(email: string): string {
  return process.env.NOTIFY_TEST_EMAIL || email;
}

function testSubjectPrefix(subject: string): string {
  return process.env.NOTIFY_TEST_EMAIL ? `[TEST] ${subject}` : subject;
}

/* ─── Email status endpoint (no auth) ─── */

router.get("/email-status", (_req: Request, res: Response) => {
  const missing: string[] = [];
  if (!process.env.AZURE_TENANT_ID && !process.env.VITE_AZURE_TENANT_ID) missing.push("AZURE_TENANT_ID");
  if (!process.env.AZURE_CLIENT_ID && !process.env.VITE_AZURE_CLIENT_ID) missing.push("AZURE_CLIENT_ID");
  if (!process.env.AZURE_CLIENT_SECRET) missing.push("AZURE_CLIENT_SECRET");
  if (!process.env.MS_SENDER_EMAIL) missing.push("MS_SENDER_EMAIL");
  res.json({ configured: missing.length === 0, missing });
});

/* ─── Notify route ─── */

router.post("/notify", requireFirebaseAuth, async (req: Request, res: Response) => {
  if (!isEmailConfigured()) {
    logger.warn("[Notify] Email not configured — skipping notification");
    return res.json({ sent: false, reason: "email_not_configured" });
  }

  const { type, data } = req.body as { type: string; data: Record<string, unknown> };

  if (!type || !data) {
    return res.status(400).json({ error: "type and data are required" });
  }

  const testMode = !!process.env.NOTIFY_TEST_EMAIL;

  const setting = await getNotificationSetting(type);
  if (!isEventEnabled(setting, type)) {
    logger.info({ type }, "[Notify] Notification event disabled — skipping");
    return res.json({ sent: false, reason: "disabled" });
  }

  const firebaseBcc: string[] = Array.isArray(setting.bccEmails)
    ? (setting.bccEmails as string[]).filter(Boolean)
    : [];

  try {
    switch (type) {
      case "task-assigned": {
        const { assigneeEmail, assigneeName, taskName, taskDescription, clientName, dueDate, creatorName, steps } = data as Record<string, unknown>;
        if (!assigneeEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(assigneeEmail as string);
        const stepList = Array.isArray(steps)
          ? (steps as Array<{ label: string; checked?: boolean }>)
          : [];
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] New task assigned: "${taskName}"`),
          setting.customSubject
        );
        let html = buildTaskAssignedHtml({
          assigneeName: assigneeName as string,
          taskName: taskName as string,
          taskDescription: taskDescription as string | undefined,
          clientName: clientName as string | undefined,
          dueDate: dueDate as string | null | undefined,
          creatorName: creatorName as string | undefined,
          steps: stepList,
        });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: assigneeEmail, taskName, testMode }, "[Notify] task-assigned email sent");
        break;
      }

      case "approval-required": {
        const { recipientEmails, requesterName, taskName, clientName } = data as { recipientEmails: string[]; requesterName: string; taskName: string; clientName: string };
        if (!recipientEmails?.length) return res.json({ sent: false, reason: "no_recipients" });
        const dedupedTo = testMode
          ? [resolveRecipient(recipientEmails[0])]
          : recipientEmails;
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] Assignment request: ${requesterName} → "${taskName}"`),
          setting.customSubject
        );
        let html = buildApprovalRequiredHtml({ requesterName, taskName, clientName });
        html = applyCustomIntroText(html, setting.customIntroText);
        await Promise.allSettled(
          dedupedTo.map((email) =>
            sendEmail({ to: email, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc })
          )
        );
        logger.info({ recipients: dedupedTo.length, taskName, testMode }, "[Notify] approval-required emails sent");
        break;
      }

      case "feedback-response": {
        const { recipientEmail, recipientName, feedbackText, replyText, adminName } = data as Record<string, string>;
        if (!recipientEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(recipientEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix("[PMT] Your feedback has received a response"),
          setting.customSubject
        );
        let html = buildFeedbackResponseHtml({ recipientName, feedbackText, replyText, adminName });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: recipientEmail, testMode }, "[Notify] feedback-response email sent");
        break;
      }

      case "mention": {
        const { recipientEmail, recipientName, mentionerName, taskName, clientName, messageText } = data as Record<string, string>;
        if (!recipientEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(recipientEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] ${mentionerName || "Someone"} mentioned you in "${taskName}"`),
          setting.customSubject
        );
        let html = buildMentionHtml({ mentionedName: recipientName, mentionerName, taskName, clientName, messageText });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: recipientEmail, taskName, testMode }, "[Notify] mention email sent");
        break;
      }

      case "qc-returned": {
        const { assigneeEmail, assigneeName, reviewerName, taskName, clientName, feedbackText } = data as Record<string, unknown>;
        if (!assigneeEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(assigneeEmail as string);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] QC returned for revision: "${taskName}"`),
          setting.customSubject
        );
        let html = buildQcReturnedHtml({
          assigneeName: assigneeName as string,
          reviewerName: reviewerName as string,
          taskName: taskName as string,
          clientName: clientName as string | undefined,
          feedbackText: (feedbackText as string) || "",
        });
        html = applyCustomIntroText(html, setting.customIntroText);
        const bccList = testMode ? [] : firebaseBcc.filter((e) => e !== assigneeEmail);
        await sendEmail({ to, subject, bodyHtml: html, bcc: bccList });
        logger.info({ to, original: assigneeEmail, taskName, bccCount: bccList.length, testMode }, "[Notify] qc-returned email sent");
        break;
      }

      case "qc-submitted": {
        const { reviewerEmail, reviewerName, submitterName, taskName, clientName } = data as Record<string, string>;
        if (!reviewerEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(reviewerEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] QC review needed: "${taskName}"`),
          setting.customSubject
        );
        let html = buildQcSubmittedHtml({ reviewerName, submitterName, taskName, clientName });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: reviewerEmail, taskName, testMode }, "[Notify] qc-submitted email sent");
        break;
      }

      case "client-added": {
        const { recipientEmail, recipientName, clientName, approverName } = data as Record<string, string>;
        if (!recipientEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(recipientEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] You've been added to "${clientName}"`),
          setting.customSubject
        );
        let html = buildClientAddedHtml({ recipientName, clientName, approverName });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: recipientEmail, clientName, testMode }, "[Notify] client-added email sent");
        break;
      }

      case "assignment-accepted": {
        const { recipientEmail, recipientName, taskName, clientName, approverName } = data as Record<string, string>;
        if (!recipientEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(recipientEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] Your assignment request was approved: "${taskName}"`),
          setting.customSubject
        );
        let html = buildAssignmentAcceptedHtml({ recipientName, taskName, clientName, approverName });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: recipientEmail, taskName, testMode }, "[Notify] assignment-accepted email sent");
        break;
      }

      case "qc-approved": {
        const { assigneeEmail, assigneeName, reviewerName, taskName, clientName, rating } = data as Record<string, unknown>;
        if (!assigneeEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(assigneeEmail as string);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] QC approved: "${taskName}"`),
          setting.customSubject
        );
        let html = buildQcApprovedHtml({
          assigneeName: assigneeName as string,
          reviewerName: reviewerName as string,
          taskName: taskName as string,
          clientName: clientName as string | undefined,
          rating: typeof rating === "number" ? rating : null,
        });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: assigneeEmail, taskName, testMode }, "[Notify] qc-approved email sent");
        break;
      }

      case "task-overdue": {
        const { assigneeEmail, assigneeName, taskName, clientName, dueDate } = data as Record<string, string>;
        if (!assigneeEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(assigneeEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] Overdue: "${taskName}"`),
          setting.customSubject
        );
        let html = buildTaskOverdueHtml({ assigneeName, taskName, clientName, dueDate });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: assigneeEmail, taskName, testMode }, "[Notify] task-overdue email sent");
        break;
      }

      case "task-due-soon": {
        const { assigneeEmail, assigneeName, taskName, clientName, dueDate } = data as Record<string, string>;
        if (!assigneeEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(assigneeEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] Due in 2 days: "${taskName}"`),
          setting.customSubject
        );
        let html = buildTaskDueSoonHtml({ assigneeName, taskName, clientName, dueDate });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: assigneeEmail, taskName, testMode }, "[Notify] task-due-soon email sent");
        break;
      }

      case "task-status-changed": {
        const { assigneeEmail, assigneeName, taskName, clientName, newStatus, changerName } = data as Record<string, string>;
        if (!assigneeEmail) return res.json({ sent: false, reason: "no_email" });
        const to = resolveRecipient(assigneeEmail);
        const subject = applyCustomSubject(
          testSubjectPrefix(`[PMT] Task status updated: "${taskName}" → ${newStatus}`),
          setting.customSubject
        );
        let html = buildTaskStatusChangedHtml({ assigneeName, taskName, clientName, newStatus, changerName });
        html = applyCustomIntroText(html, setting.customIntroText);
        await sendEmail({ to, subject, bodyHtml: html, bcc: testMode ? [] : firebaseBcc });
        logger.info({ to, original: assigneeEmail, taskName, newStatus, testMode }, "[Notify] task-status-changed email sent");
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown notification type: ${type}` });
    }

    return res.json({ sent: true });
  } catch (err) {
    logger.error({ err, type }, "[Notify] Failed to send notification email");
    return res.status(500).json({ error: "Failed to send email" });
  }
});

export default router;
