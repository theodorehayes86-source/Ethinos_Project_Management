import { useEffect, useState } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../firebase.js';

const MANAGEMENT_ROLES = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];

function parseDueDate(str) {
  if (!str) return null;
  try {
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const m = str.match(/(\d+)[a-z]*\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]));
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function todayMidnight() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function bucketTask(task) {
  const today = todayMidnight();
  const due = parseDueDate(task.dueDate);
  if (!due) return 'upcoming';
  if (due < today) {
    // Past date: overdue only if not Done; Done tasks with old dates go to upcoming
    return task.status !== 'Done' ? 'overdue' : 'upcoming';
  }
  const todayEnd = new Date(today);
  todayEnd.setHours(23,59,59,999);
  if (due <= todayEnd) return 'today';
  return 'upcoming';
}

export function getDirectReports(userId, users) {
  const uid = String(userId);
  return users.filter(u => {
    if (String(u.id) === uid) return false;
    const mid = u.managerId;
    if (Array.isArray(mid)) { if (mid.some(id => String(id) === uid)) return true; }
    else if (mid !== undefined && mid !== null && String(mid) === uid) return true;
    const mid2 = u.managerId2;
    if (mid2 !== undefined && mid2 !== null && String(mid2) === uid) return true;
    return false;
  });
}

export function getSubtreeIds(userId, users, visited = new Set()) {
  const uid = String(userId);
  if (visited.has(uid)) return visited;
  visited.add(uid);
  getDirectReports(userId, users).forEach(r => getSubtreeIds(r.id, users, visited));
  return visited;
}

export function getUserTaskStats(userId, clientLogs, clients) {
  const today = todayMidnight();
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const uid = String(userId);

  const tasks = [];
  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const client = clients.find(c => String(c.id) === String(clientId));
    (logs || []).forEach(task => {
      if (String(task.assigneeId) === uid) {
        tasks.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
      }
    });
  });

  const todayTasks   = tasks.filter(t => { const d = parseDueDate(t.dueDate); return d && d >= today && d <= todayEnd; });
  const overdueTasks = tasks.filter(t => { const d = parseDueDate(t.dueDate); return d && d < today && t.status !== 'Done'; });
  const pendingTasks = tasks.filter(t => t.status === 'Pending' && !overdueTasks.includes(t));
  const pendingQC    = tasks.filter(t => t.qcStatus === 'sent');
  const ratedTasks   = tasks.filter(t => t.qcRating);
  const avgRating    = ratedTasks.length > 0 ? ratedTasks.reduce((s, t) => s + (t.qcRating || 0), 0) / ratedTasks.length : null;

  return { total: tasks.length, today: todayTasks.length, overdue: overdueTasks.length, pending: pendingTasks.length, pendingQC: pendingQC.length, avgRating, allTasks: tasks, todayTasks, overdueTasks, pendingTasks };
}

export function getSubtreeStats(userId, users, clientLogs, clients) {
  const ids = getSubtreeIds(userId, users);
  ids.delete(String(userId));
  let today = 0, overdue = 0, pending = 0, total = 0;
  ids.forEach(uid => {
    const s = getUserTaskStats(uid, clientLogs, clients);
    today   += s.today;
    overdue += s.overdue;
    pending += s.pending;
    total   += s.total;
  });
  return { today, overdue, pending, total };
}

