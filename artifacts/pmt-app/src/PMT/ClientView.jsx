import React, { useEffect, useState } from 'react';
import { Search, ChevronLeft, Plus, Clock, Activity, CheckCircle, X, Star, Edit2, Trash2, Eye, Crown, AlertCircle, AlertTriangle, Calendar, Play, Pause, Square, Check, Users, ShieldCheck, RotateCcw, ThumbsUp, ThumbsDown, Send, UserPlus, Hourglass, Archive, ArchiveRestore, LayoutGrid, LayoutList } from 'lucide-react';
import UserPickerModal from './UserPickerModal';
import DatePicker from "react-datepicker";
import { format, subDays, parse, addDays, differenceInCalendarDays } from 'date-fns';
import "react-datepicker/dist/react-datepicker.css";
import TaskDetailPanel from './TaskDetailPanel';
import { sendNotification } from '../utils/notify';
import { ReminderPills } from './ReminderPills';
import DueDateInput from './DueDateInput';

const CROSS_DEPT_ROLES = ['Super Admin', 'Admin', 'Business Head'];

const ROLE_RANK = {
  'Super Admin':    100,
  'Director':        90,
  'Admin':           85,
  'Business Head':   80,
  'Snr Manager':     70,
  'Manager':         60,
  'Project Manager': 55,
  'CSM':             55,
  'Snr Executive':   40,
  'Executive':       30,
  'Employee':        25,
  'Intern':          20,
};
const roleRank = (role) => ROLE_RANK[role] ?? 10;

const isTaskVisible = (task, currentUser) => {
  if (CROSS_DEPT_ROLES.includes(currentUser?.role)) return true;
  if (!Array.isArray(task.departments)) return true;
  return task.departments.includes(currentUser?.department);
};

