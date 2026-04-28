import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { logger } from "./logger";
import { format, addDays, parseISO, isValid } from "date-fns";

const SECRETS_DIR = join(process.cwd(), ".secrets");
const KEKA_KEY_FILE = join(SECRETS_DIR, "keka-api-key");
const KEKA_CLIENT_ID_FILE = join(SECRETS_DIR, "keka-client-id");
const KEKA_CLIENT_SECRET_FILE = join(SECRETS_DIR, "keka-client-secret");

const KEKA_PAGE_SIZE = 200;

// ─── OAuth token cache ────────────────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Keka's OAuth2 token exchange endpoint.
 *
 * IMPORTANT: The token MUST be obtained from login.keka.com — NOT from the
 * company subdomain (e.g. ethinos.keka.com/connect/token returns 404).
 * The baseUrl stored in settings is only used for API calls, not auth.
 */
const KEKA_TOKEN_ENDPOINT = "https://login.keka.com/connect/token";

/**
 * Obtain a Keka access token via the grant_type=kekaapi OAuth2 exchange.
 *
 * Keka's HRIS API requires a short-lived Bearer token — the static API key
 * is a credential used in the token exchange, NOT a direct Bearer value.
 *
 * Exchange endpoint: POST https://login.keka.com/connect/token
 * Body: grant_type=kekaapi & client_id & client_secret & api_key & scope=kekaapi
 *
 * The baseUrl parameter (company subdomain) is only used for API calls.
 * Token exchange always targets login.keka.com.
 *
 * NOTE: If API calls return 404 for leave/holiday endpoints, the relevant
 * API modules (Leave Management, Public Holidays) may not be enabled for
 * this app in Keka Admin → Settings → Integrations → Developer Settings.
 */
