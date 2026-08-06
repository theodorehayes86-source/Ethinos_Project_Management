/**
 * Live attendance freshness check.
 *
 * Verifies against the REAL Firebase database that the attendance scheduler
 * is actually doing its job — not just that the code compiles. This is the
 * check that catches silent starvation (the failure mode of the first five
 * fixes: no errors anywhere, but no data either).
 *
 * Pass criteria (all times in the configured schedule timezone, default IST):
 *  - Outside 07:00–22:00 local: PASS (scheduler intentionally idle overnight;
 *    07:00 gives the first morning tick a full hour of grace).
 *  - Inside the window:
 *      * settings/integrations/keka/lastAttendanceSync.date must equal today
 *      * syncedAt must be < 45 minutes old (cadence is 10–30 min + duration)
 *      * attendanceData/{today} must exist and contain at least one record
 *
 * Exit code 0 = healthy, 1 = stale/missing (fails the validation run).
 *
 * Run from artifacts/api-server so firebase-admin resolves:
 *   cd artifacts/api-server && node scripts/check-attendance-freshness.mjs
 */
import admin from "firebase-admin";

const MAX_AGE_MINUTES = 45;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!saJson) fail("FIREBASE_SERVICE_ACCOUNT_JSON is not set");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(saJson)),
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
});
const db = admin.database();
const get = async (p) => (await db.ref(p).get()).val();

// Resolve the same timezone the scheduler uses.
const sched = await get("settings/notifications/reminders-schedule").catch(() => null);
const tz = sched?.scheduleTimezone || "Asia/Kolkata";

const now = new Date();
const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
const hour = local.getHours();
const today = [
  local.getFullYear(),
  String(local.getMonth() + 1).padStart(2, "0"),
  String(local.getDate()).padStart(2, "0"),
].join("-");

console.log(`Timezone: ${tz} | Local time: ${local.toISOString().slice(0, 16)} | Today: ${today}`);

if (hour < 7 || hour >= 22) {
  console.log("PASS: outside the 07:00–22:00 active window — scheduler idle by design");
  process.exit(0);
}

const lastSync = await get("settings/integrations/keka/lastAttendanceSync");
if (!lastSync?.date) fail("lastAttendanceSync metadata is missing — no sync has ever completed");
if (lastSync.date !== today) {
  fail(
    `lastAttendanceSync.date is ${lastSync.date}, expected ${today} — ` +
    "the scheduler has not synced today (check schedulerLocks and Keka credentials on all instances)"
  );
}

const ageMin = (Date.now() - new Date(lastSync.syncedAt).getTime()) / 60000;
if (!Number.isFinite(ageMin) || ageMin > MAX_AGE_MINUTES) {
  fail(
    `last sync was ${ageMin.toFixed(0)} min ago (limit ${MAX_AGE_MINUTES}) — ` +
    "scheduler has stopped syncing (likely lock starvation or a dead instance)"
  );
}

const todayData = await get(`attendanceData/${today}`);
const count = todayData ? Object.keys(todayData).length : 0;
if (count === 0) fail(`attendanceData/${today} is empty — metadata exists but no records were written`);

console.log(
  `PASS: synced ${ageMin.toFixed(0)} min ago | ${count} attendance records for ${today} | ` +
  `arrived ${lastSync.totalArrived ?? "?"} / notArrived ${lastSync.totalNotArrived ?? "?"}`
);
process.exit(0);