export function useAppData(isAuthed) {
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientLogs, setClientLogs] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthed) return;

    let loaded = { users: false, clients: false, clientLogs: false };
    const checkLoaded = () => {
      if (loaded.users && loaded.clients && loaded.clientLogs) setLoading(false);
    };
    const markLoaded = (key) => { loaded[key] = true; checkLoaded(); };

    const unsubUsers = onValue(
      ref(db, 'users'),
      snap => {
        const val = snap.val();
        if (val) setUsers(Array.isArray(val) ? val : Object.values(val));
        markLoaded('users');
      },
      () => markLoaded('users'),
    );

    const unsubClients = onValue(
      ref(db, 'clients'),
      snap => {
        const val = snap.val();
        if (val) setClients(Array.isArray(val) ? val : Object.values(val));
        markLoaded('clients');
      },
      () => markLoaded('clients'),
    );

    const unsubLogs = onValue(
      ref(db, 'clientLogs'),
      snap => {
        setClientLogs(snap.val() || {});
        markLoaded('clientLogs');
      },
      () => markLoaded('clientLogs'),
    );

    const unsubCats = onValue(
      ref(db, 'taskCategories'),
      snap => {
        const val = snap.val();
        if (val) {
          const arr = Array.isArray(val) ? val : Object.values(val);
          setCategories(arr.map(c => typeof c === 'string' ? c : c.name).filter(Boolean));
        }
      },
      () => {},
    );

    return () => { unsubUsers(); unsubClients(); unsubLogs(); unsubCats(); };
  }, [isAuthed]);

  return { users, clients, clientLogs, setClientLogs, categories, loading };
}

export function useMyTasks(currentUser, clientLogs, clients) {
  if (!currentUser) return { today: [], upcoming: [], overdue: [] };

  const allTasks = [];
  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const client = clients.find(c => String(c.id) === String(clientId));
    (logs || []).forEach(task => {
      if (String(task.assigneeId) === String(currentUser.id) && !task.archived) {
        allTasks.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
      }
    });
  });

  const today = [], upcoming = [], overdue = [];
  allTasks.forEach(t => {
    const b = bucketTask(t);
    if (b === 'today') today.push(t);
    else if (b === 'overdue') overdue.push(t);
    else upcoming.push(t);
  });

  return { today, upcoming, overdue };
}

export function usePendingApprovals(currentUser, clientLogs, clients) {
  if (!currentUser) return [];
  const pending = [];
  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const client = clients.find(c => String(c.id) === String(clientId));
    (logs || []).forEach(task => {
      if (String(task.qcAssigneeId) === String(currentUser.id) && task.qcStatus === 'sent') {
        pending.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
      }
    });
  });
  return pending;
}

export function useEmployeeNotifications(currentUser, clientLogs) {
  if (!currentUser) return [];
  const items = [];
  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    (logs || []).forEach(task => {
      if (String(task.assigneeId) === String(currentUser.id)) {
        if (task.qcStatus === 'rejected') items.push({ ...task, _type: 'returned', _clientId: clientId });
        if (task.qcStatus === 'approved') items.push({ ...task, _type: 'approved', _clientId: clientId });
      }
    });
  });
  return items;
}

export function useTeamTasks(currentUser, users, clientLogs, clients) {
  if (!currentUser) return { direct: [], allTeamTasks: [] };
  const directReports = getDirectReports(currentUser.id, users);
  const allTeamIds = getSubtreeIds(currentUser.id, users);
  allTeamIds.delete(String(currentUser.id));

  const allTeamTasks = [];
  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const client = clients.find(c => String(c.id) === String(clientId));
    (logs || []).forEach(task => {
      if (allTeamIds.has(String(task.assigneeId))) {
        allTeamTasks.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
      }
    });
  });

  return { direct: directReports, allTeamTasks };
}

export async function updateTaskInFirebase(clientId, taskId, updates, clientLogs) {
  const currentLogs = clientLogs[clientId] || [];
  const updated = currentLogs.map(t => String(t.id) === String(taskId) ? { ...t, ...updates } : t);
  await set(ref(db, `clientLogs/${clientId}`), updated);
}

export async function createTaskInFirebase(clientId, taskData, clientLogs) {
  const existing = Array.isArray(clientLogs[clientId]) ? clientLogs[clientId] : [];
  const newTask = {
    id: Date.now(),
    status: 'Pending',
    createdAt: Date.now(),
    elapsedMs: 0,
    timerState: 'stopped',
    ...taskData,
  };
  await set(ref(db, `clientLogs/${clientId}`), [...existing, newTask]);
  return newTask;
}
