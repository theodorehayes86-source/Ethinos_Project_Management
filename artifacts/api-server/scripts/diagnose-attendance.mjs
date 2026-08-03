/**
 * Diagnose why attendance sync may not be writing data.
 * Run: node artifacts/api-server/scripts/diagnose-attendance.mjs
 */
import admin from "firebase-admin";

const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!svcJson) { console.error("FIREBASE_SERVICE_ACCOUNT_JSON not set"); process.exit(1); }

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(svcJson)),
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
});
const db = admin.database();

async function readPath(path) {
  const snap = await db.ref(path).once("value");
  return snap.val();
}

async function main() {
  console.log("\n=== 1. Keka credentials in Firebase ===");
  const kekaConfig = await readPath("settings/integrations/keka");
  console.log("baseUrl:", kekaConfig?.baseUrl ?? "(missing)");
  console.log("region:", kekaConfig?.region ?? "(not set)");
  console.log("clientId:", kekaConfig?.clientId ? "set" : "(missing)");
  console.log("clientSecret:", kekaConfig?.clientSecret ? "set" : "(missing)");
  console.log("KEKA_API_KEY env:", process.env.KEKA_API_KEY ? "set" : "(missing)");

  const baseUrl = kekaConfig?.baseUrl;
  if (!baseUrl) { console.error("\n❌ No baseUrl — sync exits early with 'Keka credentials not configured'"); await admin.app().delete(); return; }

  console.log("\n=== 2. PMT users with kekaEmployeeId ===");
  const usersRaw = await readPath("users");
  const kekaLinked = [];
  if (usersRaw) {
    const list = Array.isArray(usersRaw) ? usersRaw.filter(Boolean) : Object.values(usersRaw).filter(Boolean);
    for (const u of list) {
      if (u.kekaEmployeeId) kekaLinked.push({ id: u.id, name: u.name, kekaEmployeeId: u.kekaEmployeeId });
    }
  }
  console.log(`Keka-linked users: ${kekaLinked.length}`);
  if (kekaLinked.length === 0) {
    console.error("❌ No users have kekaEmployeeId — sync writes 0 records and returns early.");
  } else {
    console.log("Sample:", JSON.stringify(kekaLinked.slice(0, 3), null, 2));
  }

  console.log("\n=== 3. Last attendance sync metadata ===");
  const lastSync = await readPath("settings/integrations/keka/lastAttendanceSync");
  console.log(JSON.stringify(lastSync, null, 2));

  console.log("\n=== 4. Attendance data for today ===");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // yyyy-MM-dd in IST
  console.log("Today (IST):", today);
  const todayData = await readPath(`attendanceData/${today}`);
  if (!todayData) {
    console.log("❌ No data at attendanceData/" + today + " — sync has not written anything today");
  } else {
    const keys = Object.keys(todayData);
    console.log(`✅ ${keys.length} records written for ${today}`);
    const sample = Object.entries(todayData).slice(0, 3);
    for (const [uid, rec] of sample) {
      console.log(`  uid=${uid}: hasArrived=${rec.hasArrived}, clockIn=${rec.clockIn}, isInOffice=${rec.isInOffice}`);
    }
  }

  console.log("\n=== 5. Scheduler lock state ===");
  const lock = await readPath("schedulerLocks/attendance-10min");
  console.log(lock ? JSON.stringify(lock) : "(no lock)");

  await admin.app().delete();
}

main().catch(e => { console.error(e); process.exit(1); });
