/**
 * REPORTING INTEGRITY SUITE
 *
 * Proves — with deterministic fixture data whose totals are hand-calculable —
 * that BH/CSM client scoping and the reporting math are correct. Exercises the
 * exact modules the UI uses (shared/clientScope.js, shared/reportingAggregation.js),
 * so a pass here means Metrics, Reports and their CSV exports compute the same
 * numbers.
 *
 * Run standalone: pnpm run test:reporting-integrity
 */
import { describe, it, expect } from 'vitest';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { getOwnerScope, scopeClientLogs, isOwnerScopedRole } from '../PMT/shared/clientScope';
import {
  computeMetrics,
  buildReportRows,
  buildClientSummary,
  buildEmployeeSummary,
  filterLogsByDepartments,
} from '../PMT/shared/reportingAggregation';
import {
  FIXTURE_USERS,
  FIXTURE_CLIENTS,
  FIXTURE_CLIENT_LOGS,
  EXPECTED,
  RESTRICTED_SENTINEL_HOURS,
  findUser,
  H,
} from './fixtures/reportingFixture';

/* ─── helpers ─── */

const now = new Date();
const RANGE = { rangeStart: startOfDay(subDays(now, 29)), rangeEnd: endOfDay(now) };

const clientsById = new Map(FIXTURE_CLIENTS.map(c => [String(c.id), c]));
const usersById = new Map(FIXTURE_USERS.map(u => [String(u.id), u]));

/** Metrics for a given user's scoped view (mirrors UserMetricsView data path). */
function metricsForUser(userId, { selectedClientId = '' } = {}) {
  const user = findUser(userId);
  const scope = getOwnerScope(user, FIXTURE_USERS, FIXTURE_CLIENTS);
  let logs = FIXTURE_CLIENT_LOGS;
  if (scope) {
    const ids = selectedClientId && scope.clientIds.has(String(selectedClientId))
      ? new Set([String(selectedClientId)])
      : scope.clientIds;
    logs = scopeClientLogs(FIXTURE_CLIENT_LOGS, ids);
  }
  return { scope, logs, metrics: computeMetrics({ clientLogs: logs, clients: FIXTURE_CLIENTS, users: FIXTURE_USERS, ...RANGE }) };
}

/** Report rows/summaries for a user's scoped view (mirrors ReportsView data path). */
function reportsForUser(userId, { selectedClientId = '', dateFrom = '', dateTo = '' } = {}) {
  const user = findUser(userId);
  const scope = getOwnerScope(user, FIXTURE_USERS, FIXTURE_CLIENTS);
  let logs = FIXTURE_CLIENT_LOGS;
  if (scope) {
    const ids = selectedClientId && scope.clientIds.has(String(selectedClientId))
      ? new Set([String(selectedClientId)])
      : scope.clientIds;
    logs = scopeClientLogs(FIXTURE_CLIENT_LOGS, ids);
  }
  const rows = buildReportRows({ clientLogs: logs, clientsById, usersById, dateFrom, dateTo });
  return { scope, rows, clientSummary: buildClientSummary(rows), employeeSummary: buildEmployeeSummary(rows) };
}

const hoursOf = (metrics) => metrics.totalSeconds / 3600;

/** Diagnostic-rich comparison: prints client/metric context on failure. */
function assertValue(label, actual, expectedValue, context = {}) {
  if (actual !== expectedValue) {
    const detail = Object.entries(context).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n');
    throw new Error(
      `FAILED: ${label}\n  Expected: ${expectedValue}\n  Actual:   ${actual}\n${detail}`
    );
  }
  expect(actual).toBe(expectedValue);
}

const sentinelStrings = [String(RESTRICTED_SENTINEL_HOURS), 'Test Client Restricted', 'Restricted Work'];
function assertNoRestrictedLeakage(label, payload) {
  const text = JSON.stringify(payload);
  for (const s of sentinelStrings) {
    if (text.includes(s)) {
      throw new Error(`FAILED: ${label} — restricted-client sentinel "${s}" leaked into output.`);
    }
  }
}

/* ─── 1. Permission scope ─── */

