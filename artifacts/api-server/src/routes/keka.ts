import { Router, type Request, type Response, type NextFunction } from "express";
import admin from "firebase-admin";
import { readFirebasePath, writeFirebasePath } from "../lib/firebase-admin";
import { syncKekaData, getKekaCredentials, readKekaApiKey, writeKekaApiKey, readKekaClientId, writeKekaClientId, readKekaClientSecret, writeKekaClientSecret, testKekaConnection } from "../lib/keka-client";
import { logger } from "../lib/logger";

const router = Router();

async function requireAdminRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const idToken = authHeader.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const usersRaw = await readFirebasePath<unknown>("users");
    const users = usersRaw
      ? (Array.isArray(usersRaw)
          ? (usersRaw as Array<{ id: unknown; email?: string; role?: string }>)
          : Object.values(usersRaw as Record<string, { id: unknown; email?: string; role?: string }>)
        ).filter(Boolean)
      : [];

    const firebaseUser = await admin.auth().getUser(uid);
    const email = firebaseUser.email?.toLowerCase();
    const matchedUser = users.find(
      (u) => u.email?.toLowerCase() === email
    );

    if (!matchedUser || !["Super Admin", "Admin", "Director"].includes(matchedUser.role ?? "")) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    next();
  } catch (err) {
    logger.warn({ err }, "[Keka] Auth verification failed");
    res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

router.post("/keka/sync", requireAdminRole, async (_req: Request, res: Response) => {
  logger.info("[Keka] Manual sync triggered via API");
  try {
    const result = await syncKekaData();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "[Keka] Manual sync failed");
    res.status(500).json({ error: "Sync failed", details: String(err) });
  }
});

router.post("/keka/test-connection", requireAdminRole, async (_req: Request, res: Response) => {
  logger.info("[Keka] Connection test triggered via API");
  try {
    const result = await testKekaConnection();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "[Keka] Connection test failed");
    res.status(500).json({ success: false, message: `Test failed: ${String(err)}` });
  }
});

router.get("/keka/settings", requireAdminRole, async (_req: Request, res: Response) => {
  try {
    const config = await readFirebasePath<{ baseUrl?: string; region?: string; apiKey?: string; lastSync?: unknown } | null>(
      "settings/integrations/keka"
    );

    // One-time migration: if an apiKey exists in Firebase, move it to server-side secrets
    if (config?.apiKey) {
      try {
        writeKekaApiKey(config.apiKey);
        await writeFirebasePath("settings/integrations/keka/apiKey", null);
        logger.info("[Keka] Migrated apiKey from Firebase to server-side secrets file");
      } catch (migErr) {
        logger.warn({ migErr }, "[Keka] Could not migrate apiKey — leaving in Firebase until next attempt");
      }
    }

    const apiKeyConfigured = !!readKekaApiKey();
    const clientIdConfigured = !!readKekaClientId();
    const clientSecretConfigured = !!readKekaClientSecret();
    const credentialsReady = apiKeyConfigured && clientIdConfigured && clientSecretConfigured && !!config?.baseUrl;
    const safe = {
      baseUrl: config?.baseUrl || "",
      region: config?.region || "All",
      apiKeyConfigured,
      clientIdConfigured,
      clientSecretConfigured,
      credentialsReady,
      lastSync: config?.lastSync ?? null,
    };
    res.json(safe);
  } catch (err) {
    logger.error({ err }, "[Keka] Failed to read settings");
    res.status(500).json({ error: "Failed to read settings" });
  }
});

router.post("/keka/settings", requireAdminRole, async (req: Request, res: Response) => {
  const { baseUrl, apiKey, clientId, clientSecret, region } = req.body as {
    baseUrl?: string;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    region?: string;
  };

  if (!baseUrl?.trim()) {
    res.status(400).json({ error: "baseUrl is required" });
    return;
  }

  try {
    // Credentials are stored server-side only — never in Firebase.
    if (apiKey?.trim()) writeKekaApiKey(apiKey.trim());
    if (clientId?.trim()) writeKekaClientId(clientId.trim());
    if (clientSecret?.trim()) writeKekaClientSecret(clientSecret.trim());

    // Patch individual fields so ancillary metadata (e.g. lastSync) is preserved.
    await Promise.all([
      writeFirebasePath("settings/integrations/keka/baseUrl", baseUrl.trim()),
      writeFirebasePath("settings/integrations/keka/region", region?.trim() || "All"),
    ]);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "[Keka] Failed to save settings");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
