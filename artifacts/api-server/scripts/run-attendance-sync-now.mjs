/**
 * Run the attendance sync immediately, bypassing the scheduler and job lock.
 * Logs every step so we can see exactly where it fails.
 * Run: node artifacts/api-server/scripts/run-attendance-sync-now.mjs
 */
import admin from "firebase-admin";

const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!svcJson) { console.error("FIREBASE_SERVICE_ACCOUNT_JSON not set"); process.exit(1); }
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(svcJson)),
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
});
const db = admin.database();

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const KEKA_PAGE_SIZE = 200;

async function getToken() {
  const body = new URLSearchParams({
    grant_type: "kekaapi",
    client_id: process.env.KEKA_CLIENT_ID?.trim(),
    client_secret: process.env.KEKA_CLIENT_SECRET?.trim(),
    api_key: process.env.KEKA_API_KEY?.trim(),
    scope: "kekaapi",
  });
  const resp = await fetch("https://login.keka.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Token exchange HTTP ${resp.status}: ${await resp.text()}`);
  const { access_token } = await resp.json();
  return access_token;
}

async function main() {
  console.log(`\n=== Attendance sync for ${today} ===\n`);

  // 1. Get token
  console.log("Step 1: Getting Keka token...");
  let token;
  try {
    token = await getToken();
    console.log("  ✅ Token OK");
  } catch (err) {
    console.error("  ❌ Token failed:", err.message);
    await admin.app().delete(); return;
  }

  // 2. Load Keka-linked PMT users
  console.log("\nStep 2: Loading Keka-linked PMT users...");
  const usersSnap = await db.ref("users").once("value");
  const usersRaw = usersSnap.val();
  const kekaIdToUserId = {};
  if (usersRaw) {
    const list = Array.isArray(usersRaw) ? usersRaw.filter(Boolean) : Object.values(usersRaw).filter(Boolean);
    for (const u of list) {
      if (u.kekaEmployeeId && u.id != null) kekaIdToUserId[u.kekaEmployeeId] = String(u.id);
    }
  }
  console.log(`  ✅ ${Object.keys(kekaIdToUserId).length} Keka-linked users`);

  // 3. Paginate Keka attendance API
  console.log("\nStep 3: Fetching attendance records from Keka...");
  const baseUrl = (await db.ref("settings/integrations/keka/baseUrl").once("value")).val();
  const records = [];
  let pageNumber = 1;
  while (true) {
    const url = `${baseUrl.replace(/\/$/, "")}/api/v1/time/attendance?from=${today}&to=${today}&pageNumber=${pageNumber}&pageSize=${KEKA_PAGE_SIZE}`;
    console.log(`  Page ${pageNumber}: GET ${url.replace(baseUrl, '{baseUrl}')}`);
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`  ❌ Keka API error HTTP ${resp.status}:`, errText.slice(0, 300));
      await admin.app().delete(); return;
    }
    const body = await resp.json();
    const page = body.data ?? body.response ?? [];
    const totalRecords = body.totalRecords;
    console.log(`    → ${page.length} records, totalRecords=${totalRecords}`);
    records.push(...page);
    const hasMore = totalRecords !== undefined
      ? pageNumber * KEKA_PAGE_SIZE < totalRecords
      : page.length >= KEKA_PAGE_SIZE;
    if (!hasMore) break;
    pageNumber++;
    if (pageNumber > 50) { console.warn("  ⚠️ Safety limit: 50 pages"); break; }
  }
  console.log(`  ✅ Total attendance records: ${records.length}`);

  // 4. Index by kekaEmployeeId
  const byKekaId = {};
  for (const rec of records) {
    if (rec.employeeIdentifier) byKekaId[rec.employeeIdentifier] = rec;
  }
  const matched = Object.keys(kekaIdToUserId).filter(kid => byKekaId[kid]).length;
  console.log(`\n  Matched ${matched} / ${Object.keys(kekaIdToUserId).length} PMT users to Keka records`);

  // 5. Write to Firebase
  console.log(`\nStep 4: Writing to attendanceData/${today}/...`);
  const nowStr = new Date().toISOString();
  let written = 0, arrived = 0, notArrived = 0;
  const updates = {};

  for (const [kekaId, pmtUserId] of Object.entries(kekaIdToUserId)) {
    const rec = byKekaId[kekaId];
    const clockIn = rec?.firstInOfTheDay?.timestamp ?? null;
    const clockOut = rec?.lastOutOfTheDay?.timestamp ?? null;
    const hasArrived = clockIn !== null;
    const isInOffice = hasArrived && clockOut === null;
    updates[`attendanceData/${today}/${pmtUserId}`] = {
      clockIn, clockOut, hasArrived, isInOffice,
      grossHours: rec?.totalGrossHours ?? 0,
      effectiveHours: rec?.totalEffectiveHours ?? 0,
      syncedAt: nowStr,
    };
    written++;
    if (hasArrived) arrived++; else notArrived++;
  }

  await db.ref().update(updates);
  console.log(`  ✅ Written ${written} records: ${arrived} arrived, ${notArrived} not arrived`);

  // 6. Update lastAttendanceSync
  await db.ref("settings/integrations/keka/lastAttendanceSync").set({
    syncedAt: nowStr, recordsWritten: written, totalArrived: arrived, totalNotArrived: notArrived, date: today,
  });
  console.log(`\n✅ Sync complete. Refresh the mobile app to see attendance indicators.`);
  await admin.app().delete();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
