/**
 * Keka sync output test script
 * Run with: node --env-file=../../.env test-keka-sync.mjs
 * or:       node test-keka-sync.mjs  (secrets loaded from environment)
 *
 * What it checks:
 *  1. Read leaveData from Firebase (what the sync wrote)
 *  2. Sample live Keka approved leaves
 *  3. Print a comparison table showing matches / discrepancies
 */
import admin from "firebase-admin";

// ── 1. Init Firebase Admin ────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const databaseURL = `https://${process.env.VITE_FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;

admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL });
const db = admin.database();

async function fbRead(path) {
  const snap = await db.ref(path).once("value");
  return snap.val();
}

// ── 2. Read Firebase leaveData ────────────────────────────────────────────────
console.log("=== Reading Firebase leaveData ===");
const leaveData = await fbRead("leaveData");

if (!leaveData) {
  console.log("❌  leaveData is empty — sync may not have run yet.");
  process.exit(0);
}

const userIds = Object.keys(leaveData);
const totalRecords = userIds.reduce((acc, uid) => acc + Object.keys(leaveData[uid]).length, 0);
console.log(`✅  ${userIds.length} users with leave records, ${totalRecords} date entries total`);

// Print a sample per user (first 10 users, first 3 dates each)
console.log("\n--- Sample leaveData (first 10 users) ---");
for (const uid of userIds.slice(0, 10)) {
  const dates = Object.keys(leaveData[uid]).sort();
  const sample = leaveData[uid][dates[0]];
  console.log(
    `  userId=${uid}  dates=${dates.length}  range=${dates[0]}..${dates[dates.length - 1]}` +
      `  type="${sample.leaveType}"  session="${sample.session}"`
  );
}

// ── 3. Read PMT users to resolve userId → name/email ─────────────────────────
console.log("\n=== Reading PMT users ===");
const usersRaw = await fbRead("users");
const users = usersRaw
  ? Object.values(usersRaw).filter(Boolean)
  : [];
const userMap = {};
for (const u of users) {
  if (u.id) userMap[String(u.id)] = u;
}
console.log(`✅  ${users.length} PMT users loaded`);

// ── 4. Cross-check with live Keka data ────────────────────────────────────────
console.log("\n=== Cross-checking with live Keka API ===");
const clientId = process.env.KEKA_CLIENT_ID;
const clientSecret = process.env.KEKA_CLIENT_SECRET;
const apiKey = process.env.KEKA_API_KEY;

if (!clientId || !clientSecret || !apiKey) {
  console.log("⚠️  KEKA_CLIENT_ID / KEKA_CLIENT_SECRET / KEKA_API_KEY not set — skipping Keka cross-check");
} else {
  const tokenRes = await fetch("https://login.keka.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "kekaapi",
      client_id: clientId,
      client_secret: clientSecret,
      api_key: apiKey,
      scope: "kekaapi",
    }),
  });
  const { access_token } = await tokenRes.json();

  // Fetch ALL employees (paginated) for GUID→email lookup
  const guidToEmail = {};
  let empPage = 1;
  while (true) {
    const empRes = await fetch(
      `https://ethinos.keka.com/api/v1/hris/employees?pageNumber=${empPage}&pageSize=200`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const empJson = await empRes.json();
    const batch = empJson.data ?? [];
    for (const e of batch) {
      if (e.id && e.email) guidToEmail[e.id] = e.email.toLowerCase();
    }
    const total = empJson.totalRecords ?? empJson.pageInfo?.totalCount ?? 0;
    if (Object.keys(guidToEmail).length >= total || batch.length === 0) break;
    empPage++;
  }
  console.log(`✅  ${Object.keys(guidToEmail).length} employees fetched from Keka (${empPage} pages)`);

  // Fetch all leave requests (status=1 = approved)
  let allLeaves = [];
  let page = 1;
  while (true) {
    const r = await fetch(
      `https://ethinos.keka.com/api/v1/time/leaverequests?pageNumber=${page}&pageSize=200`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const j = await r.json();
    const data = j.data ?? [];
    allLeaves = allLeaves.concat(data);
    const total = j.totalRecords ?? j.pageInfo?.totalCount ?? 0;
    if (allLeaves.length >= total || data.length === 0) break;
    page++;
  }
  const approved = allLeaves.filter((l) => l.status === 1);
  console.log(`✅  ${allLeaves.length} total leave requests from Keka, ${approved.length} approved`);

  // Cross-check: for each unique Keka employeeIdentifier in approved leaves,
  // check if the corresponding PMT user has leaveData
  const kekaEmpIds = [...new Set(approved.map((l) => l.employeeIdentifier).filter(Boolean))];
  const emailToUser = {};
  for (const u of users) {
    if (u.email) emailToUser[u.email.toLowerCase()] = u;
  }

  let matched = 0, noKeka = 0, noPmt = 0;
  const mismatches = [];

  console.log("\n--- Employee matching results ---");
  for (const guid of kekaEmpIds) {
    const email = guidToEmail[guid];
    const pmtUser = email ? emailToUser[email] : null;
    const pmtUserId = pmtUser ? String(pmtUser.id) : null;
    const inFirebase = pmtUserId ? !!leaveData[pmtUserId] : false;

    if (!pmtUser) { noPmt++; continue; }
    if (!inFirebase) {
      mismatches.push({ guid, email, pmtUserId, issue: "no leaveData in Firebase" });
    } else {
      matched++;
    }
  }

  console.log(`  ✅  ${matched} employees have leave records in Firebase`);
  if (noPmt) console.log(`  ⚠️  ${noPmt} Keka employees have no matching PMT user (email/id mismatch)`);
  if (mismatches.length) {
    console.log(`  ❌  ${mismatches.length} PMT users matched but missing Firebase leave records:`);
    for (const m of mismatches.slice(0, 5)) {
      console.log(`       ${m.email}  pmtId=${m.pmtUserId}  → ${m.issue}`);
    }
  }

  // Spot-check: pick 3 Keka leave records and verify they appear in Firebase
  console.log("\n--- Spot-check: 3 approved Keka records vs Firebase ---");
  let checked = 0;
  for (const leave of approved) {
    if (checked >= 3) break;
    const guid = leave.employeeIdentifier;
    const email = guidToEmail[guid];
    if (!email) continue;
    const pmtUser = emailToUser[email];
    if (!pmtUser) continue;
    const pmtUserId = String(pmtUser.id);
    const dateKey = (leave.fromDate ?? "").slice(0, 10); // stored as "YYYY-MM-DD" in Firebase
    const fbRecord = leaveData[pmtUserId]?.[dateKey];
    const leaveType = leave.selection?.[0]?.leaveTypeName ?? "?";
    const status = fbRecord ? "✅ in Firebase" : "❌ NOT in Firebase";
    console.log(
      `  Keka: ${email}  date=${dateKey}  type="${leaveType}"  → ${status}`
    );
    if (fbRecord) {
      console.log(
        `        Firebase: type="${fbRecord.leaveType}"  session="${fbRecord.session}"  userId=${fbRecord.userId}`
      );
    }
    checked++;
  }
}

await admin.app().delete();
console.log("\n=== Done ===");
