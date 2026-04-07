import React, { useEffect, useState } from 'react';
import { ref, onValue, set, get } from 'firebase/database';
import { signInWithEmailAndPassword, signInWithPopup, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase.js';

import HomeView from './PMT/HomeView';
import ClientView from './PMT/ClientView';
import UserView from './PMT/Userview';
import SettingsView from './PMT/SettingsView';
import EmployeeView from './PMT/EmployeeView';
import MasterDataView from './PMT/MasterDataView';
import UserMetricsView from './PMT/UserMetricsView';
import ReportsView from './PMT/ReportsView';
import ApprovalsView from './PMT/ApprovalsView';
import Sidebar from './PMT/Sidebar';
import Notifications from './PMT/Notifications';
import ProfileDropdown from './PMT/ProfileDropdown';
import LoginView from './PMT/LoginView';

const DEFAULT_USERS = [
  { id: 1, name: "Theo", email: "theo.hayes@ethinos.com", role: 'Super Admin', assignedProjects: ["All"], department: 'Growth', region: 'North' },
  { id: 201, name: "Ankit", email: "ankit@ethinos.com", role: 'Director', assignedProjects: ["KMF", "Durian"], department: 'Growth', region: 'South' },
  { id: 202, name: "Poonam", email: "poonam@ethinos.com", role: 'Director', assignedProjects: ["Bajaj - Chetak", "Bajaj - KTM"], department: 'Client Servicing', region: 'West' },
  { id: 205, name: "Suresh", email: "suresh@ethinos.com", role: 'Director', assignedProjects: ["KMF", "Durian", "Bajaj - Chetak", "Bajaj - KTM"], department: 'Growth', region: 'North' },
  { id: 203, name: "Sanford", email: "sanford@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - Chetak"], department: 'Client Servicing', region: 'North' },
  { id: 204, name: "Yogesh", email: "yogesh@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - KTM"], department: 'Client Servicing', region: 'South' },
  { id: 206, name: "Abha", email: "abha@ethinos.com", role: 'Manager', assignedProjects: ["KMF"], department: 'Growth', region: 'North' },
  { id: 207, name: "Gaurav Sharma", email: "gaurav.sharma@ethinos.com", role: 'Manager', assignedProjects: ["Durian"], department: 'Growth', region: 'South' },
  { id: 208, name: "Manuj", email: "manuj@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - Chetak"], department: 'Growth', region: 'West' },
  { id: 209, name: "Rajesh", email: "rajesh@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - KTM"], department: 'Growth', region: 'North' },
  { id: 210, name: "Prashanth Raghavan", email: "prashanth.r@ethinos.com", role: 'Manager', assignedProjects: ["KMF", "Durian"], department: 'Growth', region: 'South' },
  { id: 211, name: "Chinthan", email: "chinthan@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - Chetak"], department: 'Growth', region: 'West' },
  { id: 212, name: "Shivananda", email: "shivananda@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - KTM"], department: 'Growth', region: 'North' },
  { id: 213, name: "Yash", email: "yash.manager@ethinos.com", role: 'Manager', assignedProjects: ["KMF"], department: 'Growth', region: 'South' },
  { id: 214, name: "Ritwick", email: "ritwick@ethinos.com", role: 'Manager', assignedProjects: ["Durian"], department: 'Growth', region: 'West' },
  { id: 215, name: "Yash Karnawat", email: "yash.karnawat@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - Chetak"], department: 'Growth', region: 'North' },
  { id: 216, name: "Pranali", email: "pranali@ethinos.com", role: 'Manager', assignedProjects: ["Bajaj - KTM"], department: 'Growth', region: 'South' },
];

const DEFAULT_TASK_CATEGORIES = [
  'Strategy & Planning', 'Campaign Setup', 'Campaign Optimization',
  'Reporting & Analysis', 'Client Communication', 'Content Creation',
  'Creatives & Assets', 'Research', 'Budget Management', 'Technical Setup',
  'Training & Development', 'Other',
];

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

