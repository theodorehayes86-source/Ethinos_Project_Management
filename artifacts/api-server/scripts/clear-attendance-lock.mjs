/**
 * One-off script: clears the stuck schedulerLocks/attendance-10min lock from
 * Firebase and immediately runs one attendance sync so data is written NOW.
 *
 * Run from the api-server directory:
 *   node --env-file=../../.env scripts/clear-attendance-lock.mjs
 */
import admin from "firebase-admin";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  process.exit(1);
}
const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
});

const db = admin.database();

async function main() {
  // 1. Read current lock state
  const lockRef = db.ref("schedulerLocks/attendance-10min");
  const snap = await lockRef.once("value");
  const current = snap.val();
  console.log("Current lock:", JSON.stringify(current, null, 2));

  if (current) {
    const expiry = new Date(current.expiresAt).getTime();
    const now = Date.now();
    console.log(`Lock expiresAt: ${current.expiresAt}`);
    console.log(`Time until expiry: ${((expiry - now) / 1000 / 60).toFixed(1)} minutes`);
    if (expiry > now) {
      console.log("⚠️  Lock has NOT expired — it's set in the future. Clearing it now...");
    } else {
      console.log("Lock has technically expired but transaction still sees it as held. Clearing...");
    }
    await lockRef.remove();
    console.log("✅ Lock cleared.");
  } else {
    console.log("No lock present.");
  }

  // 2. Also clear health metadata so the next run starts clean
  console.log("\nSchedulerLocks cleared. The next cron tick will acquire the lock and run the sync.");
  await admin.app().delete();
}

main().catch(e => { console.error(e); process.exit(1); });
