/**
 * Deterministic reporting/permission test fixture (TEST-ONLY — never seeded
 * into Firebase or production data).
 *
 * Values are intentionally trivial to hand-calculate:
 *
 *  Test Client Alpha  (owned by Test CSM 1)
 *    Paid Media: 5 tasks × 2h = 10h   (planned 12h)
 *    SEO:       10 tasks × 2h = 20h   (planned 24h)
 *    Social:    15 tasks × 2h = 30h   (planned 36h)
 *    TOTAL:     30 tasks, 60h, planned 72h
 *
 *  Test Client Beta   (owned by Test CSM 1)
 *    Paid Media: 3 tasks (2h+2h+3h) = 7h
 *    Design:     7 tasks (6×2h+1h)  = 13h
 *    TOTAL:      10 tasks, 20h
 *
 *  Test Client Gamma  (owned by Test CSM 2)
 *    Analytics: 17 tasks (16×2h + 5h) = 37h
 *
 *  Test Client Restricted (owned by NO ONE — leakage sentinel)
 *    9,999h across 3 tasks. If 9,999 (or any part of it) ever shows up in a
 *    CSM/BH report, data is leaking.
 *
 *  Hierarchy: Test BH 1 → Test CSM 1 (direct report), so BH1 sees Alpha+Beta.
 *             Test BH 2 → Test CSM 2 (direct report), so BH2 sees Gamma.
 */
import { format, subDays } from 'date-fns';

export const H = 3_600_000; // ms per hour

const logDate = (daysAgo) => format(subDays(new Date(), daysAgo), 'do MMM yyyy');

export const FIXTURE_USERS = [
  { id: 'u-bh1', name: 'Test BH 1', role: 'Business Head', department: 'Client Servicing', active: true },
  { id: 'u-bh2', name: 'Test BH 2', role: 'Business Head', department: 'Client Servicing', active: true },
  { id: 'u-csm1', name: 'Test CSM 1', role: 'CSM', department: 'Client Servicing', managerId: 'u-bh1', active: true },
  { id: 'u-csm2', name: 'Test CSM 2', role: 'CSM', department: 'Client Servicing', managerId: 'u-bh2', active: true },
  { id: 'u-admin', name: 'Test Super Admin', role: 'Super Admin', department: 'All', active: true },
  { id: 'u-exec1', name: 'Test Exec 1', role: 'Executive', department: 'Paid Media', managerId: 'u-csm1', active: true },
  { id: 'u-exec2', name: 'Test Exec 2', role: 'Executive', department: 'SEO', active: true },
  { id: 'u-exec3', name: 'Test Exec 3', role: 'Executive', department: 'Social', active: true },
];

export const FIXTURE_CLIENTS = [
  { id: 'tc-alpha', name: 'Test Client Alpha', entityName: 'Test Entity A', ownerIds: ['u-csm1'] },
  { id: 'tc-beta', name: 'Test Client Beta', entityName: 'Test Entity B', ownerIds: ['u-csm1'] },
  { id: 'tc-gamma', name: 'Test Client Gamma', entityName: 'Test Entity G', ownerIds: ['u-csm2'] },
  { id: 'tc-restricted', name: 'Test Client Restricted', entityName: 'Test Entity R', ownerIds: [] },
];

let seq = 0;
const makeTask = ({ hours, department, category, creatorId, creatorName, daysAgo = 0, plannedHours = null }) => ({
  id: `fx-task-${++seq}`,
  name: `Fixture task ${seq}`,
  date: logDate(daysAgo),
  elapsedMs: hours * H,
  timeTaken: null,
  ...(plannedHours != null ? { estimatedMs: plannedHours * H } : {}),
  departments: [department],
  category,
  creatorId,
  creatorName,
  assigneeId: creatorId,
  status: 'Completed',
  billable: true,
});

const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

