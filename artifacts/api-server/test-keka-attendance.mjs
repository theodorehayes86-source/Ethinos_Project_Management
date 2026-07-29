/**
 * Keka attendance API probe
 * Run with: node test-keka-attendance.mjs
 * (Secrets must be set as environment variables or in Replit Secrets)
 *
 * Probes every known Keka time/attendance endpoint to find which ones
 * are accessible and what fields they return.
 */

const clientId     = process.env.KEKA_CLIENT_ID;
const clientSecret = process.env.KEKA_CLIENT_SECRET;
const apiKey       = process.env.KEKA_API_KEY;
const baseUrl      = process.env.KEKA_BASE_URL || "https://ethinos.keka.com";

if (!clientId || !clientSecret || !apiKey) {
  console.error("❌  KEKA_CLIENT_ID / KEKA_CLIENT_SECRET / KEKA_API_KEY not set");
  process.exit(1);
}

// ── 1. Obtain OAuth token ─────────────────────────────────────────────────────
console.log("=== Keka Attendance API Probe ===\n");
console.log(`Base URL: ${baseUrl}`);

const tokenRes = await fetch("https://login.keka.com/connect/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type:    "kekaapi",
    client_id:     clientId,
    client_secret: clientSecret,
    api_key:       apiKey,
    scope:         "kekaapi",
  }),
});

if (!tokenRes.ok) {
  const err = await tokenRes.text();
  console.error("❌  Token exchange failed:", tokenRes.status, err.slice(0, 200));
  process.exit(1);
}

const { access_token } = await tokenRes.json();
console.log("✅  OAuth token obtained\n");

// ── 2. Helper ─────────────────────────────────────────────────────────────────

const today     = new Date().toISOString().slice(0, 10);           // YYYY-MM-DD
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const weekAgo   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

async function probe(label, path) {
  const url = `${baseUrl}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    console.log(`[${label}]  ❌  Network error: ${err.message}`);
    return null;
  }

  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* not JSON */ }

  const statusIcon = res.ok ? "✅" : (res.status === 403 ? "🔒" : (res.status === 404 ? "❓" : "❌"));
  console.log(`[${label}]  ${statusIcon}  HTTP ${res.status}`);

  if (json) {
    const data = json.data ?? json.response ?? json.attendances ?? json.records ?? null;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`           Records returned: ${data.length}`);
      // Print first record keys and one sample
      console.log(`           Fields: ${Object.keys(data[0]).join(", ")}`);
      console.log(`           Sample:\n${JSON.stringify(data[0], null, 10).split("\n").map(l => "             " + l).join("\n")}`);
    } else if (json.succeeded === false) {
      console.log(`           succeeded=false  message=${json.message ?? "(none)"}`);
    } else if (res.status === 403) {
      console.log(`           (module not enabled for this app in Keka Developer Settings)`);
    } else if (res.status === 404) {
      console.log(`           (endpoint not found — may not exist in this Keka plan)`);
    } else {
      // Top-level keys when no data array
      console.log(`           Top-level keys: ${Object.keys(json).join(", ")}`);
      if (Object.keys(json).length <= 6) {
        console.log(`           Value: ${JSON.stringify(json)}`);
      }
    }
  } else if (!res.ok) {
    console.log(`           Body: ${raw.slice(0, 200)}`);
  }

  console.log();
  return { status: res.status, json };
}

// ── 3. Probe endpoints ────────────────────────────────────────────────────────

console.log("--- Attendance / Time endpoints ---\n");

// Standard attendance log (clock-in / clock-out captures)
await probe("attendance captures",          `/api/v1/time/attendancecaptures?pageNumber=1&pageSize=5`);
await probe("attendance captures (today)",  `/api/v1/time/attendancecaptures?fromDate=${today}&toDate=${today}&pageNumber=1&pageSize=20`);
await probe("attendance captures (week)",   `/api/v1/time/attendancecaptures?fromDate=${weekAgo}&toDate=${today}&pageNumber=1&pageSize=10`);

// Processed / summarised attendance (daily in/out summary per employee)
await probe("attendance processed",         `/api/v1/time/attendanceprocessed?pageNumber=1&pageSize=5`);
await probe("attendance processed (today)", `/api/v1/time/attendanceprocessed?fromDate=${today}&toDate=${today}&pageNumber=1&pageSize=20`);
await probe("attendance processed (week)",  `/api/v1/time/attendanceprocessed?fromDate=${weekAgo}&toDate=${today}&pageNumber=1&pageSize=10`);

// Raw attendance (alternate path used by some Keka tenants)
await probe("attendance (v1/time)",         `/api/v1/time/attendance?pageNumber=1&pageSize=5`);
await probe("attendance (today)",           `/api/v1/time/attendance?fromDate=${today}&toDate=${today}&pageNumber=1&pageSize=20`);

// Attendance summary (aggregated per employee)
await probe("attendance summary",           `/api/v1/time/attendancesummary?pageNumber=1&pageSize=5`);
await probe("attendance summary (today)",   `/api/v1/time/attendancesummary?fromDate=${today}&toDate=${today}&pageNumber=1&pageSize=20`);

// My-time / employee self-service
await probe("mytime",                       `/api/v1/time/mytime?pageNumber=1&pageSize=5`);

// Employee present today (some tenants expose this)
await probe("employees present",            `/api/v1/hris/employees/present?date=${today}&pageNumber=1&pageSize=10`);
await probe("employees checkedin",          `/api/v1/hris/employees/checkedin?pageNumber=1&pageSize=10`);

// Timesheet
await probe("timesheets",                   `/api/v1/time/timesheets?pageNumber=1&pageSize=5`);
await probe("timesheets (week)",            `/api/v1/time/timesheets?fromDate=${weekAgo}&toDate=${today}&pageNumber=1&pageSize=5`);

// Payroll attendance (sometimes separate module)
await probe("payroll attendance",           `/api/v1/payroll/attendance?pageNumber=1&pageSize=5`);

console.log("=== Probe complete ===");
