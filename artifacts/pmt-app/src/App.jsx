import React, { useEffect, useRef, useState } from 'react';
import { ref, onValue, set, get } from 'firebase/database';
import { signInWithEmailAndPassword, signInWithCustomToken, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, updateProfile, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { db, auth } from './firebase.js';
// MSAL import removed — we use a direct PKCE+postMessage popup flow instead.

import HomeView from './PMT/HomeView';
import ClientView from './PMT/ClientView';
import EmployeeView from './PMT/EmployeeView';
import MasterDataView from './PMT/MasterDataView';
import UserMetricsView from './PMT/UserMetricsView';
import ReportsView from './PMT/ReportsView';
import ApprovalsView from './PMT/ApprovalsView';
import Sidebar from './PMT/Sidebar';
import Notifications from './PMT/Notifications';
import ProfileDropdown from './PMT/ProfileDropdown';
import LoginView from './PMT/LoginView';
import TestModePanel, { TEST_USERS } from './PMT/TestModePanel';

const DEFAULT_USERS = [
  { id: 1, name: "Theo", email: "theo.hayes@ethinos.com", role: 'Super Admin', assignedProjects: [], department: 'Growth', region: 'North' },
  ...TEST_USERS,
];

// Categories are stored as objects: { name: string, departments: string[] }
// departments: [] means Universal (visible to all)
const DEFAULT_TASK_CATEGORIES = [
  { name: 'Strategy & Planning', departments: [] },
  { name: 'Campaign Setup', departments: [] },
  { name: 'Campaign Optimization', departments: [] },
  { name: 'Reporting & Analysis', departments: [] },
  { name: 'Client Communication', departments: [] },
  { name: 'Content Creation', departments: [] },
  { name: 'Creatives & Assets', departments: [] },
  { name: 'Research', departments: [] },
  { name: 'Budget Management', departments: [] },
  { name: 'Technical Setup', departments: [] },
  { name: 'Training & Development', departments: [] },
  { name: 'Other', departments: [] },
];

// Migrate legacy string categories to the new object format.
// Also normalizes malformed objects (missing name or departments field).
const migrateCategoryList = (val) => {
  if (!Array.isArray(val)) return DEFAULT_TASK_CATEGORIES;
  return val.map(item => {
    if (typeof item === 'string') return { name: item, departments: [] };
    if (item && typeof item === 'object') {
      return {
        name: typeof item.name === 'string' ? item.name : String(item.name || ''),
        departments: Array.isArray(item.departments) ? item.departments : [],
      };
    }
    return null;
  }).filter(Boolean);
};

const DEFAULT_TASK_TEMPLATES = [
  {
    id: 'prebuilt-1',
    name: 'Monthly Digital Report',
    description: 'Standard end-of-month reporting tasks for digital campaigns.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Pull performance data from all ad platforms', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
      { comment: 'Compile monthly KPI summary deck', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
      { comment: 'Share report with client and collect feedback', category: 'Client Communication', repeatFrequency: 'Monthly' },
      { comment: 'Update internal performance tracker', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
    ],
  },
  {
    id: 'prebuilt-2',
    name: 'New Client Onboarding',
    description: 'Tasks to onboard a new client onto the platform and align on strategy.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Kick-off call and introductions', category: 'Client Communication', repeatFrequency: 'Once' },
      { comment: 'Collect brand guidelines and assets', category: 'Creatives & Assets', repeatFrequency: 'Once' },
      { comment: 'Set up ad accounts and grant access', category: 'Technical Setup', repeatFrequency: 'Once' },
      { comment: 'Define goals, KPIs and reporting cadence', category: 'Strategy & Planning', repeatFrequency: 'Once' },
      { comment: 'Create onboarding summary doc and share with team', category: 'Client Communication', repeatFrequency: 'Once' },
    ],
  },
  {
    id: 'prebuilt-3',
    name: 'Campaign Launch',
    description: 'Pre-launch and go-live checklist for a new campaign.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Brief creative team on campaign requirements', category: 'Creatives & Assets', repeatFrequency: 'Once' },
      { comment: 'Set up campaign in ad platform with correct targeting', category: 'Campaign Setup', repeatFrequency: 'Once' },
      { comment: 'QA all creatives, copy and tracking links', category: 'Campaign Setup', repeatFrequency: 'Once' },
      { comment: 'Get client approval on launch plan', category: 'Client Communication', repeatFrequency: 'Once' },
      { comment: 'Launch campaign and monitor initial delivery', category: 'Campaign Optimization', repeatFrequency: 'Once' },
    ],
  },
  {
    id: 'prebuilt-4',
    name: 'Weekly Performance Review',
    description: 'Recurring weekly tasks to monitor and optimise live campaigns.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Review weekly spend vs. budget pacing', category: 'Budget Management', repeatFrequency: 'Weekly' },
      { comment: 'Check CTR, CPC and conversion metrics', category: 'Campaign Optimization', repeatFrequency: 'Weekly' },
      { comment: 'Pause underperforming ad sets and reallocate budget', category: 'Campaign Optimization', repeatFrequency: 'Weekly' },
      { comment: 'Send weekly performance update to client', category: 'Client Communication', repeatFrequency: 'Weekly' },
    ],
  },
  {
    id: 'prebuilt-5',
    name: 'Social Media Monthly Plan',
    description: 'Monthly content planning and scheduling tasks for social channels.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Plan content calendar for the month', category: 'Content Creation', repeatFrequency: 'Monthly' },
      { comment: 'Create and design post creatives', category: 'Creatives & Assets', repeatFrequency: 'Monthly' },
      { comment: 'Write captions and get client approval', category: 'Client Communication', repeatFrequency: 'Monthly' },
      { comment: 'Schedule posts across platforms', category: 'Content Creation', repeatFrequency: 'Monthly' },
      { comment: 'Review previous month engagement and refine strategy', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
    ],
  },
];

