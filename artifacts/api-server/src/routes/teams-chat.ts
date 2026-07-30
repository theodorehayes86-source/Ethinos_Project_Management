/**
 * Teams Chat route — bidirectional 1:1 messaging between Flow Pro and Teams.
 *
 * POST /api/teams-chat/open    Resolve/create the Graph chat, hydrate Firebase with history,
 *                               create/renew change-notification subscription.
 * POST /api/teams-chat/send    Send a message via Graph and write it to Firebase.
 * POST /api/teams-chat/webhook Receive Microsoft Graph change notifications (new messages).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAdminAuth, readFirebasePath, writeFirebasePath } from "../lib/firebase-admin";
import {
  findOrCreateOneOnOneChat,
  getChatMessages,
  getChatMessage,
  getChatMembers,
  sendBotProactiveMessage,
  subscribeToChatMessages,
  renewChatSubscription,
  resolveEntraObjectId,
  getTeamsBaseUrl,
} from "../lib/microsoft-graph";
import { logger } from "../lib/logger";

const router = Router();

// Must match what the frontend sends when creating subscriptions.
// Change this value to invalidate all existing subscriptions.
const WEBHOOK_CLIENT_STATE = "flowpro-chat-v1";

// ── Auth middleware ────────────────────────────────────────────────────────
async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  try {
    await getAdminAuth().verifyIdToken(auth.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
/** Make a string safe to use as a Firebase Realtime Database path segment. */
function fbKey(s: string): string {
  return s.replace(/[.#$[\]/]/g, "_");
}

/** Strip HTML tags from a Graph message body. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── POST /api/teams-chat/open ──────────────────────────────────────────────
router.post(
  "/teams-chat/open",
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    const {
      senderId,
      senderEmail,
      senderName,
      recipientId,
      recipientEmail,
    } = req.body as Record<string, string>;

    if (!senderId || !senderEmail || !recipientId || !recipientEmail) {
      return res.status(400).json({
        error: "senderId, senderEmail, recipientId, recipientEmail required",
      });
    }

    try {
      // Stable lookup key — sort so A→B and B→A use the same entry
      const lookupKey = fbKey([senderId, recipientId].sort().join("_"));
      const cached = await readFirebasePath<{
        rawChatId: string;
        senderObjectId?: string;
        recipientObjectId?: string;
      } | null>(`teamsDMs/lookup/${lookupKey}`);

      let rawChatId: string;
      let senderObjectId: string | null = cached?.senderObjectId ?? null;
      let recipientObjectId: string | null = cached?.recipientObjectId ?? null;

      if (cached?.rawChatId) {
        rawChatId = cached.rawChatId;
      } else {
        [senderObjectId, recipientObjectId] = await Promise.all([
          resolveEntraObjectId(senderEmail, senderId),
          resolveEntraObjectId(recipientEmail, recipientId),
        ]);
        if (!senderObjectId || !recipientObjectId) {
          return res.status(400).json({
            error: "Could not resolve Entra Object IDs — check Azure AD user records",
          });
        }
        rawChatId = await findOrCreateOneOnOneChat(
          senderObjectId,
          recipientObjectId
        );
        await writeFirebasePath(`teamsDMs/lookup/${lookupKey}`, {
          rawChatId,
          senderObjectId,
          recipientObjectId,
          senderPmtId: senderId,
          recipientPmtId: recipientId,
          createdAt: Date.now(),
        });
      }

      const chatKey = fbKey(rawChatId);

      // Hydrate Firebase with recent message history from Graph
      try {
        const graphMessages = await getChatMessages(rawChatId, 50);
        for (const msg of graphMessages) {
          const raw = msg.body.contentType === "html"
            ? htmlToText(msg.body.content)
            : msg.body.content;
          const body = raw.trim();
          if (!body) continue;
          const msgKey = fbKey(msg.id);
          const existing = await readFirebasePath(
            `teamsDMs/chats/${chatKey}/messages/${msgKey}`
          );
          if (!existing) {
            await writeFirebasePath(
              `teamsDMs/chats/${chatKey}/messages/${msgKey}`,
              {
                id: msg.id,
                fromObjectId: msg.from?.user?.id ?? "",
                fromName: msg.from?.user?.displayName ?? "Unknown",
                body,
                sentAt: new Date(msg.createdDateTime).getTime(),
                source: "teams",
              }
            );
          }
        }
      } catch (histErr) {
        logger.warn(
          { histErr, rawChatId },
          "[TeamsChat] History hydration failed — continuing"
        );
      }

      // Create or renew the Graph change-notification subscription
      const webhookUrl = `${getTeamsBaseUrl()}/api/teams-chat/webhook`;
      try {
        const existingSub = await readFirebasePath<{
          id: string;
          expiresAt: number;
        } | null>(`teamsDMs/chats/${chatKey}/subscription`);

        if (
          existingSub?.id &&
          existingSub.expiresAt > Date.now() + 5 * 60 * 1000
        ) {
          // Still valid — extend it
          const newExpiry = await renewChatSubscription(existingSub.id);
          await writeFirebasePath(`teamsDMs/chats/${chatKey}/subscription`, {
            id: existingSub.id,
            expiresAt: new Date(newExpiry).getTime(),
          });
        } else {
          const sub = await subscribeToChatMessages(
            rawChatId,
            webhookUrl,
            WEBHOOK_CLIENT_STATE
          );
          await writeFirebasePath(`teamsDMs/chats/${chatKey}/subscription`, {
            id: sub.id,
            expiresAt: new Date(sub.expiresDateTime).getTime(),
          });
        }
      } catch (subErr) {
        // Non-fatal — the chat still works, just without instant push
        logger.warn(
          { subErr, rawChatId },
          "[TeamsChat] Subscription create/renew failed — replies may be delayed"
        );
      }

      logger.info(
        { chatKey, senderName },
        "[TeamsChat] Chat opened"
      );

      return res.json({
        chatKey,
        rawChatId,
        senderObjectId: senderObjectId ?? "",
      });
    } catch (err) {
      logger.error({ err }, "[TeamsChat] /open failed");
      return res.status(500).json({ error: "Failed to open chat" });
    }
  }
);

// ── POST /api/teams-chat/send ──────────────────────────────────────────────
router.post(
  "/teams-chat/send",
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    const { rawChatId, chatKey, message, fromId, fromName, fromObjectId } =
      req.body as Record<string, string>;

    if (!rawChatId || !message?.trim()) {
      return res.status(400).json({ error: "rawChatId and message required" });
    }

    try {
      const key = chatKey || fbKey(rawChatId);
      const now = Date.now();
      // Write to Firebase first so the message always appears in Flow Pro,
      // even if the Teams Graph delivery has a transient failure.
      const tempKey = `fp_${now}`;
      await writeFirebasePath(`teamsDMs/chats/${key}/messages/${tempKey}`, {
        id: tempKey,
        fromId: fromId || "",
        fromObjectId: fromObjectId || "",
        fromName: fromName || "You",
        body: message.trim(),
        sentAt: now,
        source: "flowpro",
      });

      // Deliver to Teams via Bot Connector (proactive message to recipient's bot chat).
      try {
        // Find the other participant in this chat so we know who to notify.
        let recipientAadId: string | null = null;
        if (fromObjectId) {
          try {
            const members = await getChatMembers(rawChatId);
            const other = members.find((m) => m.aadObjectId !== fromObjectId);
            recipientAadId = other?.aadObjectId ?? null;
          } catch (membersErr) {
            logger.warn({ err: membersErr }, "[TeamsChat] Could not resolve chat members — skipping Teams delivery");
          }
        }

        if (recipientAadId) {
          await sendBotProactiveMessage(recipientAadId, fromName || "A colleague", message.trim());
          // Message delivered to Teams — promote temp Firebase entry to a stable key.
          const stableKey = `fp_${now}_sent`;
          await writeFirebasePath(`teamsDMs/chats/${key}/messages/${stableKey}`, {
            id: stableKey,
            fromId: fromId || "",
            fromObjectId: fromObjectId || "",
            fromName: fromName || "You",
            body: message.trim(),
            sentAt: now,
            source: "flowpro",
          });
          await writeFirebasePath(`teamsDMs/chats/${key}/messages/${tempKey}`, null);
          return res.json({ ok: true, messageId: stableKey });
        } else {
          // No recipient resolved — message is in Firebase, Teams delivery skipped.
          return res.json({ ok: true, messageId: tempKey, teamsSkipped: true });
        }
      } catch (botErr) {
        logger.error({ err: botErr }, "[TeamsChat] Bot Connector delivery failed — message saved to Firebase only");
        // Don't fail the request — the message is already in Firebase and visible in Flow Pro.
        return res.json({ ok: true, messageId: tempKey, teamsSkipped: true, teamsError: (botErr as Error).message });
      }
    } catch (err) {
      logger.error({ err }, "[TeamsChat] /send failed");
      return res.status(500).json({ error: "Failed to send message" });
    }
  }
);

// ── POST /api/teams-chat/webhook ───────────────────────────────────────────
// Receives Microsoft Graph change notifications for chat messages.
// NOTE: This endpoint must be publicly reachable — no auth middleware.
router.post("/teams-chat/webhook", async (req: Request, res: Response) => {
  // Validation handshake: Graph sends POST with ?validationToken=xxx
  const validationToken = req.query.validationToken as string | undefined;
  if (validationToken) {
    logger.info("[TeamsChat] Webhook validation handshake received");
    return res.status(200).type("text/plain").send(validationToken);
  }

  // Acknowledge immediately — Graph requires a response within 3 s
  res.status(202).send();
  return;

  type GraphNotification = {
    clientState?: string;
    resource?: string;
    resourceData?: { id?: string };
  };
  const notifications: GraphNotification[] =
    ((req.body as { value?: GraphNotification[] })?.value) ?? [];

  for (const n of notifications) {
    // Verify clientState to reject spoofed notifications
    if (n.clientState !== WEBHOOK_CLIENT_STATE) {
      logger.warn(
        { clientState: n.clientState },
        "[TeamsChat] Webhook clientState mismatch — skipping"
      );
      continue;
    }

    // resource: /chats/{chatId}/messages/{messageId}
    const resource = n.resource ?? "";
    const rawChatId = resource.match(/\/chats\/([^/]+)\//)?.[1] ?? "";
    const messageId = resource.match(/\/messages\/([^/]+)$/)?.[1] ?? "";
    if (!rawChatId || !messageId) continue;
    const chatKey = fbKey(rawChatId);
    const msgKey = fbKey(messageId);

    void (async () => {
      try {
        const existing = await readFirebasePath(
          `teamsDMs/chats/${chatKey}/messages/${msgKey}`
        );
        if (existing) return;

        const msg = await getChatMessage(rawChatId, messageId);
        if (!msg) return;

        const raw =
          msg.body.contentType === "html"
            ? htmlToText(msg.body.content)
            : msg.body.content;
        const body = raw.trim();
        if (!body) return;

        await writeFirebasePath(
          `teamsDMs/chats/${chatKey}/messages/${msgKey}`,
          {
            id: msg.id,
            fromObjectId: msg.from?.user?.id ?? "",
            fromName: msg.from?.user?.displayName ?? "Unknown",
            body,
            sentAt: new Date(msg.createdDateTime).getTime(),
            source: "teams",
          }
        );
        logger.info(
          { chatKey, messageId },
          "[TeamsChat] New Teams message stored in Firebase"
        );
      } catch (err) {
        logger.warn(
          { err, rawChatId, messageId },
          "[TeamsChat] Webhook notification processing failed"
        );
      }
    })();
  }
});

export default router;
