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
  getBotUserChatId,
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

    const t0 = Date.now();
    try {
      // ── 1. Resolve the chat ID (fast: Firebase cache or parallel Graph calls) ──
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
      const resolveMs = Date.now() - t0;

      // ── 2. Respond immediately — UI is unblocked ──────────────────────────
      // History hydration and subscription management run in the background so
      // they never delay the chat from opening. Messages arrive via the Firebase
      // onValue listener once hydration completes.
      logger.info(
        { chatKey, senderName, resolveMs },
        "[TeamsChat] Chat opened — hydration/subscription running in background"
      );
      res.json({ chatKey, rawChatId, senderObjectId: senderObjectId ?? "" });

      // ── 3. Background: hydrate Firebase with recent message history ────────
      void (async () => {
        const hStart = Date.now();
        try {
          const graphMessages = await getChatMessages(rawChatId, 50);
          let hydrated = 0;
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
              hydrated++;
            }
          }
          logger.info(
            { chatKey, hydrated, totalFetched: graphMessages.length, ms: Date.now() - hStart },
            "[TeamsChat] Background history hydration complete"
          );
        } catch (histErr) {
          logger.warn(
            { histErr, rawChatId, ms: Date.now() - hStart },
            "[TeamsChat] Background history hydration failed"
          );
        }
      })();

      // ── 4. Background: create / renew the Graph change-notification subscription
      //
      // Recovery guarantee: the chat-subscription-scheduler runs at startup and
      // every 10 minutes to renew or recreate any subscriptions that lapsed while
      // the server was down. Re-opening the chat also retries hydration and this
      // block, so a lost background job here is always recoverable without manual
      // intervention.
      //
      // Renewal policy (matches the scheduler's RENEW_BEFORE_EXPIRY_MS = 12 min):
      //   • Sub healthy (> 12 min remaining) → skip; scheduler owns the renewal.
      //   • Sub near expiry (≤ 12 min remaining) → renew proactively.
      //   • Sub missing or already expired   → create a new subscription.
      //
      // This avoids unnecessary Graph calls when users open chats frequently.
      const OPEN_RENEW_BEFORE_MS = 12 * 60 * 1000;
      void (async () => {
        const sStart = Date.now();
        const webhookUrl = `${getTeamsBaseUrl()}/api/teams-chat/webhook`;
        try {
          const existingSub = await readFirebasePath<{
            id: string;
            expiresAt: number;
          } | null>(`teamsDMs/chats/${chatKey}/subscription`);

          const now = Date.now();

          if (existingSub?.id && existingSub.expiresAt > now + OPEN_RENEW_BEFORE_MS) {
            // Subscription is healthy — nothing to do; the scheduler will renew it.
            logger.info(
              { chatKey, expiresIn: Math.round((existingSub.expiresAt - now) / 60_000) + "m" },
              "[TeamsChat] Background subscription still valid — skipping renewal"
            );
          } else if (existingSub?.id && existingSub.expiresAt > now) {
            // Near expiry — renew proactively.
            const newExpiry = await renewChatSubscription(existingSub.id);
            await writeFirebasePath(`teamsDMs/chats/${chatKey}/subscription`, {
              id: existingSub.id,
              expiresAt: new Date(newExpiry).getTime(),
            });
            logger.info({ chatKey, ms: Date.now() - sStart }, "[TeamsChat] Background subscription renewed");
          } else {
            // Missing or expired — create a new subscription.
            const sub = await subscribeToChatMessages(
              rawChatId,
              webhookUrl,
              WEBHOOK_CLIENT_STATE
            );
            await writeFirebasePath(`teamsDMs/chats/${chatKey}/subscription`, {
              id: sub.id,
              expiresAt: new Date(sub.expiresDateTime).getTime(),
            });
            logger.info({ chatKey, ms: Date.now() - sStart }, "[TeamsChat] Background subscription ensured");
          }
        } catch (subErr) {
          logger.warn(
            { subErr, rawChatId, ms: Date.now() - sStart },
            "[TeamsChat] Background subscription create/renew failed — replies may be delayed"
          );
        }
      })();

      return;
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
      // Key prefix "flowpro_" marks outgoing Flow Pro messages; it is NOT a
      // content-fingerprint — do not confuse with the dedup logic that was
      // removed from the webhook handler.
      const tempKey = `flowpro_${now}`;
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
          const stableKey = `flowpro_${now}_sent`;
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

          // Subscribe to the bot-user chat so replies from Teams flow back into Flow Pro.
          // This is the chat the bot uses, which is different from the user-to-user rawChatId.
          void (async () => {
            try {
              const botChatId = await getBotUserChatId(recipientAadId);
              if (!botChatId) return;
              const botChatKey = fbKey(botChatId);

              // Persist a mapping: botChatKey → flowpro chatKey so the webhook can route replies.
              await writeFirebasePath(`teamsDMs/botChatMap/${botChatKey}`, key);

              // Create or renew a subscription on the bot-user chat.
              const webhookUrl = `${getTeamsBaseUrl()}/api/teams-chat/webhook`;
              const existingSub = await readFirebasePath<{
                id: string;
                expiresAt: number;
              } | null>(`teamsDMs/botChats/${botChatKey}/subscription`);

              if (
                existingSub?.id &&
                existingSub.expiresAt > Date.now() + 5 * 60 * 1000
              ) {
                const newExpiry = await renewChatSubscription(existingSub.id);
                await writeFirebasePath(`teamsDMs/botChats/${botChatKey}/subscription`, {
                  id: existingSub.id,
                  expiresAt: new Date(newExpiry).getTime(),
                });
              } else {
                const sub = await subscribeToChatMessages(botChatId, webhookUrl, WEBHOOK_CLIENT_STATE);
                await writeFirebasePath(`teamsDMs/botChats/${botChatKey}/subscription`, {
                  id: sub.id,
                  expiresAt: new Date(sub.expiresDateTime).getTime(),
                });
              }
              logger.info({ botChatKey, key }, "[TeamsChat] Bot-chat subscription ensured for reply tracking");
            } catch (subErr) {
              logger.warn({ err: subErr }, "[TeamsChat] Bot-chat subscription failed — replies may not appear in Flow Pro");
            }
          })();

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
    const incomingChatKey = fbKey(rawChatId);
    const msgKey = fbKey(messageId);

    void (async () => {
      try {
        // Check if this is a bot-user chat — map it to the Flow Pro chat key if so.
        // Bot-user chats are subscribed via /send; they map to a user-to-user chatKey.
        const botMappedKey = await readFirebasePath<string | null>(
          `teamsDMs/botChatMap/${incomingChatKey}`
        );
        const chatKey = botMappedKey ?? incomingChatKey;

        // Fast path: exact message-key match (same chat, same Graph message ID)
        const existing = await readFirebasePath(
          `teamsDMs/chats/${chatKey}/messages/${msgKey}`
        );
        if (existing) return;

        const msg = await getChatMessage(rawChatId, messageId);
        if (!msg) return;

        // ── Guard 1: skip bot/application messages ─────────────────────────
        // When the bot-user subscription (/send) is active, every outgoing
        // bot message echoes back as a webhook notification. These have no
        // from.user (Graph sets from.application instead). Storing them would
        // duplicate every Flow Pro → Teams message in the chat history.
        if (!msg.from?.user?.id) {
          logger.info(
            { chatKey, messageId, viaBot: !!botMappedKey },
            "[TeamsChat] Skipping bot/system message (no from.user)"
          );
          return;
        }

        const raw =
          msg.body.contentType === "html"
            ? htmlToText(msg.body.content)
            : msg.body.content;
        const body = raw.trim();
        if (!body) return;

        // Duplicate protection is handled solely by the fast-path msgKey check
        // above (teamsDMs/chats/{chatKey}/messages/{msgKey} already exists →
        // return early). Content-fingerprint dedup was removed because it uses
        // sender + body + minute-bucket, which suppresses legitimate repeated
        // messages ("ok", "thanks") sent by the same person within one minute.
        const msgSentAt = new Date(msg.createdDateTime).getTime();

        await writeFirebasePath(
          `teamsDMs/chats/${chatKey}/messages/${msgKey}`,
          {
            id: msg.id,
            fromObjectId: msg.from.user.id,
            fromName: msg.from.user.displayName ?? "Unknown",
            body,
            sentAt: msgSentAt,
            source: "teams",
          }
        );
        logger.info(
          { chatKey, messageId, viaBot: !!botMappedKey },
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
  return;
});

export default router;