describe('CSM/BH client permission scope', () => {
  it('CSM 1 sees exactly Alpha and Beta', () => {
    const scope = getOwnerScope(findUser('u-csm1'), FIXTURE_USERS, FIXTURE_CLIENTS);
    expect([...scope.clientIds].sort()).toEqual(['tc-alpha', 'tc-beta']);
  });

  it('CSM 2 sees exactly Gamma', () => {
    const scope = getOwnerScope(findUser('u-csm2'), FIXTURE_USERS, FIXTURE_CLIENTS);
    expect([...scope.clientIds]).toEqual(['tc-gamma']);
  });

  it('BH 1 inherits Alpha and Beta through direct report CSM 1', () => {
    const scope = getOwnerScope(findUser('u-bh1'), FIXTURE_USERS, FIXTURE_CLIENTS);
    expect([...scope.clientIds].sort()).toEqual(['tc-alpha', 'tc-beta']);
  });

  it('BH 2 inherits only Gamma through CSM 2', () => {
    const scope = getOwnerScope(findUser('u-bh2'), FIXTURE_USERS, FIXTURE_CLIENTS);
    expect([...scope.clientIds]).toEqual(['tc-gamma']);
  });

  it('Restricted client is in NO owner scope', () => {
    for (const uid of ['u-csm1', 'u-csm2', 'u-bh1', 'u-bh2']) {
      const scope = getOwnerScope(findUser(uid), FIXTURE_USERS, FIXTURE_CLIENTS);
      expect(scope.clientIds.has('tc-restricted'), `${uid} must not see tc-restricted`).toBe(false);
    }
  });

  it('non-BH/CSM roles get null scope (behavior unchanged)', () => {
    expect(getOwnerScope(findUser('u-admin'), FIXTURE_USERS, FIXTURE_CLIENTS)).toBeNull();
    expect(getOwnerScope(findUser('u-exec1'), FIXTURE_USERS, FIXTURE_CLIENTS)).toBeNull();
    expect(isOwnerScopedRole('Super Admin')).toBe(false);
    expect(isOwnerScopedRole('CSM')).toBe(true);
    expect(isOwnerScopedRole('Business Head')).toBe(true);
  });

  it('inactive/archived direct reports do not extend BH scope', () => {
    const users = FIXTURE_USERS.map(u => (u.id === 'u-csm1' ? { ...u, active: false } : u));
    const scope = getOwnerScope(findUser('u-bh1'), users, FIXTURE_CLIENTS);
    expect(scope.clientIds.size).toBe(0);
  });
});

/* ─── 2. Metrics (Control Center / Metrics view) numbers ─── */

describe('Metrics aggregation for permitted clients', () => {
  it('CSM 1 + Alpha: 60h across all departments, 30 tasks', () => {
    const { metrics } = metricsForUser('u-csm1', { selectedClientId: 'tc-alpha' });
    assertValue('Alpha Reporting Hours', hoursOf(metrics), EXPECTED.alpha.hours, {
      client: 'Test Client Alpha', user: 'Test CSM 1',
      byCategory: metrics.categoryRows.map(r => `${r.name}: ${r.seconds / 3600}h`),
    });
    assertValue('Alpha Tasks Completed', metrics.totalTasks, EXPECTED.alpha.tasks, { client: 'Test Client Alpha' });
  });

  it('Alpha department/category breakdown reconciles with headline total (no dropped/double-counted department)', () => {
    const { metrics } = metricsForUser('u-csm1', { selectedClientId: 'tc-alpha' });
    const byCat = Object.fromEntries(metrics.categoryRows.map(r => [r.name, r.seconds / 3600]));
    for (const [cat, hours] of Object.entries(EXPECTED.alpha.byCategory)) {
      assertValue(`Alpha ${cat} hours`, byCat[cat], hours, { client: 'Test Client Alpha', breakdown: byCat });
    }
    const breakdownSum = metrics.categoryRows.reduce((s, r) => s + r.seconds, 0);
    assertValue('Alpha breakdown sum = headline total', breakdownSum, metrics.totalSeconds, { breakdown: byCat });
  });

  it('CSM 1 + Beta: 20h, 10 tasks', () => {
    const { metrics } = metricsForUser('u-csm1', { selectedClientId: 'tc-beta' });
    assertValue('Beta Reporting Hours', hoursOf(metrics), EXPECTED.beta.hours, { client: 'Test Client Beta' });
    assertValue('Beta Tasks Completed', metrics.totalTasks, EXPECTED.beta.tasks, { client: 'Test Client Beta' });
  });

  it('CSM 1 "All My Clients" = Alpha + Beta only (80h / 40 tasks) — never Gamma or Restricted', () => {
    const { metrics, logs } = metricsForUser('u-csm1');
    assertValue('All-my-clients hours', hoursOf(metrics), EXPECTED.csm1AllClients.hours, {
      permittedBuckets: Object.keys(logs),
    });
    assertValue('All-my-clients tasks', metrics.totalTasks, EXPECTED.csm1AllClients.tasks, {});
    expect(Object.keys(logs).sort()).toEqual(['tc-alpha', 'tc-beta']);
  });

  it('CSM 1 requesting Gamma directly (URL/state manipulation) still gets only permitted data', () => {
    const { metrics, logs } = metricsForUser('u-csm1', { selectedClientId: 'tc-gamma' });
    // Unauthorized selection falls back to the permitted set — never Gamma data.
    expect(Object.keys(logs).sort()).toEqual(['tc-alpha', 'tc-beta']);
    assertValue('Hours after unauthorized selection', hoursOf(metrics), EXPECTED.csm1AllClients.hours, {});
  });

  it('BH 1 sees the same Alpha totals as CSM 1 (hierarchy access)', () => {
    const { metrics } = metricsForUser('u-bh1', { selectedClientId: 'tc-alpha' });
    assertValue('BH1 Alpha hours', hoursOf(metrics), EXPECTED.alpha.hours, { user: 'Test BH 1' });
  });

  it('BH 2 / CSM 2 see only Gamma (37h / 17 tasks)', () => {
    for (const uid of ['u-bh2', 'u-csm2']) {
      const { metrics, logs } = metricsForUser(uid);
      expect(Object.keys(logs)).toEqual(['tc-gamma']);
      assertValue(`${uid} Gamma hours`, hoursOf(metrics), EXPECTED.gamma.hours, { user: uid });
      assertValue(`${uid} Gamma tasks`, metrics.totalTasks, EXPECTED.gamma.tasks, { user: uid });
    }
  });

  it('Super Admin (non-scoped) still sees everything, including Restricted (9,999h present)', () => {
    const { metrics, scope } = metricsForUser('u-admin');
    expect(scope).toBeNull();
    const expectedTotal = EXPECTED.alpha.hours + EXPECTED.beta.hours + EXPECTED.gamma.hours + EXPECTED.restricted.hours;
    assertValue('Super Admin total hours', hoursOf(metrics), expectedTotal, {});
  });
});