/* Alpha: 5×2h Paid Media (planned 2.4h each), 10×2h SEO, 15×2h Social. */
const alphaLogs = [
  ...repeat(5, i => makeTask({ hours: 2, plannedHours: 2.4, department: 'Paid Media', category: 'Paid Media Work', creatorId: 'u-exec1', creatorName: 'Test Exec 1', daysAgo: i % 4 })),
  ...repeat(10, i => makeTask({ hours: 2, plannedHours: 2.4, department: 'SEO', category: 'SEO Work', creatorId: 'u-exec2', creatorName: 'Test Exec 2', daysAgo: i % 4 })),
  ...repeat(15, i => makeTask({ hours: 2, plannedHours: 2.4, department: 'Social', category: 'Social Work', creatorId: 'u-exec3', creatorName: 'Test Exec 3', daysAgo: i % 4 })),
];

/* Beta: Paid Media 2+2+3 = 7h, Design 6×2h+1h = 13h. */
const betaLogs = [
  makeTask({ hours: 2, department: 'Paid Media', category: 'Paid Media Work', creatorId: 'u-exec1', creatorName: 'Test Exec 1', daysAgo: 1 }),
  makeTask({ hours: 2, department: 'Paid Media', category: 'Paid Media Work', creatorId: 'u-exec1', creatorName: 'Test Exec 1', daysAgo: 2 }),
  makeTask({ hours: 3, department: 'Paid Media', category: 'Paid Media Work', creatorId: 'u-exec1', creatorName: 'Test Exec 1', daysAgo: 0 }),
  ...repeat(6, i => makeTask({ hours: 2, department: 'Design', category: 'Design Work', creatorId: 'u-exec2', creatorName: 'Test Exec 2', daysAgo: i % 3 })),
  makeTask({ hours: 1, department: 'Design', category: 'Design Work', creatorId: 'u-exec2', creatorName: 'Test Exec 2', daysAgo: 3 }),
];

/* Gamma: 16×2h + 5h = 37h, 17 tasks. */
const gammaLogs = [
  ...repeat(16, i => makeTask({ hours: 2, department: 'Analytics', category: 'Analytics Work', creatorId: 'u-exec3', creatorName: 'Test Exec 3', daysAgo: i % 4 })),
  makeTask({ hours: 5, department: 'Analytics', category: 'Analytics Work', creatorId: 'u-exec3', creatorName: 'Test Exec 3', daysAgo: 2 }),
];

/* Restricted: 9,999h sentinel — must NEVER appear in any CSM/BH output. */
export const RESTRICTED_SENTINEL_HOURS = 9999;
const restrictedLogs = [
  makeTask({ hours: 5000, department: 'Paid Media', category: 'Restricted Work', creatorId: 'u-exec1', creatorName: 'Test Exec 1', daysAgo: 0 }),
  makeTask({ hours: 4000, department: 'SEO', category: 'Restricted Work', creatorId: 'u-exec2', creatorName: 'Test Exec 2', daysAgo: 1 }),
  makeTask({ hours: 999, department: 'Social', category: 'Restricted Work', creatorId: 'u-exec3', creatorName: 'Test Exec 3', daysAgo: 2 }),
];

export const FIXTURE_CLIENT_LOGS = {
  'tc-alpha': alphaLogs,
  'tc-beta': betaLogs,
  'tc-gamma': gammaLogs,
  'tc-restricted': restrictedLogs,
};

export const EXPECTED = {
  alpha: {
    hours: 60,
    tasks: 30,
    plannedHours: 72,
    byDepartment: { 'Paid Media': 10, SEO: 20, Social: 30 },
    byCategory: { 'Paid Media Work': 10, 'SEO Work': 20, 'Social Work': 30 },
  },
  beta: { hours: 20, tasks: 10, byDepartment: { 'Paid Media': 7, Design: 13 } },
  gamma: { hours: 37, tasks: 17 },
  restricted: { hours: RESTRICTED_SENTINEL_HOURS, tasks: 3 },
  csm1AllClients: { hours: 80, tasks: 40 }, // Alpha 60 + Beta 20
};

export const findUser = (id) => FIXTURE_USERS.find(u => u.id === id);
