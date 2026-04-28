import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { logger } from "./logger";
import { format, addDays, parseISO, isValid } from "date-fns";

const SECRETS_DIR = join(process.cwd(), ".secrets");
const KEKA_KEY_FILE = join(SECRETS_DIR, "keka-api-key");

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

  const clientId = process.env.KEKA_CLIENT_ID?.trim();
  const clientSecret = process.env.KEKA_CLIENT_SECRET?.trim();
  const apiKey = readKekaApiKey();

  if (!clientId || !clientSecret || !apiKey) {
    throw new Error(
      "Keka credentials incomplete. Ensure KEKA_CLIENT_ID, KEKA_CLIENT_SECRET, and KEKA_API_KEY are set as Replit secrets."
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

interface KekaLeaveRecord {
  id: string;
  from?: string;
  to?: string;
  halfDayType?: string;
  sessionType?: string;
  employee: KekaEmployee;
  leaveType?: { name?: string };
}

interface KekaHolidayRecord {
  id: string;
  name?: string;
  date?: string;
  region?: string;
  locationName?: string;
}

interface KekaApiResponse<T> {
  data?: T[];
  response?: T[];
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

  const totalCount = body.pageInfo?.totalCount;
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

function mapHalfDaySession(
  raw?: string
): "full" | "first-half" | "second-half" | "half-day" {
  if (!raw) return "full";
  const v = raw.toLowerCase();
  if (v.includes("first") || v === "firsthalf") return "first-half";
  if (v.includes("second") || v === "secondhalf") return "second-half";
  if (v.includes("half")) return "half-day";
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
  const pmtUsers: PMTUser[] = usersRaw
    ? (Array.isArray(usersRaw)
        ? (usersRaw as PMTUser[])
        : Object.values(usersRaw as Record<string, PMTUser>)
      ).filter(Boolean)
    : [];

  const emailToUserId: Record<string, string> = {};
  const kekaIdToUserId: Record<string, string> = {};
  for (const u of pmtUsers) {
    if (u.email) emailToUserId[u.email.toLowerCase()] = String(u.id);
    if (u.kekaEmployeeId) kekaIdToUserId[u.kekaEmployeeId] = String(u.id);
  }

  const today = new Date();
  const fromDate = format(today, "yyyy-MM-dd");
  const toDate = format(addDays(today, 92), "yyyy-MM-dd");

  let leaveRecordsWritten = 0;
  let holidayRecordsWritten = 0;
  let usersMatched = 0;
  const unmatchedKekaIds = new Set<string>();

  try {
    // Correct path: /api/v1/hris/leavemanagement/leavetransactions
    // (Confirmed present on Keka gateway; requires Leave Management module access
    // to be enabled for this app in Keka Admin → Developer Settings)
    const leaves = await kekaGet<KekaLeaveRecord>(
      creds.baseUrl,
      `/api/v1/hris/leavemanagement/leavetransactions?startDate=${fromDate}&endDate=${toDate}`
    );

    logger.info({ count: leaves.length }, "[Keka] Fetched leave records");

    for (const leave of leaves) {
      if (!leave.employee) continue;

      const kekaEmail = leave.employee.email?.toLowerCase();
      const kekaEmpId = leave.employee.id;

      let pmtUserId = kekaEmail ? emailToUserId[kekaEmail] : undefined;
      if (!pmtUserId && kekaEmpId) {
        pmtUserId = kekaIdToUserId[kekaEmpId];
      }

      if (!pmtUserId) {
        if (kekaEmpId) unmatchedKekaIds.add(kekaEmpId);
        continue;
      }

      usersMatched++;

      if (kekaEmpId && !kekaIdToUserId[kekaEmpId]) {
        await writeFirebasePath(
          `users/${pmtUserId}/kekaEmployeeId`,
          kekaEmpId
        );
        kekaIdToUserId[kekaEmpId] = pmtUserId;
      }

      const startDate = leave.from ?? "";
      const endDate = leave.to ?? startDate;
      const leaveType = leave.leaveType?.name ?? "Leave";
      const session = mapHalfDaySession(leave.halfDayType ?? leave.sessionType);
      const dates = expandLeaveDates(startDate, endDate);

      for (const dateKey of dates) {
        const record: LeaveRecord = {
          leaveId: leave.id,
          userId: pmtUserId,
          startDate,
          endDate,
          leaveType,
          session: dates.length > 1 ? "full" : session,
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

  try {
    const currentYear = today.getFullYear();
    const nextYear = currentYear + 1;
    const region = creds.region || "All";

    for (const year of [currentYear, nextYear]) {
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