async function getKekaAccessToken(_baseUrl: string): Promise<string> {
  // Return in-memory cached token while still valid (60-second buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = readKekaClientId();
  const clientSecret = readKekaClientSecret();
  const apiKey = readKekaApiKey();

  if (!clientId || !clientSecret || !apiKey) {
    throw new Error(
      "Keka credentials incomplete. Set Client ID, Client Secret, and API Key in Control Centre → Integrations."
    );
  }

  const body = new URLSearchParams({
    grant_type: "kekaapi",
    client_id: clientId,
    client_secret: clientSecret,
    api_key: apiKey,
    scope: "kekaapi",
  });

  logger.debug({ tokenUrl: KEKA_TOKEN_ENDPOINT }, "[Keka] Fetching OAuth access token");

  const resp = await fetch(KEKA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(
      `Keka token exchange failed (HTTP ${resp.status}): ${errBody.slice(0, 300)}`
    );
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const expiresIn = (data.expires_in ?? 3600) - 60;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  logger.info({ expiresIn }, "[Keka] OAuth token acquired and cached");
  return cachedToken.token;
}

// ─── API key helpers (legacy / fallback) ─────────────────────────────────────

/**
 * Read the Keka API key from KEKA_API_KEY env var or the server-side secrets file.
 * The API key is NEVER stored in Firebase to prevent client-readable exposure.
 */
export function readKekaApiKey(): string | null {
  if (process.env.KEKA_API_KEY?.trim()) return process.env.KEKA_API_KEY.trim();
  try {
    const key = readFileSync(KEKA_KEY_FILE, "utf8").trim();
    return key || null;
  } catch {
    return null;
  }
}

/**
 * Persist the Keka API key to the server-side secrets file (mode 0o600).
 */
export function writeKekaApiKey(key: string): void {
  mkdirSync(SECRETS_DIR, { recursive: true });
  writeFileSync(KEKA_KEY_FILE, key.trim(), { encoding: "utf8", mode: 0o600 });
}

export function readKekaClientId(): string | null {
  if (process.env.KEKA_CLIENT_ID?.trim()) return process.env.KEKA_CLIENT_ID.trim();
  try {
    const val = readFileSync(KEKA_CLIENT_ID_FILE, "utf8").trim();
    return val || null;
  } catch {
    return null;
  }
}

export function writeKekaClientId(value: string): void {
  mkdirSync(SECRETS_DIR, { recursive: true });
  writeFileSync(KEKA_CLIENT_ID_FILE, value.trim(), { encoding: "utf8", mode: 0o600 });
}

export function readKekaClientSecret(): string | null {
  if (process.env.KEKA_CLIENT_SECRET?.trim()) return process.env.KEKA_CLIENT_SECRET.trim();
  try {
    const val = readFileSync(KEKA_CLIENT_SECRET_FILE, "utf8").trim();
    return val || null;
  } catch {
    return null;
  }
}

export function writeKekaClientSecret(value: string): void {
  mkdirSync(SECRETS_DIR, { recursive: true });
  writeFileSync(KEKA_CLIENT_SECRET_FILE, value.trim(), { encoding: "utf8", mode: 0o600 });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KekaCredentials {
  baseUrl: string;
  apiKey: string;
  region?: string;
}

export interface LeaveRecord {
  leaveId: string;
  userId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  session: "full" | "first-half" | "second-half" | "half-day";
  /** "approved" = status 1 from Keka; "pending" = status 0 (requested, not yet approved) */
  status: "approved" | "pending";
}

export interface HolidayRecord {
  holidayId: string;
  name: string;
  date: string;
  region: string;
}

export interface KekaSyncResult {
  success: boolean;
  leaveRecordsWritten: number;
  holidayRecordsWritten: number;
  usersMatched: number;
  usersUnmatched: number;
  /** PMT users whose email was not found in Keka's employee list */
  unmatchedPmtUsers?: Array<{ id: string; name?: string; email?: string }>;
  /** PMT users matched in Keka by email but with no leave requests in the current calendar year */
  noLeavePmtUsers?: Array<{ id: string; name?: string; email?: string }>;
  error?: string;
  syncedAt: string;
}

export interface KekaConnectionTestResult {
  success: boolean;
  message: string;
  httpStatus?: number;
}

interface KekaEmployee {
  id: string;
  displayName?: string;
  email?: string;
}

/**
 * Response shape from GET /api/v1/time/leaverequests
 *
 * Key fields:
 *  - employeeIdentifier: Keka employee GUID (matches /hris/employees[*].id)
 *  - fromDate / toDate: ISO date strings for leave span
 *  - fromSession / toSession:
 *      0 = first half (morning)
 *      1 = second half (afternoon)
 *      full-day = fromSession:0 + toSession:1
 *      first-half only = fromSession:0 + toSession:0
 *      second-half only = fromSession:1 + toSession:1
 *  - status: 0=pending, 1=approved, 2=rejected, 3=cancelled
 *  - selection[*].leaveTypeName: human-readable leave type
 */
interface KekaLeaveRecord {
  id: string;
  employeeIdentifier: string;
  employeeNumber?: string;
  fromDate?: string;
  toDate?: string;
  fromSession?: number;
  toSession?: number;
  status?: number;
  selection?: Array<{ leaveTypeName?: string; count?: number }>;
  // Legacy fallbacks (used by older API shapes — kept for type safety)
  from?: string;
  to?: string;
  halfDayType?: string;
  sessionType?: string;
  employee?: KekaEmployee;
  leaveType?: { name?: string };
}

interface KekaHolidayRecord {
  id: string;
  name?: string;
  date?: string;
  region?: string;
  locationName?: string;
}

/**
 * Keka API pagination envelope.
 * The /time/* endpoints return pagination metadata at the root level:
 *   { data, pageNumber, pageSize, totalPages, totalRecords, succeeded, ... }
 * The /hris/* endpoints may use pageInfo.totalCount instead.
 */
interface KekaApiResponse<T> {
  data?: T[];
  response?: T[];
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
  totalRecords?: number;
  succeeded?: boolean;
  // Legacy HRIS envelope
  pageInfo?: { totalCount?: number };
}

interface PMTUser {
  id: string | number;
  email?: string;
  kekaEmployeeId?: string;
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

async function kekaGetPage<T>(
  baseUrl: string,
  path: string,
  pageNumber: number
): Promise<{ items: T[]; hasMore: boolean }> {
  const token = await getKekaAccessToken(baseUrl);
  const separator = path.includes("?") ? "&" : "?";
  const url = `${baseUrl.replace(/\/$/, "")}${path}${separator}pageNumber=${pageNumber}&pageSize=${KEKA_PAGE_SIZE}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Keka API error ${resp.status} for ${path}: ${body}`);
  }

  const body = (await resp.json()) as KekaApiResponse<T>;
  const items = (body.data ?? body.response ?? []) as T[];

  // Support both pagination shapes:
  //   /time/* endpoints: { totalRecords, totalPages, pageNumber, pageSize } at root
  //   /hris/* endpoints: { pageInfo: { totalCount } }
  const totalCount =
    body.totalRecords ?? body.pageInfo?.totalCount;
  const hasMore =
    totalCount !== undefined
      ? pageNumber * KEKA_PAGE_SIZE < totalCount
      : items.length >= KEKA_PAGE_SIZE;

  return { items, hasMore };
}

async function kekaGet<T>(baseUrl: string, path: string): Promise<T[]> {
  const allItems: T[] = [];
  let pageNumber = 1;

  while (true) {
    const { items, hasMore } = await kekaGetPage<T>(
      baseUrl,
      path,
      pageNumber
    );
    allItems.push(...items);
    if (!hasMore) break;
    pageNumber++;
    if (pageNumber > 50) {
      logger.warn({ path }, "[Keka] Pagination safety limit reached (50 pages)");
      break;
    }
  }

  return allItems;
}

/**
 * Map Keka leave request session values to PMT session type.
 *
 * Keka /time/leaverequests uses numeric fromSession / toSession:
 *   0 = first half (morning)
 *   1 = second half (afternoon)
 *   full day = fromSession:0 + toSession:1
 *
 * Legacy string-based halfDayType is kept as a fallback.
 */
function mapLeaveSession(
  fromSession?: number,
  toSession?: number,
  legacyType?: string
): "full" | "first-half" | "second-half" | "half-day" {
  // Numeric session values from /time/leaverequests
  if (fromSession !== undefined && toSession !== undefined) {
    if (fromSession === 0 && toSession === 1) return "full";
    if (fromSession === 0 && toSession === 0) return "first-half";
    if (fromSession === 1 && toSession === 1) return "second-half";
  }
  // Legacy string fallback
  if (legacyType) {
    const v = legacyType.toLowerCase();
    if (v.includes("first") || v === "firsthalf") return "first-half";
    if (v.includes("second") || v === "secondhalf") return "second-half";
    if (v.includes("half")) return "half-day";
  }
  return "full";
}

function expandLeaveDates(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (!isValid(start) || !isValid(end)) return [];
  const dates: string[] = [];
  let cur = start;
  while (cur <= end) {
    dates.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return dates;
}

// ─── Credential resolution ────────────────────────────────────────────────────

/**
 * Resolve Keka credentials from Firebase (baseUrl / region) + env/secrets (API key).
 * Returns null if either the API key or the base URL is not configured.
 */
export async function getKekaCredentials(): Promise<KekaCredentials | null> {
  try {
    const apiKey = readKekaApiKey();
    if (!apiKey) return null;

    const config = await readFirebasePath<{
      baseUrl?: string;
      region?: string;
    } | null>("settings/integrations/keka");
    if (!config?.baseUrl) return null;

    return { baseUrl: config.baseUrl, apiKey, region: config.region };
  } catch (err) {
    logger.error({ err }, "[Keka] Failed to read credentials");
    return null;
  }
}

// ─── Connection test ──────────────────────────────────────────────────────────

export async function testKekaConnection(): Promise<KekaConnectionTestResult> {
  const creds = await getKekaCredentials();
  if (!creds) {
    return {
      success: false,
      message:
        "Keka credentials are not configured. Save a Base URL first, and ensure API credentials are set.",
    };
  }

  // Step 1: Verify token exchange with login.keka.com
  let token: string;
  try {
    token = await getKekaAccessToken(creds.baseUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `OAuth token exchange failed: ${msg}`,
    };
  }

  // Step 2: Probe the company subdomain to confirm the token is accepted.
  // /api/v1/hris/employees is used as the reachability probe.
  //   HTTP 200/2xx → fully connected, employees module accessible
  //   HTTP 403      → token accepted, but this app lacks the employees privilege
  //                   (this is expected — it still confirms the auth flow works)
  //   HTTP 404      → endpoint not found; base URL may be wrong
  //   Other errors  → connectivity / configuration problem
  const probeUrl = `${creds.baseUrl.replace(/\/$/, "")}/api/v1/hris/employees?pageNumber=1&pageSize=1`;

  try {
    const resp = await fetch(probeUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (resp.ok) {
      return {
        success: true,
        message: `Connected to ${creds.baseUrl} (HTTP ${resp.status}). OAuth token accepted.`,
        httpStatus: resp.status,
      };
    }

    if (resp.status === 403) {
      // Token is valid and the API is reachable — the app just lacks the
      // "employees" module permission. Leave/holiday sync depends on separate
      // module permissions (Leave Management, Public Holidays) that must be
      // enabled in Keka Admin → Developer Settings for this app.
      return {
        success: true,
        message:
          `OAuth token accepted by ${creds.baseUrl}. ` +
          `API is reachable, but this app has limited module access (HTTP 403 on employees probe). ` +
          `Ensure the Leave Management and Public Holidays modules are enabled for this app in ` +
          `Keka Admin → Settings → Integrations → Developer Settings.`,
        httpStatus: resp.status,
      };
    }

    const body = await resp.text().catch(() => "");
    return {
      success: false,
      message: `Keka API probe returned HTTP ${resp.status}. ${
        body ? `Detail: ${body.slice(0, 200)}` : "Check your Base URL."
      }`,
      httpStatus: resp.status,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Could not reach ${creds.baseUrl}: ${msg}`,
    };
  }
}

// ─── Full sync ────────────────────────────────────────────────────────────────

export async function syncKekaData(): Promise<KekaSyncResult> {
  const syncedAt = new Date().toISOString();

  const creds = await getKekaCredentials();
  if (!creds) {
    return {
      success: false,
      leaveRecordsWritten: 0,
      holidayRecordsWritten: 0,
      usersMatched: 0,
      usersUnmatched: 0,
      error: "Keka credentials not configured",
      syncedAt,
    };
  }

  const usersRaw = await readFirebasePath<unknown>("users");
  // PMT users are stored in two layouts:
  //   1. Numeric-indexed array: users/0, users/1 ... — objects include an `id` field
  //   2. Key-based: users/{userId} — the Firebase key IS the id; `id` may be absent
  // We normalise both by falling back to the Firebase key when `id` is missing.
  // We also track firebaseKey (the actual path segment) per user so that writes
  // (e.g. kekaEmployeeId) land on the correct existing node rather than creating
  // orphan entries under the user's id value.
  const pmtUsers: PMTUser[] = [];
  const userIdToFirebaseKey: Record<string, string> = {};

  if (usersRaw) {
    if (Array.isArray(usersRaw)) {
      // Clean array — each index is the Firebase key
      (usersRaw as PMTUser[]).forEach((u, idx) => {
        if (!u) return;
        pmtUsers.push(u);
        const uid = u.id != null ? String(u.id) : String(idx);
        userIdToFirebaseKey[uid] = String(idx);
      });
    } else {
      const entries = Object.entries(usersRaw as Record<string, PMTUser>).filter(([, u]) => Boolean(u));
      // Numeric keys are real array positions; string keys may be orphan entries
      // from previous writes that used the user's id value as the path segment.
      // Process numeric keys first so they always win for the firebaseKey mapping.
      const numericEntries = entries.filter(([k]) => /^\d+$/.test(k));
      const stringEntries = entries.filter(([k]) => !/^\d+$/.test(k));

      numericEntries.forEach(([key, u]) => {
        pmtUsers.push(u);
        if (u.id != null) userIdToFirebaseKey[String(u.id)] = key;
      });

      // Only include string-key entries that don't duplicate a numeric-key user.
      const orphanKeysToDelete: string[] = [];
      stringEntries.forEach(([key, u]) => {
        const normalized = { ...u, id: u.id ?? key };
        const uid = String(normalized.id);
        if (!userIdToFirebaseKey[uid]) {
          // Genuinely new user stored by id-key, not an orphan
          pmtUsers.push(normalized);
          userIdToFirebaseKey[uid] = key;
        } else {
          // Already mapped by a numeric key — this is an orphan from a prior
          // incorrect write. Schedule it for deletion.
          orphanKeysToDelete.push(key);
        }
      });

      // Delete orphan entries so they don't pollute future reads
      for (const key of orphanKeysToDelete) {
        try {
          await writeFirebasePath(`users/${key}`, null);
          logger.info({ key }, "[Keka] Deleted orphan user entry from Firebase");
        } catch { /* best-effort */ }
      }
    }
  }

  const emailToUserId: Record<string, string> = {};
  const kekaIdToUserId: Record<string, string> = {};
  for (const u of pmtUsers) {
    const uid = u.id != null ? String(u.id) : undefined;
    if (!uid || uid === "undefined") continue;
    if (u.email) emailToUserId[u.email.toLowerCase()] = uid;
    if (u.kekaEmployeeId) kekaIdToUserId[u.kekaEmployeeId] = uid;
  }

  const today = new Date();

  let leaveRecordsWritten = 0;
  let holidayRecordsWritten = 0;
  let usersMatched = 0;
  const unmatchedKekaIds = new Set<string>();
  let unmatchedPmtUsers: Array<{ id: string; name?: string; email?: string }> = [];
  let noLeavePmtUsers: Array<{ id: string; name?: string; email?: string }> = [];
  // Tracks PMT user IDs that are confirmed in Keka (email match or stored kekaEmployeeId)
  const kekaMatchedPmtIds = new Set<string>();
  // Tracks PMT user IDs with at least one leave record in the current calendar year
  const usersWithLeaveThisYear = new Set<string>();
  const currentYear = today.getFullYear().toString();

  try {
    // Step 1: Pre-fetch employees to build Keka GUID → email map.
    // /api/v1/hris/employees returns { data: [{ id, email, ... }] }
    const kekaIdToEmail: Record<string, string> = {};
    try {
      const employees = await kekaGet<KekaEmployee>(
        creds.baseUrl,
        "/api/v1/hris/employees"
      );
      for (const emp of employees) {
        if (emp.id && emp.email) {
          kekaIdToEmail[emp.id] = emp.email.toLowerCase();
        }
      }
      logger.info({ count: employees.length }, "[Keka] Pre-fetched employee list for email matching");

      // Build reverse map: email → Keka employee ID
      const emailToKekaId: Record<string, string> = {};
      for (const [kekaId, email] of Object.entries(kekaIdToEmail)) {
        emailToKekaId[email] = kekaId;
      }

      // Step 1b: Write kekaEmployeeId for ALL PMT users matched by email,
      // even if they have no leave requests. This ensures the Users tab badge
      // shows "Matched" for employees in Keka regardless of leave history.
      for (const u of pmtUsers) {
        const uid = String(u.id ?? "");
        if (!uid || uid === "undefined" || !u.email) continue;

        let kekaId: string | undefined = u.kekaEmployeeId;
        if (!kekaId) {
          kekaId = emailToKekaId[u.email.toLowerCase()];
        }
        if (!kekaId) continue;

        // User is confirmed in Keka
        kekaMatchedPmtIds.add(uid);
        kekaIdToUserId[kekaId] = uid;

        // Persist kekaEmployeeId if not already set
        if (!u.kekaEmployeeId) {
          const firebaseKey = userIdToFirebaseKey[uid] ?? uid;
          await writeFirebasePath(`users/${firebaseKey}/kekaEmployeeId`, kekaId);
          logger.info({ uid, kekaId }, "[Keka] Wrote kekaEmployeeId for email-matched user");
        }
      }

      // Mark users who already had a stored kekaEmployeeId as matched
      for (const u of pmtUsers) {
        if (u.kekaEmployeeId) kekaMatchedPmtIds.add(String(u.id ?? ""));
      }

      // Compute PMT users whose email is truly not in Keka at all.
      const kekaEmailSet = new Set(Object.values(kekaIdToEmail));
      unmatchedPmtUsers = pmtUsers
        .filter(u => {
          const uid = String(u.id ?? "");
          if (!uid || uid === "undefined" || !u.email) return false;
          if (kekaMatchedPmtIds.has(uid)) return false; // already confirmed in Keka
          return !kekaEmailSet.has(u.email.toLowerCase());
        })
        .map(u => ({ id: String(u.id), name: u.name, email: u.email }));

      logger.info({ count: unmatchedPmtUsers.length }, "[Keka] PMT users with no Keka email match");
    } catch (empErr) {
      logger.warn({ empErr }, "[Keka] Could not pre-fetch employees — falling back to kekaEmployeeId matching only");
      // Fall back: mark users with stored kekaEmployeeId as matched
      for (const u of pmtUsers) {
        if (u.kekaEmployeeId) kekaMatchedPmtIds.add(String(u.id ?? ""));
      }
    }

    // Step 2: Fetch all leave requests (no date filter).
    // Path:   GET /api/v1/time/leaverequests
    // Status: 1 = approved (0=pending, 2=rejected, 3=cancelled)
    //
    // NOTE: The Keka API's "from"/"to" query params exhibit non-standard
    // behaviour (e.g. 12-month range returns 0, 2-month ranges return > total).
    // We fetch all records and apply date-range logic in code instead.
    const leaves = await kekaGet<KekaLeaveRecord>(
      creds.baseUrl,
      "/api/v1/time/leaverequests"
    );

    logger.info({ count: leaves.length }, "[Keka] Fetched all leave records");

    // Only keep leaves that are within a 30 days back → 180 days forward window.
    // This covers recent/ongoing leaves as well as planning ahead.
    const windowStart = addDays(today, -30);
    const windowEnd = addDays(today, 180);

    for (const leave of leaves) {
      // Sync approved (1) and pending/requested (0) leaves.
      // Rejected (2) and cancelled (3) are excluded.
      if (leave.status !== 1 && leave.status !== 0) continue;

      // Skip leaves entirely outside the sync window
      const leaveStart = parseISO((leave.fromDate ?? leave.from ?? "").slice(0, 10));
      const leaveEnd = parseISO((leave.toDate ?? leave.to ?? (leave.fromDate ?? "")).slice(0, 10));
      if (isValid(leaveEnd) && leaveEnd < windowStart) continue;
      if (isValid(leaveStart) && leaveStart > windowEnd) continue;

      const kekaEmpId = leave.employeeIdentifier ?? leave.employee?.id ?? "";
      if (!kekaEmpId) continue;

      // Match: kekaEmployeeId stored in PMT → or email via employee pre-fetch
      let pmtUserId = kekaIdToUserId[kekaEmpId];
      if (!pmtUserId) {
        const kekaEmail = kekaIdToEmail[kekaEmpId] ?? leave.employee?.email?.toLowerCase();
        if (kekaEmail) pmtUserId = emailToUserId[kekaEmail];
      }

      if (!pmtUserId) {
        unmatchedKekaIds.add(kekaEmpId);
        continue;
      }

      usersMatched++;

      // Field names in /time/leaverequests: fromDate / toDate / selection / fromSession / toSession
      const startDate = (leave.fromDate ?? leave.from ?? "").slice(0, 10);

      // Track if this user has any leave in the current calendar year (regardless of sync window)
      if (startDate.startsWith(currentYear)) {
        usersWithLeaveThisYear.add(pmtUserId);
      }
      const endDate = (leave.toDate ?? leave.to ?? startDate).slice(0, 10);
      const leaveType =
        leave.selection?.[0]?.leaveTypeName ??
        leave.leaveType?.name ??
        "Leave";
      const session = mapLeaveSession(
        leave.fromSession,
        leave.toSession,
        leave.halfDayType ?? leave.sessionType
      );
      const dates = expandLeaveDates(startDate, endDate);

      for (const dateKey of dates) {
        const record: LeaveRecord = {
          leaveId: leave.id,
          userId: pmtUserId,
          startDate,
          endDate,
          leaveType,
          session: dates.length > 1 ? "full" : session,
          status: leave.status === 1 ? "approved" : "pending",
        };
        await writeFirebasePath(`leaveData/${pmtUserId}/${dateKey}`, record);
        leaveRecordsWritten++;
      }
    }
  } catch (err) {
    logger.error({ err }, "[Keka] Failed to fetch/store leave records");
    return {
      success: false,
      leaveRecordsWritten,
      holidayRecordsWritten,
      usersMatched,
      usersUnmatched: unmatchedKekaIds.size,
      error: String(err),
      syncedAt,
    };
  }

  // Compute matched users with no leave this year
  noLeavePmtUsers = pmtUsers
    .filter(u => {
      const uid = String(u.id ?? "");
      return uid && uid !== "undefined" && kekaMatchedPmtIds.has(uid) && !usersWithLeaveThisYear.has(uid);
    })
    .map(u => ({ id: String(u.id), name: u.name, email: u.email }));
  logger.info({ count: noLeavePmtUsers.length }, "[Keka] Matched PMT users with no leave this year");

  try {
    const thisYear = today.getFullYear();
    const nextYear = thisYear + 1;
    const region = creds.region || "All";

    for (const year of [thisYear, nextYear]) {
      // Correct path: /api/v1/hris/publicholidays
      // (Confirmed present on Keka gateway; requires Public Holidays module access)
      const holidays = await kekaGet<KekaHolidayRecord>(
        creds.baseUrl,
        `/api/v1/hris/publicholidays?year=${year}`
      );

      logger.info({ count: holidays.length, year }, "[Keka] Fetched holidays");

      for (const holiday of holidays) {
        if (!holiday.date) continue;
        const dateKey = holiday.date.slice(0, 10);
        const holidayRegion = holiday.locationName ?? holiday.region ?? region;
        const record: HolidayRecord = {
          holidayId: holiday.id,
          name: holiday.name ?? "Holiday",
          date: dateKey,
          region: holidayRegion,
        };
        await writeFirebasePath(
          `publicHolidays/${holidayRegion}/${dateKey}`,
          record
        );
        if (holidayRegion !== "All") {
          await writeFirebasePath(`publicHolidays/All/${dateKey}`, record);
        }
        holidayRecordsWritten++;
      }
    }
  } catch (err) {
    logger.error({ err }, "[Keka] Failed to fetch/store holiday records");
  }

  const result: KekaSyncResult = {
    success: true,
    leaveRecordsWritten,
    holidayRecordsWritten,
    usersMatched,
    usersUnmatched: unmatchedKekaIds.size,
    unmatchedPmtUsers,
    noLeavePmtUsers,
    syncedAt,
  };

  await writeFirebasePath("settings/integrations/keka/lastSync", result);
  logger.info(result, "[Keka] Sync complete");

  return result;
}

// ─── Leave / holiday conflict check ──────────────────────────────────────────

export interface LeaveConflict {
  type: "full-leave" | "half-leave" | "holiday";
  leaveType?: string;
  session?: "first-half" | "second-half" | "half-day";
  holidayName?: string;
  userId: string;
  date: string;
}

export async function checkLeaveConflict(
  userId: string,
  dateStr: string,
  region = "All"
): Promise<LeaveConflict | null> {
  try {
    const [leaveRecord, holidayRecord] = await Promise.all([
      readFirebasePath<LeaveRecord | null>(`leaveData/${userId}/${dateStr}`),
      readFirebasePath<HolidayRecord | null>(
        `publicHolidays/${region}/${dateStr}`
      ),
    ]);

    if (leaveRecord) {
      if (leaveRecord.session === "full") {
        return {
          type: "full-leave",
          leaveType: leaveRecord.leaveType,
          userId,
          date: dateStr,
        };
      }
      return {
        type: "half-leave",
        leaveType: leaveRecord.leaveType,
        session: leaveRecord.session,
        userId,
        date: dateStr,
      };
    }

    if (holidayRecord) {
      return {
        type: "holiday",
        holidayName: holidayRecord.name,
        userId,
        date: dateStr,
      };
    }

    return null;
  } catch (err) {
    logger.warn(
      { err, userId, dateStr },
      "[LeaveCheck] Error checking leave conflict"
    );
    return null;
  }
}