const ClientView = ({ 
  selectedClient, setSelectedClient, clients = [], setClients, 
  clientLogs = {}, setClientLogs, clientSearch = "", setClientSearch,
  users = [], setUsers, currentUser, taskCategories = [], taskTemplates = [], setNotifications = () => {},
  departments = [], regions = [], accessibleClients = [], syntheticClients = [],
}) => {
  const managementRoles = ['Super Admin', 'Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
  const executionRoles = ['Employee', 'Snr Executive', 'Executive', 'Intern'];
  
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");

  // Edit Task modal state
  const [editingTask, setEditingTask] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editDraftCategoryQuery, setEditDraftCategoryQuery] = useState('');
  const [editDraftShowCategoryMenu, setEditDraftShowCategoryMenu] = useState(false);
  const [editDraftAssigneeQuery, setEditDraftAssigneeQuery] = useState('');
  const [editDraftShowAssigneeMenu, setEditDraftShowAssigneeMenu] = useState(false);
  const [editDraftError, setEditDraftError] = useState('');
  const [editScope, setEditScope] = useState('one');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskDueDate, setTaskDueDate] = useState(null);
  const [newTaskComment, setNewTaskComment] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editField, setEditField] = useState(""); 
  const [tempValue, setTempValue] = useState("");
  const [timerTick, setTimerTick] = useState(Date.now());
  const [taskStatusFilter, setTaskStatusFilter] = useState('All');
  const [newTaskCategory, setNewTaskCategory] = useState("");
  const [taskCategoryQuery, setTaskCategoryQuery] = useState("");
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);
  const [taskFormError, setTaskFormError] = useState("");
  const [newTaskRepeat, setNewTaskRepeat] = useState('Once');
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [reportUrlInput, setReportUrlInput] = useState("");
  const [isEditingReportLink, setIsEditingReportLink] = useState(false);
  const [showAddCustomReport, setShowAddCustomReport] = useState(false);
  const [customReportName, setCustomReportName] = useState("");
  const [customReportUrl, setCustomReportUrl] = useState("");
  const [editingCustomReportId, setEditingCustomReportId] = useState(null);
  const [activePicker, setActivePicker] = useState(null); // 'addLeadership'|'addTeam'|'qcReviewer'
  const [pickerSearch, setPickerSearch] = useState("");
  const [clientViewFilter, setClientViewFilter] = useState('mine'); // 'mine' | 'available'
  const [clientDisplayMode, setClientDisplayMode] = useState(() => localStorage.getItem('clientDisplayMode') || 'cards');
  const [showArchived, setShowArchived] = useState(false);

  // Ethinos internal client filters (Super Admin only)
  const [ethinosDeptFilter, setEthinosDeptFilter] = useState('All');
  const [ethinosRegionFilter, setEthinosRegionFilter] = useState('All');
  const [ethinosUserFilter, setEthinosUserFilter] = useState('All');

  // Task detail panel state
  const [detailTask, setDetailTask] = useState(null);

  // QC form state (for new task creation)
  const [qcEnabled, setQcEnabled] = useState(true);
  const [qcAssigneeId, setQcAssigneeId] = useState('');
  const [qcAssigneeName, setQcAssigneeName] = useState('');
  // Department selection for new task
  const [newTaskDepartments, setNewTaskDepartments] = useState([]);
  // Billable toggle for new task
  const [newTaskBillable, setNewTaskBillable] = useState(true);
  // Reminder offsets for new task
  const [newTaskReminders, setNewTaskReminders] = useState([]);
  // Repeat end date for new task
  const [newTaskRepeatEnd, setNewTaskRepeatEnd] = useState(null);
  // Weekly day picker (0=Mon … 4=Fri)
  const [newTaskRepeatDays, setNewTaskRepeatDays] = useState([0, 1, 2, 3, 4]);
  // Monthly nth-weekday picker
  const [newTaskRepeatMonthlyWeek, setNewTaskRepeatMonthlyWeek] = useState(1);
  const [newTaskRepeatMonthlyDay, setNewTaskRepeatMonthlyDay] = useState(0);
  // Estimated time for new task (hours + minutes inputs)
  const [newTaskEstimatedHrs, setNewTaskEstimatedHrs] = useState('');
  const [newTaskEstimatedMins, setNewTaskEstimatedMins] = useState('');

  // QC review state (for management reviewing a sent task)
  const [qcReviewingTaskId, setQcReviewingTaskId] = useState(null);
  const [qcReviewRating, setQcReviewRating] = useState('');
  const [qcReviewFeedback, setQcReviewFeedback] = useState('');
  const [qcReviewDecision, setQcReviewDecision] = useState('approved'); // 'approved' | 'rejected'

  // --- TEMPLATE APPLY STATE ---
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templateStep, setTemplateStep] = useState(1); // 1 = pick template, 2 = set date + assignee
  const [templateApplyError, setTemplateApplyError] = useState('');
  // Per-task config array: one entry per task in selected template
  const [perTaskConfig, setPerTaskConfig] = useState([]);
  // "Set all" defaults row state
  const [setAllStartDate, setSetAllStartDate] = useState(new Date());
  const [setAllDueDate, setSetAllDueDate] = useState(null);
  const [setAllAssigneeId, setSetAllAssigneeId] = useState('');
  const [setAllAssigneeQuery, setSetAllAssigneeQuery] = useState('');
  const [setAllQcAssigneeId, setSetAllQcAssigneeId] = useState('');
  const [setAllQcAssigneeQuery, setSetAllQcAssigneeQuery] = useState('');

  const isManagement = managementRoles.includes(currentUser?.role);

  // Permission helpers for task-level access
  const canFullyEditTask = (log) => {
    if (!currentUser) return false;
    // Management roles can always edit any task
    if (managementRoles.includes(currentUser.role)) return true;
    // Execution roles: cannot edit a task if the creator outranks them
    const myLevel = roleRank(currentUser.role);
    const creatorLevel = roleRank(log?.creatorRole);
    if (creatorLevel > myLevel) return false;
    // Same level or unranked creator: only the creator themselves can edit
    return String(log?.creatorId) === String(currentUser.id);
  };
  const canChangeTaskStatus = (log) => {
    if (canFullyEditTask(log)) return true;
    return String(log.assigneeId) === String(currentUser?.id);
  };

  // True if the current user is the assigned employee, or management (who can always interact)
  const isAssignedToTask = (log) => {
    if (isManagement) return true;
    return String(log.assigneeId) === String(currentUser?.id);
  };

  // True if the current user has already sent an assignment request for this task
  const hasRequestedAssignment = (log) => {
    return (log.assignmentRequests || []).some(r => String(r.requesterId) === String(currentUser?.id));
  };

  // Employee requests to be assigned — stores on task + notifies client leadership
  const handleRequestAssignment = (log) => {
    if (!currentUser || hasRequestedAssignment(log)) return;
    const request = { requesterId: currentUser.id, requesterName: currentUser.name, timestamp: Date.now() };
    const updated = (clientLogs[selectedClient.id] || []).map(l =>
      l.id === log.id ? { ...l, assignmentRequests: [...(l.assignmentRequests || []), request] } : l
    );
    setClientLogs({ ...clientLogs, [selectedClient.id]: updated });

    // Fire a notification visible to client leadership
    const leaders = getProjectStaff(selectedClient.name).admins;
    setNotifications(prev => [
      {
        id: `req-assign-${Date.now()}`,
        text: `${currentUser.name} is requesting to be assigned to: "${log.comment || log.name}"`,
        time: 'Just now',
        type: 'assignment-request',
        read: false,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        taskId: log.id,
        requesterId: currentUser.id,
        requesterName: currentUser.name,
        leaderIds: leaders.map(l => l.id),
      },
      ...prev
    ]);

    const leaderEmails = leaders.map(l => l.email).filter(Boolean);
    if (leaderEmails.length > 0) {
      sendNotification('approval-required', {
        recipientEmails: leaderEmails,
        requesterName: currentUser.name,
        taskName: log.comment || log.name,
        clientName: selectedClient.name,
      });
    }
  };

  // ─── Recurrence helpers ────────────────────────────────────────────────────
  const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const WEEKDAY_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const WEEK_ORDINALS = ['1st', '2nd', '3rd', '4th'];

  const getNthWeekdayOfMonth = (year, month, weekNum, dayIdx) => {
    const jsDay = dayIdx + 1; // 0=Mon → JS 1; 4=Fri → JS 5
    let count = 0;
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) {
      if (d.getDay() === jsDay) { count++; if (count === weekNum) return new Date(d); }
      d.setDate(d.getDate() + 1);
    }
    return null;
  };

  const generateRecurringDates = (startDate, endDate, freq, repeatDays, repeatMonthlyWeek, repeatMonthlyDay) => {
    if (!endDate || !startDate) return startDate ? [startDate] : [];
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    const dates = [];
    if (freq === 'Daily') {
      const d = new Date(startDate);
      while (d <= end) {
        const jd = d.getDay();
        if (jd >= 1 && jd <= 5) dates.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (freq === 'Weekly') {
      const days = (repeatDays && repeatDays.length > 0) ? repeatDays : [0];
      const d = new Date(startDate);
      while (d <= end) {
        const jd = d.getDay();
        if (jd >= 1 && jd <= 5 && days.includes(jd - 1)) dates.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (freq === 'Monthly') {
      const wk = repeatMonthlyWeek || 1;
      const di = repeatMonthlyDay !== undefined ? repeatMonthlyDay : 0;
      let yr = startDate.getFullYear(), mo = startDate.getMonth();
      const endYr = end.getFullYear(), endMo = end.getMonth();
      while (yr < endYr || (yr === endYr && mo <= endMo)) {
        const dt = getNthWeekdayOfMonth(yr, mo, wk, di);
        if (dt && dt >= startDate && dt <= end) dates.push(dt);
        mo++; if (mo > 11) { mo = 0; yr++; }
      }
    }
    return dates.length > 0 ? dates : [startDate];
  };
  // ───────────────────────────────────────────────────────────────────────────

  const openEditModal = (log) => {
    const tryParse = (str) => {
      if (!str) return null;
      try { return parse(str, 'do MMM yyyy', new Date()); } catch { return null; }
    };
    const estMs = log.estimatedMs || 0;
    const estTotalMins = Math.round(estMs / 60000);
    const estHrs = Math.floor(estTotalMins / 60);
    const estMins = estTotalMins % 60;
    setEditingTask(log);
    setEditDraft({
      name: log.name || '',
      comment: log.comment || '',
      category: log.category || '',
      assigneeId: log.assigneeId || '',
      assigneeName: log.assigneeName || '',
      date: tryParse(log.date) || new Date(),
      dueDate: tryParse(log.dueDate) || null,
      repeatFrequency: log.repeatFrequency || 'Once',
      repeatEnd: tryParse(log.repeatEnd) || null,
      status: log.status || 'Pending',
      qcEnabled: log.qcEnabled ?? true,
      qcAssigneeId: log.qcAssigneeId || '',
      qcAssigneeName: log.qcAssigneeName || '',
      billable: log.billable ?? true,
      estimatedHrs: estMs > 0 ? String(estHrs) : '',
      estimatedMins: estMs > 0 ? String(estMins) : '',
      reminderOffsets: log.reminderOffsets || [],
    });
    setEditDraftCategoryQuery(log.category || '');
    setEditDraftAssigneeQuery(log.assigneeName || '');
    setEditDraftShowCategoryMenu(false);
    setEditDraftShowAssigneeMenu(false);
    setEditDraftError('');
    setEditScope('one');
  };

  const handleSaveEditTask = () => {
    if (!editDraft) return;
    if (!editDraft.name.trim() || !editDraft.comment.trim() || !editDraft.category || !editDraft.assigneeId) {
      setEditDraftError('Task name, description, category and assignee are all required.');
      return;
    }
    const assignee = (users || []).find(u => String(u.id) === String(editDraft.assigneeId));
    const editEstHrs = parseInt(editDraft.estimatedHrs || '0', 10) || 0;
    const editEstMins = parseInt(editDraft.estimatedMins || '0', 10) || 0;
    const editEstimatedMs = (editEstHrs * 60 + editEstMins) > 0 ? (editEstHrs * 3600000 + editEstMins * 60000) : null;

    const updateAll = editScope === 'all' && editingTask.repeatGroupId;

    // Shared fields applied to all occurrences; assignee names fall back to
    // each log's existing value if the user lookup fails (e.g. deleted user)
    const sharedFields = (l) => ({
      name: editDraft.name.trim(),
      comment: editDraft.comment.trim(),
      category: editDraft.category,
      assigneeId: editDraft.assigneeId,
      assigneeName: assignee?.name || l.assigneeName,
      assigneeEmail: assignee?.email || l.assigneeEmail,
      billable: editDraft.billable ?? true,
      estimatedMs: editEstimatedMs,
      qcEnabled: editDraft.qcEnabled,
      qcAssigneeId: editDraft.qcEnabled && editDraft.qcAssigneeId ? editDraft.qcAssigneeId : null,
      qcAssigneeName: editDraft.qcEnabled && editDraft.qcAssigneeName ? editDraft.qcAssigneeName : null,
      reminderOffsets: editDraft.reminderOffsets?.length > 0 ? editDraft.reminderOffsets : null,
    });

    const updated = (clientLogs[selectedClient.id] || []).map(l => {
      // "Update all" — apply shared fields to every sibling in the series
      if (updateAll && l.repeatGroupId === editingTask.repeatGroupId && l.id !== editingTask.id) {
        return { ...l, ...sharedFields(l) };
      }
      // Always fully update the task being edited (per-occurrence fields included)
      if (l.id === editingTask.id) {
        return {
          ...l,
          ...sharedFields(l),
          date: format(editDraft.date || new Date(), 'do MMM yyyy'),
          dueDate: editDraft.dueDate ? format(editDraft.dueDate, 'do MMM yyyy') : null,
          repeatFrequency: editDraft.repeatFrequency,
          repeatEnd: editDraft.repeatFrequency !== 'Once' && editDraft.repeatEnd ? format(editDraft.repeatEnd, 'do MMM yyyy') : null,
          status: editDraft.status,
        };
      }
      return l;
    });
    setClientLogs({ ...clientLogs, [selectedClient.id]: updated });
    setEditingTask(null);
    setEditDraft(null);
  };

  useEffect(() => {
    const hasRunningTimers = Object.values(clientLogs || {}).some(logs =>
      (logs || []).some(log => log.timerState === 'running')
    );

    if (!hasRunningTimers) return;
    const intervalId = setInterval(() => setTimerTick(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [clientLogs]);

  const formatDuration = (milliseconds = 0) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const formatEstimatedTime = (ms) => {
    if (!ms || ms <= 0) return null;
    const totalMins = Math.round(ms / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  const getElapsedMs = (log) => {
    const baseElapsed = log.elapsedMs || 0;
    if (log.timerState === 'running' && log.timerStartedAt) {
      return baseElapsed + Math.max(0, timerTick - log.timerStartedAt);
    }
    return baseElapsed;
  };

  const updateTaskLog = (logId, updater) => {
    const updatedLogs = (clientLogs[selectedClient.id] || []).map(log =>
      log.id === logId ? updater(log) : log
    );
    setClientLogs({ ...clientLogs, [selectedClient.id]: updatedLogs });
  };

  const startTaskTimer = (logId) => {
    updateTaskLog(logId, (log) => {
      return {
        ...log,
        status: 'WIP',
        timerState: 'running',
        timerStartedAt: Date.now(),
        elapsedMs: log.elapsedMs || 0,
      };
    });
  };

  const pauseTaskTimer = (logId) => {
    updateTaskLog(logId, (log) => {
      if (log.timerState !== 'running' || !log.timerStartedAt) return log;
      const elapsedMs = (log.elapsedMs || 0) + (Date.now() - log.timerStartedAt);
      return {
        ...log,
        timerState: 'paused',
        timerStartedAt: null,
        elapsedMs,
        timeTaken: formatDuration(elapsedMs)
      };
    });
  };

  const stopTaskTimer = (logId) => {
    updateTaskLog(logId, (log) => {
      const elapsedMs = log.timerState === 'running' && log.timerStartedAt
        ? (log.elapsedMs || 0) + (Date.now() - log.timerStartedAt)
        : (log.elapsedMs || 0);

      return {
        ...log,
        timerState: 'stopped',
        timerStartedAt: null,
        elapsedMs,
        timeTaken: formatDuration(elapsedMs)
      };
    });
  };

  // --- CORE LOGIC (UNCHANGED) ---
  const handleSaveInline = (logId) => {
    const log = (clientLogs[selectedClient?.id] || []).find(l => l.id === logId);
    if (!log || !canFullyEditTask(log)) { setEditingId(null); return; }
    const updated = (clientLogs[selectedClient.id] || []).map(l =>
      l.id === logId ? { ...l, [editField]: tempValue } : l
    );
    setClientLogs({ ...clientLogs, [selectedClient.id]: updated });
    setEditingId(null);
  };

  const getProjectStaff = (clientName) => {
    const staff = (users || []).filter(u => u.assignedProjects?.includes(clientName));
    return {
      admins: staff.filter(u => managementRoles.includes(u.role)),
      employees: staff.filter(u => executionRoles.includes(u.role))
    };
  };

  const handleRequestClientAssignment = (client) => {
    if (!currentUser) return;
    const alreadyRequested = (client.joinRequests || []).some(r => r.requesterId === currentUser.id);
    if (alreadyRequested) return;
    const newRequest = { requesterId: currentUser.id, requesterName: currentUser.name, timestamp: Date.now() };
    const updatedClient = { ...client, joinRequests: [...(client.joinRequests || []), newRequest] };
    const updatedClients = clients.map(c => c.id === client.id ? updatedClient : c);
    setClients(updatedClients);
    const leaders = getProjectStaff(client.name).admins;
    const superAdmins = (users || []).filter(u => u.role === 'Super Admin');
    const notifyIds = [...new Set([...leaders.map(l => l.id), ...superAdmins.map(u => u.id)])];
    notifyIds.forEach(recipientId => {
      setNotifications(prev => [{
        id: Date.now() + Math.random(),
        type: 'client-join-request',
        text: `${currentUser.name} requested to be assigned to ${client.name}`,
        clientId: client.id,
        clientName: client.name,
        requesterId: currentUser.id,
        requesterName: currentUser.name,
        recipientId,
        timestamp: new Date().toISOString(),
        read: false,
      }, ...prev]);
    });
  };

  const getNameSearchScore = (name = '', query = '') => {
    const normalizedName = String(name).toLowerCase();
    const normalizedQuery = String(query).trim().toLowerCase();
    if (!normalizedQuery) return Number.POSITIVE_INFINITY;

    const compactName = normalizedName.replace(/\s+/g, '');
    const compactQuery = normalizedQuery.replace(/\s+/g, '');

    if (normalizedName === normalizedQuery) return 0;
    if (normalizedName.startsWith(normalizedQuery)) return 1;
    if (normalizedName.includes(normalizedQuery)) return 2;
    if (compactName.includes(compactQuery)) return 3;

    const nameTokens = normalizedName.split(/\s+/);
    if (nameTokens.some(token => token.startsWith(normalizedQuery))) return 4;

    let queryIndex = 0;
    for (const char of compactName) {
      if (char === compactQuery[queryIndex]) queryIndex += 1;
      if (queryIndex === compactQuery.length) return 5;
    }

    return Number.POSITIVE_INFINITY;
  };

  const getUserSuggestionsByRole = (roleList, query) => {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return [];

    return (users || [])
      .filter(user => roleList.includes(user.role))
      .map(user => ({ user, score: getNameSearchScore(user.name, normalizedQuery) }))
      .filter(item => Number.isFinite(item.score))
      .sort((left, right) => left.score - right.score || left.user.name.localeCompare(right.user.name))
      .slice(0, 10)
      .map(item => item.user);
  };

  const getTaskCounts = (clientId) => {
    const logs = (clientLogs[clientId] || []).filter(t => isTaskVisible(t, currentUser) && !t.archived);
    const twoDaysAgo = subDays(new Date(), 2);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      open: logs.filter(l => l.status === 'Pending').length,
      wip: logs.filter(l => l.timerState === 'running').length,
      done: logs.filter(l => l.status === 'Done').length,
      recentPending: logs.filter(l => {
        if (l.status === 'Done') return false;
        try {
          const taskDate = parse(l.date, 'do MMM yyyy', new Date());
          return taskDate <= twoDaysAgo;
        } catch (e) { return false; }
      }).length,
      overdue: logs.filter(l => {
        if (l.status === 'Done' || !l.dueDate) return false;
        try {
          const d = parse(l.dueDate, 'do MMM yyyy', new Date());
          d.setHours(0, 0, 0, 0);
          return d < today;
        } catch (e) { return false; }
      }).length,
      dueToday: logs.filter(l => {
        if (l.status === 'Done' || !l.dueDate) return false;
        try {
          const d = parse(l.dueDate, 'do MMM yyyy', new Date());
          d.setHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        } catch (e) { return false; }
      }).length,
    };
  };

  const addTaskEntry = (e) => {
    e.preventDefault();
    const trimmedComment = newTaskComment.trim();
    const selectedAssignee = (users || []).find(u => String(u.id) === String(newTaskAssigneeId));
    if (!newTaskName.trim() || !trimmedComment || !newTaskCategory || !selectedAssignee) {
      setTaskFormError('Task name, description, category and assignee are all required.');
      return;
    }
    const newEstHrs = parseInt(newTaskEstimatedHrs || '0', 10) || 0;
    const newEstMins = parseInt(newTaskEstimatedMins || '0', 10) || 0;
    const newEstimatedMs = (newEstHrs * 60 + newEstMins) > 0 ? (newEstHrs * 3600000 + newEstMins * 60000) : null;
    const newLogRepeatGroupId = newTaskRepeat !== 'Once'
      ? `rg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      : undefined;
    const newLog = {
      id: Date.now(),
      name: newTaskName.trim(),
      date: format(selectedDate, 'do MMM yyyy'),
      dueDate: taskDueDate ? format(taskDueDate, 'do MMM yyyy') : null,
      comment: trimmedComment, result: '', status: 'Pending',
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || 'Employee',
      assigneeId: selectedAssignee.id,
      assigneeName: selectedAssignee.name,
      assigneeEmail: selectedAssignee.email || '',
      category: newTaskCategory,
      repeatFrequency: newTaskRepeat,
      repeatEnd: newTaskRepeat !== 'Once' && newTaskRepeatEnd ? format(newTaskRepeatEnd, 'do MMM yyyy') : null,
      repeatDays: newTaskRepeat === 'Weekly' ? newTaskRepeatDays : null,
      repeatMonthlyWeek: newTaskRepeat === 'Monthly' ? newTaskRepeatMonthlyWeek : null,
      repeatMonthlyDay: newTaskRepeat === 'Monthly' ? newTaskRepeatMonthlyDay : null,
      lastSpawnedDate: null,
      timerState: 'idle',
      timerStartedAt: null,
      elapsedMs: 0,
      timeTaken: null,
      qcEnabled: qcEnabled,
      qcAssigneeId: qcEnabled && qcAssigneeId ? qcAssigneeId : null,
      qcAssigneeName: qcEnabled && qcAssigneeName ? qcAssigneeName : null,
      qcStatus: null,
      qcRating: null,
      qcFeedback: null,
      qcReviewedAt: null,
      departments: newTaskDepartments.length > 0 ? newTaskDepartments : (currentUser?.department ? [currentUser.department] : null),
      billable: newTaskBillable,
      estimatedMs: newEstimatedMs,
      reminderOffsets: newTaskReminders.length > 0 ? newTaskReminders : null,
      ...(newLogRepeatGroupId ? { repeatGroupId: newLogRepeatGroupId } : {}),
    };

    setNotifications(prev => [
      {
        id: `assign-${Date.now()}`,
        text: `Task assigned to ${selectedAssignee.name}: ${trimmedComment}`,
        time: 'Just now',
        type: 'assignment',
        read: false,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        assigneeId: selectedAssignee.id,
        assigneeName: selectedAssignee.name,
        assigneeEmail: selectedAssignee.email || ''
      },
      ...prev
    ]);

    // Generate all occurrences if repeating with an end date
    const dueDateOffsetDays = taskDueDate && selectedDate
      ? differenceInCalendarDays(taskDueDate, selectedDate)
      : null;
    let logsToAdd = [newLog];
    if (newTaskRepeat !== 'Once' && newTaskRepeatEnd) {
      const dates = generateRecurringDates(
        selectedDate, newTaskRepeatEnd, newTaskRepeat,
        newTaskRepeatDays, newTaskRepeatMonthlyWeek, newTaskRepeatMonthlyDay
      );
      if (dates.length > 1) {
        logsToAdd = dates.map((dt, i) => ({
          ...newLog,
          id: Date.now() + i + Math.random(),
          date: format(dt, 'do MMM yyyy'),
          dueDate: dueDateOffsetDays !== null ? format(addDays(dt, dueDateOffsetDays), 'do MMM yyyy') : null,
        }));
      }
    }
    setClientLogs({
      ...clientLogs,
      [selectedClient.id]: [...logsToAdd, ...(clientLogs[selectedClient.id] || [])]
    });

    if (selectedAssignee.email) {
      sendNotification('task-assigned', {
        assigneeEmail: selectedAssignee.email,
        assigneeName: selectedAssignee.name,
        taskName: newTaskName.trim(),
        taskDescription: trimmedComment,
        clientName: selectedClient.name,
        dueDate: taskDueDate ? format(taskDueDate, 'do MMM yyyy') : null,
        creatorName: currentUser?.name,
      });
    }

    setNewTaskName("");
    setNewTaskComment("");
    setNewTaskCategory("");
    setTaskCategoryQuery("");
    setShowCategoryMenu(false);
    setNewTaskAssigneeId("");
    setAssigneeQuery("");
    setShowAssigneeMenu(false);
    setTaskFormError("");
    setNewTaskRepeat('Once');
    setNewTaskRepeatEnd(null);
    setNewTaskRepeatDays([0, 1, 2, 3, 4]);
    setNewTaskRepeatMonthlyWeek(1);
    setNewTaskRepeatMonthlyDay(0);
    setTaskDueDate(null);
    setQcEnabled(true);
    setQcAssigneeId('');
    setQcAssigneeName('');
    setNewTaskDepartments(currentUser?.department ? [currentUser.department] : []);
    setNewTaskBillable(true);
    setNewTaskReminders([]);
    setNewTaskEstimatedHrs('');
    setNewTaskEstimatedMins('');
    setShowTaskForm(false);
  };

  // --- TEMPLATE APPLY HELPERS ---
  const resetPerTaskDefaults = () => {
    setSetAllStartDate(new Date());
    setSetAllDueDate(null);
    setSetAllAssigneeId('');
    setSetAllAssigneeQuery('');
    setSetAllQcAssigneeId('');
    setSetAllQcAssigneeQuery('');
  };

  const openTemplateModal = () => {
    setTemplateSearch('');
    setSelectedTemplateId(null);
    setTemplateStep(1);
    setPerTaskConfig([]);
    resetPerTaskDefaults();
    setTemplateApplyError('');
    setShowTemplateModal(true);
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setSelectedTemplateId(null);
    setTemplateStep(1);
    setTemplateSearch('');
    setPerTaskConfig([]);
    resetPerTaskDefaults();
    setTemplateApplyError('');
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplateId || !selectedClient) return;
    const tpl = taskTemplates.find(t => t.id === selectedTemplateId);
    if (!tpl) return;

    const clientTeam = getProjectStaff(selectedClient.name);
    const clientMemberIds = new Set([
      ...clientTeam.admins.map(u => String(u.id)),
      ...clientTeam.employees.map(u => String(u.id)),
    ]);

    // Validate each task has an assignee
    const missingAssignee = perTaskConfig.some(cfg => !cfg.assigneeId);
    if (missingAssignee) {
      setTemplateApplyError('Please select an assignee for every task.');
      return;
    }

    // Validate all assignees are on the client team
    const badAssignee = perTaskConfig.find(cfg => !clientMemberIds.has(String(cfg.assigneeId)));
    if (badAssignee) {
      setTemplateApplyError('One or more assignees are not on this client\'s team.');
      return;
    }

    // Validate QC assignees (if set) are also on the client team
    const badQcAssignee = perTaskConfig.find(cfg => cfg.qcAssigneeId && !clientMemberIds.has(String(cfg.qcAssigneeId)));
    if (badQcAssignee) {
      setTemplateApplyError('One or more QC assignees are not on this client\'s team.');
      return;
    }

    const creatorDept = currentUser?.department;
    const newTasks = [];
    tpl.tasks.forEach((taskItem, idx) => {
      const cfg = perTaskConfig[idx] || {};
      const assignee = (users || []).find(u => String(u.id) === String(cfg.assigneeId));
      const qcAssignee = cfg.qcAssigneeId ? (users || []).find(u => String(u.id) === String(cfg.qcAssigneeId)) : null;
      const hasQc = !!qcAssignee;
      const freq = taskItem.repeatFrequency || 'Once';
      const baseTask = {
        name: taskItem.name || taskItem.comment,
        dueDate: cfg.dueDate ? format(cfg.dueDate, 'do MMM yyyy') : null,
        comment: taskItem.comment,
        result: '',
        status: 'Pending',
        creatorId: currentUser?.id || null,
        creatorName: currentUser?.name || 'Unassigned',
        creatorRole: currentUser?.role || 'Employee',
        assigneeId: assignee?.id || null,
        assigneeName: assignee?.name || '',
        assigneeEmail: assignee?.email || '',
        category: taskItem.category || '',
        repeatFrequency: freq,
        repeatDays: freq === 'Weekly' ? (cfg.repeatDays || [0,1,2,3,4]) : null,
        repeatMonthlyWeek: freq === 'Monthly' ? (cfg.repeatMonthlyWeek || 1) : null,
        repeatMonthlyDay: freq === 'Monthly' ? (cfg.repeatMonthlyDay !== undefined ? cfg.repeatMonthlyDay : 0) : null,
        repeatEnd: freq !== 'Once' && cfg.repeatEnd ? format(cfg.repeatEnd, 'do MMM yyyy') : null,
        lastSpawnedDate: null,
        timerState: 'idle',
        timerStartedAt: null,
        elapsedMs: 0,
        timeTaken: null,
        departments: creatorDept ? [creatorDept] : [],
        qcEnabled: hasQc,
        qcAssigneeId: hasQc ? qcAssignee.id : null,
        qcAssigneeName: hasQc ? qcAssignee.name : null,
        billable: true,
      };

      // Generate all occurrences if repeating with an end date
      const tplDueDateOffset = (cfg.dueDate && cfg.startDate)
        ? differenceInCalendarDays(cfg.dueDate, cfg.startDate)
        : null;
      if (freq !== 'Once' && cfg.repeatEnd && cfg.startDate) {
        const dates = generateRecurringDates(
          cfg.startDate, cfg.repeatEnd, freq,
          cfg.repeatDays, cfg.repeatMonthlyWeek, cfg.repeatMonthlyDay
        );
        dates.forEach((dt, i) => {
          newTasks.push({
            ...baseTask,
            id: Date.now() + newTasks.length + i + Math.random(),
            date: format(dt, 'do MMM yyyy'),
            dueDate: tplDueDateOffset !== null ? format(addDays(dt, tplDueDateOffset), 'do MMM yyyy') : null,
          });
        });
      } else {
        newTasks.push({
          ...baseTask,
          id: Date.now() + newTasks.length + Math.random(),
          date: cfg.startDate ? format(cfg.startDate, 'do MMM yyyy') : format(new Date(), 'do MMM yyyy'),
        });
      }
    });

    setClientLogs({
      ...clientLogs,
      [selectedClient.id]: [...newTasks, ...(clientLogs[selectedClient.id] || [])],
    });

    setNotifications(prev => [
      {
        id: `tpl-${Date.now()}`,
        text: `Applied template "${tpl.name}" to ${selectedClient.name} — ${newTasks.length} task${newTasks.length !== 1 ? 's' : ''} created`,
        time: 'Just now',
        type: 'assignment',
        read: false,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
      },
      ...prev,
    ]);

    closeTemplateModal();
  };

  const handleSaveDailyReportLink = () => {
    if (!selectedClient) return;
    const trimmed = reportUrlInput.trim();
    if (!trimmed) return;

    const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const updatedClients = clients.map(client =>
      client.id === selectedClient.id ? { ...client, dailyReportUrl: normalizedUrl } : client
    );

    setClients(updatedClients);
    const updatedSelected = updatedClients.find(client => client.id === selectedClient.id);
    if (updatedSelected) setSelectedClient(updatedSelected);
    setIsEditingReportLink(false);
  };

  const handleSaveCustomReport = () => {
    if (!selectedClient) return;
    const trimmedName = customReportName.trim();
    const trimmedUrl = customReportUrl.trim();
    if (!trimmedName || !trimmedUrl) return;

    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    const selectedClientRecord = clients.find(client => client.id === selectedClient.id) || selectedClient;
    const existingReports = selectedClientRecord.customReports || [];

    let nextReports = existingReports;
    if (editingCustomReportId) {
      nextReports = existingReports.map(report =>
        report.id === editingCustomReportId ? { ...report, name: trimmedName, url: normalizedUrl } : report
      );
    } else {
      if (existingReports.length >= 7) return;
      nextReports = [...existingReports, { id: `report-${Date.now()}`, name: trimmedName, url: normalizedUrl }];
    }

    const updatedClients = clients.map(client =>
      client.id === selectedClient.id ? { ...client, customReports: nextReports } : client
    );

    setClients(updatedClients);
    const updatedSelected = updatedClients.find(client => client.id === selectedClient.id);
    if (updatedSelected) setSelectedClient(updatedSelected);

    setShowAddCustomReport(false);
    setCustomReportName("");
    setCustomReportUrl("");
    setEditingCustomReportId(null);
  };

  // --- 1. DEEP VIEW (SINGLE CLIENT) ---
  if (selectedClient) {
    const stats = getTaskCounts(selectedClient.id);
    const isSuperAdmin = currentUser?.role === 'Super Admin';
    const visibleTaskLogs = (clientLogs[selectedClient.id] || []).filter(log => {
      if (selectedClient.isEthinos) {
        if (!isSuperAdmin && String(log.assigneeId) !== String(currentUser?.id)) return false;
        // Super Admin Ethinos filters
        if (isSuperAdmin) {
          if (ethinosUserFilter !== 'All' && String(log.assigneeId) !== ethinosUserFilter) return false;
          if (ethinosDeptFilter !== 'All') {
            const assignee = users.find(u => String(u.id) === String(log.assigneeId));
            if (!assignee || assignee.department !== ethinosDeptFilter) return false;
          }
          if (ethinosRegionFilter !== 'All') {
            const assignee = users.find(u => String(u.id) === String(log.assigneeId));
            if (!assignee || assignee.region !== ethinosRegionFilter) return false;
          }
        }
      }
      return isTaskVisible(log, currentUser);
    });
    const archivedCount = visibleTaskLogs.filter(log => log.archived).length;
    const filteredTaskLogs = visibleTaskLogs.filter(log => {
      if (!showArchived && log.archived) return false;
      if (showArchived) return !!log.archived;
      if (taskStatusFilter === 'All') return true;
      if (taskStatusFilter === 'Overdue') {
        if (log.status === 'Done' || !log.dueDate) return false;
        try {
          const tod = new Date(); tod.setHours(0, 0, 0, 0);
          const d = parse(log.dueDate, 'do MMM yyyy', new Date()); d.setHours(0, 0, 0, 0);
          return d < tod;
        } catch { return false; }
      }
      if (taskStatusFilter === 'Today') {
        if (log.status === 'Done' || !log.dueDate) return false;
        try {
          const tod = new Date(); tod.setHours(0, 0, 0, 0);
          const d = parse(log.dueDate, 'do MMM yyyy', new Date()); d.setHours(0, 0, 0, 0);
          return d.getTime() === tod.getTime();
        } catch { return false; }
      }
      if (taskStatusFilter === '48H+') {
        if (log.status === 'Done') return false;
        try {
          const twoDaysAgo = subDays(new Date(), 2);
          const taskDate = parse(log.date, 'do MMM yyyy', new Date());
          return taskDate <= twoDaysAgo;
        } catch { return false; }
      }
      return log.status === taskStatusFilter;
    });
    const selectedClientRecord = clients.find(client => client.id === selectedClient.id) || selectedClient;
    const dailyReportUrl = selectedClientRecord?.dailyReportUrl || '';
    const customReports = selectedClientRecord?.customReports || [];
    const availableTaskCategories = taskCategories.length ? taskCategories : ['General'];
    const filteredTaskCategories = availableTaskCategories.filter(category =>
      category.toLowerCase().includes(taskCategoryQuery.toLowerCase())
    );
    const projectStaff = getProjectStaff(selectedClient.name);
    const assignableUsers = [...projectStaff.admins, ...projectStaff.employees];
    const filteredAssignees = assignableUsers.filter(user =>
      `${user.name} ${user.email || ''}`.toLowerCase().includes(assigneeQuery.toLowerCase())
    );
    return (
      <div className="min-h-full p-4 font-sans animate-in fade-in duration-500 text-left space-y-3">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedClient(null)} className="p-2 bg-white hover:bg-slate-50 rounded-xl transition-all border border-slate-100 shadow-sm">
              <ChevronLeft size={18} className="text-slate-600"/>
            </button>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{selectedClient.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setReportUrlInput(dailyReportUrl);
                setIsEditingReportLink(!dailyReportUrl);
                setShowReportsModal(true);
              }}
              className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-lg font-semibold text-xs hover:bg-slate-50 transition-all"
            >
              Reports
            </button>
            <button
              onClick={() => setShowArchived(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs border transition-all ${
                showArchived
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              title={showArchived ? 'Hide archived tasks' : 'Show archived tasks'}
            >
              {showArchived ? <ArchiveRestore size={13}/> : <Archive size={13}/>}
              {showArchived ? 'Hide Archived' : `Archived${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
            </button>
            {!showArchived && (
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
              >
                <option value="All">All Tasks</option>
                <option value="Pending">Pending</option>
                <option value="WIP">WIP</option>
                <option value="Done">Completed</option>
                <option value="Today">Due Today</option>
                <option value="Overdue">Overdue</option>
                <option value="48H+">48H+ Not Done</option>
              </select>
            )}
            {isManagement && (
              <button
                onClick={openTemplateModal}
                className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-lg font-semibold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5"
              >
                Use Template
              </button>
            )}
            <button
              onClick={() => {
                setNewTaskName('');
                setSelectedDate(new Date());
                setNewTaskComment('');
                setNewTaskCategory('');
                setTaskCategoryQuery('');
                setShowCategoryMenu(false);
                setNewTaskAssigneeId('');
                setAssigneeQuery('');
                setShowAssigneeMenu(false);
                setTaskFormError('');
                setNewTaskRepeat('Once');
                setNewTaskRepeatEnd(null);
                setNewTaskRepeatDays([0, 1, 2, 3, 4]);
                setNewTaskRepeatMonthlyWeek(1);
                setNewTaskRepeatMonthlyDay(0);
                setTaskDueDate(null);
                setQcEnabled(true);
                setQcAssigneeId('');
                setQcAssigneeName('');
                setNewTaskDepartments(currentUser?.department ? [currentUser.department] : []);
                setNewTaskBillable(true);
                setNewTaskReminders([]);
                setShowTaskForm(true);
              }}
              className="bg-blue-600 text-white px-3.5 py-2 rounded-lg font-semibold text-xs hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-md"
            >
              <Plus size={14}/> Add Task
            </button>
          </div>
        </div>

        {/* --- ETHINOS SUPER ADMIN FILTERS --- */}
        {selectedClient.isEthinos && isSuperAdmin && (
          <div className="flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-600 mr-1">Filter by:</span>
            {/* Department */}
            <select
              value={ethinosDeptFilter}
              onChange={e => setEthinosDeptFilter(e.target.value)}
              className="bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 ring-indigo-500/20"
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {/* Region */}
            <select
              value={ethinosRegionFilter}
              onChange={e => setEthinosRegionFilter(e.target.value)}
              className="bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 ring-indigo-500/20"
            >
              <option value="All">All Regions</option>
              {regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {/* User */}
            <select
              value={ethinosUserFilter}
              onChange={e => setEthinosUserFilter(e.target.value)}
              className="bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 ring-indigo-500/20"
            >
              <option value="All">All Users</option>
              {users.filter(u => u.email?.endsWith('@ethinos.com')).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(u => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
            {/* Reset */}
            {(ethinosDeptFilter !== 'All' || ethinosRegionFilter !== 'All' || ethinosUserFilter !== 'All') && (
              <button
                onClick={() => { setEthinosDeptFilter('All'); setEthinosRegionFilter('All'); setEthinosUserFilter('All'); }}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline ml-1"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-[11px] font-semibold text-indigo-500">
              {visibleTaskLogs.length} task{visibleTaskLogs.length !== 1 ? 's' : ''} shown
            </span>
          </div>
        )}

        {/* --- OVERALL NUMBERS ROW --- */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between min-h-[62px]">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Pending</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{stats.open}</p>
            </div>
            <div className="p-1 bg-orange-50 rounded-md"><Clock size={12} className="text-orange-500"/></div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between min-h-[62px]">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">WIP Tasks</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{stats.wip}</p>
            </div>
            <div className="p-1 bg-blue-50 rounded-md"><Activity size={12} className="text-blue-500"/></div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between min-h-[62px]">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Completed</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{stats.done}</p>
            </div>
            <div className="p-1 bg-emerald-50 rounded-md"><CheckCircle size={12} className="text-emerald-500"/></div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-red-100 shadow-sm flex items-center justify-between min-h-[62px]">
            <div>
              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">48H+ Not Done</p>
              <p className="text-base font-bold text-red-600 mt-0.5">{stats.recentPending}</p>
            </div>
            <div className="p-1 bg-red-50 rounded-md"><AlertCircle size={12} className="text-red-500"/></div>
          </div>
          <div className={`bg-white p-2 rounded-lg border shadow-sm flex items-center justify-between min-h-[62px] ${stats.overdue > 0 ? 'border-red-200' : 'border-slate-100'}`}>
            <div>
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${stats.overdue > 0 ? 'text-red-500' : 'text-slate-500'}`}>Overdue</p>
              <p className={`text-base font-bold mt-0.5 ${stats.overdue > 0 ? 'text-red-600' : 'text-slate-900'}`}>{stats.overdue}</p>
            </div>
            <div className={`p-1 rounded-md ${stats.overdue > 0 ? 'bg-red-50' : 'bg-slate-50'}`}><AlertTriangle size={12} className={stats.overdue > 0 ? 'text-red-500' : 'text-slate-400'}/></div>
          </div>
          <div className={`bg-white p-2 rounded-lg border shadow-sm flex items-center justify-between min-h-[62px] ${stats.dueToday > 0 ? 'border-amber-200' : 'border-slate-100'}`}>
            <div>
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${stats.dueToday > 0 ? 'text-amber-600' : 'text-slate-500'}`}>Due Today</p>
              <p className={`text-base font-bold mt-0.5 ${stats.dueToday > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{stats.dueToday}</p>
            </div>
            <div className={`p-1 rounded-md ${stats.dueToday > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}><Calendar size={12} className={stats.dueToday > 0 ? 'text-amber-500' : 'text-slate-400'}/></div>
          </div>
        </div>

        {/* Task Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full min-w-[1100px] border-collapse table-fixed">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[11%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[22%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                  <th className="px-1.5 py-2 text-left">Date</th>
                  <th className="px-1.5 py-2 text-left">Task</th>
                  <th className="px-1.5 py-2 text-left">Category</th>
                  <th className="px-1.5 py-2 text-left">Due Date</th>
                  <th className="px-1.5 py-2 text-left">Assigned To</th>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-center">Edit</th>
                  <th className="px-1.5 py-2 text-right">Timer</th>
                  <th className="px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTaskLogs.map(log => {
                  const timerState = log.timerState || (log.elapsedMs > 0 ? 'paused' : 'idle');

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setDetailTask(log)}
                      className="hover:bg-slate-50 transition-all group align-top cursor-pointer"
                    >
                      {/* Date */}
                      <td className="px-1.5 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">{String(log.date || '').replace(/\s+\d{4}$/, '')}</td>

                      {/* Task name */}
                      <td className="px-1.5 py-2">
                        <p className="text-xs font-semibold text-slate-800 leading-4 break-words line-clamp-2">{log.name || '—'}</p>
                        {Array.isArray(log.departments) && log.departments.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {log.departments.map(dept => (
                              <span key={dept} className="text-[8px] font-semibold text-purple-600 bg-purple-50 px-1 py-0.5 rounded">{dept}</span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-1.5 py-2">
                        <span className="text-[10px] font-semibold text-slate-600">{log.category || 'General'}</span>
                      </td>

                      {/* Due Date */}
                      <td className="px-1.5 py-2 text-xs font-medium whitespace-nowrap">
                        {log.dueDate ? (
                          <span className={`px-1.5 py-0.5 rounded-md font-semibold text-[9px] ${
                            new Date(log.dueDate) < new Date() && log.status !== 'Done'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>{log.dueDate}</span>
                        ) : (
                          <span className="text-slate-400 text-[9px]">—</span>
                        )}
                      </td>

                      {/* Assigned To */}
                      <td className="px-1.5 py-2 text-xs text-slate-600">
                        <div className="leading-4">
                          <p className="font-semibold text-slate-700 truncate">{log.assigneeName || 'Unassigned'}</p>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-2 py-2">
                        <p className="text-xs text-slate-600 leading-4 break-words line-clamp-2">{log.comment}</p>
                        {log.qcEnabled && log.qcAssigneeName && (
                          <p className="text-[10px] text-indigo-500 font-medium mt-0.5">QC: {log.qcAssigneeName}</p>
                        )}
                        {log.qcEnabled && log.qcStatus === 'rejected' && log.qcFeedback && (
                          <div className="mt-1.5 flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                            <ThumbsDown size={10} className="text-red-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold text-red-700">Feedback{log.qcRating ? ` · ${log.qcRating}/10` : ''}:</p>
                              <p className="text-[10px] text-red-600 break-words">{log.qcFeedback}</p>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Edit / Delete / Archive */}
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {canFullyEditTask(log) && (
                          <div className="flex items-center justify-center gap-1">
                            {!log.archived && (
                              <button
                                onClick={() => openEditModal(log)}
                                className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                                title="Edit task"
                              >
                                <Edit2 size={12}/>
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const upd = (clientLogs[selectedClient.id] || []).map(l =>
                                  l.id === log.id ? { ...l, archived: !l.archived } : l
                                );
                                setClientLogs({ ...clientLogs, [selectedClient.id]: upd });
                              }}
                              className={`p-1.5 rounded-md transition-all ${
                                log.archived
                                  ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                                  : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
                              }`}
                              title={log.archived ? 'Unarchive task' : 'Archive task'}
                            >
                              {log.archived ? <ArchiveRestore size={12}/> : <Archive size={12}/>}
                            </button>
                            {!log.archived && (
                              <button
                                onClick={() => {
                                  if (window.confirm('Are you sure you want to delete this task?')) {
                                    const upd = clientLogs[selectedClient.id].filter(l => l.id !== log.id);
                                    setClientLogs({ ...clientLogs, [selectedClient.id]: upd });
                                  }
                                }}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                                title="Delete task"
                              >
                                <Trash2 size={12}/>
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Timer display */}
                      <td className="px-1.5 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] font-semibold text-slate-700">{formatDuration(getElapsedMs(log))}</span>
                          {timerState === 'stopped' && log.timeTaken && (
                            <span className="text-[8px] font-medium text-emerald-600">Time: {log.timeTaken}</span>
                          )}
                          {formatEstimatedTime(log.estimatedMs) && (
                            <span className="text-[8px] font-medium text-amber-600 flex items-center gap-0.5">
                              <Hourglass size={7} /> {formatEstimatedTime(log.estimatedMs)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions: status + QC + timer controls */}
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1">
                          {/* Status */}
                          {canChangeTaskStatus(log) ? (
                            <select
                              className={`w-full text-[10px] border-none rounded-md px-1.5 py-1 font-semibold outline-none cursor-pointer ${
                                log.status === 'Done' ? 'bg-emerald-100 text-emerald-600' :
                                log.status === 'WIP' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
                              }`}
                              value={log.status}
                              onChange={e => {
                                const newStatus = e.target.value;
                                const updated = clientLogs[selectedClient.id].map(l => {
                                  if (l.id !== log.id) return l;
                                  let timerUpdate = {};
                                  if (newStatus === 'Done' && (l.timerState === 'running' || l.timerState === 'paused')) {
                                    const elapsedMs = l.timerState === 'running' && l.timerStartedAt
                                      ? (l.elapsedMs || 0) + (Date.now() - l.timerStartedAt)
                                      : (l.elapsedMs || 0);
                                    timerUpdate = { timerState: 'stopped', timerStartedAt: null, elapsedMs, timeTaken: formatDuration(elapsedMs) };
                                  }
                                  return {
                                    ...l,
                                    status: newStatus,
                                    qcStatus: newStatus !== 'Done' && l.qcStatus === 'sent' ? null : l.qcStatus,
                                    ...timerUpdate
                                  };
                                });
                                setClientLogs({ ...clientLogs, [selectedClient.id]: updated });
                              }}
                            >
                              <option value="Pending">Pending</option>
                              <option value="WIP">WIP</option>
                              <option value="Done">Done</option>
                            </select>
                          ) : (
                            <span className={`inline-block text-[10px] rounded-md px-1.5 py-1 font-semibold ${
                              log.status === 'Done' ? 'bg-emerald-100 text-emerald-600' :
                              log.status === 'WIP' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
                            }`}>{log.status}</span>
                          )}
                          {/* QC badges */}
                          {log.qcEnabled && log.status === 'Done' && (!log.qcStatus || log.qcStatus === 'rejected') && canChangeTaskStatus(log) && (
                            <button
                              onClick={() => {
                                const updated = clientLogs[selectedClient.id].map(l =>
                                  l.id === log.id ? { ...l, qcStatus: 'sent' } : l
                                );
                                setClientLogs({ ...clientLogs, [selectedClient.id]: updated });
                              }}
                              className="flex items-center gap-0.5 text-[9px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-1 py-0.5 hover:bg-indigo-100 transition-all whitespace-nowrap"
                              title="Send for Quality Check"
                            >
                              <Send size={8} /> Send for QC
                            </button>
                          )}
                          {log.qcEnabled && log.qcStatus === 'sent' && !isManagement && (
                            <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded px-1 py-0.5 whitespace-nowrap">
                              <ShieldCheck size={8} /> Pending QC
                            </span>
                          )}
                          {log.qcEnabled && log.qcStatus === 'sent' && isManagement && (
                            <button
                              onClick={() => {
                                setQcReviewingTaskId(log.id);
                                setQcReviewDecision('approved');
                                setQcReviewRating('');
                                setQcReviewFeedback('');
                              }}
                              className="flex items-center gap-0.5 text-[9px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded px-1 py-0.5 hover:bg-amber-100 transition-all whitespace-nowrap"
                              title="Review QC submission"
                            >
                              <ShieldCheck size={8} /> Review QC
                            </button>
                          )}
                          {log.qcEnabled && log.qcStatus === 'approved' && (
                            <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-1 py-0.5 whitespace-nowrap">
                              <ThumbsUp size={8} /> Approved{log.qcRating ? ` · ${log.qcRating}/10` : ''}
                            </span>
                          )}
                          {log.qcEnabled && log.qcStatus === 'rejected' && (
                            <button
                              onClick={() => {
                                const updated = clientLogs[selectedClient.id].map(l =>
                                  l.id === log.id ? { ...l, qcStatus: 'sent' } : l
                                );
                                setClientLogs({ ...clientLogs, [selectedClient.id]: updated });
                              }}
                              className="flex items-center gap-0.5 text-[9px] font-semibold bg-red-50 text-red-600 border border-red-200 rounded px-1 py-0.5 hover:bg-red-100 transition-all whitespace-nowrap"
                              title="Resubmit for QC"
                            >
                              <RotateCcw size={8} /> Returned
                            </button>
                          )}
                          {/* Timer controls — hidden when Done */}
                          {log.status !== 'Done' && (
                            isAssignedToTask(log) ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                {(timerState === 'idle' || timerState === 'stopped') && (
                                  <button onClick={() => startTaskTimer(log.id)} className="p-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all" title="Start timer">
                                    <Play size={11} />
                                  </button>
                                )}
                                {timerState === 'running' && (
                                  <>
                                    <button onClick={() => pauseTaskTimer(log.id)} className="p-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all" title="Pause timer">
                                      <Pause size={11} />
                                    </button>
                                    <button onClick={() => stopTaskTimer(log.id)} className="p-1 rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all" title="Stop timer">
                                      <Square size={11} />
                                    </button>
                                  </>
                                )}
                                {timerState === 'paused' && (
                                  <>
                                    <button onClick={() => startTaskTimer(log.id)} className="p-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all" title="Resume timer">
                                      <Play size={11} />
                                    </button>
                                    <button onClick={() => stopTaskTimer(log.id)} className="p-1 rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all" title="Stop timer">
                                      <Square size={11} />
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              hasRequestedAssignment(log) ? (
                                <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-slate-50 text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 whitespace-nowrap">
                                  <UserPlus size={8} /> Requested
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleRequestAssignment(log)}
                                  className="flex items-center gap-0.5 text-[9px] font-semibold bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-0.5 mt-0.5 hover:bg-violet-100 transition-all whitespace-nowrap"
                                  title="Request to be assigned to this task"
                                >
                                  <UserPlus size={8} /> Ask to assign
                                </button>
                              )
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {showReportsModal && (
          <div className="fixed inset-0 z-[650] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-2xl border border-slate-200 rounded-2xl shadow-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-slate-900">{selectedClient.name} Reports</h4>
                <button
                  onClick={() => setShowReportsModal(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Daily Reports</p>

                  {!isEditingReportLink && dailyReportUrl && (
                    <div className="flex items-center gap-2">
                      <a
                        href={dailyReportUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        View Report
                      </a>
                      <button
                        type="button"
                        onClick={() => setIsEditingReportLink(true)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 transition-all"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}

                  {!isEditingReportLink && !dailyReportUrl && (
                    <button
                      type="button"
                      onClick={() => setIsEditingReportLink(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Add Link
                    </button>
                  )}
                </div>

                {isEditingReportLink && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="url"
                      value={reportUrlInput}
                      onChange={(e) => setReportUrlInput(e.target.value)}
                      placeholder="Paste report URL"
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleSaveDailyReportLink}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingReportLink(false);
                        setReportUrlInput(dailyReportUrl);
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Custom Reports</p>
                  {!showAddCustomReport && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCustomReport(true);
                        setEditingCustomReportId(null);
                        setCustomReportName('');
                        setCustomReportUrl('');
                      }}
                      disabled={customReports.length >= 7}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add Report
                    </button>
                  )}
                </div>

                {showAddCustomReport && (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr,1.2fr,auto,auto] gap-2">
                    <input
                      type="text"
                      value={customReportName}
                      onChange={(e) => setCustomReportName(e.target.value)}
                      placeholder="Report name"
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    />
                    <input
                      type="url"
                      value={customReportUrl}
                      onChange={(e) => setCustomReportUrl(e.target.value)}
                      placeholder="Report URL"
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomReport}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCustomReport(false);
                        setCustomReportName('');
                        setCustomReportUrl('');
                        setEditingCustomReportId(null);
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {customReports.length > 0 ? (
                    customReports.map(report => (
                      <div key={report.id} className="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-lg">
                        <span className="text-sm font-semibold text-slate-700 truncate">{report.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={report.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            View Report
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddCustomReport(true);
                              setEditingCustomReportId(report.id);
                              setCustomReportName(report.name);
                              setCustomReportUrl(report.url);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 transition-all"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs font-medium text-slate-500">No custom reports added yet.</p>
                  )}
                </div>

                <p className="text-[11px] font-medium text-slate-500">You can add up to 7 reports.</p>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add Task */}
        {showTaskForm && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/10 backdrop-blur-md p-4">
            <div className="bg-white w-full max-w-5xl border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95 flex flex-col" style={{maxHeight:'92vh'}}>
              {/* Sticky header */}
              <div className="flex-shrink-0 flex justify-between items-center px-8 pt-7 pb-5 border-b border-slate-100">
                <h4 className="text-lg font-semibold text-slate-900">New Task</h4>
                <button
                  onClick={() => {
                    setShowTaskForm(false);
                    setTaskFormError('');
                    setShowCategoryMenu(false);
                    setShowAssigneeMenu(false);
                    setTaskDueDate(null);
                  }}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                >
                  <X size={18}/>
                </button>
              </div>
              <form onSubmit={addTaskEntry} className="flex-1 overflow-y-auto space-y-6 px-8 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Select</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Today', days: 0 },
                          { label: 'Tomorrow', days: 1 },
                          { label: 'Next Week', days: 7 },
                          { label: 'Next Month', days: 30 },
                        ].map(({ label, days }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + days);
                              setSelectedDate(d);
                              if (taskDueDate && d > taskDueDate) setTaskDueDate(null);
                            }}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                      <DatePicker
                        selected={selectedDate}
                        onChange={(date) => {
                          setSelectedDate(date);
                          if (taskDueDate && date && date > taskDueDate) setTaskDueDate(null);
                        }}
                        inline
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        placeholder="Short title for this task"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                        value={newTaskName}
                        onChange={e => setNewTaskName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Category <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search and select category"
                          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                          value={taskCategoryQuery}
                          onFocus={() => setShowCategoryMenu(true)}
                          onChange={(e) => {
                            setTaskCategoryQuery(e.target.value);
                            setNewTaskCategory('');
                            setShowCategoryMenu(true);
                            if (taskFormError) setTaskFormError('');
                          }}
                        />
                        {showCategoryMenu && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                            {filteredTaskCategories.length ? (
                              filteredTaskCategories.map(category => (
                                <button
                                  key={category}
                                  type="button"
                                  onClick={() => {
                                    setNewTaskCategory(category);
                                    setTaskCategoryQuery(category);
                                    setShowCategoryMenu(false);
                                    if (taskFormError) setTaskFormError('');
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm font-medium text-black bg-white hover:bg-slate-50 transition-all"
                                >
                                  {category}
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-2 text-sm text-slate-500">No categories found</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign To <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search assignee"
                          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                          value={assigneeQuery}
                          onFocus={() => setShowAssigneeMenu(true)}
                          onChange={(e) => {
                            setAssigneeQuery(e.target.value);
                            setNewTaskAssigneeId('');
                            setShowAssigneeMenu(true);
                            if (taskFormError) setTaskFormError('');
                          }}
                        />
                        {showAssigneeMenu && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                            {filteredAssignees.length ? (
                              filteredAssignees.map(user => (
                                <button
                                  key={user.id}
                                  type="button"
                                  onClick={() => {
                                    setNewTaskAssigneeId(user.id);
                                    setAssigneeQuery(user.name);
                                    setShowAssigneeMenu(false);
                                    if (taskFormError) setTaskFormError('');
                                  }}
                                  className="w-full text-left px-3 py-2 bg-white hover:bg-slate-50 transition-all"
                                >
                                  <p className="text-sm font-semibold text-slate-700">{user.name}</p>
                                  <p className="text-xs text-slate-500">{user.email || 'No email'}</p>
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-2 text-sm text-slate-500">
                                {assignableUsers.length ? 'No matching assignee found' : 'No team members assigned to this client'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Description <span className="text-red-500">*</span></label>
                      <textarea
                        placeholder="Describe the task details"
                        className="w-full h-40 p-4 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none bg-slate-100"
                        value={newTaskComment}
                        onChange={e => {
                          setNewTaskComment(e.target.value);
                          if (taskFormError) setTaskFormError('');
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat Frequency</label>
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all" style={newTaskRepeat === 'Once' ? {borderColor: '#2563eb', backgroundColor: '#eff6ff'} : {}}>
                          <input
                            type="radio"
                            name="repeat"
                            value="Once"
                            checked={newTaskRepeat === 'Once'}
                            onChange={(e) => setNewTaskRepeat(e.target.value)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-slate-700">Once</span>
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all" style={newTaskRepeat === 'Daily' ? {borderColor: '#2563eb', backgroundColor: '#eff6ff'} : {}}>
                          <input
                            type="radio"
                            name="repeat"
                            value="Daily"
                            checked={newTaskRepeat === 'Daily'}
                            onChange={(e) => setNewTaskRepeat(e.target.value)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-slate-700">Daily</span>
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all" style={newTaskRepeat === 'Weekly' ? {borderColor: '#2563eb', backgroundColor: '#eff6ff'} : {}}>
                          <input
                            type="radio"
                            name="repeat"
                            value="Weekly"
                            checked={newTaskRepeat === 'Weekly'}
                            onChange={(e) => setNewTaskRepeat(e.target.value)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-slate-700">Weekly</span>
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all" style={newTaskRepeat === 'Monthly' ? {borderColor: '#2563eb', backgroundColor: '#eff6ff'} : {}}>
                          <input
                            type="radio"
                            name="repeat"
                            value="Monthly"
                            checked={newTaskRepeat === 'Monthly'}
                            onChange={(e) => setNewTaskRepeat(e.target.value)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-slate-700">Monthly</span>
                        </label>
                      </div>
                      {newTaskRepeat === 'Weekly' && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repeat on Days</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {WEEKDAY_SHORT.map((d, i) => (
                              <button
                                key={i} type="button"
                                onClick={() => setNewTaskRepeatDays(prev =>
                                  prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                                )}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${newTaskRepeatDays.includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                              >{d}</button>
                            ))}
                          </div>
                          {newTaskRepeatDays.length === 0 && <p className="text-[10px] text-red-500 font-medium">Select at least one day</p>}
                        </div>
                      )}
                      {newTaskRepeat === 'Monthly' && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repeat on</label>
                          <div className="flex gap-2">
                            <select
                              value={newTaskRepeatMonthlyWeek}
                              onChange={e => setNewTaskRepeatMonthlyWeek(Number(e.target.value))}
                              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 bg-white"
                            >
                              {WEEK_ORDINALS.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
                            </select>
                            <select
                              value={newTaskRepeatMonthlyDay}
                              onChange={e => setNewTaskRepeatMonthlyDay(Number(e.target.value))}
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 bg-white"
                            >
                              {WEEKDAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                          </div>
                          <p className="text-[10px] text-blue-600 font-medium">
                            {WEEK_ORDINALS[newTaskRepeatMonthlyWeek - 1]} {WEEKDAY_FULL[newTaskRepeatMonthlyDay]} of each month
                          </p>
                        </div>
                      )}
                    </div>
                    {newTaskRepeat !== 'Once' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Repeat Until <span className="text-slate-400 font-normal normal-case">(contract / end date)</span>
                        </label>
                        <DatePicker
                          selected={newTaskRepeatEnd}
                          onChange={(date) => setNewTaskRepeatEnd(date)}
                          placeholderText="No end date"
                          dateFormat="do MMM yyyy"
                          minDate={taskDueDate || selectedDate || new Date()}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                        />
                        {newTaskRepeatEnd && (() => {
                          const previewDates = generateRecurringDates(
                            selectedDate || new Date(), newTaskRepeatEnd, newTaskRepeat,
                            newTaskRepeatDays, newTaskRepeatMonthlyWeek, newTaskRepeatMonthlyDay
                          );
                          return (
                            <p className="text-[10px] text-blue-600 font-medium">
                              Will create {previewDates.length} task{previewDates.length !== 1 ? 's' : ''}
                            </p>
                          );
                        })()}
                        {newTaskRepeatEnd && (
                          <button type="button" onClick={() => setNewTaskRepeatEnd(null)} className="text-xs font-semibold text-red-600 hover:text-red-700 transition-all">
                            Clear End Date
                          </button>
                        )}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                      <DueDateInput
                        startDate={selectedDate || new Date()}
                        value={taskDueDate}
                        onChange={setTaskDueDate}
                        minDate={selectedDate || new Date()}
                      />
                      {taskDueDate && (
                        <button
                          type="button"
                          onClick={() => setTaskDueDate(null)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 transition-all"
                        >
                          Clear Due Date
                        </button>
                      )}
                    </div>
                    {taskDueDate && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Email Reminders
                          <span className="ml-1.5 text-slate-400 normal-case font-normal">— "after" reminders go to QC manager too</span>
                        </label>
                        <ReminderPills selected={newTaskReminders} onChange={setNewTaskReminders} />
                      </div>
                    )}
                    {/* Billable Toggle */}
                    <div className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3 bg-slate-50/60">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Billable</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{newTaskBillable ? 'This task is client-chargeable' : 'This task is internal / non-billable'}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={newTaskBillable}
                        aria-label="Toggle billable"
                        onClick={() => setNewTaskBillable(b => !b)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${newTaskBillable ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${newTaskBillable ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated Time</label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="number"
                            min="0"
                            max="999"
                            placeholder="0"
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                            value={newTaskEstimatedHrs}
                            onChange={e => setNewTaskEstimatedHrs(e.target.value)}
                          />
                          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">hrs</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            placeholder="0"
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                            value={newTaskEstimatedMins}
                            onChange={e => setNewTaskEstimatedMins(e.target.value)}
                          />
                          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">mins</span>
                        </div>
                      </div>
                    </div>
                    {/* QC Section */}
                    <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={15} className="text-indigo-600" />
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Quality Check</label>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={qcEnabled}
                          aria-label="Enable Quality Check"
                          onClick={() => {
                            setQcEnabled(!qcEnabled);
                            if (qcEnabled) { setQcAssigneeId(''); setQcAssigneeName(''); }
                          }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${qcEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${qcEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      {qcEnabled && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-500">QC Reviewer</label>
                          <button
                            type="button"
                            onClick={() => { setPickerSearch(''); setActivePicker('qcReviewer'); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${qcAssigneeId ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40'}`}
                          >
                            <Users size={13} className={qcAssigneeId ? 'text-indigo-600' : 'text-slate-400'} />
                            {qcAssigneeId ? qcAssigneeName : 'Select a reviewer (optional)'}
                            {qcAssigneeId && (
                              <span
                                role="button"
                                onClick={(e) => { e.stopPropagation(); setQcAssigneeId(''); setQcAssigneeName(''); }}
                                className="ml-auto text-indigo-400 hover:text-indigo-600 cursor-pointer flex items-center"
                              >
                                <X size={12} />
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Departments */}
                    {departments.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Departments</label>
                        <div className="flex flex-wrap gap-2">
                          {departments.map(dept => {
                            const isSelected = newTaskDepartments.includes(dept);
                            const isCreatorDept = dept === currentUser?.department;
                            return (
                              <button
                                key={dept}
                                type="button"
                                disabled={isCreatorDept}
                                onClick={() => {
                                  if (isCreatorDept) return;
                                  setNewTaskDepartments(prev =>
                                    prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
                                  );
                                }}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                                  isSelected
                                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-purple-300 hover:text-purple-600'
                                } ${isCreatorDept ? 'cursor-default ring-1 ring-purple-400' : 'cursor-pointer'}`}
                                title={isCreatorDept ? 'Your department (always included)' : undefined}
                              >
                                {dept}{isCreatorDept ? ' ✓' : ''}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400">Your department is pre-selected and cannot be removed.</p>
                      </div>
                    )}
                  </div>
                </div>
                {taskFormError && (
                  <p className="text-sm font-medium text-red-600">{taskFormError}</p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!availableTaskCategories.length || !assignableUsers.length}
                  >
                    Add to Log
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Task Modal */}
        {editingTask && editDraft && (() => {
          const editFilteredCategories = availableTaskCategories.filter(c =>
            c.toLowerCase().includes(editDraftCategoryQuery.toLowerCase())
          );
          const editFilteredAssignees = assignableUsers.filter(u =>
            `${u.name} ${u.email || ''}`.toLowerCase().includes(editDraftAssigneeQuery.toLowerCase())
          );
          const managementUsersForQC = assignableUsers.filter(u => managementRoles.includes(u.role));
          return (
            <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/20 backdrop-blur-md p-4">
              <div className="bg-white w-full max-w-5xl border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95 flex flex-col" style={{maxHeight:'92vh'}}>
                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-center px-8 pt-7 pb-5 border-b border-slate-100">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">Edit Task</h4>
                    {editingTask.name && <p className="text-xs text-slate-500 mt-0.5">{editingTask.name}</p>}
                  </div>
                  <button
                    onClick={() => { setEditingTask(null); setEditDraft(null); }}
                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                  >
                    <X size={18}/>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-6 px-8 py-6">
                  <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-6">
                    {/* Left column: dates + status */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Date</label>
                        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                          <DatePicker
                            selected={editDraft.date}
                            onChange={date => setEditDraft(d => ({
                              ...d,
                              date: date || new Date(),
                              dueDate: d.dueDate && date && date > d.dueDate ? null : d.dueDate,
                            }))}
                            inline
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                        <DueDateInput
                          key={editingTask?.id}
                          startDate={editDraft.date || new Date()}
                          value={editDraft.dueDate}
                          onChange={date => setEditDraft(d => ({ ...d, dueDate: date }))}
                          minDate={editDraft.date || new Date()}
                        />
                        {editDraft.dueDate && (
                          <button type="button" onClick={() => setEditDraft(d => ({ ...d, dueDate: null, reminderOffsets: [] }))} className="text-xs font-semibold text-red-600 hover:text-red-700">
                            Clear Due Date
                          </button>
                        )}
                      </div>
                      {editDraft.dueDate && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Email Reminders
                            <span className="ml-1.5 text-slate-400 normal-case font-normal">— "after" reminders go to QC manager too</span>
                          </label>
                          <ReminderPills
                            selected={editDraft.reminderOffsets || []}
                            onChange={offsets => setEditDraft(d => ({ ...d, reminderOffsets: offsets }))}
                          />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
                        <select
                          value={editDraft.status}
                          onChange={e => setEditDraft(d => ({ ...d, status: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 bg-white"
                        >
                          <option value="Pending">Pending</option>
                          <option value="WIP">WIP</option>
                          <option value="Done">Done</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat Frequency</label>
                        <div className="flex flex-wrap gap-2">
                          {['Once','Daily','Weekly','Monthly'].map(freq => (
                            <label key={freq} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg cursor-pointer text-xs font-semibold transition-all"
                              style={editDraft.repeatFrequency === freq ? {borderColor:'#2563eb',backgroundColor:'#eff6ff',color:'#1d4ed8'} : {borderColor:'#e2e8f0',color:'#374151'}}
                            >
                              <input type="radio" name="editRepeat" value={freq} checked={editDraft.repeatFrequency === freq}
                                onChange={() => setEditDraft(d => ({ ...d, repeatFrequency: freq }))}
                                className="w-3.5 h-3.5 accent-blue-600"
                              />
                              {freq}
                            </label>
                          ))}
                        </div>
                        {editDraft.repeatFrequency !== 'Once' && (
                          <div className="mt-2 space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Repeat Until <span className="text-slate-400 font-normal normal-case">(optional)</span>
                            </label>
                            <DatePicker
                              selected={editDraft.repeatEnd || null}
                              onChange={(date) => setEditDraft(d => ({ ...d, repeatEnd: date }))}
                              placeholderText="No end date"
                              dateFormat="do MMM yyyy"
                              minDate={editDraft.dueDate || new Date()}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                            />
                            {editDraft.repeatEnd && (
                              <button type="button" onClick={() => setEditDraft(d => ({ ...d, repeatEnd: null }))} className="text-xs font-semibold text-red-600 hover:text-red-700 transition-all">
                                Clear End Date
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Right column: all text fields */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="Short title for this task"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                          value={editDraft.name}
                          onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Description <span className="text-red-500">*</span></label>
                        <textarea
                          placeholder="Describe the task details"
                          className="w-full h-28 p-4 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none bg-slate-50"
                          value={editDraft.comment}
                          onChange={e => { setEditDraft(d => ({ ...d, comment: e.target.value })); setEditDraftError(''); }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Category <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search and select category"
                            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                            value={editDraftCategoryQuery}
                            onFocus={() => setEditDraftShowCategoryMenu(true)}
                            onChange={e => { setEditDraftCategoryQuery(e.target.value); setEditDraft(d => ({ ...d, category: '' })); setEditDraftShowCategoryMenu(true); setEditDraftError(''); }}
                          />
                          {editDraftShowCategoryMenu && (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {editFilteredCategories.length ? editFilteredCategories.map(c => (
                                <button key={c} type="button"
                                  onClick={() => { setEditDraft(d => ({ ...d, category: c })); setEditDraftCategoryQuery(c); setEditDraftShowCategoryMenu(false); setEditDraftError(''); }}
                                  className="w-full text-left px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >{c}</button>
                              )) : <p className="px-3 py-2 text-sm text-slate-500">No categories found</p>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign To <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search assignee"
                            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                            value={editDraftAssigneeQuery}
                            onFocus={() => setEditDraftShowAssigneeMenu(true)}
                            onChange={e => { setEditDraftAssigneeQuery(e.target.value); setEditDraft(d => ({ ...d, assigneeId: '', assigneeName: '' })); setEditDraftShowAssigneeMenu(true); setEditDraftError(''); }}
                          />
                          {editDraftShowAssigneeMenu && (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {editFilteredAssignees.length ? editFilteredAssignees.map(u => (
                                <button key={u.id} type="button"
                                  onClick={() => { setEditDraft(d => ({ ...d, assigneeId: u.id, assigneeName: u.name })); setEditDraftAssigneeQuery(u.name); setEditDraftShowAssigneeMenu(false); setEditDraftError(''); }}
                                  className="w-full text-left px-3 py-2 hover:bg-slate-50"
                                >
                                  <p className="text-sm font-semibold text-slate-700">{u.name}</p>
                                  <p className="text-xs text-slate-500">{u.email || ''}</p>
                                </button>
                              )) : <p className="px-3 py-2 text-sm text-slate-500">{assignableUsers.length ? 'No match' : 'No team members on this client'}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Billable Toggle (Edit) */}
                      <div className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3 bg-slate-50/60">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Billable</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{editDraft.billable !== false ? 'This task is client-chargeable' : 'This task is internal / non-billable'}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={editDraft.billable !== false}
                          aria-label="Toggle billable"
                          onClick={() => setEditDraft(d => ({ ...d, billable: !(d.billable ?? true) }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editDraft.billable !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${editDraft.billable !== false ? 'translate-x-4' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated Time</label>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="number"
                              min="0"
                              max="999"
                              placeholder="0"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                              value={editDraft.estimatedHrs || ''}
                              onChange={e => setEditDraft(d => ({ ...d, estimatedHrs: e.target.value }))}
                            />
                            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">hrs</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="number"
                              min="0"
                              max="59"
                              placeholder="0"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                              value={editDraft.estimatedMins || ''}
                              onChange={e => setEditDraft(d => ({ ...d, estimatedMins: e.target.value }))}
                            />
                            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">mins</span>
                          </div>
                        </div>
                      </div>
                      {/* QC Section */}
                      <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck size={15} className="text-indigo-600" />
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Quality Check</label>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={editDraft.qcEnabled}
                            onClick={() => setEditDraft(d => ({
                              ...d,
                              qcEnabled: !d.qcEnabled,
                              qcAssigneeId: d.qcEnabled ? '' : d.qcAssigneeId,
                              qcAssigneeName: d.qcEnabled ? '' : d.qcAssigneeName,
                            }))}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editDraft.qcEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${editDraft.qcEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        {editDraft.qcEnabled && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">QC Reviewer</label>
                            <div className="relative">
                              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Search management reviewer..."
                                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-indigo-500/20"
                                value={editDraft.qcAssigneeName || ''}
                                onChange={e => {
                                  const q = e.target.value.toLowerCase();
                                  const match = managementUsersForQC.find(u => u.name.toLowerCase() === q);
                                  setEditDraft(d => ({ ...d, qcAssigneeName: e.target.value, qcAssigneeId: match ? String(match.id) : '' }));
                                }}
                              />
                              {editDraft.qcAssigneeName && (
                                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-36 overflow-y-auto">
                                  {managementUsersForQC.filter(u => u.name.toLowerCase().includes((editDraft.qcAssigneeName || '').toLowerCase())).map(u => (
                                    <button key={u.id} type="button"
                                      onClick={() => setEditDraft(d => ({ ...d, qcAssigneeId: String(u.id), qcAssigneeName: u.name }))}
                                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50"
                                    >{u.name} <span className="text-slate-400">· {u.role}</span></button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {editDraftError && <p className="text-sm font-medium text-red-600">{editDraftError}</p>}
                  {editingTask.repeatGroupId && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Update:</span>
                      {[
                        { id: 'one', label: 'This task only' },
                        { id: 'all', label: 'All tasks in this series' },
                      ].map(opt => (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg cursor-pointer text-xs font-semibold transition-all select-none ${
                            editScope === opt.id
                              ? opt.id === 'all'
                                ? 'border-amber-400 bg-amber-50 text-amber-800'
                                : 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="editScope"
                            value={opt.id}
                            checked={editScope === opt.id}
                            onChange={() => setEditScope(opt.id)}
                            className="w-3.5 h-3.5 accent-blue-600"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => { setEditingTask(null); setEditDraft(null); }}
                      className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditTask}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-md"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* QC Review Modal (management only) */}
        {qcReviewingTaskId && (() => {
          const reviewingTask = (clientLogs[selectedClient.id] || []).find(l => l.id === qcReviewingTaskId);
          if (!reviewingTask) return null;
          const handleSubmitReview = () => {
            const ratingNum = parseInt(qcReviewRating, 10);
            const validRating = !isNaN(ratingNum) && ratingNum >= 1 && ratingNum <= 10 ? ratingNum : null;
            if (qcReviewDecision === 'rejected' && !qcReviewFeedback.trim()) return;
            const feedbackText = qcReviewFeedback.trim();
            const updated = clientLogs[selectedClient.id].map(l => {
              if (l.id !== qcReviewingTaskId) return l;
              const existing = Array.isArray(l.feedbackThread) ? l.feedbackThread : [];
              const entry = feedbackText ? {
                id: `fb-${Date.now()}`,
                authorId: currentUser?.id || null,
                authorName: currentUser?.name || 'Reviewer',
                text: feedbackText,
                type: qcReviewDecision,
                timestamp: new Date().toISOString(),
              } : null;
              return {
                ...l,
                status: qcReviewDecision === 'rejected' ? 'Pending' : l.status,
                qcStatus: qcReviewDecision,
                qcRating: validRating,
                qcFeedback: feedbackText || null,
                qcReviewedAt: new Date().toISOString(),
                qcReviewerName: currentUser?.name || null,
                feedbackThread: entry ? [...existing, entry] : existing,
              };
            });
            setClientLogs({ ...clientLogs, [selectedClient.id]: updated });
            setQcReviewingTaskId(null);
            setQcReviewRating('');
            setQcReviewFeedback('');
          };
          return (
            <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={17} className="text-indigo-600" />
                    <h3 className="text-base font-bold text-slate-800">QC Review</h3>
                  </div>
                  <button onClick={() => setQcReviewingTaskId(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"><X size={16}/></button>
                </div>
                <div className="px-6 py-4 space-y-4">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Task</p>
                    <p className="text-sm font-medium text-slate-700 line-clamp-3">{reviewingTask.comment}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Assigned to: {reviewingTask.assigneeName}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision</label>
                    <div className="flex gap-3">
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all flex-1 justify-center ${qcReviewDecision === 'approved' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input type="radio" name="qcDecision" value="approved" checked={qcReviewDecision === 'approved'} onChange={() => setQcReviewDecision('approved')} className="sr-only" />
                        <ThumbsUp size={14} /> <span className="text-xs font-semibold">Approve</span>
                      </label>
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all flex-1 justify-center ${qcReviewDecision === 'rejected' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input type="radio" name="qcDecision" value="rejected" checked={qcReviewDecision === 'rejected'} onChange={() => setQcReviewDecision('rejected')} className="sr-only" />
                        <ThumbsDown size={14} /> <span className="text-xs font-semibold">Return</span>
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rating (1–10) <span className="text-slate-400 font-normal normal-case">optional</span></label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setQcReviewRating(String(n) === qcReviewRating ? '' : String(n))}
                          className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${String(n) === qcReviewRating ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Feedback {qcReviewDecision === 'rejected' && <span className="text-red-500">*</span>}
                    </label>
                    <textarea
                      className="w-full h-24 p-3 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-indigo-500/20 resize-none bg-slate-50"
                      placeholder={qcReviewDecision === 'rejected' ? 'Describe what needs to be fixed...' : 'Optional comments...'}
                      value={qcReviewFeedback}
                      onChange={e => setQcReviewFeedback(e.target.value)}
                    />
                    {qcReviewDecision === 'rejected' && !qcReviewFeedback.trim() && (
                      <p className="text-[10px] text-red-500 font-medium">Feedback is required when returning a task.</p>
                    )}
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setQcReviewingTaskId(null)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitReview}
                    disabled={qcReviewDecision === 'rejected' && !qcReviewFeedback.trim()}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${qcReviewDecision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {qcReviewDecision === 'approved' ? 'Approve Task' : 'Return to Employee'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Task Detail Panel */}
        {detailTask && (
          <TaskDetailPanel
            task={detailTask}
            currentUser={currentUser}
            users={users}
            canEdit={canFullyEditTask(detailTask)}
            setNotifications={setNotifications}
            onClose={() => setDetailTask(null)}
            onUpdate={(updatedTask) => {
              const updatedLogs = (clientLogs[selectedClient.id] || []).map(l =>
                l.id === updatedTask.id ? { ...l, ...updatedTask } : l
              );
              setClientLogs({ ...clientLogs, [selectedClient.id]: updatedLogs });
              setDetailTask(updatedTask);
            }}
          />
        )}

        {/* ─── TEMPLATE PICKER MODAL ─── */}
        {showTemplateModal && (() => {
          const projectStaffForTpl = getProjectStaff(selectedClient.name);
          const assignableForTpl = [...projectStaffForTpl.admins, ...projectStaffForTpl.employees];
          const filteredTpls = templateSearch.trim()
            ? taskTemplates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase()))
            : taskTemplates;
          const selectedTpl = taskTemplates.find(t => t.id === selectedTemplateId) || null;
          const repeatBadge = (freq) => {
            if (freq === 'Daily') return 'bg-rose-100 text-rose-700';
            if (freq === 'Weekly') return 'bg-amber-100 text-amber-700';
            if (freq === 'Monthly') return 'bg-blue-100 text-blue-700';
            return 'bg-slate-100 text-slate-600';
          };

          // Per-task config helpers
          const updateTaskConfig = (idx, field, value) => {
            setPerTaskConfig(prev => {
              const next = [...prev];
              next[idx] = { ...next[idx], [field]: value };
              return next;
            });
            setTemplateApplyError('');
          };

          // "Set all" filtered lists
          const filteredSetAllAssignees = setAllAssigneeQuery.trim()
            ? assignableForTpl.filter(u => u.name.toLowerCase().includes(setAllAssigneeQuery.toLowerCase()))
            : assignableForTpl;
          const filteredSetAllQc = setAllQcAssigneeQuery.trim()
            ? assignableForTpl.filter(u => u.name.toLowerCase().includes(setAllQcAssigneeQuery.toLowerCase()))
            : assignableForTpl;
          return (
            <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col" style={{maxHeight:'88vh'}}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      {templateStep === 1 ? 'Choose a Template' : `Apply "${selectedTpl?.name}"`}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {templateStep === 1
                        ? 'Select a template to preview its tasks, then continue.'
                        : 'Configure dates and assignees for each task individually.'}
                    </p>
                  </div>
                  <button onClick={closeTemplateModal} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"><X size={16}/></button>
                </div>

                {/* Step 1: Template list + preview */}
                {templateStep === 1 && (
                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Left: template list */}
                    <div className="w-1/2 border-r border-slate-100 flex flex-col">
                      <div className="p-3 border-b border-slate-100">
                        <div className="relative">
                          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                          <input
                            value={templateSearch}
                            onChange={e => setTemplateSearch(e.target.value)}
                            placeholder="Search templates..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
                          />
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredTpls.length === 0 && (
                          <p className="text-center text-sm text-slate-400 py-6">No templates found</p>
                        )}
                        {filteredTpls.map(tpl => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => setSelectedTemplateId(tpl.id)}
                            className={`w-full text-left p-3 rounded-xl border transition-all ${
                              selectedTemplateId === tpl.id
                                ? 'bg-blue-50 border-blue-200'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`text-sm font-semibold ${selectedTemplateId === tpl.id ? 'text-blue-700' : 'text-slate-800'}`}>{tpl.name}</p>
                              {tpl.isPrebuilt && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Prebuilt</span>
                              )}
                            </div>
                            {tpl.description && (
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{tpl.description}</p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">{(tpl.tasks || []).length} tasks</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Right: preview */}
                    <div className="w-1/2 flex flex-col">
                      {!selectedTpl ? (
                        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                          Select a template to preview
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                          <p className="text-xs font-bold text-slate-700 mb-2">Tasks in this template</p>
                          {(selectedTpl.tasks || []).map((task, idx) => (
                            <div key={idx} className="flex items-start gap-2 p-2.5 bg-white rounded-lg border border-slate-200">
                              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                {task.name && <p className="text-xs font-semibold text-slate-800 leading-snug">{task.name}</p>}
                                <p className="text-xs text-slate-700 leading-snug mt-0.5">{task.comment}</p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {task.category && (
                                    <span className="text-[9px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">{task.category}</span>
                                  )}
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${repeatBadge(task.repeatFrequency)}`}>
                                    {task.repeatFrequency}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Per-task configuration */}
                {templateStep === 2 && (
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* "Set all" defaults row */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Set All (apply defaults to every task)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-500">Start Date</label>
                          <DatePicker
                            selected={setAllStartDate}
                            onChange={date => {
                              setSetAllStartDate(date);
                              if (setAllDueDate && date && date > setAllDueDate) setSetAllDueDate(null);
                              setPerTaskConfig(prev => prev.map(cfg => ({
                                ...cfg,
                                startDate: date,
                                dueDate: cfg.dueDate && date && date > cfg.dueDate ? null : cfg.dueDate,
                              })));
                            }}
                            dateFormat="do MMM yyyy"
                            className="w-full border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-500">Due Date</label>
                          <DatePicker
                            selected={setAllDueDate}
                            onChange={date => {
                              setSetAllDueDate(date);
                              setPerTaskConfig(prev => prev.map(cfg => ({ ...cfg, dueDate: date })));
                            }}
                            dateFormat="do MMM yyyy"
                            isClearable
                            placeholderText="Optional"
                            minDate={setAllStartDate || new Date()}
                            className="w-full border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-500">Assignee</label>
                          <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input
                              value={setAllAssigneeQuery}
                              onChange={e => { setSetAllAssigneeQuery(e.target.value); setSetAllAssigneeId(''); }}
                              placeholder="Search..."
                              className="w-full bg-white border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                            />
                          </div>
                          {setAllAssigneeQuery.trim() && (
                            <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                              {filteredSetAllAssignees.map(u => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    setSetAllAssigneeId(u.id);
                                    setSetAllAssigneeQuery(u.name);
                                    setPerTaskConfig(prev => prev.map(cfg => ({ ...cfg, assigneeId: u.id })));
                                  }}
                                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 ${String(setAllAssigneeId) === String(u.id) ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'}`}
                                >
                                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{(u.name||'?')[0].toUpperCase()}</span>
                                  {u.name}
                                </button>
                              ))}
                              {filteredSetAllAssignees.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No results</p>}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-500">QC Assignee <span className="text-slate-400">(optional)</span></label>
                          <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input
                              value={setAllQcAssigneeQuery}
                              onChange={e => { setSetAllQcAssigneeQuery(e.target.value); setSetAllQcAssigneeId(''); }}
                              placeholder="Search..."
                              className="w-full bg-white border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                            />
                          </div>
                          {setAllQcAssigneeQuery.trim() && (
                            <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                              {filteredSetAllQc.map(u => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    setSetAllQcAssigneeId(u.id);
                                    setSetAllQcAssigneeQuery(u.name);
                                    setPerTaskConfig(prev => prev.map(cfg => ({ ...cfg, qcAssigneeId: u.id })));
                                  }}
                                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 ${String(setAllQcAssigneeId) === String(u.id) ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'}`}
                                >
                                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{(u.name||'?')[0].toUpperCase()}</span>
                                  {u.name}
                                </button>
                              ))}
                              {filteredSetAllQc.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No results</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Per-task rows */}
                    <div className="space-y-3">
                      {(selectedTpl?.tasks || []).map((taskItem, idx) => {
                        const cfg = perTaskConfig[idx] || {};
                        const assignee = assignableForTpl.find(u => String(u.id) === String(cfg.assigneeId));
                        const qcAssignee = cfg.qcAssigneeId ? assignableForTpl.find(u => String(u.id) === String(cfg.qcAssigneeId)) : null;
                        const rowAssigneeQuery = cfg._assigneeQuery || (assignee ? assignee.name : '');
                        const rowQcQuery = cfg._qcQuery || (qcAssignee ? qcAssignee.name : '');
                        const filteredRowAssignees = (cfg._assigneeQuery || '') !== '' && !assignee
                          ? assignableForTpl.filter(u => u.name.toLowerCase().includes((cfg._assigneeQuery||'').toLowerCase()))
                          : [];
                        const filteredRowQc = (cfg._qcQuery || '') !== '' && !qcAssignee
                          ? assignableForTpl.filter(u => u.name.toLowerCase().includes((cfg._qcQuery||'').toLowerCase()))
                          : [];
                        const missingAssignee = !cfg.assigneeId;

                        return (
                          <div key={idx} className={`border rounded-xl p-3 space-y-2 ${missingAssignee ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'}`}>
                            {/* Task header */}
                            <div className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                {taskItem.name && <p className="text-xs font-semibold text-slate-800 leading-snug">{taskItem.name}</p>}
                                <p className="text-xs font-medium text-slate-500 leading-snug mt-0.5">{taskItem.comment}</p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {taskItem.category && (
                                    <span className="text-[9px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">{taskItem.category}</span>
                                  )}
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${repeatBadge(taskItem.repeatFrequency)}`}>{taskItem.repeatFrequency}</span>
                                </div>
                              </div>
                            </div>

                            {/* Row controls */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-slate-500">Start Date</label>
                                <DatePicker
                                  selected={cfg.startDate || null}
                                  onChange={date => {
                                    updateTaskConfig(idx, 'startDate', date);
                                    if (cfg.dueDate && date && date > cfg.dueDate) updateTaskConfig(idx, 'dueDate', null);
                                  }}
                                  dateFormat="do MMM yyyy"
                                  placeholderText="Pick date"
                                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-slate-500">Due Date</label>
                                <DatePicker
                                  selected={cfg.dueDate || null}
                                  onChange={date => updateTaskConfig(idx, 'dueDate', date)}
                                  dateFormat="do MMM yyyy"
                                  isClearable
                                  placeholderText="Optional"
                                  minDate={cfg.startDate || new Date()}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {/* Assignee picker per task */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-slate-500">Assignee <span className="text-red-500">*</span></label>
                                <div className="relative">
                                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                                  <input
                                    value={rowAssigneeQuery}
                                    onChange={e => {
                                      updateTaskConfig(idx, '_assigneeQuery', e.target.value);
                                      updateTaskConfig(idx, 'assigneeId', '');
                                    }}
                                    placeholder="Search..."
                                    className={`w-full border rounded-lg pl-6 pr-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20 ${missingAssignee ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                                  />
                                </div>
                                {(cfg._assigneeQuery || '') !== '' && !cfg.assigneeId && (
                                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                                    {filteredRowAssignees.map(u => (
                                      <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => {
                                          updateTaskConfig(idx, 'assigneeId', u.id);
                                          updateTaskConfig(idx, '_assigneeQuery', u.name);
                                        }}
                                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 text-slate-700"
                                      >
                                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{(u.name||'?')[0].toUpperCase()}</span>
                                        {u.name}
                                      </button>
                                    ))}
                                    {filteredRowAssignees.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No results</p>}
                                  </div>
                                )}
                                {assignee && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">{(assignee.name||'?')[0].toUpperCase()}</span>
                                    <span className="text-[10px] font-semibold text-blue-700">{assignee.name}</span>
                                    <button type="button" onClick={() => { updateTaskConfig(idx, 'assigneeId', ''); updateTaskConfig(idx, '_assigneeQuery', ''); }} className="ml-auto text-slate-400 hover:text-red-500"><X size={10}/></button>
                                  </div>
                                )}
                              </div>

                              {/* QC picker per task */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-slate-500">QC Assignee <span className="text-slate-400">(optional)</span></label>
                                <div className="relative">
                                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                                  <input
                                    value={rowQcQuery}
                                    onChange={e => {
                                      updateTaskConfig(idx, '_qcQuery', e.target.value);
                                      updateTaskConfig(idx, 'qcAssigneeId', '');
                                    }}
                                    placeholder="Search..."
                                    className="w-full border border-slate-200 bg-white rounded-lg pl-6 pr-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                                  />
                                </div>
                                {(cfg._qcQuery || '') !== '' && !cfg.qcAssigneeId && (
                                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                                    {filteredRowQc.map(u => (
                                      <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => {
                                          updateTaskConfig(idx, 'qcAssigneeId', u.id);
                                          updateTaskConfig(idx, '_qcQuery', u.name);
                                        }}
                                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 text-slate-700"
                                      >
                                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{(u.name||'?')[0].toUpperCase()}</span>
                                        {u.name}
                                      </button>
                                    ))}
                                    {filteredRowQc.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No results</p>}
                                  </div>
                                )}
                                {qcAssignee && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">{(qcAssignee.name||'?')[0].toUpperCase()}</span>
                                    <span className="text-[10px] font-semibold text-indigo-700">{qcAssignee.name}</span>
                                    <button type="button" onClick={() => { updateTaskConfig(idx, 'qcAssigneeId', ''); updateTaskConfig(idx, '_qcQuery', ''); }} className="ml-auto text-slate-400 hover:text-red-500"><X size={10}/></button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Recurrence controls for repeating tasks */}
                            {taskItem.repeatFrequency === 'Weekly' && (
                              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repeat on Days</label>
                                <div className="flex gap-1.5 flex-wrap">
                                  {WEEKDAY_SHORT.map((d, i) => (
                                    <button
                                      key={i} type="button"
                                      onClick={() => updateTaskConfig(idx, 'repeatDays',
                                        (cfg.repeatDays || []).includes(i)
                                          ? (cfg.repeatDays || []).filter(x => x !== i)
                                          : [...(cfg.repeatDays || []), i]
                                      )}
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${(cfg.repeatDays || []).includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                                    >{d}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {taskItem.repeatFrequency === 'Monthly' && (
                              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repeat on</label>
                                <div className="flex gap-2">
                                  <select
                                    value={cfg.repeatMonthlyWeek || 1}
                                    onChange={e => updateTaskConfig(idx, 'repeatMonthlyWeek', Number(e.target.value))}
                                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 outline-none bg-white"
                                  >
                                    {WEEK_ORDINALS.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
                                  </select>
                                  <select
                                    value={cfg.repeatMonthlyDay !== undefined ? cfg.repeatMonthlyDay : 0}
                                    onChange={e => updateTaskConfig(idx, 'repeatMonthlyDay', Number(e.target.value))}
                                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 outline-none bg-white"
                                  >
                                    {WEEKDAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                  </select>
                                </div>
                                <p className="text-[10px] text-blue-600 font-medium">
                                  {WEEK_ORDINALS[(cfg.repeatMonthlyWeek || 1) - 1]} {WEEKDAY_FULL[cfg.repeatMonthlyDay !== undefined ? cfg.repeatMonthlyDay : 0]} of each month
                                </p>
                              </div>
                            )}
                            {taskItem.repeatFrequency !== 'Once' && (
                              <div className="space-y-1 pt-1 border-t border-slate-100">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Repeat Until <span className="text-slate-400 font-normal normal-case">(contract end date)</span>
                                </label>
                                <DatePicker
                                  selected={cfg.repeatEnd || null}
                                  onChange={date => updateTaskConfig(idx, 'repeatEnd', date)}
                                  dateFormat="do MMM yyyy"
                                  isClearable
                                  placeholderText="No end date"
                                  minDate={cfg.startDate || new Date()}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 ring-blue-500/20"
                                />
                                {cfg.repeatEnd && cfg.startDate && (() => {
                                  const cnt = generateRecurringDates(
                                    cfg.startDate, cfg.repeatEnd, taskItem.repeatFrequency,
                                    cfg.repeatDays, cfg.repeatMonthlyWeek, cfg.repeatMonthlyDay
                                  ).length;
                                  return <p className="text-[10px] text-blue-600 font-medium">Will create {cnt} task{cnt !== 1 ? 's' : ''}</p>;
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {templateApplyError && (
                      <p className="text-xs font-semibold text-red-500">{templateApplyError}</p>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-100">
                  <button
                    onClick={templateStep === 1 ? closeTemplateModal : () => setTemplateStep(1)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    {templateStep === 1 ? 'Cancel' : 'Back'}
                  </button>
                  {templateStep === 1 ? (
                    <button
                      disabled={!selectedTemplateId}
                      onClick={() => {
                        const tpl = taskTemplates.find(t => t.id === selectedTemplateId);
                        if (tpl) {
                          resetPerTaskDefaults();
                          setPerTaskConfig((tpl.tasks || []).map((taskItem) => ({
                            startDate: new Date(),
                            dueDate: null,
                            repeatEnd: null,
                            repeatDays: [0, 1, 2, 3, 4],
                            repeatMonthlyWeek: 1,
                            repeatMonthlyDay: 0,
                            assigneeId: '',
                            qcAssigneeId: '',
                            _assigneeQuery: '',
                            _qcQuery: '',
                          })));
                        }
                        setTemplateStep(2);
                      }}
                      className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  ) : (
                    <button
                      onClick={handleApplyTemplate}
                      className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm"
                    >
                      Apply Template
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* QC Reviewer Picker — rendered inside selectedClient view so it mounts when the Add Task form is open */}
      {activePicker === 'qcReviewer' && (() => {
        const clientStaff = getProjectStaff(selectedClient.name);
        const reviewerUsers = clientStaff.admins.length
          ? clientStaff.admins
          : (users || []).filter(u => managementRoles.includes(u.role));
        return (
          <UserPickerModal
            title="Select QC Reviewer"
            users={reviewerUsers}
            selected={qcAssigneeId ? [qcAssigneeId] : []}
            onToggle={id => {
              const picked = reviewerUsers.find(u => u.id === id);
              if (picked) {
                setQcAssigneeId(qcAssigneeId === id ? '' : id);
                setQcAssigneeName(qcAssigneeId === id ? '' : picked.name);
              }
              setActivePicker(null);
            }}
            onClose={() => setActivePicker(null)}
            pickerSearch={pickerSearch}
            setPickerSearch={setPickerSearch}
          />
        );
      })()}
      </div>
    );
  }

  // --- GRID VIEW ---
  const isSuperAdmin = currentUser?.role === 'Super Admin';

  // "My Clients" — always driven by explicit assignment on the user record,
  // even for Super Admins (accessibleClients for SA = all clients for task access,
  // but the card list should only show where they're explicitly added).
  const explicitlyAssignedIds = new Set(
    clients
      .filter(c => currentUser?.assignedProjects?.includes(c.name))
      .map(c => c.id)
  );

  // "Available" for non-Super-Admin: only clients where the user's department
  // is already represented (at least one assigned user shares their department).
  const departmentLinkedClientNames = isSuperAdmin
    ? null
    : new Set(
        (users || [])
          .filter(u => u.department === currentUser?.department && String(u.id) !== String(currentUser?.id))
          .flatMap(u => u.assignedProjects || [])
      );

  const searchLower = clientSearch.toLowerCase();

  const myClients = clients.filter(c =>
    explicitlyAssignedIds.has(c.id) && c.name.toLowerCase().includes(searchLower)
  );
  const pendingClients = clients.filter(c =>
    !explicitlyAssignedIds.has(c.id) &&
    (c.joinRequests || []).some(r => r.requesterId === currentUser?.id) &&
    c.name.toLowerCase().includes(searchLower)
  );
  const pendingClientIds = new Set(pendingClients.map(c => c.id));
  const availableClients = clients.filter(c => {
    if (explicitlyAssignedIds.has(c.id)) return false;
    if (pendingClientIds.has(c.id)) return false;
    if (!c.name.toLowerCase().includes(searchLower)) return false;
    // Super Admins see all non-assigned clients as Available
    if (isSuperAdmin) return true;
    // Other users only see Available clients where their department is represented
    return departmentLinkedClientNames?.has(c.name) ?? false;
  });
  const filteredClients = clientViewFilter === 'mine' ? myClients : clientViewFilter === 'pending' ? pendingClients : availableClients;

  // --- PICKER CONFIG (only qcReviewer remains here) ---
  const pickerAllUsers = users || [];

  return (
    <div className="p-3 space-y-5 animate-in fade-in duration-500 text-left min-h-full">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input type="text" placeholder="Filter Clients..." className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 ring-blue-500/20 shadow-sm text-slate-700" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setClientViewFilter('mine')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${clientViewFilter === 'mine' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >My Clients <span className="ml-1 text-[10px] font-bold text-blue-500">{myClients.length}</span></button>
            {pendingClients.length > 0 && (
              <button
                onClick={() => setClientViewFilter('pending')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${clientViewFilter === 'pending' ? 'bg-white text-amber-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >Waiting for Approval <span className="ml-1 text-[10px] font-bold text-amber-500">{pendingClients.length}</span></button>
            )}
            <button
              onClick={() => setClientViewFilter('available')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${clientViewFilter === 'available' ? 'bg-white text-violet-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >Available <span className="ml-1 text-[10px] font-bold text-violet-500">{availableClients.length}</span></button>
          </div>
          <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => { setClientDisplayMode('cards'); localStorage.setItem('clientDisplayMode', 'cards'); }}
              title="Card view"
              className={`p-1.5 rounded-md transition-all ${clientDisplayMode === 'cards' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            ><LayoutGrid size={14} /></button>
            <button
              onClick={() => { setClientDisplayMode('list'); localStorage.setItem('clientDisplayMode', 'list'); }}
              title="List view"
              className={`p-1.5 rounded-md transition-all ${clientDisplayMode === 'list' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            ><LayoutList size={14} /></button>
          </div>
        </div>
      </div>

      {filteredClients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Users size={36} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {clientViewFilter === 'mine' ? 'No clients assigned to you yet.' : clientViewFilter === 'pending' ? 'No pending requests.' : 'No available clients to request.'}
          </p>
        </div>
      )}

      {clientDisplayMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Always show Ethinos internal client in My Clients — card */}
          {clientViewFilter === 'mine' && (() => {
            const ethinos = syntheticClients.find(c => c.isEthinos);
            if (!ethinos) return null;
            if (clientSearch && !'ethinos'.includes(clientSearch.toLowerCase())) return null;
            const myEthinosTasks = (clientLogs['__ethinos__'] || []).filter(t => String(t.assigneeId) === String(currentUser?.id));
            const eOpen = myEthinosTasks.filter(t => t.status === 'Pending' && !t.archived).length;
            const eWip = myEthinosTasks.filter(t => t.status === 'WIP' && !t.archived).length;
            const eDone = myEthinosTasks.filter(t => t.status === 'Done' && !t.archived).length;
            return (
              <div
                key="__ethinos__"
                onClick={() => setSelectedClient(ethinos)}
                className="group bg-gradient-to-br from-indigo-50 to-white border-2 border-indigo-200 hover:border-indigo-400 hover:shadow-lg rounded-2xl p-4 shadow-sm transition-all cursor-pointer"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold uppercase tracking-tight text-indigo-900 group-hover:text-indigo-700 transition-all">Ethinos Internal</h3>
                    <p className="text-[10px] text-indigo-500 font-medium mt-0.5">Your internal tasks only</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex-shrink-0">Internal</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-orange-50 px-2 py-2 rounded-xl border border-orange-200 text-center">
                    <Clock size={14} className="text-orange-500 mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-orange-600">{eOpen}</p>
                    <p className="text-[9px] text-orange-500 font-medium">Pending</p>
                  </div>
                  <div className="bg-blue-50 px-2 py-2 rounded-xl border border-blue-200 text-center">
                    <Activity size={14} className="text-blue-500 mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-blue-600">{eWip}</p>
                    <p className="text-[9px] text-blue-500 font-medium">WIP</p>
                  </div>
                  <div className="bg-emerald-50 px-2 py-2 rounded-xl border border-emerald-200 text-center">
                    <CheckCircle size={14} className="text-emerald-500 mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-emerald-600">{eDone}</p>
                    <p className="text-[9px] text-emerald-500 font-medium">Done</p>
                  </div>
                </div>
              </div>
            );
          })()}
          {filteredClients.map(c => {
            const counts = getTaskCounts(c.id);
            const staff = getProjectStaff(c.name);
            const isAvailable = clientViewFilter === 'available';
            const isPending = clientViewFilter === 'pending';

            let avgTimeStr = '—';
            if (!isAvailable && !isPending) {
              const projectLogs = (clientLogs[c.id] || []).filter(t => isTaskVisible(t, currentUser));
              const dailyTotals = {};
              projectLogs.forEach(log => {
                if (!dailyTotals[log.date]) dailyTotals[log.date] = 0;
                dailyTotals[log.date] += log.elapsedMs || 0;
              });
              const uniqueDays = Object.keys(dailyTotals).length || 1;
              const totalMs = Object.values(dailyTotals).reduce((sum, ms) => sum + ms, 0);
              const avgMs = totalMs / uniqueDays;
              const avgHours = Math.floor(avgMs / 3600000);
              const avgMinutes = Math.floor((avgMs % 3600000) / 60000);
              avgTimeStr = avgHours > 0 ? `${avgHours}h ${avgMinutes}m` : `${avgMinutes}m`;
            }

            return (
              <div
                key={c.id}
                onClick={!isAvailable && !isPending ? () => { setTaskStatusFilter('All'); setSelectedClient(c); } : undefined}
                className={`group bg-white border-2 rounded-2xl p-4 shadow-sm transition-all ${
                  isPending
                    ? 'border-amber-200 bg-amber-50/30'
                    : isAvailable
                      ? 'border-slate-200 hover:border-violet-300 hover:shadow-md'
                      : 'border-slate-200 hover:shadow-lg hover:border-blue-400 cursor-pointer'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className={`text-base font-bold uppercase tracking-tight transition-all ${isAvailable || isPending ? 'text-slate-700' : 'text-slate-900 group-hover:text-blue-600'}`}>{c.name}</h3>
                  {!isAvailable && !isPending && (
                    <div className="bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200 flex-shrink-0">
                      <p className="text-[8px] font-semibold text-purple-600">AVG</p>
                      <p className="text-xs font-bold text-purple-700">{avgTimeStr}</p>
                    </div>
                  )}
                  {isAvailable && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">Unassigned</span>
                  )}
                  {isPending && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-300 flex items-center gap-1">
                      <Hourglass size={9} /> Pending
                    </span>
                  )}
                </div>
                {staff.admins.length > 0 && (
                  <div className="mb-3 pb-3 border-b border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Leadership</p>
                    <div className="flex flex-wrap gap-1.5">
                      {staff.admins.map(admin => (
                        <div key={admin.id} className="flex items-center gap-1 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-300">
                          <Crown size={10} className="text-blue-600 fill-blue-600" />
                          <span className="text-xs font-semibold text-blue-700">{admin.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {staff.employees.length > 0 && (
                  <div className="mb-3 pb-3 border-b border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Team</p>
                    <div className="flex flex-wrap gap-1.5">
                      {staff.employees.map(emp => (
                        <div key={emp.id} className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 shadow-sm">
                          <span className="text-xs font-semibold text-slate-600">{emp.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isAvailable && !isPending && (
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {[
                      { label: 'Pending',  value: counts.open,          filter: 'Pending', icon: <Clock size={13} className="text-orange-500 mx-auto mb-0.5"/>,   bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-600',  subtext: 'text-orange-400' },
                      { label: 'WIP',      value: counts.wip,           filter: 'WIP',     icon: <Activity size={13} className="text-blue-500 mx-auto mb-0.5"/>,    bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-600',    subtext: 'text-blue-400' },
                      { label: 'Done',     value: counts.done,          filter: 'Done',    icon: <CheckCircle size={13} className="text-emerald-500 mx-auto mb-0.5"/>, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', subtext: 'text-emerald-400' },
                      { label: 'Today',    value: counts.dueToday,      filter: 'Today',   icon: <Calendar size={13} className="text-amber-500 mx-auto mb-0.5"/>,    bg: counts.dueToday > 0 ? 'bg-amber-50' : 'bg-slate-50',  border: counts.dueToday > 0 ? 'border-amber-300' : 'border-slate-200', text: counts.dueToday > 0 ? 'text-amber-600' : 'text-slate-400',  subtext: counts.dueToday > 0 ? 'text-amber-400' : 'text-slate-300' },
                      { label: 'Overdue',  value: counts.overdue,       filter: 'Overdue', icon: <AlertTriangle size={13} className={`${counts.overdue > 0 ? 'text-red-500' : 'text-slate-400'} mx-auto mb-0.5`}/>, bg: counts.overdue > 0 ? 'bg-red-50' : 'bg-slate-50', border: counts.overdue > 0 ? 'border-red-300' : 'border-slate-200', text: counts.overdue > 0 ? 'text-red-600' : 'text-slate-400', subtext: counts.overdue > 0 ? 'text-red-400' : 'text-slate-300' },
                      { label: '48H+',     value: counts.recentPending, filter: '48H+',    icon: <Hourglass size={13} className={`${counts.recentPending > 0 ? 'text-rose-500' : 'text-slate-400'} mx-auto mb-0.5`}/>, bg: counts.recentPending > 0 ? 'bg-rose-50' : 'bg-slate-50', border: counts.recentPending > 0 ? 'border-rose-300' : 'border-slate-200', text: counts.recentPending > 0 ? 'text-rose-600' : 'text-slate-400', subtext: counts.recentPending > 0 ? 'text-rose-400' : 'text-slate-300' },
                    ].map(({ label, value, filter, icon, bg, border, text, subtext }) => (
                      <button
                        key={label}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaskStatusFilter(filter);
                          setSelectedClient(c);
                        }}
                        className={`${bg} px-2 py-1.5 rounded-xl border ${border} text-center transition-all hover:opacity-80 hover:scale-[1.03] active:scale-95 cursor-pointer`}
                      >
                        {icon}
                        <p className={`text-xs font-bold ${text}`}>{value}</p>
                        <p className={`text-[9px] font-medium ${subtext}`}>{label}</p>
                      </button>
                    ))}
                  </div>
                )}
                {isPending ? (
                  <button disabled className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 bg-amber-50 text-amber-600 border border-amber-300 cursor-default">
                    <Hourglass size={14} /> Waiting for Approval
                  </button>
                ) : isAvailable ? (
                  <button
                    onClick={() => handleRequestClientAssignment(c)}
                    className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600 shadow-md"
                  >
                    <UserPlus size={14} /> Request to Join
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedClient(c)}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:from-blue-700 hover:to-blue-600 transition-all shadow-md group-hover:shadow-lg"
                  >
                    <Eye size={15} /> View Tasks
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <div className="flex flex-col divide-y divide-slate-100 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Ethinos internal — list row */}
          {clientViewFilter === 'mine' && (() => {
            const ethinos = syntheticClients.find(c => c.isEthinos);
            if (!ethinos) return null;
            if (clientSearch && !'ethinos'.includes(clientSearch.toLowerCase())) return null;
            const myEthinosTasks = (clientLogs['__ethinos__'] || []).filter(t => String(t.assigneeId) === String(currentUser?.id));
            const eOpen = myEthinosTasks.filter(t => t.status === 'Pending' && !t.archived).length;
            const eWip = myEthinosTasks.filter(t => t.status === 'WIP' && !t.archived).length;
            const eDone = myEthinosTasks.filter(t => t.status === 'Done' && !t.archived).length;
            return (
              <div
                key="__ethinos__"
                onClick={() => setSelectedClient(ethinos)}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/60 cursor-pointer transition-all"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold uppercase tracking-tight text-indigo-900 group-hover:text-indigo-700 transition-all">Ethinos Internal</span>
                  <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 border border-indigo-200">Internal</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
                    <Clock size={10}/> {eOpen}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                    <Activity size={10}/> {eWip}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <CheckCircle size={10}/> {eDone}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedClient(ethinos)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                >
                  <Eye size={12}/> View
                </button>
              </div>
            );
          })()}
          {filteredClients.length === 0 && !syntheticClients.find(c => c.isEthinos) && (
            <div className="py-10 text-center text-slate-400 text-sm">No clients found.</div>
          )}
          {filteredClients.map(c => {
            const counts = getTaskCounts(c.id);
            const staff = getProjectStaff(c.name);
            const isAvailable = clientViewFilter === 'available';
            const isPending = clientViewFilter === 'pending';

            let avgTimeStr = null;
            if (!isAvailable && !isPending) {
              const projectLogs = (clientLogs[c.id] || []).filter(t => isTaskVisible(t, currentUser));
              const dailyTotals = {};
              projectLogs.forEach(log => {
                if (!dailyTotals[log.date]) dailyTotals[log.date] = 0;
                dailyTotals[log.date] += log.elapsedMs || 0;
              });
              const uniqueDays = Object.keys(dailyTotals).length || 1;
              const totalMs = Object.values(dailyTotals).reduce((sum, ms) => sum + ms, 0);
              const avgMs = totalMs / uniqueDays;
              const avgHours = Math.floor(avgMs / 3600000);
              const avgMinutes = Math.floor((avgMs % 3600000) / 60000);
              avgTimeStr = avgHours > 0 ? `${avgHours}h ${avgMinutes}m` : `${avgMinutes}m`;
            }

            const leaderNames = staff.admins.slice(0, 2).map(a => a.name);
            const extraLeaders = staff.admins.length > 2 ? staff.admins.length - 2 : 0;

            return (
              <div
                key={c.id}
                onClick={!isAvailable && !isPending ? () => { setTaskStatusFilter('All'); setSelectedClient(c); } : undefined}
                className={`group flex items-center gap-3 px-4 py-3 transition-all ${
                  isPending
                    ? 'bg-amber-50/40'
                    : isAvailable
                      ? 'hover:bg-slate-50'
                      : 'hover:bg-blue-50/40 cursor-pointer'
                }`}
              >
                {/* Name + leadership */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-bold uppercase tracking-tight truncate transition-all ${isAvailable || isPending ? 'text-slate-700' : 'text-slate-900 group-hover:text-blue-700'}`}>
                      {c.name}
                    </span>
                    {isPending && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-300 flex-shrink-0">
                        <Hourglass size={8}/> Pending
                      </span>
                    )}
                    {isAvailable && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 flex-shrink-0">Unassigned</span>
                    )}
                  </div>
                  {leaderNames.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Crown size={9} className="text-blue-400 flex-shrink-0"/>
                      <span className="text-[11px] text-slate-400 truncate">
                        {leaderNames.join(', ')}{extraLeaders > 0 ? ` +${extraLeaders}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status pills — only for assigned clients */}
                {!isAvailable && !isPending && (
                  <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setTaskStatusFilter('Pending'); setSelectedClient(c); }} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-all">
                      <Clock size={10}/> {counts.open}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setTaskStatusFilter('WIP'); setSelectedClient(c); }} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-all">
                      <Activity size={10}/> {counts.wip}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setTaskStatusFilter('Done'); setSelectedClient(c); }} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-all">
                      <CheckCircle size={10}/> {counts.done}
                    </button>
                    {counts.dueToday > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); setTaskStatusFilter('Today'); setSelectedClient(c); }} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-300 hover:bg-amber-100 transition-all">
                        <Calendar size={10}/> {counts.dueToday}
                      </button>
                    )}
                    {counts.overdue > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); setTaskStatusFilter('Overdue'); setSelectedClient(c); }} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-300 hover:bg-red-100 transition-all">
                        <AlertTriangle size={10}/> {counts.overdue}
                      </button>
                    )}
                    {counts.recentPending > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); setTaskStatusFilter('48H+'); setSelectedClient(c); }} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-300 hover:bg-rose-100 transition-all">
                        <Hourglass size={10}/> {counts.recentPending}
                      </button>
                    )}
                    {avgTimeStr && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-600 border border-purple-200 flex-shrink-0">
                        {avgTimeStr} avg
                      </span>
                    )}
                  </div>
                )}

                {/* Action */}
                <div className="flex-shrink-0">
                  {isPending ? (
                    <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-300 rounded-lg cursor-default">
                      <Hourglass size={11}/> Pending
                    </span>
                  ) : isAvailable ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRequestClientAssignment(c); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-all shadow-sm"
                    >
                      <UserPlus size={12}/> Request
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setTaskStatusFilter('All'); setSelectedClient(c); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm"
                    >
                      <Eye size={12}/> View
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QC Reviewer Picker (single-select, management only) */}
      {activePicker === 'qcReviewer' && selectedClient && (() => {
        const clientStaff = getProjectStaff(selectedClient.name);
        const managementUsers = clientStaff.admins;
        return (
          <UserPickerModal
            title="Select QC Reviewer"
            users={managementUsers.length ? managementUsers : (users || []).filter(u => managementRoles.includes(u.role))}
            selected={qcAssigneeId ? [qcAssigneeId] : []}
            onToggle={id => {
              const picked = (managementUsers.length ? managementUsers : (users || []).filter(u => managementRoles.includes(u.role))).find(u => u.id === id);
              if (picked) {
                setQcAssigneeId(qcAssigneeId === id ? '' : id);
                setQcAssigneeName(qcAssigneeId === id ? '' : picked.name);
              }
              setActivePicker(null);
            }}
            onClose={() => setActivePicker(null)}
            pickerSearch={pickerSearch}
            setPickerSearch={setPickerSearch}
          />
        );
      })()}
    </div>
  );
};

export default ClientView;

// client side is view needed here 

// Add a timer view to add a task