/* ─── 3. Reports view + CSV-export data ─── */

describe('Reports aggregation & exports for permitted clients', () => {
  it('CSM 1 client summary reconciles exactly (Alpha 60h/30, Beta 20h/10) and contains nothing else', () => {
    const { clientSummary } = reportsForUser('u-csm1');
    expect(clientSummary.map(r => r.clientName).sort()).toEqual(['Test Client Alpha', 'Test Client Beta']);
    const alpha = clientSummary.find(r => r.clientName === 'Test Client Alpha');
    const beta = clientSummary.find(r => r.clientName === 'Test Client Beta');
    assertValue('Reports Alpha totalHours', alpha.totalHours, EXPECTED.alpha.hours, { categories: alpha.categories });
    assertValue('Reports Alpha taskCount', alpha.taskCount, EXPECTED.alpha.tasks, {});
    assertValue('Reports Alpha planned hours', alpha.totalEstimatedHours, EXPECTED.alpha.plannedHours, {});
    assertValue('Reports Beta totalHours', beta.totalHours, EXPECTED.beta.hours, { categories: beta.categories });
    assertValue('Reports Beta taskCount', beta.taskCount, EXPECTED.beta.tasks, {});
    // Category breakdown must reconcile with the client total.
    const alphaCatSum = alpha.categories.reduce((s, c) => s + c.hours, 0);
    assertValue('Alpha category breakdown sum', alphaCatSum, EXPECTED.alpha.hours, { categories: alpha.categories });
  });

  it('Reports rows (combined view / CSV source) for CSM 1 never include restricted or gamma rows', () => {
    const { rows, clientSummary, employeeSummary } = reportsForUser('u-csm1');
    expect(rows.every(r => r.clientId === 'tc-alpha' || r.clientId === 'tc-beta')).toBe(true);
    assertNoRestrictedLeakage('CSM 1 report rows', rows);
    assertNoRestrictedLeakage('CSM 1 client summary', clientSummary);
    assertNoRestrictedLeakage('CSM 1 employee summary', employeeSummary);
    expect(JSON.stringify(rows)).not.toContain('Gamma');
  });

  it('Metrics/Reports/underlying records all agree (cross-surface reconciliation)', () => {
    // Underlying fixture records
    const rawAlphaHours = FIXTURE_CLIENT_LOGS['tc-alpha'].reduce((s, t) => s + t.elapsedMs, 0) / H;
    // Metrics surface
    const metricsAlphaHours = hoursOf(metricsForUser('u-csm1', { selectedClientId: 'tc-alpha' }).metrics);
    // Reports surface
    const reportsAlphaHours = reportsForUser('u-csm1', { selectedClientId: 'tc-alpha' })
      .clientSummary.find(r => r.clientName === 'Test Client Alpha').totalHours;
    assertValue('Raw records = Metrics', metricsAlphaHours, rawAlphaHours, {
      surfaces: { rawAlphaHours, metricsAlphaHours, reportsAlphaHours },
    });
    assertValue('Raw records = Reports', reportsAlphaHours, rawAlphaHours, {
      surfaces: { rawAlphaHours, metricsAlphaHours, reportsAlphaHours },
    });
  });
});