const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [taskCategories, setTaskCategories] = useState(DEFAULT_TASK_CATEGORIES);
  const [departments, setDepartments] = useState(['Creative', 'Biddable', 'Growth', 'Client Servicing']);
  const [regions, setRegions] = useState(['North', 'South', 'West']);
  const [controlCenterAccessRoles, setControlCenterAccessRoles] = useState(['Super Admin', 'Director']);
  const [settingsAccessRoles, setSettingsAccessRoles] = useState(['Super Admin', 'Director']);
  const [userManagementAccessRoles, setUserManagementAccessRoles] = useState(['Super Admin', 'Director']);
  const [employeeViewAccessRoles, setEmployeeViewAccessRoles] = useState(['Super Admin', 'Director']);
  const [metricsAccessRoles, setMetricsAccessRoles] = useState(['Super Admin', 'Director']);
  const [reportsAccessRoles, setReportsAccessRoles] = useState(['Super Admin', 'Director']);
  const [clientLogs, setClientLogs] = useState({});
  const [taskTemplates, setTaskTemplates] = useState(DEFAULT_TASK_TEMPLATES);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Permissions system active", time: "Just now", read: false },
  ]);

  const [selectedClient, setSelectedClient] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [dbReady, setDbReady] = useState(false);

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

    // Seed DEFAULT_USERS into Firebase if the users node is empty
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

    const unsubs = [
      syncRef('users', (val) => {
        const firebaseList = Array.isArray(val) ? val : Object.values(val);
        // Merge: keep all Firebase users and back-fill any DEFAULT_USERS not yet in Firebase
        const merged = [...firebaseList];
        DEFAULT_USERS.forEach(du => {
          if (!merged.find(u => u.email?.toLowerCase() === du.email?.toLowerCase())) {
            merged.push(du);
          }
        });
        setUsers(merged);
      }),
      syncRef('clients', (val) => setClients(Array.isArray(val) ? val : Object.values(val))),
      syncRef('clientLogs', (val) => setClientLogs(val || {})),
      syncRef('taskCategories', (val) => setTaskCategories(Array.isArray(val) ? val : DEFAULT_TASK_CATEGORIES)),
      syncRef('taskTemplates', (val) => setTaskTemplates(Array.isArray(val) ? val : Object.values(val))),
      syncRef('departments', (val) => setDepartments(Array.isArray(val) ? val : ['Creative', 'Biddable', 'Growth', 'Client Servicing'])),
      syncRef('regions', (val) => setRegions(Array.isArray(val) ? val : ['North', 'South', 'West'])),
      syncRef('controlCenterAccessRoles', (val) => setControlCenterAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('settingsAccessRoles', (val) => setSettingsAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('userManagementAccessRoles', (val) => setUserManagementAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('employeeViewAccessRoles', (val) => setEmployeeViewAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('metricsAccessRoles', (val) => setMetricsAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('reportsAccessRoles', (val) => setReportsAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
    ];

    setDbReady(true);

    return () => unsubs.forEach(u => u());
  }, [firebaseUser]);

  // --- FIREBASE WRITE HELPERS ---
  const persistUsers = (nextUsers) => {
    setUsers(nextUsers);
    if (firebaseUser) set(ref(db, 'users'), nextUsers);
  };
  const persistClients = (nextClients) => {
    setClients(nextClients);
    if (firebaseUser) set(ref(db, 'clients'), nextClients);
  };
  const persistClientLogs = (nextLogs) => {
    setClientLogs(nextLogs);
    if (firebaseUser) set(ref(db, 'clientLogs'), nextLogs);
  };
  const persistTaskCategories = (val) => {
    setTaskCategories(val);
    if (firebaseUser) set(ref(db, 'taskCategories'), val);
  };
  const persistTaskTemplates = (val) => {
    setTaskTemplates(val);
    if (firebaseUser) set(ref(db, 'taskTemplates'), val);
  };
  const persistDepartments = (val) => {
    setDepartments(val);
    if (firebaseUser) set(ref(db, 'departments'), val);
  };
  const persistRegions = (val) => {
    setRegions(val);
    if (firebaseUser) set(ref(db, 'regions'), val);
  };
  const persistControlCenterRoles = (val) => {
    setControlCenterAccessRoles(val);
    if (firebaseUser) set(ref(db, 'controlCenterAccessRoles'), val);
  };
  const persistSettingsRoles = (val) => {
    setSettingsAccessRoles(val);
    if (firebaseUser) set(ref(db, 'settingsAccessRoles'), val);
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

  // --- MATCH FIREBASE AUTH USER → PMT USER RECORD ---
  // Runs whenever auth state changes or the users list loads from Firebase.
  useEffect(() => {
    if (!firebaseUser) { setCurrentUserId(null); return; }
    const email = firebaseUser.email?.toLowerCase();
    if (!email) return;
    // Check Firebase users first, then fall back to DEFAULT_USERS
    const firebaseMatch = users.find(u => u.email?.toLowerCase() === email);
    const defaultMatch = DEFAULT_USERS.find(u => u.email?.toLowerCase() === email);
    const matched = firebaseMatch || defaultMatch;

    if (matched) {
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
      // No PMT record means manually added via Firebase Console → Super Admin
      const adminId = `firebase-admin-${firebaseUser.uid}`;
      const adminRecord = {
        id: adminId,
        name: firebaseUser.displayName || email.split('@')[0],
        email: firebaseUser.email,
        role: 'Super Admin',
        assignedProjects: ['All'],
        department: 'Management',
        region: 'All',
      };
      setUsers(prev => {
        if (prev.find(u => u.id === adminId)) return prev;
        return [...prev, adminRecord];
      });
      setCurrentUserId(adminId);
    }
  }, [firebaseUser, users]);

  // --- SHARED LOGIC ---
  const currentUser = users.find(u => u.id === currentUserId) || null;
  const canSeeControlCenter = controlCenterAccessRoles.includes(currentUser?.role);
  const canSeeSettings = settingsAccessRoles.includes(currentUser?.role);
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

  const allTasks = accessibleClients.flatMap(c => (clientLogs[c.id] || []).map(t => ({ ...t, cid: c.id, cName: c.name })));

  const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
  const canSeeApprovals = managementRoles.includes(currentUser?.role);

  const pendingApprovalsCount = canSeeApprovals
    ? Object.values(clientLogs || {}).reduce((total, logs) => {
        return total + (logs || []).filter(t =>
          String(t.qcAssigneeId) === String(currentUser?.id) && t.qcStatus === 'sent'
        ).length;
      }, 0)
    : 0;

  const tabTitles = {
    home: 'Home',
    clients: 'Clients',
    approvals: 'Approvals',
    users: 'Users',
    metrics: 'Metrics',
    reports: 'Reports',
    employees: 'Employees',
    settings: 'Settings',
    'master-data': 'Control Center',
  };

  const isMinimized = sidebarMinimized || activeTab === 'clients' || selectedClient !== null;

  const handleUpdateProfileName = (updatedName) => {
    if (!updatedName?.trim() || !currentUser) return;
    persistUsers(users.map(u => u.id === currentUser.id ? { ...u, name: updatedName.trim() } : u));
  };

  const handleChangePassword = () => {};

  const handleLogin = async (email, password) => {
    if (!email || !password) {
      setLoginError('Enter both email and password');
      return;
    }
    try {
      setLoginError('');
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setLoginError('Invalid email or password. Please try again.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoginError('');
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code === 'auth/popup-blocked') {
        setLoginError('Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.');
      } else if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // user dismissed — no error message needed
      } else {
        setLoginError('Google sign-in failed. Please try again.');
      }
    }
  };

  const handleCreateAccount = async ({ name, email, password, department, region }) => {
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
    await signOut(auth);
  };

  useEffect(() => {
    if (activeTab === 'master-data' && !canSeeControlCenter) setActiveTab('home');
    if (activeTab === 'settings' && !canSeeSettings) setActiveTab('home');
    if (activeTab === 'users' && !canSeeUserManagement) setActiveTab('home');
    if (activeTab === 'employees' && !canSeeEmployeeView) setActiveTab('home');
    if (activeTab === 'metrics' && !canSeeMetrics) setActiveTab('home');
    if (activeTab === 'reports' && !canSeeReports) setActiveTab('home');
    if (activeTab === 'approvals' && !canSeeApprovals) setActiveTab('home');
  }, [activeTab, canSeeControlCenter, canSeeSettings, canSeeUserManagement, canSeeEmployeeView, canSeeMetrics, canSeeReports, canSeeApprovals]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-sm font-semibold text-slate-500">Loading...</div>
      </div>
    );
  }

  // Firebase user signed in but not registered in the PMT system
  if (firebaseUser && !currentUser) {
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

  if (!firebaseUser || !currentUser) {
    return <LoginView onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} onCreateAccount={handleCreateAccount} loginError={loginError} />;
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
        canSeeSettings={canSeeSettings}
        canSeeUserManagement={canSeeUserManagement}
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
              currentUser={currentUser}
              users={users}
              clients={clients}
              clientLogs={clientLogs}
            />
            <ProfileDropdown
              isProfileOpen={isProfileOpen}
              setIsProfileOpen={setIsProfileOpen}
              setIsNotifOpen={setIsNotifOpen}
              currentUser={currentUser}
              onUpdateProfileName={handleUpdateProfileName}
              onChangePassword={handleChangePassword}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="p-6 overflow-y-auto flex-1 bg-transparent">
          {activeTab === 'home' && !selectedClient && (
            <HomeView
              accessibleClients={accessibleClients}
              allTasks={allTasks}
              clientLogs={clientLogs}
              setSelectedClient={setSelectedClient}
              setClientLogs={persistClientLogs}
              currentUser={currentUser}
              taskCategories={taskCategories}
            />
          )}

          {activeTab === 'approvals' && !selectedClient && canSeeApprovals && (
            <ApprovalsView
              clientLogs={clientLogs}
              clients={clients}
              users={users}
              currentUser={currentUser}
              persistClientLogs={persistClientLogs}
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
              taskCategories={taskCategories}
              taskTemplates={taskTemplates}
              setNotifications={setNotifications}
              accessibleClients={accessibleClients}
            />
          )}

          {activeTab === 'users' && !selectedClient && canSeeUserManagement && (
            <UserView
              users={users}
              setUsers={persistUsers}
              currentUser={currentUser}
              clients={clients}
            />
          )}

          {activeTab === 'employees' && !selectedClient && canSeeEmployeeView && (
            <EmployeeView users={users} clients={clients} clientLogs={clientLogs} />
          )}

          {activeTab === 'metrics' && !selectedClient && canSeeMetrics && (
            <UserMetricsView users={users} clients={clients} clientLogs={clientLogs} />
          )}

          {activeTab === 'reports' && !selectedClient && canSeeReports && (
            <ReportsView users={users} clients={clients} clientLogs={clientLogs} />
          )}

          {activeTab === 'settings' && !selectedClient && canSeeSettings && (
            <SettingsView
              users={users}
              setUsers={persistUsers}
              currentUser={currentUser}
              clients={clients}
              setClients={persistClients}
              setClientLogs={persistClientLogs}
            />
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
              controlCenterAccessRoles={controlCenterAccessRoles}
              setControlCenterAccessRoles={persistControlCenterRoles}
              settingsAccessRoles={settingsAccessRoles}
              setSettingsAccessRoles={persistSettingsRoles}
              userManagementAccessRoles={userManagementAccessRoles}
              setUserManagementAccessRoles={persistUserManagementRoles}
              employeeViewAccessRoles={employeeViewAccessRoles}
              setEmployeeViewAccessRoles={persistEmployeeViewRoles}
              metricsAccessRoles={metricsAccessRoles}
              setMetricsAccessRoles={persistMetricsRoles}
              reportsAccessRoles={reportsAccessRoles}
              setReportsAccessRoles={persistReportsRoles}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
