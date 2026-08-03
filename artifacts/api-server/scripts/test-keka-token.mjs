/**
 * Test Keka OAuth token exchange and attendance API call.
 * Run: node artifacts/api-server/scripts/test-keka-token.mjs
 */
import admin from "firebase-admin";

const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!svcJson) { console.error("FIREBASE_SERVICE_ACCOUNT_JSON not set"); process.exit(1); }

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(svcJson)),
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
});
const db = admin.database();

async function main() {
  // 1. Check env vars
  const clientId = process.env.KEKA_CLIENT_ID?.trim();
  const clientSecret = process.env.KEKA_CLIENT_SECRET?.trim();
  const apiKey = process.env.KEKA_API_KEY?.trim();
  const baseUrlSnap = await db.ref("settings/integrations/keka/baseUrl").once("value");
  const baseUrl = baseUrlSnap.val();

  console.log("=== Keka credentials ===");
  console.log("KEKA_CLIENT_ID:", clientId ? `set (${clientId.slice(0,8)}...)` : "❌ MISSING");
  console.log("KEKA_CLIENT_SECRET:", clientSecret ? "set" : "❌ MISSING");
  console.log("KEKA_API_KEY:", apiKey ? "set" : "❌ MISSING");
  console.log("baseUrl (Firebase):", baseUrl ?? "❌ MISSING");

  if (!clientId || !clientSecret || !apiKey || !baseUrl) {
    console.error("\n❌ One or more credentials missing — token exchange will fail on every sync tick.");
    await admin.app().delete();
    return;
  }

  // 2. Try token exchange
  console.log("\n=== Token exchange (login.keka.com) ===");
  try {
    const body = new URLSearchParams({
      grant_type: "kekaapi",
      client_id: clientId,
      client_secret: clientSecret,
      api_key: apiKey,
      scope: "kekaapi",
    });
    const resp = await fetch("https://login.keka.com/connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`❌ Token exchange failed: HTTP ${resp.status}`);
      console.error("Response:", text.slice(0, 500));
      await admin.app().delete();
      return;
    }
    const data = JSON.parse(text);
    const token = data.access_token;
    console.log(`✅ Token obtained (expires_in: ${data.expires_in}s)`);

    // 3. Try attendance API for today
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    console.log(`\n=== Attendance API for ${today} ===`);
    const url = `${baseUrl.replace(/\/$/, "")}/api/v1/time/attendance?from=${today}&to=${today}&pageNumber=1&pageSize=10`;
    const apiResp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const apiText = await apiResp.text();
    if (!apiResp.ok) {
      console.error(`❌ Attendance API failed: HTTP ${apiResp.status}`);
      console.error("Response:", apiText.slice(0, 500));
    } else {
      const apiData = JSON.parse(apiText);
      const records = apiData.data ?? apiData.response ?? [];
      console.log(`✅ Attendance API OK — records on page 1: ${records.length}`);
      console.log(`   totalRecords: ${apiData.totalRecords ?? "(field not present)"}`);
      if (records.length > 0) {
        const r = records[0];
        console.log(`   Sample: employeeIdentifier=${r.employeeIdentifier}, clockIn=${r.firstInOfTheDay?.timestamp ?? null}`);
      }
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }

  await admin.app().delete();
}

main().catch(e => { console.error(e); process.exit(1); });