/* ─── 4. Date-range correctness ─── */

describe('Date filtering', () => {
  const iso = (d) => format(d, 'yyyy-MM-dd');
  const dmy = (d) => format(d, 'do MMM yyyy');

  const boundaryLogs = {
    'tc-alpha': [
      { id: 'b1', date: dmy(subDays(now, 0)), elapsedMs: 1 * H, departments: ['SEO'], category: 'B', creatorId: 'u-exec1', creatorName: 'Test Exec 1' },
      { id: 'b2', date: dmy(subDays(now, 6)), elapsedMs: 2 * H, departments: ['SEO'], category: 'B', creatorId: 'u-exec1', creatorName: 'Test Exec 1' },
      { id: 'b3', date: dmy(subDays(now, 7)), elapsedMs: 4 * H, departments: ['SEO'], category: 'B', creatorId: 'u-exec1', creatorName: 'Test Exec 1' },
      { id: 'b4', date: dmy(subDays(now, 45)), elapsedMs: 8 * H, departments: ['SEO'], category: 'B', creatorId: 'u-exec1', creatorName: 'Test Exec 1' },
    ],
  };

  it('metrics range includes boundary days exactly once, excludes outside days', () => {
    // Window = last 7 days: includes b1 (today) and b2 (6 days ago); excludes b3, b4.
    const m = computeMetrics({
      clientLogs: boundaryLogs, clients: FIXTURE_CLIENTS, users: FIXTURE_USERS,
      rangeStart: startOfDay(subDays(now, 6)), rangeEnd: endOfDay(now),
    });
    assertValue('7-day window hours', hoursOf(m), 3, { included: 'b1(1h)+b2(2h)', excluded: 'b3(4h), b4(8h)' });
    // Widen by one day: b3 now included, still no double count.
    const m2 = computeMetrics({
      clientLogs: boundaryLogs, clients: FIXTURE_CLIENTS, users: FIXTURE_USERS,
      rangeStart: startOfDay(subDays(now, 7)), rangeEnd: endOfDay(now),
    });
    assertValue('8-day window hours', hoursOf(m2), 7, { included: 'b1+b2+b3' });
  });

  it('reports date filter respects from/to boundaries inclusively', () => {
    const rows = buildReportRows({
      clientLogs: boundaryLogs, clientsById, usersById,
      dateFrom: iso(subDays(now, 7)), dateTo: iso(now),
    });
    const total = rows.reduce((s, r) => s + r.hoursSpent, 0);
    assertValue('reports from/to window hours', total, 7, { rows: rows.map(r => `${r.date}: ${r.hoursSpent}h`) });
  });
});

/* ─── 5. Regression: non-scoped roles' department behavior unchanged ─── */

describe('Department filtering regression (non-BH/CSM roles)', () => {
  it('all-data users with no selection see everything', () => {
    const out = filterLogsByDepartments(FIXTURE_CLIENT_LOGS, { effectiveAllData: true, selectedDepts: [] });
    expect(out).toEqual(FIXTURE_CLIENT_LOGS);
  });

  it('all-data users with a department selection keep dept-less logs and matching logs only', () => {
    const out = filterLogsByDepartments(FIXTURE_CLIENT_LOGS, { effectiveAllData: true, selectedDepts: ['SEO'] });
    const alphaSeo = out['tc-alpha'].reduce((s, t) => s + t.elapsedMs, 0) / H;
    assertValue('Alpha SEO-only hours', alphaSeo, EXPECTED.alpha.byDepartment.SEO, {});
  });

  it('restricted (non-all-data) users only see their own department or dept-less logs', () => {
    const out = filterLogsByDepartments(FIXTURE_CLIENT_LOGS, { effectiveAllData: false, userDept: 'Design' });
    const betaDesign = out['tc-beta'].reduce((s, t) => s + t.elapsedMs, 0) / H;
    assertValue('Beta Design-only hours', betaDesign, EXPECTED.beta.byDepartment.Design, {});
    expect(out['tc-alpha']).toHaveLength(0);
  });
});
