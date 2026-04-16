import { Router, type Request, type Response, type NextFunction } from "express";
import admin from "firebase-admin";
import { sendEmail, isEmailConfigured } from "../lib/microsoft-graph";
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
}): string {
  const desc = d.taskDescription
    ? `<p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">${d.taskDescription}</p>`
    : "";
  const tableBody = [
    row("Assigned to", d.assigneeName || ""),
    row("Client", d.clientName || ""),
    row("Due date", d.dueDate || "Not set"),
    row("Created by", d.creatorName || ""),
  ].join("");
  const body = `
    ${desc}
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">You have been assigned a new task in the Ethinos PMT. Please log in to review the details and get started.</p>
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

/* ─── Route ─── */

router.post("/notify", requireFirebaseAuth, async (req: Request, res: Response) => {
  if (!isEmailConfigured()) {
    logger.warn("[Notify] Email not configured — skipping notification");
    return res.json({ sent: false, reason: "email_not_configured" });
  }

  const { type, data } = req.body as { type: string; data: Record<string, unknown> };

  if (!type || !data) {
    return res.status(400).json({ error: "type and data are required" });
  }

  try {
    switch (type) {
      case "task-assigned": {
        const { assigneeEmail, assigneeName, taskName, taskDescription, clientName, dueDate, creatorName } = data as Record<string, string>;
        if (!assigneeEmail) return res.json({ sent: false, reason: "no_email" });
        await sendEmail({
          to: assigneeEmail,
          subject: `[PMT] New task assigned: "${taskName}"`,
          bodyHtml: buildTaskAssignedHtml({ assigneeName, taskName, taskDescription, clientName, dueDate, creatorName }),
        });
        logger.info({ to: assigneeEmail, taskName }, "[Notify] task-assigned email sent");
        break;
      }

      case "approval-required": {
        const { recipientEmails, requesterName, taskName, clientName } = data as { recipientEmails: string[]; requesterName: string; taskName: string; clientName: string };
        if (!recipientEmails?.length) return res.json({ sent: false, reason: "no_recipients" });
        await Promise.allSettled(
          recipientEmails.map((email) =>
            sendEmail({
              to: email,
              subject: `[PMT] Assignment request: ${requesterName} → "${taskName}"`,
              bodyHtml: buildApprovalRequiredHtml({ requesterName, taskName, clientName }),
            })
          )
        );
        logger.info({ recipients: recipientEmails.length, taskName }, "[Notify] approval-required emails sent");
        break;
      }

      case "feedback-response": {
        const { recipientEmail, recipientName, feedbackText, replyText, adminName } = data as Record<string, string>;
        if (!recipientEmail) return res.json({ sent: false, reason: "no_email" });
        await sendEmail({
          to: recipientEmail,
          subject: "[PMT] Your feedback has received a response",
          bodyHtml: buildFeedbackResponseHtml({ recipientName, feedbackText, replyText, adminName }),
        });
        logger.info({ to: recipientEmail }, "[Notify] feedback-response email sent");
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
