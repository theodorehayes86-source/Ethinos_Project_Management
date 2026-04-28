import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { logger } from "./logger";
import { format, addDays, parseISO, isValid } from "date-fns";

const SECRETS_DIR = join(process.cwd(), ".secrets");
const KEKA_KEY_FILE = join(SECRETS_DIR, "keka-api-key");

/**
 * Read the Keka API key from the server-side secrets file or KEKA_API_KEY env var.
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
 * Only the server process can read this file.
 */
export function writeKekaApiKey(key: string): void {
  mkdirSync(SECRETS_DIR, { recursive: true });
  writeFileSync(KEKA_KEY_FILE, key.trim(), { encoding: "utf8", mode: 0o600 });
}

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

interface KekaEmployee {
  id: string;
  displayName?: string;
  email?: string;
}

interface KekaLeaveRecord {
  id: string;
  employee?: KekaEmployee;
  leaveType?: { name?: string };
  from?: string;
  to?: string;
  halfDayType?: string | null;
  sessionType?: string | null;
}

interface KekaHolidayRecord {
  id: string;
  name?: string;
  date?: string;
  locationName?: string;
  region?: string;
}

interface KekaApiResponse<T> {
  succeeded?: boolean;
  data?: T[];
  response?: T[];
}

interface PMTUser {
  id: string | number;
  email?: string;
  kekaEmployeeId?: string;
}

async function kekaGet<T>(
  baseUrl: string,
  apiKey: string,
  path: string
): Promise<T[]> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(`Keka API error ${resp.status} for ${path}: ${await resp.text()}`);
  }

  const body = (await resp.json()) as KekaApiResponse<T>;
  return (body.data ?? body.response ?? []) as T[];
}

function mapHalfDaySession(
  halfDayType?: string | null
): "full" | "first-half" | "second-half" | "half-day" {
  if (!halfDayType) return "full";
  const lower = halfDayType.toLowerCase();
  if (lower.includes("first") || lower === "firsthalf") return "first-half";
  if (lower.includes("second") || lower === "secondhalf") return "second-half";
  // Unknown half-day type → soft warning; use generic "half-day" (ambiguous session)
  return "half-day";
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

export async function getKekaCredentials(): Promise<KekaCredentials | null> {
  try {
    const apiKey = readKekaApiKey();
    if (!apiKey) return null;

    const config = await readFirebasePath<{ baseUrl?: string; region?: string } | null>(
      "settings/integrations/keka"
    );
    if (!config?.baseUrl) return null;

    return { baseUrl: config.baseUrl, apiKey, region: config.region };
  } catch (err) {
    logger.error({ err }, "[Keka] Failed to read credentials");
    return null;
  }
}

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
    const leaves = await kekaGet<KekaLeaveRecord>(
      creds.baseUrl,
      creds.apiKey,
      `/api/v1/time/attendance/leaves?startDate=${fromDate}&endDate=${toDate}`
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
      const holidays = await kekaGet<KekaHolidayRecord>(
        creds.baseUrl,
        creds.apiKey,
        `/api/v1/time/attendance/publicholidays?year=${year}`
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
        // Write under specific region for fine-grained lookup
        await writeFirebasePath(
          `publicHolidays/${holidayRegion}/${dateKey}`,
          record
        );
        // Also write under "All" so client-side default lookups always find holidays
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
      readFirebasePath<HolidayRecord | null>(`publicHolidays/${region}/${dateStr}`),
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
    logger.warn({ err, userId, dateStr }, "[LeaveCheck] Error checking leave conflict");
    return null;
  }
}