const MicrosoftProfileSetup = ({ firebaseUser, departments, regions, onComplete, onSignOut }) => {
  const [department, setDepartment] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const displayName = firebaseUser.displayName || firebaseUser.email.split('@')[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!department) { setError('Please select your department.'); return; }
    if (!region) { setError('Please select your region.'); return; }
    setSaving(true);
    setError('');
    try {
      await onComplete({ department, region });
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="relative min-h-screen w-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'radial-gradient(58% 72% at 8% 16%, rgba(241, 94, 88, 0.92) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(52% 64% at 52% 88%, rgba(82, 110, 255, 0.78) 0%, rgba(82, 110, 255, 0) 66%), linear-gradient(140deg, #eb6f7a 0%, #c86ea0 33%, #8c7fd1 58%, #8ca3d4 74%, #d5dca8 100%)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/35 bg-white/90 shadow-2xl backdrop-blur-xl p-10">
        <div className="mb-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 mb-4">
            <svg className="h-7 w-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Complete Your Profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Welcome, <strong className="text-slate-700">{displayName}</strong>! Select your department and region to get started.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">Department</label>
            <select value={department} onChange={e => setDepartment(e.target.value)} className={inputCls} required>
              <option value="">Select department…</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">Region</label>
            <select value={region} onChange={e => setRegion(e.target.value)} className={inputCls} required>
              <option value="">Select region…</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs text-indigo-700">
              <span className="font-bold">Employee access.</span> Your manager will assign clients and update your role once your account is reviewed.
            </p>
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-rose-500 via-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {saving ? 'Setting up…' : 'Continue to Workspace'}
          </button>
        </form>

        <button onClick={onSignOut} className="mt-4 w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
};

// Detect if this window was opened as a popup (e.g. by our MS login flow).
// We render a minimal "Completing sign-in…" screen so the user doesn't see
// the full login page flash inside the popup.
const isPopupWindow = (() => {
  try { return !!window.opener && window.opener !== window; } catch { return false; }
})();

// ---------------------------------------------------------------------------
// PKCE helpers for the custom Microsoft popup login flow.
// We build the auth URL ourselves and communicate via postMessage so the flow
// works even inside sandboxed iframes (MSAL's popup monitor does not).
// ---------------------------------------------------------------------------

async function generatePkce() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hashed)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [msLoginPending, setMsLoginPending] = useState(false);
  const [msLoginStatus, setMsLoginStatus] = useState('');

  // True when this window was opened by Microsoft's redirect after auth.
  // We detect it once at init time (before React clears the URL).
  const [isAuthRedirectMode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return !!(p.get('code') && p.get('state'));
  });
  const [msAuthRedirectError, setMsAuthRedirectError] = useState('');

  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [taskCategories, setTaskCategories] = useState(DEFAULT_TASK_CATEGORIES);
  const [departments, setDepartments] = useState(['Creative', 'Biddable', 'Growth', 'Client Servicing']);
  const [regions, setRegions] = useState(['North', 'South', 'West']);
  const DEFAULT_CC_TAB_ACCESS = { users: ['Super Admin', 'Director'], clients: ['Super Admin', 'Director'], categories: ['Super Admin', 'Director'], departments: ['Super Admin', 'Director'], regions: ['Super Admin', 'Director'], conditions: ['Super Admin'], templates: ['Super Admin', 'Director'], feedback: ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM', 'Employee', 'Snr Executive', 'Executive', 'Intern'] };
  const [controlCenterTabAccess, setControlCenterTabAccess] = useState(DEFAULT_CC_TAB_ACCESS);
  const [userManagementAccessRoles, setUserManagementAccessRoles] = useState(['Super Admin', 'Director']);
  const [employeeViewAccessRoles, setEmployeeViewAccessRoles] = useState(['Super Admin', 'Director']);
  const [metricsAccessRoles, setMetricsAccessRoles] = useState(['Super Admin', 'Director']);
  const [reportsAccessRoles, setReportsAccessRoles] = useState(['Super Admin', 'Director']);
  const [metricsAllDataRoles, setMetricsAllDataRoles] = useState(['Super Admin', 'Director']);
  const [reportsAllDataRoles, setReportsAllDataRoles] = useState(['Super Admin', 'Director']);
  const [clientLogs, setClientLogs] = useState({});
  const [taskTemplates, setTaskTemplates] = useState(DEFAULT_TASK_TEMPLATES);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Permissions system active", time: "Just now", read: false },
  ]);

  const [selectedClient, setSelectedClient] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [testModeUserId, setTestModeUserId] = useState(null);

  // --- FIREBASE AUTH LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setCurrentUserId(null);
      }
    });
    return unsubscribe;
  }, []);




  // --- FIREBASE DATA SYNC (read once on auth) ---
  useEffect(() => {
    if (!firebaseUser) return;

    const syncRef = (path, setter) => {
      const dbRef = ref(db, path);
      return onValue(dbRef, (snapshot) => {
        const val = snapshot.val();
        if (val !== null && val !== undefined) setter(val);
      });
    };

    // Seed DEFAULT_USERS into Firebase; also upsert test users by email
    const seedUsers = async () => {
      const snap = await get(ref(db, 'users'));
      if (!snap.exists()) {
        await set(ref(db, 'users'), DEFAULT_USERS);
      }
    };
    seedUsers();

    // Seed DEFAULT_TASK_TEMPLATES into Firebase if the taskTemplates node is empty
    const seedTaskTemplates = async () => {
      const snap = await get(ref(db, 'taskTemplates'));
      if (!snap.exists()) {
        await set(ref(db, 'taskTemplates'), DEFAULT_TASK_TEMPLATES);
      }
    };
    seedTaskTemplates();

    // Migrate category data: if Firebase has legacy string arrays, write back as objects
    const migrateCategoriesInFirebase = async () => {
      const snap = await get(ref(db, 'taskCategories'));
      if (!snap.exists()) {
        await set(ref(db, 'taskCategories'), sanitizeForFirebase(DEFAULT_TASK_CATEGORIES));
        return;
      }
      const val = snap.val();
      const list = Array.isArray(val) ? val : null;
      if (list && list.some(item => typeof item === 'string')) {
        // Legacy string format detected — migrate and persist
        const migrated = migrateCategoryList(list);
        await set(ref(db, 'taskCategories'), sanitizeForFirebase(migrated));
      }
    };
    migrateCategoriesInFirebase();

    // Seed default departments & regions if they don't exist in Firebase yet
    const seedDepartmentsRegions = async () => {
      const dSnap = await get(ref(db, 'departments'));
      if (!dSnap.exists()) {
        await set(ref(db, 'departments'), ['Creative', 'Biddable', 'Growth', 'Client Servicing']);
      }
      const rSnap = await get(ref(db, 'regions'));
      if (!rSnap.exists()) {
        await set(ref(db, 'regions'), ['North', 'South', 'East', 'West', 'Pan India']);
      }
    };
    seedDepartmentsRegions();

    const unsubs = [
      syncRef('users', (val) => {
        const firebaseList = Array.isArray(val) ? val : Object.values(val);
        setUsers(firebaseList);
      }),
      syncRef('clients', (val) => setClients(Array.isArray(val) ? val : Object.values(val))),
      syncRef('clientLogs', (val) => setClientLogs(val || {})),
      syncRef('taskCategories', (val) => setTaskCategories(migrateCategoryList(val))),
      syncRef('taskTemplates', (val) => setTaskTemplates(Array.isArray(val) ? val : Object.values(val))),
      syncRef('departments', (val) => setDepartments(Array.isArray(val) ? val : Object.values(val))),
      syncRef('regions', (val) => setRegions(Array.isArray(val) ? val : Object.values(val))),
      syncRef('controlCenterTabAccess', (val) => { if (val && typeof val === 'object' && !Array.isArray(val)) setControlCenterTabAccess(prev => ({ ...prev, ...val })); }),
      syncRef('userManagementAccessRoles', (val) => setUserManagementAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('employeeViewAccessRoles', (val) => setEmployeeViewAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('metricsAccessRoles', (val) => setMetricsAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('reportsAccessRoles', (val) => setReportsAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('metricsAllDataRoles', (val) => setMetricsAllDataRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('reportsAllDataRoles', (val) => setReportsAllDataRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('feedbackItems', (val) => setFeedbackItems(val && typeof val === 'object' ? (Array.isArray(val) ? val : Object.values(val)) : [])),
    ];

    setDbReady(true);

    return () => unsubs.forEach(u => u());
  }, [firebaseUser]);

  // --- FIREBASE WRITE HELPERS ---
  // Firebase rejects `undefined` values — replace them recursively with `null`
  const sanitizeForFirebase = (value) => {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitizeForFirebase);
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeForFirebase(v)])
    );
  };

  const persistUsers = (nextUsers) => {
    setUsers(nextUsers);
    if (firebaseUser) set(ref(db, 'users'), sanitizeForFirebase(nextUsers));
  };
  const persistClients = (nextClients) => {
    setClients(nextClients);
    if (firebaseUser) set(ref(db, 'clients'), sanitizeForFirebase(nextClients));
  };
  const persistClientLogs = (nextLogs) => {
    setClientLogs(nextLogs);
    if (firebaseUser) set(ref(db, 'clientLogs'), sanitizeForFirebase(nextLogs));
  };
  const persistTaskCategories = (val) => {
    setTaskCategories(val);
    if (firebaseUser) set(ref(db, 'taskCategories'), sanitizeForFirebase(val));
  };
  const persistTaskTemplates = (val) => {
    setTaskTemplates(val);
    if (firebaseUser) set(ref(db, 'taskTemplates'), sanitizeForFirebase(val));
  };
  const persistDepartments = (val, prevVal) => {
    setDepartments(val);
    if (firebaseUser) set(ref(db, 'departments'), sanitizeForFirebase(val)).catch(() => {
      if (prevVal !== undefined) setDepartments(prevVal);
    });
  };
  const persistRegions = (val, prevVal) => {
    setRegions(val);
    if (firebaseUser) set(ref(db, 'regions'), sanitizeForFirebase(val)).catch(() => {
      if (prevVal !== undefined) setRegions(prevVal);
    });
  };
  const persistControlCenterTabAccess = (val) => {
    setControlCenterTabAccess(val);
    if (firebaseUser) set(ref(db, 'controlCenterTabAccess'), sanitizeForFirebase(val));
  };
  const persistUserManagementRoles = (val) => {
    setUserManagementAccessRoles(val);
    if (firebaseUser) set(ref(db, 'userManagementAccessRoles'), val);
  };
  const persistEmployeeViewRoles = (val) => {
    setEmployeeViewAccessRoles(val);
    if (firebaseUser) set(ref(db, 'employeeViewAccessRoles'), val);
  };
  const persistMetricsRoles = (val) => {
    setMetricsAccessRoles(val);
    if (firebaseUser) set(ref(db, 'metricsAccessRoles'), val);
  };
  const persistReportsRoles = (val) => {
    setReportsAccessRoles(val);
    if (firebaseUser) set(ref(db, 'reportsAccessRoles'), val);
  };
  const persistMetricsAllDataRoles = (val) => {
    setMetricsAllDataRoles(val);
    if (firebaseUser) set(ref(db, 'metricsAllDataRoles'), val);
  };
  const persistReportsAllDataRoles = (val) => {
    setReportsAllDataRoles(val);
    if (firebaseUser) set(ref(db, 'reportsAllDataRoles'), val);
  };
  const persistFeedbackItems = (val) => {
    setFeedbackItems(val);
    if (firebaseUser) set(ref(db, 'feedbackItems'), sanitizeForFirebase(val));
  };

  // --- MATCH FIREBASE AUTH USER → PMT USER RECORD ---
  // Runs whenever auth state changes, the users list loads from Firebase, or dbReady changes.
  useEffect(() => {
    if (!firebaseUser) { setCurrentUserId(null); return; }
    // Wait until Firebase data has finished loading before making a role decision.
    // Without this guard the effect runs with an empty users list and can't find
    // the real record — previously it fell through to create a fake Super Admin.
    if (!dbReady) return;

    const email = firebaseUser.email?.toLowerCase();
    if (!email) return;
    // Check Firebase users first, then fall back to DEFAULT_USERS
    const firebaseMatch = users.find(u => u.email?.toLowerCase() === email);
    const defaultMatch = DEFAULT_USERS.find(u => u.email?.toLowerCase() === email);
    const matched = firebaseMatch || defaultMatch;

    if (matched) {
      setMsLoginPending(false);
      // Merge with live Firebase Auth info so name/email are always current
      const mergedRecord = {
        ...matched,
        name: firebaseUser.displayName || matched.name,
        email: firebaseUser.email,
        _id: matched.id,
      };
      // Ensure the record is in the users state so currentUser resolves correctly
      setUsers(prev => {
        const exists = prev.find(u => u.id === matched.id);
        if (exists) {
          // Only update if name or email are actually stale (avoid infinite loop)
          if (exists.name === mergedRecord.name && exists.email === mergedRecord.email) return prev;
          return prev.map(u => u.id === matched.id
            ? { ...u, name: mergedRecord.name, email: mergedRecord.email }
            : u
          );
        }
        return [...prev, mergedRecord];
      });
      setCurrentUserId(matched.id);
    } else {
      // Valid @ethinos.com account but not yet added to the PMT system by an admin.
      // Leave currentUserId as null → shows the "Access Not Set Up" screen.
      setCurrentUserId(null);
    }
  }, [firebaseUser, users, dbReady]);

  // --- SHARED LOGIC ---
  const effectiveUserId = testModeUserId || currentUserId;
  const currentUser = users.find(u => u.id === effectiveUserId) || null;
  const isTestMode = !!testModeUserId;
  const canSeeAllMetricsData = metricsAllDataRoles.includes(currentUser?.role);
  const canSeeAllReportsData = reportsAllDataRoles.includes(currentUser?.role);
  const canSeeControlCenter = currentUser?.role === 'Super Admin' || Object.values(controlCenterTabAccess).some(roles => (roles || []).includes(currentUser?.role));
  const canSeeUserManagement = userManagementAccessRoles.includes(currentUser?.role);
  const canSeeEmployeeView = employeeViewAccessRoles.includes(currentUser?.role);
  const canSeeMetrics = metricsAccessRoles.includes(currentUser?.role);
  const canSeeReports = reportsAccessRoles.includes(currentUser?.role);
  const availableRoles = [...new Set(users.map(u => u.role))];

  const accessibleClients = !currentUser
    ? []
    : currentUser.role === 'Super Admin'
      ? clients
      : clients.filter(c => currentUser.assignedProjects?.includes(c.name) || currentUser.assignedProjects?.includes('All'));

  const SYNTHETIC_CLIENTS = [
    { id: '__personal__', name: 'Personal', synthetic: true, isPersonal: true },
    { id: '__ethinos__', name: 'Ethinos', synthetic: true, isEthinos: true, nonBillableLocked: true },
  ];

  const allTasks = [
    ...accessibleClients.flatMap(c => (clientLogs[c.id] || []).map(t => ({ ...t, cid: c.id, cName: c.name }))),
    ...SYNTHETIC_CLIENTS.flatMap(c => (clientLogs[c.id] || []).map(t => ({ ...t, cid: c.id, cName: c.name }))),
  ];

  const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
  const canSeeApprovals = managementRoles.includes(currentUser?.role);

  const CROSS_DEPT_ROLES_APP = ['Super Admin', 'Admin', 'Director', 'Business Head'];
  const isCrossDeptApp = CROSS_DEPT_ROLES_APP.includes(currentUser?.role) || currentUser?.department === 'All';
  const userDeptApp = currentUser?.department;

  // Filtered category names for task creation/editing (scoped to user's department)
  // Cross-dept roles see all categories; others see Universal + their department's categories
  const filteredTaskCategoryNames = taskCategories
    .filter(cat => {
      if (isCrossDeptApp) return true;
      const depts = cat.departments || [];
      return depts.length === 0 || depts.includes(userDeptApp);
    })
    .map(cat => cat.name);
  const myClientNames = (currentUser?.assignedProjects || []);
  const pendingApprovalsCount = canSeeApprovals
    ? Object.entries(clientLogs || {}).reduce((total, [clientId, logs]) => {
        const client = clients.find(c => String(c.id) === String(clientId));
        const qcCount = (logs || []).filter(t => {
          if (String(t.qcAssigneeId) !== String(currentUser?.id) || t.qcStatus !== 'sent') return false;
          if (isCrossDeptApp) return true;
          if (!Array.isArray(t.departments)) return true;
          return t.departments.includes(userDeptApp);
        }).length;
        const assignReqCount = (isCrossDeptApp || (client && myClientNames.includes(client.name)))
          ? (logs || []).reduce((n, t) => n + (t.assignmentRequests?.length || 0), 0)
          : 0;
        return total + qcCount + assignReqCount;
      }, 0)
      + (clients || []).reduce((n, c) => {
          if (!isCrossDeptApp && !myClientNames.includes(c.name)) return n;
          return n + (c.joinRequests?.length || 0);
        }, 0)
    : 0;

  const tabTitles = {
    home: 'Home',
    clients: 'Clients',
    approvals: 'Approvals',
    metrics: 'Metrics',
    reports: 'Reports',
    employees: 'Employees',
    settings: 'Settings',
    'master-data': 'Control Center',
  };

  const isMinimized = sidebarMinimized || activeTab === 'clients' || selectedClient !== null;

  const handleUpdateProfile = ({ name, secondaryEmail, phone, photoURL }) => {
    if (!currentUser) return;
    const updated = {
      ...currentUser,
      ...(name?.trim() ? { name: name.trim() } : {}),
      secondaryEmail: (secondaryEmail || '').trim(),
      phone: (phone || '').trim(),
      photoURL: photoURL || '',
    };
    persistUsers(users.map(u => u.id === currentUser.id ? updated : u));
    if (firebaseUser && name?.trim()) {
      updateProfile(firebaseUser, { displayName: name.trim() }).catch(() => {});
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    if (!firebaseUser || !currentPassword || !newPassword) throw new Error('All fields are required.');
    const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
    await reauthenticateWithCredential(firebaseUser, credential);
    await updatePassword(firebaseUser, newPassword);
  };

  const handleResetPassword = async (email) => {
    if (!email) throw new Error('Please enter your email address.');
    if (!email.toLowerCase().endsWith('@ethinos.com')) {
      throw new Error('Password reset is only available for Ethinos work accounts (@ethinos.com).');
    }
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    const resp = await fetch(`${apiBase}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to send reset email');
    }
  };

  const isEthinosDomain = (email) => email?.toLowerCase().endsWith('@ethinos.com');

  const handleLogin = async (email, password) => {
    if (!email || !password) {
      setLoginError('Enter both email and password');
      return;
    }
    if (!isEthinosDomain(email)) {
      setLoginError('Access is restricted to Ethinos work accounts (@ethinos.com).');
      return;
    }
    try {
      setLoginError('');
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setLoginError('Invalid email or password. Please try again.');
    }
  };

  // Exchange a Microsoft access token for a Firebase custom token and sign in.
  const finishMsLogin = async ({ accessToken }) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    const resp = await fetch(`${apiBase}/auth/ms-token-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msAccessToken: accessToken }),
    });
    if (resp.ok) {
      const { customToken } = await resp.json();
      setMsLoginPending(true);
      await signInWithCustomToken(auth, customToken);
    } else {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Microsoft sign-in failed. Please contact your administrator.');
    }
  };

  // Stable ref so the auth-redirect useEffect can call finishMsLogin safely.
  const finishMsLoginRef = useRef(finishMsLogin);
  finishMsLoginRef.current = finishMsLogin;

  // -------------------------------------------------------------------------
  // Auth-redirect processing — runs once on mount when this tab is the one
  // Azure redirected back to (URL has ?code=&state=).
  // Strategy: redirect back to the ROOT URL of the main app (already registered
  // in Azure). The app running in this auth tab exchanges the PKCE code for a
  // token, signs in with Firebase, then tries to close itself.
  // The ORIGINAL tab detects the sign-in via Firebase's cross-tab auth
  // persistence (onAuthStateChanged fires there within ~1 s). No postMessage
  // or storage events needed.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthRedirectMode) return;

    const p           = new URLSearchParams(window.location.search);
    const code        = p.get('code');
    const state       = p.get('state');
    const error       = p.get('error');
    const errorDesc   = p.get('error_description');

    // Clean the URL so a manual reload doesn't re-trigger this.
    window.history.replaceState({}, '', window.location.pathname);

    console.log('[MS auth-redirect] code present:', !!code, 'state present:', !!state, 'error:', error);

    if (error) {
      setMsAuthRedirectError(errorDesc || error);
      return;
    }

    // Decode verifier and redirectUri from the state param — they were embedded
    // by handleMicrosoftLogin so no localStorage (cross-partition) access is needed.
    let verifier, redirectUri;
    try {
      const padded = state.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(padded + '='.repeat((4 - padded.length % 4) % 4)));
      verifier    = decoded.v;
      redirectUri = decoded.r;
    } catch {
      verifier = null;
    }

    console.log('[MS auth-redirect] verifier decoded from state:', !!verifier, 'redirectUri:', redirectUri);

    if (!verifier || !redirectUri) {
      setMsAuthRedirectError('Invalid authentication state — please close this tab and try again.');
      return;
    }

    // Server-side exchange: our API calls Azure's token endpoint server-to-server,
    // avoiding the AADSTS9002326 cross-origin restriction on Web-type redirect URIs.
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

    (async () => {
      try {
        console.log('[MS auth-redirect] Sending code to server for exchange…');
        const exchangeRes = await fetch(`${apiBase}/auth/ms-code-exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, verifier, redirectUri }),
        });
        const exchangeData = await exchangeRes.json();
        console.log('[MS auth-redirect] Server exchange response:', exchangeRes.status, exchangeData.error || 'OK');
        if (!exchangeRes.ok) throw new Error(exchangeData.error || 'Sign-in failed — server error');

        const { customToken } = exchangeData;
        console.log('[MS auth-redirect] Signing in with Firebase custom token…');
        setMsLoginPending(true);
        await signInWithCustomToken(auth, customToken);
        console.log('[MS auth-redirect] Firebase sign-in complete ✓ — redirecting to app');
        // Replace the URL with the clean app root so the user lands on the
        // dashboard in this tab. window.close() is often blocked by browsers
        // when the tab was opened by window.open(), and the Replit preview
        // iframe uses a partitioned storage context that prevents cross-tab
        // Firebase auth sync in the workspace (not an issue in production).
        setTimeout(() => {
          window.location.replace(window.location.origin + '/');
        }, 600);
      } catch (err) {
        console.error('[MS auth-redirect] Error:', err);
        setMsAuthRedirectError(err.message || 'Sign-in failed. Please close this tab and try again.');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open a Microsoft login tab using a custom PKCE flow.
  // The PKCE verifier and redirectUri are encoded inside the OAuth `state`
  // parameter so they travel through Azure's redirect URL with zero reliance
  // on localStorage (which is storage-partitioned when the app runs inside
  // a Replit preview iframe on a different top-level origin).
  const handleMicrosoftLogin = async () => {
    setLoginError('');
    setMsLoginStatus('');
    const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;
    const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;

    console.log('[MS login] clientId present:', !!clientId, 'tenantId present:', !!tenantId);

    if (!clientId || !tenantId) {
      setLoginError('Microsoft login is not configured. Please use email/password to sign in.');
      return;
    }

    const redirectUri = window.location.origin + '/';
    const { verifier, challenge } = await generatePkce();

    // Encode verifier + redirectUri into the state string so the auth tab
    // can read them directly from the URL — no cross-partition storage needed.
    const statePayload = btoa(JSON.stringify({ v: verifier, r: redirectUri }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id',             clientId);
    authUrl.searchParams.set('response_type',         'code');
    authUrl.searchParams.set('redirect_uri',          redirectUri);
    authUrl.searchParams.set('scope',                 'openid profile email User.Read');
    authUrl.searchParams.set('state',                 statePayload);
    authUrl.searchParams.set('code_challenge',        challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('response_mode',         'query');

    console.log('[MS login] Opening auth URL, redirectUri:', redirectUri);

    const tab = window.open(
      authUrl.toString(),
      'ms-auth-tab',
      'width=520,height=680,menubar=no,toolbar=no,location=no,resizable=yes',
    );

    if (!tab) {
      console.warn('[MS login] Popup blocked, falling back to same-window redirect');
      window.location.href = authUrl.toString();
      return;
    }

    console.log('[MS login] Auth tab opened — waiting for Firebase cross-tab auth-state sync…');
    setMsLoginStatus('Waiting for Microsoft sign-in… (you can return to this tab after signing in)');
  };

  const handleCreateAccount = async ({ name, email, password, department, region }) => {
    if (!isEthinosDomain(email)) {
      setLoginError('Registration is restricted to Ethinos work accounts (@ethinos.com).');
      return;
    }
    try {
      setLoginError('');
      // 1. Create the Firebase Auth account (auto signs them in)
      await createUserWithEmailAndPassword(auth, email, password);

      // 2. Once authenticated, read current users and append the new record
      const snap = await get(ref(db, 'users'));
      const existing = snap.val();
      const currentList = Array.isArray(existing)
        ? existing
        : existing ? Object.values(existing) : DEFAULT_USERS;

      const newUser = {
        id: Date.now(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'Employee',
        assignedProjects: [],
        department: department || 'Growth',
        region: region || 'North',
      };

      const updated = [...currentList, newUser];
      await set(ref(db, 'users'), updated);
      // The onValue listener will pick this up and trigger the matching effect
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setLoginError('An account with this email already exists. Try signing in instead.');
      } else if (err.code === 'auth/weak-password') {
        setLoginError('Password must be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setLoginError('Please enter a valid email address.');
      } else {
        setLoginError('Could not create account. Please try again.');
      }
    }
  };

  const handleLogout = async () => {
    setIsProfileOpen(false);
    setIsNotifOpen(false);
    setSelectedClient(null);
    setActiveTab('home');
    setCurrentUserId(null);
    setDbReady(false);
    setMsLoginPending(false);
    await signOut(auth);
  };

  useEffect(() => {
    if (activeTab === 'master-data' && !canSeeControlCenter) setActiveTab('home');
    if (activeTab === 'employees' && !canSeeEmployeeView) setActiveTab('home');
    if (activeTab === 'metrics' && !canSeeMetrics) setActiveTab('home');
    if (activeTab === 'reports' && !canSeeReports) setActiveTab('home');
    if (activeTab === 'approvals' && !canSeeApprovals) setActiveTab('home');
  }, [activeTab, canSeeControlCenter, canSeeEmployeeView, canSeeMetrics, canSeeReports, canSeeApprovals]);

  // This tab was the Azure redirect target — show a simple "completing" screen.
  // The parent tab gets signed in via Firebase's cross-tab auth persistence.
  if (isAuthRedirectMode && !firebaseUser) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    minHeight:'100vh', background:'#f8fafc', gap:'16px', fontFamily:'system-ui,sans-serif',
                    padding:'32px', textAlign:'center' }}>
        {msAuthRedirectError ? (
          <>
            <div style={{ fontSize:'15px', fontWeight:'600', color:'#dc2626' }}>Sign-in error</div>
            <div style={{ fontSize:'13px', color:'#64748b', maxWidth:'360px' }}>{msAuthRedirectError}</div>
            <div style={{ fontSize:'12px', color:'#94a3b8' }}>Please close this tab and try again in the original tab.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize:'15px', fontWeight:'600', color:'#1e293b' }}>Completing sign-in…</div>
            <div style={{ fontSize:'13px', color:'#64748b' }}>Verifying your Microsoft account. Please wait.</div>
            <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'8px' }}>
              You'll be redirected to the dashboard in a moment…
            </div>
          </>
        )}
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-sm font-semibold text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!firebaseUser && !testModeUserId) {
    return (
      <>
        <LoginView onLogin={handleLogin} onMicrosoftLogin={handleMicrosoftLogin} onCreateAccount={handleCreateAccount} onResetPassword={handleResetPassword} loginError={loginError} msLoginStatus={msLoginStatus} />
        <TestModePanel
          currentUser={null}
          isTestMode={false}
          onImpersonate={(testUser) => {
            if (!users.find(u => u.id === testUser.id)) {
              setUsers(prev => [...prev, testUser]);
            }
            setTestModeUserId(testUser.id);
            setActiveTab('home');
            setSelectedClient(null);
          }}
          onExit={() => setTestModeUserId(null)}
        />
      </>
    );
  }

  if (!testModeUserId && firebaseUser && !currentUser) {
    if (msLoginPending && dbReady) {
      return (
        <MicrosoftProfileSetup
          firebaseUser={firebaseUser}
          departments={departments}
          regions={regions}
          onComplete={async ({ department, region }) => {
            const displayName = firebaseUser.displayName || firebaseUser.email.split('@')[0];
            const newUser = {
              id: `user-${Date.now()}`,
              name: displayName,
              email: firebaseUser.email.toLowerCase(),
              role: 'Employee',
              assignedProjects: [],
              department,
              region,
            };
            const snap = await get(ref(db, 'users'));
            const existing = snap.val();
            const currentList = Array.isArray(existing)
              ? existing
              : existing ? Object.values(existing) : DEFAULT_USERS;
            const updated = [...currentList, newUser];
            await set(ref(db, 'users'), updated);
            setMsLoginPending(false);
          }}
          onSignOut={handleLogout}
        />
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900">Access Not Set Up</h2>
          <p className="mt-2 text-sm text-slate-500">
            <strong className="text-slate-700">{firebaseUser.email}</strong> is not registered in the PMT system yet. Please ask your administrator to add your account.
          </p>
          <button
            onClick={handleLogout}
            className="mt-6 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex w-screen h-screen text-black text-sm overflow-hidden font-sans"
      style={{
        background:
          'radial-gradient(58% 64% at 8% 10%, rgba(241, 94, 88, 0.14) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(48% 56% at 52% 92%, rgba(82, 110, 255, 0.13) 0%, rgba(82, 110, 255, 0) 64%), radial-gradient(36% 48% at 96% 12%, rgba(236, 232, 123, 0.15) 0%, rgba(236, 232, 123, 0) 62%), linear-gradient(140deg, #fff7f8 0%, #f7f8ff 58%, #fffde9 100%)'
      }}
    >
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setSelectedClient={setSelectedClient}
        isMinimized={isMinimized}
        setIsMinimized={setSidebarMinimized}
        canSeeControlCenter={canSeeControlCenter}
        canSeeEmployeeView={canSeeEmployeeView}
        canSeeMetrics={canSeeMetrics}
        canSeeReports={canSeeReports}
        canSeeApprovals={canSeeApprovals}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      <div className="flex-1 flex flex-col bg-transparent overflow-hidden relative border-l border-white/40">
        <header className="h-16 px-8 flex items-center justify-between border-b border-white/50 font-black bg-white/45 backdrop-blur-sm uppercase sticky top-0 z-20">
          <h2 className="tracking-tight text-black">
            {selectedClient ? selectedClient.name : (tabTitles[activeTab] || activeTab)}
          </h2>
          <div className="flex items-center gap-4">
            <Notifications
              isNotifOpen={isNotifOpen}
              setIsNotifOpen={setIsNotifOpen}
              setIsProfileOpen={setIsProfileOpen}
              notifications={notifications}
              setNotifications={setNotifications}
              currentUser={currentUser}
              users={users}
              clients={clients}
              clientLogs={clientLogs}
              setActiveTab={setActiveTab}
              setSelectedClient={setSelectedClient}
            />
            <ProfileDropdown
              isProfileOpen={isProfileOpen}
              setIsProfileOpen={setIsProfileOpen}
              setIsNotifOpen={setIsNotifOpen}
              currentUser={currentUser}
              onUpdateProfile={handleUpdateProfile}
              onChangePassword={handleChangePassword}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="p-6 overflow-y-auto flex-1 bg-transparent">
          {activeTab === 'home' && !selectedClient && (
            <HomeView
              accessibleClients={accessibleClients}
              syntheticClients={SYNTHETIC_CLIENTS}
              allTasks={allTasks}
              clientLogs={clientLogs}
              setSelectedClient={setSelectedClient}
              setClientLogs={persistClientLogs}
              currentUser={currentUser}
              taskCategories={filteredTaskCategoryNames}
              users={users}
              departments={departments}
              onNavigateToClients={() => setActiveTab('clients')}
            />
          )}

          {activeTab === 'approvals' && !selectedClient && canSeeApprovals && (
            <ApprovalsView
              clientLogs={clientLogs}
              clients={clients}
              users={users}
              currentUser={currentUser}
              persistClientLogs={persistClientLogs}
              setClients={persistClients}
              setUsers={persistUsers}
            />
          )}

          {(activeTab === 'clients' || selectedClient) && (
            <ClientView
              selectedClient={selectedClient}
              setSelectedClient={setSelectedClient}
              clients={clients}
              setClients={persistClients}
              clientLogs={clientLogs}
              setClientLogs={persistClientLogs}
              clientSearch={clientSearch}
              setClientSearch={setClientSearch}
              users={users}
              setUsers={persistUsers}
              currentUser={currentUser}
              taskCategories={filteredTaskCategoryNames}
              taskTemplates={taskTemplates}
              setNotifications={setNotifications}
              accessibleClients={accessibleClients}
              departments={departments}
            />
          )}

          {activeTab === 'employees' && !selectedClient && canSeeEmployeeView && (
            <EmployeeView users={users} clients={clients} clientLogs={clientLogs} currentUser={currentUser} />
          )}

          {activeTab === 'metrics' && !selectedClient && canSeeMetrics && (
            <UserMetricsView users={users} clients={clients} clientLogs={clientLogs} currentUser={currentUser} departments={departments} canSeeAllData={canSeeAllMetricsData} />
          )}

          {activeTab === 'reports' && !selectedClient && canSeeReports && (
            <ReportsView users={users} clients={clients} clientLogs={clientLogs} currentUser={currentUser} departments={departments} canSeeAllData={canSeeAllReportsData} />
          )}

          {activeTab === 'master-data' && !selectedClient && canSeeControlCenter && (
            <MasterDataView
              taskCategories={taskCategories}
              setTaskCategories={persistTaskCategories}
              taskTemplates={taskTemplates}
              setTaskTemplates={persistTaskTemplates}
              currentUser={currentUser}
              departments={departments}
              setDepartments={persistDepartments}
              regions={regions}
              setRegions={persistRegions}
              availableRoles={availableRoles}
              controlCenterTabAccess={controlCenterTabAccess}
              setControlCenterTabAccess={persistControlCenterTabAccess}
              userManagementAccessRoles={userManagementAccessRoles}
              setUserManagementAccessRoles={persistUserManagementRoles}
              employeeViewAccessRoles={employeeViewAccessRoles}
              setEmployeeViewAccessRoles={persistEmployeeViewRoles}
              metricsAccessRoles={metricsAccessRoles}
              setMetricsAccessRoles={persistMetricsRoles}
              reportsAccessRoles={reportsAccessRoles}
              setReportsAccessRoles={persistReportsRoles}
              metricsAllDataRoles={metricsAllDataRoles}
              setMetricsAllDataRoles={persistMetricsAllDataRoles}
              reportsAllDataRoles={reportsAllDataRoles}
              setReportsAllDataRoles={persistReportsAllDataRoles}
              clients={clients}
              setClients={persistClients}
              users={users}
              setUsers={persistUsers}
              clientLogs={clientLogs}
              setClientLogs={persistClientLogs}
              createFirebaseUser={async (email, name) => {
                const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
                const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
                const resp = await fetch(`${apiBase}/auth/create-user`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                  },
                  body: JSON.stringify({ email, name }),
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                  const err = new Error(data.error || 'Failed to create user');
                  err.code = data.error;
                  throw err;
                }
                return data;
              }}
              feedbackItems={feedbackItems}
              setFeedbackItems={persistFeedbackItems}
              onSendPasswordReset={currentUser?.role === 'Super Admin' ? handleResetPassword : null}
            />
          )}
        </main>
      </div>

      <TestModePanel
        currentUser={currentUser}
        isTestMode={isTestMode}
        onImpersonate={(testUser) => {
          if (!users.find(u => u.id === testUser.id)) {
            setUsers(prev => [...prev, testUser]);
          }
          setTestModeUserId(testUser.id);
          setActiveTab('home');
          setSelectedClient(null);
        }}
        onExit={() => setTestModeUserId(null)}
      />
    </div>
  );
};

export default App;
