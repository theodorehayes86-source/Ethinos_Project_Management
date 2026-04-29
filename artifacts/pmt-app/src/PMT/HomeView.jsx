import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { format, parse, isBefore, addDays, differenceInCalendarDays } from 'date-fns';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Briefcase, Clock, Activity, AlertTriangle, ChevronRight, Plus, X, Search, ShieldCheck, Users, CheckCircle, XCircle, MinusCircle, Tag, Calendar, Archive, ArchiveRestore, LayoutTemplate, ChevronDown, ChevronUp, Play, Square, Pause, Send, ThumbsUp, ThumbsDown, RotateCcw, Pencil, ClipboardList, CheckSquare, Trash2 } from 'lucide-react';
import UserPickerModal from './UserPickerModal';
import TaskDetailPanel from './TaskDetailPanel';
import ChecklistGroupDetailPanel from './ChecklistGroupDetailPanel';
import { sendNotification } from '../utils/notify';
import { ReminderPills } from './ReminderPills';
import DueDateInput from './DueDateInput';
import LeaveConflictModal from './LeaveConflictModal';
import { checkLeaveConflict, toDateKey, getUserLeaveAndHolidayData, isFullDayLeaveOrHoliday, getUserLeaveStatus } from '../utils/leaveConflict';

const managementRoles = ['Super Admin', 'Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];

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

function parseDateStr(raw) {
  if (!raw) return null;
  const fmts = ['do MMM yyyy', 'd MMM yyyy', 'dd MMM yyyy', 'yyyy-MM-dd'];
  for (const fmt of fmts) {
    try {
      const d = parse(raw, fmt, new Date());
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch { /* continue */ }
  }
  return null;
}

function compareByDate(a, b) {
  const da = parseDateStr(a._sortKey);
  const db = parseDateStr(b._sortKey);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da - db;
}

const canFullyEditTaskFor = (task, currentUser) => {
  if (!currentUser || !task) return false;
  if (managementRoles.includes(currentUser.role)) return true;
  const myLevel = roleRank(currentUser.role);
  const creatorLevel = roleRank(task.creatorRole);
  if (creatorLevel > myLevel) return false;
  return String(task.creatorId) === String(currentUser.id);
};

const HomeView = ({
  accessibleClients,
  syntheticClients = [],
  allTasks,
  clientLogs,
  setSelectedClient,
  setClientLogs,
  currentUser,
  taskCategories = [],
  users = [],
  departments = [],
  onNavigateToClients,
  collapsedClients = new Set(),
  setCollapsedClients = () => {},
  setNotifications = () => {},
  taskTemplates = [],
  checklistTemplates = [],
  canCreateChecklists = false,
  taskGroups = [],
  setTaskGroups = () => {},
}) => {
  const isManagement = managementRoles.includes(currentUser?.role);
  const allClientOptions = useMemo(
    () => [...syntheticClients, ...accessibleClients],
    [syntheticClients, accessibleClients]
  );
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(
    isManagement ? (accessibleClients[0]?.id || '__personal__') : '__personal__'
  );
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskCategory, setTaskCategory] = useState('');
  const [taskCategoryQuery, setTaskCategoryQuery] = useState('');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [taskRepeat, setTaskRepeat] = useState('Once');
  const [taskRepeatEnd, setTaskRepeatEnd] = useState(null);
  const [taskRepeatDays, setTaskRepeatDays] = useState([]);
  const [taskRepeatMonthlyWeek, setTaskRepeatMonthlyWeek] = useState(1);
  const [taskRepeatMonthlyDay, setTaskRepeatMonthlyDay] = useState(0);
  const [taskName, setTaskName] = useState('');
  const [taskComment, setTaskComment] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);
  const [qcEnabled, setQcEnabled] = useState(false);
  const [qcAssigneeId, setQcAssigneeId] = useState('');
  const [qcAssigneeName, setQcAssigneeName] = useState('');
  const [showQcPicker, setShowQcPicker] = useState(false);
  const [qcPickerSearch, setQcPickerSearch] = useState('');
  const [taskError, setTaskError] = useState('');
  const [qcReviewingTask, setQcReviewingTask] = useState(null);
  const [qcReviewRating, setQcReviewRating] = useState('');
  const [qcReviewFeedback, setQcReviewFeedback] = useState('');
  const [qcReviewDecision, setQcReviewDecision] = useState('approved');
  const [taskDepartments, setTaskDepartments] = useState([]);
  const [taskBillable, setTaskBillable] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const taskListRef = useRef(null);
  const [estimatedHrs, setEstimatedHrs] = useState('');
  const [estimatedMins, setEstimatedMins] = useState('');
  const [taskReminders, setTaskReminders] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [leaveConflict, setLeaveConflict] = useState(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const acknowledgedLeaveRef = useRef(null);
  const [currentUserLeaveData, setCurrentUserLeaveData] = useState({});
  const [teamLeaveStatuses, setTeamLeaveStatuses] = useState({});
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    getUserLeaveAndHolidayData(String(currentUser.id)).then(data => {
      if (!cancelled) setCurrentUserLeaveData(data);
    });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isManagement || !users.length || !currentUser?.id) return;
    const directReports = users.filter(u => String(u.managerId) === String(currentUser.id));
    if (!directReports.length) return;
    let cancelled = false;
    Promise.all(
      directReports.map(u =>
        getUserLeaveStatus(String(u.id)).then(s => ({ id: String(u.id), name: u.name, ...s }))
      )
    ).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(r => { map[r.id] = r; });
      setTeamLeaveStatuses(map);
    });
    return () => { cancelled = true; };
  }, [isManagement, users, currentUser?.id]);

  useEffect(() => {
    const id = (assigneeId || '').toString();
    if (!id || !taskDueDate) { setLeaveConflict(null); setLeaveModalOpen(false); return; }
    const dateKey = toDateKey(taskDueDate);
    if (!dateKey) return;
    const comboKey = `${id}__${dateKey}`;
    let cancelled = false;
    checkLeaveConflict(id, taskDueDate).then(conflict => {
      if (!cancelled) {
        setLeaveConflict(conflict);
        if (conflict && acknowledgedLeaveRef.current !== comboKey) {
          setLeaveModalOpen(true);
        }
      }
    });
    return () => { cancelled = true; };
  }, [assigneeId, taskDueDate]);

  // --- Checklist Group state ---
  const [showNewChecklistModal, setShowNewChecklistModal] = useState(false);
  const [clSelectedTemplateId, setClSelectedTemplateId] = useState('');
  const [clSelectedClientId, setClSelectedClientId] = useState('');
  const [clSelectedDate, setClSelectedDate] = useState(new Date());
  const [clRepeatFreq, setClRepeatFreq] = useState('Once');
  const [clRepeatEnd, setClRepeatEnd] = useState(null);
  const [clAssigneeId, setClAssigneeId] = useState('');
  const [clAssigneeName, setClAssigneeName] = useState('');
  const [clAssigneeQuery, setClAssigneeQuery] = useState('');
  const [clShowAssigneeMenu, setClShowAssigneeMenu] = useState(false);
  const [clError, setClError] = useState('');
  const [detailGroup, setDetailGroup] = useState(null);

  // --- Edit task modal state ---
  const [editingTask, setEditingTask] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editDraftError, setEditDraftError] = useState('');
  const [editLeaveConflict, setEditLeaveConflict] = useState(null);
  const editAcknowledgedLeaveRef = useRef(null);

  useEffect(() => {
    const id = String(currentUser?.id || '');
    if (!id || !editDraft?.dueDate) { setEditLeaveConflict(null); return; }
    const dateKey = toDateKey(editDraft.dueDate);
    if (!dateKey) return;
    const comboKey = `${id}__${dateKey}`;
    if (editAcknowledgedLeaveRef.current === comboKey) return;
    let cancelled = false;
    checkLeaveConflict(id, editDraft.dueDate).then(conflict => {
      if (!cancelled) setEditLeaveConflict(conflict);
    });
    return () => { cancelled = true; };
  }, [currentUser?.id, editDraft?.dueDate]);
  const [editScope, setEditScope] = useState('one');
  const [editDraftCategoryQuery, setEditDraftCategoryQuery] = useState('');
  const [editDraftShowCategoryMenu, setEditDraftShowCategoryMenu] = useState(false);

  // --- Home Template state ---
  const [showHomeTemplateModal, setShowHomeTemplateModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);
  const [homeTemplateFilter, setHomeTemplateFilter] = useState('All');
  const [selectedHomeTemplateId, setSelectedHomeTemplateId] = useState(null);
  const [expandedTemplateTasks, setExpandedTemplateTasks] = useState({});

  const roleHomeTemplates = useMemo(() => {
    return taskTemplates.filter(t => {
      if (!t.isHomeTemplate) return false;
      if (!t.targetRoles || t.targetRoles.length === 0) return true;
      return t.targetRoles.includes(currentUser?.role);
    });
  }, [taskTemplates, currentUser]);

  const filteredHomeTemplates = useMemo(() => {
    if (homeTemplateFilter === 'All') return roleHomeTemplates;
    return roleHomeTemplates.filter(t =>
      (t.tasks || []).some(task => task.repeatFrequency === homeTemplateFilter)
    );
  }, [roleHomeTemplates, homeTemplateFilter]);

  const handleApplyHomeTemplate = () => {
    const tpl = roleHomeTemplates.find(t => t.id === selectedHomeTemplateId);
    if (!tpl) return;
    const today = format(new Date(), 'do MMM yyyy');
    const newTasks = (tpl.tasks || []).map((taskItem, i) => ({
      id: Date.now() + Math.random() + i,
      name: taskItem.name || taskItem.comment,
      comment: taskItem.comment || '',
      status: 'Pending',
      date: today,
      dueDate: null,
      assigneeId: currentUser?.id || null,
      assigneeName: currentUser?.name || null,
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || 'Employee',
      category: taskItem.category || 'Other',
      repeatFrequency: taskItem.repeatFrequency || 'Once',
      steps: (taskItem.steps || []).map((label, si) => ({
        id: `step-${Date.now()}-${i}-${si}`,
        label,
        checked: false,
      })),
      billable: false,
      departments: currentUser?.department ? [currentUser.department] : [],
      timerState: 'idle',
      timerStartedAt: null,
      elapsedMs: 0,
      timeTaken: null,
      result: '',
      qcEnabled: false,
      qcAssigneeId: null,
      qcAssigneeName: null,
      qcStatus: null,
      qcRating: null,
      qcFeedback: null,
      qcReviewedAt: null,
    }));
    const existing = clientLogs['__ethinos__'] || [];
    setClientLogs({ ...clientLogs, '__ethinos__': [...newTasks, ...existing] });
    setShowHomeTemplateModal(false);
    setSelectedHomeTemplateId(null);
    setHomeTemplateFilter('All');
    setExpandedTemplateTasks({});
  };

  const selectedClient = useMemo(
    () => allClientOptions.find(c => c.id === selectedClientId),
    [allClientOptions, selectedClientId]
  );

  const assignableUsers = useMemo(() => {
    if (!selectedClient || selectedClient.synthetic) return users;
    return users.filter(u => (u.assignedProjects || []).includes(selectedClient.name));
  }, [users, selectedClient]);

  const filteredAssignees = assignableUsers.filter(u =>
    !assigneeQuery.trim() || (u.name || '').toLowerCase().includes(assigneeQuery.toLowerCase())
  );

  const availableTaskCategories = taskCategories.length ? taskCategories : ['General'];
  const filteredTaskCategories = availableTaskCategories.filter(c =>
    c.toLowerCase().includes(taskCategoryQuery.toLowerCase())
  );

  const resetModal = () => {
    const defaultClientId = isManagement ? (accessibleClients[0]?.id || '__personal__') : '__personal__';
    setSelectedClientId(defaultClientId);
    setSelectedDate(new Date());
    setTaskCategory('');
    setTaskCategoryQuery('');
    setShowCategoryMenu(false);
    setTaskRepeat('Once');
    setTaskRepeatEnd(null);
    setTaskRepeatDays([]);
    setTaskRepeatMonthlyWeek(1);
    setTaskRepeatMonthlyDay(0);
    setTaskName('');
    setTaskComment('');
    setTaskDueDate(null);
    if (!isManagement) {
      setAssigneeId(currentUser?.id || '');
      setAssigneeName(currentUser?.name || '');
      setAssigneeQuery(currentUser?.name || '');
    } else {
      setAssigneeId('');
      setAssigneeName('');
      setAssigneeQuery('');
    }
    setShowAssigneeMenu(false);
    setQcEnabled(false);
    setQcAssigneeId('');
    setQcAssigneeName('');
    setShowQcPicker(false);
    setQcPickerSearch('');
    setTaskError('');
    setTaskDepartments(currentUser?.department ? [currentUser.department] : []);
    setTaskBillable(defaultClientId === '__ethinos__' ? false : true);
    setEstimatedHrs('');
    setEstimatedMins('');
    setTaskReminders([]);
    setLeaveConflict(null);
    setLeaveModalOpen(false);
    acknowledgedLeaveRef.current = null;
  };

  const openAddTaskModal = () => { resetModal(); setShowAddTaskModal(true); };
  const closeModal = () => { setShowAddTaskModal(false); resetModal(); };

  // --- Checklist group creation ---
  const resetClModal = () => {
    setClSelectedTemplateId('');
    setClSelectedClientId(isManagement ? (accessibleClients[0]?.id || '__personal__') : '__personal__');
    setClSelectedDate(new Date());
    setClRepeatFreq('Once');
    setClRepeatEnd(null);
    setClAssigneeId(isManagement ? '' : (currentUser?.id || ''));
    setClAssigneeName(isManagement ? '' : (currentUser?.name || ''));
    setClAssigneeQuery(isManagement ? '' : (currentUser?.name || ''));
    setClShowAssigneeMenu(false);
    setClError('');
  };

  const openNewChecklistModal = () => { resetClModal(); setShowNewChecklistModal(true); };
  const closeNewChecklistModal = () => { setShowNewChecklistModal(false); resetClModal(); };

  const handleCreateChecklistGroup = () => {
    if (!clSelectedTemplateId) { setClError('Please select a checklist template.'); return; }
    if (!clSelectedClientId) { setClError('Please select a client.'); return; }
    const effectiveAssigneeId = isManagement ? clAssigneeId : (currentUser?.id || '');
    const effectiveAssigneeName = isManagement ? clAssigneeName : (currentUser?.name || '');
    if (!effectiveAssigneeId) { setClError('Please select an assignee.'); return; }

    const template = checklistTemplates.find(t => t.id === clSelectedTemplateId);
    if (!template) { setClError('Template not found.'); return; }
    if (!template.questions || template.questions.length === 0) { setClError('This template has no questions. Add questions to the template before assigning it.'); return; }

    const clientOpt = allClientOptions.find(c => c.id === clSelectedClientId);
    const formattedDate = format(clSelectedDate, 'do MMM yyyy');
    const groupId = `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const repeatGroupId = clRepeatFreq !== 'Once' ? `rg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` : undefined;

    const newGroup = {
      id: groupId,
      name: template.name,
      templateId: template.id,
      templateName: template.name,
      questions: (template.questions || []).map(q => ({
        id: q.id,
        text: q.text,
        requiresInput: q.requiresInput || false,
        inputLabel: q.inputLabel || '',
        order: q.order ?? 0,
      })),
      clientId: clSelectedClientId,
      clientName: clientOpt?.name || '',
      date: formattedDate,
      dueDate: null,
      repeatFrequency: clRepeatFreq,
      repeatEnd: clRepeatFreq !== 'Once' ? (clRepeatEnd ? format(clRepeatEnd, 'do MMM yyyy') : null) : null,
      assigneeId: effectiveAssigneeId,
      assigneeName: effectiveAssigneeName,
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || '',
      creatorRole: currentUser?.role || '',
      status: 'Pending',
      archived: false,
      ...(repeatGroupId ? { repeatGroupId } : {}),
    };

    const childTasks = (template.questions || []).map((q, i) => ({
      id: `${groupId}-q${i}-${Date.now() + i}`,
      taskGroupId: groupId,
      taskType: 'checklist',
      questionText: q.text,
      requiresInput: q.requiresInput || false,
      inputLabel: q.inputLabel || '',
      name: q.text,
      comment: '',
      date: formattedDate,
      status: 'Pending',
      assigneeId: effectiveAssigneeId,
      assigneeName: effectiveAssigneeName,
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || '',
      creatorRole: currentUser?.role || '',
      category: 'Checklist',
      repeatFrequency: 'Once',
      checklistAnswer: null,
      checklistNote: null,
      timerState: 'idle',
      timerStartedAt: null,
      elapsedMs: 0,
      billable: false,
      departments: currentUser?.department ? [currentUser.department] : [],
    }));

    const nextLogs = {
      ...clientLogs,
      [clSelectedClientId]: [...childTasks, ...(clientLogs[clSelectedClientId] || [])],
    };
    setClientLogs(nextLogs);
    setTaskGroups([newGroup, ...taskGroups]);

    closeNewChecklistModal();
  };

  const handleUpdateGroupChildTask = (updatedTask) => {
    const cid = updatedTask.taskGroupId
      ? (taskGroups.find(g => g.id === updatedTask.taskGroupId)?.clientId)
      : updatedTask.cid;
    if (!cid) return;
    const updated = (clientLogs[cid] || []).map(t =>
      t.id === updatedTask.id ? { ...t, ...updatedTask } : t
    );
    setClientLogs({ ...clientLogs, [cid]: updated });
  };

  const handleUpdateGroup = (updatedGroup) => {
    setTaskGroups(taskGroups.map(g => g.id === updatedGroup.id ? updatedGroup : g));
  };

  const handleDeleteGroup = (group) => {
    setTaskGroups(taskGroups.filter(g => g.id !== group.id));
    const cid = group.clientId;
    if (cid) {
      const remaining = (clientLogs[cid] || []).filter(t => t.taskGroupId !== group.id);
      setClientLogs({ ...clientLogs, [cid]: remaining });
    }
  };

  const handleCreateTaskFromItem = ({ taskName, category, dueDate, comment, clientId, clientName, assigneeId, assigneeName }) => {
    const newTask = {
      id: Date.now(),
      name: taskName,
      date: format(new Date(), 'do MMM yyyy'),
      comment: comment || '',
      result: '',
      status: 'Pending',
      assigneeId: assigneeId || currentUser?.id || null,
      assigneeName: assigneeName || currentUser?.name || null,
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || 'Employee',
      category: category || '',
      repeatFrequency: 'Once',
      repeatEnd: null,
      dueDate: dueDate || null,
      timerState: 'idle',
      timerStartedAt: null,
      elapsedMs: 0,
      timeTaken: null,
    };
    const targetClientId = clientId || '__personal__';
    const nextLogs = { ...clientLogs, [targetClientId]: [newTask, ...(clientLogs[targetClientId] || [])] };
    setClientLogs(nextLogs);

    // Notify assignee if different from creator
    const assigneeUser = users.find(u => String(u.id) === String(assigneeId));
    if (assigneeUser?.email && String(assigneeId) !== String(currentUser?.id)) {
      sendNotification('task-assigned', {
        assigneeEmail: assigneeUser.email,
        assigneeName: assigneeUser.name,
        taskName,
        taskDescription: comment || '',
        clientName: clientName || '',
        dueDate: dueDate || null,
        creatorName: currentUser?.name,
        steps: [],
      });
    }
  };

  // Auto-complete watcher removed — groups are now marked done only via the explicit
  // "Save & Submit" button in ChecklistGroupDetailPanel.

  // ── Recurrence helpers ─────────────────────────────────────────────────────
  const HV_WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const HV_WEEKDAY_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const HV_WEEK_ORDINALS = ['1st', '2nd', '3rd', '4th'];

  const hvGetNthWeekday = (year, month, weekNum, dayIdx) => {
    const jsDay = dayIdx + 1;
    let count = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month, d).getDay() === jsDay) {
        count++;
        if (count === weekNum) return new Date(year, month, d);
      }
    }
    return null;
  };

  const hvGenerateRecurring = (startDate, endDate, freq, rDays, rWeek, rDay) => {
    if (!endDate || !startDate) return startDate ? [startDate] : [];
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    const dates = [];
    if (freq === 'Daily') {
      const d = new Date(startDate);
      while (d <= end) {
        const dow = d.getDay();
        if (dow >= 1 && dow <= 5) dates.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (freq === 'Weekly') {
      const days = (rDays && rDays.length > 0) ? rDays : [0];
      const d = new Date(startDate);
      while (d <= end) {
        const dow = d.getDay();
        const mapped = dow === 0 ? -1 : dow - 1;
        if (days.includes(mapped)) dates.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (freq === 'Monthly') {
      const wk = rWeek || 1;
      const di = rDay !== undefined ? rDay : 0;
      let yr = startDate.getFullYear(), mo = startDate.getMonth();
      const endYr = end.getFullYear(), endMo = end.getMonth();
      while (yr < endYr || (yr === endYr && mo <= endMo)) {
        const dt = hvGetNthWeekday(yr, mo, wk, di);
        if (dt && dt >= startDate && dt <= end) dates.push(dt);
        mo++; if (mo > 11) { mo = 0; yr++; }
      }
    }
    return dates;
  };

  const hvRecurringCount = (taskRepeat !== 'Once' && taskRepeatEnd && selectedDate)
    ? hvGenerateRecurring(selectedDate, taskRepeatEnd, taskRepeat, taskRepeatDays, taskRepeatMonthlyWeek, taskRepeatMonthlyDay).length
    : 0;

  const handleAddTaskFromHome = (event) => {
    event.preventDefault();
    const effectiveAssigneeId = !isManagement ? (currentUser?.id || assigneeId) : assigneeId;
    const effectiveAssigneeName = !isManagement ? (currentUser?.name || assigneeName) : assigneeName;
    if (!selectedClientId || !taskName.trim() || !taskCategory || !effectiveAssigneeId || !taskComment.trim() || !selectedDate) {
      setTaskError('Task name, category, and description are all required.');
      return;
    }
    const formattedDate = format(selectedDate, 'do MMM yyyy');
    const homeEstHrs = parseInt(estimatedHrs || '0', 10) || 0;
    const homeEstMins = parseInt(estimatedMins || '0', 10) || 0;
    const homeEstimatedMs = (homeEstHrs * 60 + homeEstMins) > 0 ? (homeEstHrs * 3600000 + homeEstMins * 60000) : null;
    const effectiveBillable = selectedClientId === '__ethinos__' ? false : taskBillable;
    const newRepeatGroupId = taskRepeat !== 'Once'
      ? `rg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      : undefined;
    const newTask = {
      id: Date.now(),
      name: taskName.trim(),
      date: formattedDate,
      comment: taskComment.trim(),
      result: '',
      status: 'Pending',
      assigneeId: effectiveAssigneeId || null,
      assigneeName: effectiveAssigneeName || null,
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || 'Employee',
      category: taskCategory,
      repeatFrequency: taskRepeat,
      repeatEnd: taskRepeat !== 'Once' ? (taskRepeatEnd ? format(taskRepeatEnd, 'do MMM yyyy') : null) : null,
      repeatDays: taskRepeat === 'Weekly' ? (taskRepeatDays.length > 0 ? taskRepeatDays : [0, 1, 2, 3, 4]) : null,
      repeatMonthlyWeek: taskRepeat === 'Monthly' ? taskRepeatMonthlyWeek : null,
      repeatMonthlyDay: taskRepeat === 'Monthly' ? taskRepeatMonthlyDay : null,
      dueDate: taskDueDate ? format(taskDueDate, 'do MMM yyyy') : null,
      timerState: 'idle',
      timerStartedAt: null,
      elapsedMs: 0,
      timeTaken: null,
      qcEnabled,
      qcAssigneeId: qcEnabled ? qcAssigneeId || null : null,
      qcAssigneeName: qcEnabled ? qcAssigneeName || null : null,
      qcStatus: null,
      qcRating: null,
      qcFeedback: null,
      qcReviewedAt: null,
      departments: taskDepartments.length > 0 ? taskDepartments : (currentUser?.department ? [currentUser.department] : null),
      billable: effectiveBillable,
      estimatedMs: homeEstimatedMs,
      reminderOffsets: taskReminders.length > 0 ? taskReminders : null,
      ...(newRepeatGroupId ? { repeatGroupId: newRepeatGroupId } : {}),
    };
    const dueDateOffsetDays = taskDueDate && selectedDate
      ? differenceInCalendarDays(taskDueDate, selectedDate)
      : null;
    let logsToAdd = [newTask];
    if (taskRepeat !== 'Once' && taskRepeatEnd) {
      const dates = hvGenerateRecurring(
        selectedDate, taskRepeatEnd, taskRepeat,
        taskRepeat === 'Weekly' ? (taskRepeatDays.length > 0 ? taskRepeatDays : [0,1,2,3,4]) : taskRepeatDays,
        taskRepeatMonthlyWeek, taskRepeatMonthlyDay
      );
      if (dates.length > 1) {
        logsToAdd = dates.map((dt, i) => ({
          ...newTask,
          id: Date.now() + i,
          date: format(dt, 'do MMM yyyy'),
          dueDate: dueDateOffsetDays !== null ? format(addDays(dt, dueDateOffsetDays), 'do MMM yyyy') : null,
        }));
      }
      if (logsToAdd.length === 0) logsToAdd = [newTask];
    }
    const nextLogs = { ...clientLogs, [selectedClientId]: [...logsToAdd, ...(clientLogs[selectedClientId] || [])] };
    setClientLogs(nextLogs);

    // Notify the assignee by email — skip if the creator is assigning to themselves
    const assigneeUser = users.find(u => String(u.id) === String(effectiveAssigneeId));
    if (assigneeUser?.email && String(effectiveAssigneeId) !== String(currentUser?.id)) {
      sendNotification('task-assigned', {
        assigneeEmail: assigneeUser.email,
        assigneeName: effectiveAssigneeName,
        taskName: taskName.trim(),
        taskDescription: taskComment.trim(),
        clientName: selectedClient?.name || '',
        dueDate: taskDueDate ? format(taskDueDate, 'do MMM yyyy') : null,
        creatorName: currentUser?.name,
        steps: [],
      });
    }

    closeModal();
  };

  // --- Personal task data ---
  const myTasks = useMemo(() => {
    return allTasks.filter(t =>
      String(t.assigneeId) === String(currentUser?.id) && !t.archived && !t.taskGroupId
    );
  }, [allTasks, currentUser]);

  // --- Task groups assigned to current user ---
  const myTaskGroups = useMemo(() => {
    return taskGroups.filter(g =>
      String(g.assigneeId) === String(currentUser?.id) && !g.archived
    );
  }, [taskGroups, currentUser]);

  // --- Get child tasks for a group ---
  const getGroupChildren = useCallback((group) => {
    const logs = clientLogs[group.clientId] || [];
    return logs.filter(t => t.taskGroupId === group.id);
  }, [clientLogs]);

  const myArchivedTasks = useMemo(() => {
    return allTasks.filter(t => String(t.assigneeId) === String(currentUser?.id) && t.archived);
  }, [allTasks, currentUser]);

  const myOpenTasks = myTasks.filter(t => t.status !== 'Done');
  const myWip = myTasks.filter(t => t.status === 'WIP');
  const myPending = myTasks.filter(t => t.status === 'Pending');
  const myDone = myTasks.filter(t => t.status === 'Done');

  const todayStr = format(new Date(), 'do MMM yyyy');
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const myOverdue = myTasks.filter(t => {
    if (!t.dueDate || t.status === 'Done') return false;
    try {
      const d = parse(t.dueDate, 'do MMM yyyy', new Date()); d.setHours(0,0,0,0);
      if (!(d < todayStart)) return false;
      const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), dy = String(d.getDate()).padStart(2,'0');
      return !isFullDayLeaveOrHoliday(currentUserLeaveData[`${y}-${mo}-${dy}`]);
    } catch { return false; }
  });
  const myDueToday = myTasks.filter(t => t.dueDate === todayStr && t.status !== 'Done');
  const my48Plus = myTasks.filter(t => {
    if (t.status === 'Done') return false;
    try { return differenceInCalendarDays(new Date(), parse(t.date, 'do MMM yyyy', new Date())) >= 2; } catch { return false; }
  });

  const myAwaitingQC = myTasks.filter(t => t.qcEnabled && t.qcStatus === 'sent');

  // --- Checklist group stats — use g.date (assignment date, always set) not g.dueDate (usually null) ---
  const myOverdueChecklists = myTaskGroups.filter(g => {
    if (!g.date || g.status === 'done') return false;
    try {
      const d = parse(g.date, 'do MMM yyyy', new Date()); d.setHours(0,0,0,0);
      if (!(d < todayStart)) return false;
      const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), dy = String(d.getDate()).padStart(2,'0');
      return !isFullDayLeaveOrHoliday(currentUserLeaveData[`${y}-${mo}-${dy}`]);
    } catch { return false; }
  });
  const myDueTodayChecklists = myTaskGroups.filter(g => {
    if (!g.date || g.status === 'done') return false;
    try { const d = parse(g.date, 'do MMM yyyy', new Date()); d.setHours(0,0,0,0); return d.getTime() === todayStart.getTime(); } catch { return false; }
  });
  const myOpenChecklists = myTaskGroups.filter(g => g.status !== 'done');

  const scrollToTasks = () => setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  const filteredMyTasks = useMemo(() => {
    if (showArchived) return myArchivedTasks;
    if (statusFilter.startsWith('cl-')) return []; // checklist-only view — no regular tasks
    if (statusFilter === 'all') return myTasks.filter(t =>
      t.status !== 'Done' ||
      (t.qcEnabled && (!t.qcStatus || t.qcStatus === 'rejected'))
    );
    if (statusFilter === 'done') return myDone;
    if (statusFilter === 'overdue') return myOverdue;
    if (statusFilter === 'dueToday') return myDueToday;
    if (statusFilter === '48plus') return my48Plus;
    if (statusFilter === 'awaitingQC') return myAwaitingQC;
    return myTasks.filter(t => t.status === statusFilter);
  }, [myTasks, myDone, myArchivedTasks, myOverdue, myDueToday, my48Plus, myAwaitingQC, statusFilter, showArchived]);

  const handleArchiveTask = (task) => {
    const cid = task.cid;
    if (!cid) return;
    const updated = (clientLogs[cid] || []).map(t =>
      t.id === task.id ? { ...t, archived: !t.archived } : t
    );
    setClientLogs({ ...clientLogs, [cid]: updated });
  };

  const handleUpdateTask = (task, changes) => {
    const cid = task.cid;
    if (!cid) return;
    const updated = (clientLogs[cid] || []).map(t =>
      t.id === task.id ? { ...t, ...changes } : t
    );
    setClientLogs({ ...clientLogs, [cid]: updated });
  };

  const handleBatchDelete = () => {
    if (selectedTaskIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedTaskIds.size} selected task${selectedTaskIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    const updated = {};
    Object.keys(clientLogs).forEach(cid => {
      updated[cid] = (clientLogs[cid] || []).filter(t => !selectedTaskIds.has(t.id));
    });
    setClientLogs({ ...clientLogs, ...updated });
    setSelectedTaskIds(new Set());
    setSelectMode(false);
  };

  const handleBatchStatus = (newStatus) => {
    if (selectedTaskIds.size === 0) return;
    const updated = {};
    Object.keys(clientLogs).forEach(cid => {
      updated[cid] = (clientLogs[cid] || []).map(t =>
        selectedTaskIds.has(t.id) ? { ...t, status: newStatus } : t
      );
    });
    setClientLogs({ ...clientLogs, ...updated });
    setSelectedTaskIds(new Set());
    setSelectMode(false);
  };

  const hvTryParse = (str) => {
    if (!str) return null;
    try { const d = parse(str, 'do MMM yyyy', new Date()); return isNaN(d) ? null : d; } catch { return null; }
  };

  const handleOpenEditTask = (task) => {
    setEditingTask(task);
    setEditDraft({
      name: task.name || '',
      comment: task.comment || '',
      category: task.category || '',
      dueDate: hvTryParse(task.dueDate) || null,
      status: task.status || 'Pending',
    });
    setEditDraftCategoryQuery(task.category || '');
    setEditDraftShowCategoryMenu(false);
    setEditDraftError('');
    setEditScope('one');
  };

  const handleSaveEditTask = () => {
    if (!editDraft || !editingTask) return;
    if (!editDraft.name.trim() || !editDraft.comment.trim() || !editDraft.category) {
      setEditDraftError('Task name, description and category are all required.');
      return;
    }
    const cid = editingTask.cid;
    if (!cid) return;
    const updateAll = editScope === 'all' && editingTask.repeatGroupId;
    const sharedFields = {
      name: editDraft.name.trim(),
      comment: editDraft.comment.trim(),
      category: editDraft.category,
    };
    const updated = (clientLogs[cid] || []).map(t => {
      if (updateAll && t.repeatGroupId === editingTask.repeatGroupId && t.id !== editingTask.id) {
        return { ...t, ...sharedFields };
      }
      if (t.id === editingTask.id) {
        return {
          ...t,
          ...sharedFields,
          dueDate: editDraft.dueDate ? format(editDraft.dueDate, 'do MMM yyyy') : null,
          status: editDraft.status,
        };
      }
      return t;
    });
    setClientLogs({ ...clientLogs, [cid]: updated });
    setEditingTask(null);
    setEditDraft(null);
  };

  // Timer tick for live display
  const [timerTick, setTimerTick] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTimerTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setShowAddMenu(false); };
    if (showAddMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddMenu]);

  const formatDuration = (ms) => {
    if (!ms) return '0:00:00';
    const total = Math.floor(ms / 1000);
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const getElapsedMs = (task) => {
    const base = task.elapsedMs || 0;
    if (task.timerState === 'running' && task.timerStartedAt) {
      return base + Math.max(0, timerTick - task.timerStartedAt);
    }
    return base;
  };

  const startTaskTimer = useCallback((task) => {
    handleUpdateTask(task, { status: 'WIP', timerState: 'running', timerStartedAt: Date.now() });
    if (task.status !== 'WIP') {
      const assignee = task.assigneeId
        ? (users || []).find(u => String(u.id) === String(task.assigneeId))
        : null;
      if (assignee?.email && String(assignee.id) !== String(currentUser?.id)) {
        sendNotification('task-status-changed', {
          assigneeEmail: assignee.email,
          assigneeName: assignee.name,
          taskName: task.name || task.comment,
          clientName: task.cName || task.cid || '',
          newStatus: 'WIP',
          changerName: currentUser?.name,
        });
      }
    }
  }, [clientLogs, users, currentUser]);

  const pauseTaskTimer = useCallback((task) => {
    if (task.timerState !== 'running' || !task.timerStartedAt) return;
    const elapsedMs = (task.elapsedMs || 0) + (Date.now() - task.timerStartedAt);
    handleUpdateTask(task, { timerState: 'paused', timerStartedAt: null, elapsedMs, timeTaken: formatDuration(elapsedMs) });
  }, [clientLogs]);

  const stopTaskTimer = useCallback((task) => {
    const elapsedMs = task.timerState === 'running' && task.timerStartedAt
      ? (task.elapsedMs || 0) + (Date.now() - task.timerStartedAt)
      : (task.elapsedMs || 0);
    handleUpdateTask(task, { timerState: 'stopped', timerStartedAt: null, elapsedMs, timeTaken: formatDuration(elapsedMs) });
  }, [clientLogs]);

  const handleChangeStatus = (task, newStatus) => {
    let timerUpdate = {};
    if (newStatus === 'Done' && (task.timerState === 'running' || task.timerState === 'paused')) {
      const elapsedMs = task.timerState === 'running' && task.timerStartedAt
        ? (task.elapsedMs || 0) + (Date.now() - task.timerStartedAt)
        : (task.elapsedMs || 0);
      timerUpdate = { timerState: 'stopped', timerStartedAt: null, elapsedMs, timeTaken: formatDuration(elapsedMs) };
    }
    const qcReset = newStatus !== 'Done' && task.qcStatus === 'sent' ? { qcStatus: null } : {};
    handleUpdateTask(task, { status: newStatus, ...timerUpdate, ...qcReset });
    setDetailTask(prev => prev?.id === task.id ? { ...prev, status: newStatus, ...timerUpdate, ...qcReset } : prev);
    if ((newStatus === 'WIP' || newStatus === 'Done') && newStatus !== task.status) {
      const assignee = task.assigneeId
        ? (users || []).find(u => String(u.id) === String(task.assigneeId))
        : null;
      if (assignee?.email && String(assignee.id) !== String(currentUser?.id)) {
        sendNotification('task-status-changed', {
          assigneeEmail: assignee.email,
          assigneeName: assignee.name,
          taskName: task.name || task.comment,
          clientName: task.cName || task.cid || '',
          newStatus,
          changerName: currentUser?.name,
        });
      }
    }
  };

  // Group tasks and task groups by client
  const tasksByClient = useMemo(() => {
    const groups = {};
    filteredMyTasks.forEach(task => {
      const key = task.cid || 'unknown';
      if (!groups[key]) groups[key] = { clientName: task.cName || 'Unknown Client', clientId: task.cid, tasks: [], taskGroups: [] };
      groups[key].tasks.push(task);
    });
    // Add task groups into the client groupings
    const filteredGroups = showArchived ? [] : (
      statusFilter === 'done' ? myTaskGroups.filter(g => g.status === 'done') :
      (statusFilter === 'overdue' || statusFilter === 'cl-overdue') ? myOverdueChecklists :
      (statusFilter === 'dueToday' || statusFilter === 'cl-dueToday') ? myDueTodayChecklists :
      (statusFilter === 'all' || statusFilter === 'cl-all') ? myTaskGroups.filter(g => g.status !== 'done') :
      []);
    filteredGroups.forEach(group => {
      const key = group.clientId || 'unknown';
      const clientName = group.clientName || allClientOptions.find(c => c.id === group.clientId)?.name || 'Unknown Client';
      if (!groups[key]) groups[key] = { clientName, clientId: group.clientId, tasks: [], taskGroups: [] };
      groups[key].taskGroups.push(group);
    });
    return Object.values(groups);
  }, [filteredMyTasks, myTaskGroups, myOverdueChecklists, myDueTodayChecklists, showArchived, statusFilter, allClientOptions]);

  const statusColor = (status) => {
    if (status === 'Done') return 'bg-emerald-100 text-emerald-700';
    if (status === 'WIP') return 'bg-blue-100 text-blue-700';
    return 'bg-orange-100 text-orange-700';
  };

  const isTaskOverdue = (task) => {
    if (!task.dueDate || task.status === 'Done') return false;
    try {
      const due = parse(task.dueDate, 'do MMM yyyy', new Date());
      if (!isBefore(due, new Date())) return false;
      const y = due.getFullYear(), mo = String(due.getMonth()+1).padStart(2,'0'), dy = String(due.getDate()).padStart(2,'0');
      return !isFullDayLeaveOrHoliday(currentUserLeaveData[`${y}-${mo}-${dy}`]);
    } catch { return false; }
  };

  return (
    <div
      className="w-full space-y-6 p-6 min-h-screen"
      style={{
        background:
          'radial-gradient(50% 60% at 9% 10%, rgba(241, 94, 88, 0.12) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(44% 52% at 50% 94%, rgba(82, 110, 255, 0.12) 0%, rgba(82, 110, 255, 0) 64%), radial-gradient(38% 46% at 96% 12%, rgba(236, 232, 123, 0.13) 0%, rgba(236, 232, 123, 0) 62%), linear-gradient(140deg, #fff7f8 0%, #f7f8ff 58%, #fffde9 100%)'
      }}
    >
      {/* PERSONAL STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'My Clients', filterKey: null, value: accessibleClients.length,
            icon: <Briefcase size={16} className="text-blue-600"/>, bgColor: 'bg-blue-50', iconBgColor: 'bg-blue-100', border: 'border-blue-100',
            onClick: onNavigateToClients,
          },
          {
            label: 'Open Tasks', filterKey: 'all', value: myOpenTasks.length, clCount: myOpenChecklists.length,
            icon: <Clock size={16} className="text-green-600"/>, bgColor: 'bg-green-50', iconBgColor: 'bg-green-100', border: 'border-green-100',
          },
          {
            label: 'WIP', filterKey: 'WIP', value: myWip.length, clCount: 0,
            icon: <Activity size={16} className="text-orange-500"/>, bgColor: 'bg-orange-50', iconBgColor: 'bg-orange-100', border: 'border-orange-100',
          },
          {
            label: 'Pending', filterKey: 'Pending', value: myPending.length, clCount: 0,
            icon: <AlertTriangle size={16} className="text-red-500"/>, bgColor: 'bg-red-50', iconBgColor: 'bg-red-100', border: 'border-red-100',
          },
        ].map((stat, i) => {
          const isActive = stat.filterKey && (statusFilter === stat.filterKey || statusFilter === 'cl-' + stat.filterKey) && !showArchived;
          const handleClick = stat.onClick || (stat.filterKey ? () => { setShowArchived(false); setStatusFilter(isActive ? 'all' : stat.filterKey); scrollToTasks(); } : undefined);
          return (
            <div key={i} onClick={handleClick}
              className={`${stat.bgColor} p-4 rounded-2xl shadow-sm border flex flex-col justify-between h-24 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${isActive ? 'ring-2 ring-offset-1 ring-slate-700 border-slate-300' : stat.border}`}
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-slate-500">{stat.label}</span>
                <div className={`p-2 ${stat.iconBgColor} rounded-lg`}>{stat.icon}</div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                {stat.clCount > 0 && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); if (stat.filterKey) { setShowArchived(false); setStatusFilter('cl-' + stat.filterKey); scrollToTasks(); } }}
                    className="relative z-10 text-xs font-semibold px-2 py-0.5 rounded-full text-slate-600 bg-white/80 ring-1 ring-slate-400 hover:bg-white hover:scale-105 transition-all cursor-pointer"
                  >+{stat.clCount} Checklists</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ALERT STAT CARDS: Overdue / Due Today / 48+ hrs open / Awaiting QC */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Overdue', filterKey: 'overdue',
            taskCount: myOverdue.length, clCount: myOverdueChecklists.length,
            icon: <AlertTriangle size={16} className="text-rose-600"/>,
            activeColor: 'bg-rose-50 border-rose-300 ring-rose-500',
            inactiveColor: myOverdue.length > 0 || myOverdueChecklists.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100',
            valueColor: myOverdue.length > 0 || myOverdueChecklists.length > 0 ? 'text-rose-700' : 'text-slate-400',
            iconBgColor: myOverdue.length > 0 || myOverdueChecklists.length > 0 ? 'bg-rose-100' : 'bg-slate-100',
          },
          {
            label: 'Due Today', filterKey: 'dueToday',
            taskCount: myDueToday.length, clCount: myDueTodayChecklists.length,
            icon: <Calendar size={16} className="text-amber-600"/>,
            activeColor: 'bg-amber-50 border-amber-300 ring-amber-500',
            inactiveColor: myDueToday.length > 0 || myDueTodayChecklists.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100',
            valueColor: myDueToday.length > 0 || myDueTodayChecklists.length > 0 ? 'text-amber-700' : 'text-slate-400',
            iconBgColor: myDueToday.length > 0 || myDueTodayChecklists.length > 0 ? 'bg-amber-100' : 'bg-slate-100',
          },
          {
            label: '48 hrs+ Open', filterKey: '48plus',
            taskCount: my48Plus.length, clCount: 0,
            icon: <Clock size={16} className="text-purple-600"/>,
            activeColor: 'bg-purple-50 border-purple-300 ring-purple-500',
            inactiveColor: my48Plus.length > 0 ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-100',
            valueColor: my48Plus.length > 0 ? 'text-purple-700' : 'text-slate-400',
            iconBgColor: my48Plus.length > 0 ? 'bg-purple-100' : 'bg-slate-100',
          },
          {
            label: 'Awaiting QC', filterKey: 'awaitingQC',
            taskCount: myAwaitingQC.length, clCount: 0,
            icon: <ShieldCheck size={16} className="text-indigo-600"/>,
            activeColor: 'bg-indigo-50 border-indigo-300 ring-indigo-500',
            inactiveColor: myAwaitingQC.length > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100',
            valueColor: myAwaitingQC.length > 0 ? 'text-indigo-700' : 'text-slate-400',
            iconBgColor: myAwaitingQC.length > 0 ? 'bg-indigo-100' : 'bg-slate-100',
          },
        ].map((stat, i) => {
          const isActive = (statusFilter === stat.filterKey || statusFilter === 'cl-' + stat.filterKey) && !showArchived;
          return (
            <div key={i}
              onClick={() => { setShowArchived(false); setStatusFilter(isActive ? 'all' : stat.filterKey); scrollToTasks(); }}
              className={`p-4 rounded-2xl shadow-sm border flex flex-col justify-between h-24 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${isActive ? `${stat.activeColor} ring-2 ring-offset-1` : stat.inactiveColor}`}
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-slate-500">{stat.label}</span>
                <div className={`p-1.5 ${stat.iconBgColor} rounded-lg`}>{stat.icon}</div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className={`text-2xl font-bold ${stat.valueColor}`}>{stat.taskCount}</p>
                {stat.clCount > 0 && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setShowArchived(false); setStatusFilter('cl-' + stat.filterKey); scrollToTasks(); }}
                    className={`relative z-10 text-xs font-semibold px-2 py-0.5 rounded-full ${stat.valueColor} bg-white/80 ring-1 ring-current hover:bg-white hover:scale-105 transition-all cursor-pointer`}
                  >+{stat.clCount} Checklists</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* LEAVE OVERVIEW */}
      {(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayKey = toDateKey(today);

        // Collect my leave for next 30 days
        const myApproved = [], myPending = [];
        for (let i = 0; i <= 30; i++) {
          const d = new Date(today); d.setDate(d.getDate() + i);
          const dk = toDateKey(d);
          const rec = currentUserLeaveData[dk];
          if (!rec) continue;
          if (rec.status === 'pending') myPending.push({ date: new Date(d), dk });
          else myApproved.push({ date: new Date(d), dk });
        }

        // Group consecutive dates into label ranges
        const fmtD = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const groupRanges = (items) => {
          if (!items.length) return [];
          const groups = []; let gs = items[0], ge = items[0];
          for (let i = 1; i < items.length; i++) {
            if (Math.round((items[i].date - ge.date) / 86400000) === 1) { ge = items[i]; }
            else { groups.push({ gs, ge }); gs = ge = items[i]; }
          }
          groups.push({ gs, ge }); return groups;
        };
        const rangeLabel = (gs, ge) =>
          gs.dk === ge.dk ? fmtD(gs.date) : `${fmtD(gs.date)} – ${fmtD(ge.date)}`;

        const approvedGroups = groupRanges(myApproved);
        const pendingGroups  = groupRanges(myPending);

        // Team leave entries (direct reports with any leave status)
        const teamEntries = Object.values(teamLeaveStatuses).filter(t =>
          t.onLeaveToday || t.onLeavePendingToday || t.upcomingLeaveDate || t.upcomingPendingDate
        );

        const hasMyLeave   = myApproved.length > 0 || myPending.length > 0;
        const hasTeamLeave = isManagement && teamEntries.length > 0;
        if (!hasMyLeave && !hasTeamLeave) return null;

        return (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-sky-100 rounded-lg"><Calendar size={14} className="text-sky-600"/></div>
              <h3 className="text-sm font-bold text-slate-700">Leave Overview</h3>
            </div>
            <div className={`grid gap-4 ${hasTeamLeave ? 'grid-cols-2 divide-x divide-slate-100' : 'grid-cols-1'}`}>

              {/* MY LEAVE */}
              <div className={hasTeamLeave ? 'pr-4' : ''}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">My Leave</p>
                {!hasMyLeave ? (
                  <p className="text-xs text-slate-400 italic">No upcoming leave in the next 30 days</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {approvedGroups.map(({ gs, ge }, i) => (
                      <span key={i} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        {gs.dk === todayKey ? 'On Leave Today' : rangeLabel(gs, ge)}
                      </span>
                    ))}
                    {pendingGroups.map(({ gs, ge }, i) => (
                      <span key={i} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                        {gs.dk === todayKey ? 'Leave Pending Today' : `Pending: ${rangeLabel(gs, ge)}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* TEAM LEAVE */}
              {hasTeamLeave && (
                <div className="pl-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Team Leave</p>
                  <div className="space-y-1.5">
                    {teamEntries.map(t => {
                      const badge = t.onLeaveToday
                        ? { label: 'On Leave Today', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
                        : t.onLeavePendingToday
                          ? { label: 'Pending Today', cls: 'bg-blue-50 text-blue-600 border-blue-200' }
                          : t.upcomingLeaveDate
                            ? { label: `Leave ${new Date(t.upcomingLeaveDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, cls: 'bg-sky-50 text-sky-600 border-sky-200' }
                            : { label: `Pending ${new Date(t.upcomingPendingDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, cls: 'bg-blue-50 text-blue-500 border-blue-200' };
                      return (
                        <div key={t.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-700 font-medium truncate">{t.name}</span>
                          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TASK LIST HEADER */}
      <div ref={taskListRef} className="flex items-center gap-2 min-w-0">
        {/* My Tasks label — always visible */}
        <div className="flex items-center gap-2 shrink-0">
          <h2 className="text-sm font-bold text-slate-800 whitespace-nowrap">My Tasks</h2>
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">({myTasks.length} total)</span>
        </div>
        {/* Filter pills — scrolls horizontally if needed, clipped safely */}
        {!showArchived && (
          <div className="flex-1 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
            <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-max">
              {[
                { key: 'all', label: 'Open' },
                { key: 'WIP', label: 'WIP' },
                { key: 'Pending', label: 'Pending' },
                { key: 'dueToday', label: 'Due Today', alertCount: myDueToday.length + myDueTodayChecklists.length, show: myDueToday.length + myDueTodayChecklists.length > 0 || statusFilter === 'dueToday' },
                { key: 'overdue', label: 'Overdue', alertCount: myOverdue.length + myOverdueChecklists.length },
                { key: '48plus', label: '48 hrs+', alertCount: my48Plus.length, show: my48Plus.length > 0 || statusFilter === '48plus' },
                { key: 'awaitingQC', label: 'QC', alertCount: myAwaitingQC.length, show: myAwaitingQC.length > 0 || statusFilter === 'awaitingQC' },
                { key: 'done', label: 'Done' },
              ].filter(f => f.show !== false).map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    statusFilter === f.key
                      ? f.key === 'overdue' || f.key === 'dueToday'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-900 text-white shadow-sm'
                      : (f.alertCount > 0)
                        ? f.key === 'overdue' || f.key === 'dueToday'
                          ? 'text-rose-600 hover:bg-rose-50'
                          : 'text-slate-600 hover:bg-slate-50'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label}{f.alertCount > 0 ? ` (${f.alertCount})` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Archive + Add — fixed right, outside any overflow container so dropdown isn't clipped */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {!showArchived && (
            <button
              onClick={() => {
                const next = !selectMode;
                setSelectMode(next);
                if (!next) setSelectedTaskIds(new Set());
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border transition-all whitespace-nowrap ${
                selectMode
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              title="Select multiple tasks"
            >
              <CheckSquare size={12} />
              {selectMode && selectedTaskIds.size > 0 ? `${selectedTaskIds.size} Selected` : 'Select'}
            </button>
          )}
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border transition-all whitespace-nowrap ${
              showArchived
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
            title={showArchived ? 'Back to active tasks' : 'Show archived tasks'}
          >
            {showArchived ? <ArchiveRestore size={12}/> : <Archive size={12}/>}
            {showArchived ? 'Hide Archived' : `Archived${myArchivedTasks.length > 0 ? ` (${myArchivedTasks.length})` : ''}`}
          </button>
          <div className="relative" ref={addMenuRef}>
            <button
              onClick={() => setShowAddMenu(v => !v)}
              className="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={13} /> Add
              <ChevronDown size={11} className={`transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
            </button>
            {showAddMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                <button
                  onClick={() => { openAddTaskModal(); setShowAddMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  <Plus size={13} className="text-slate-500" /> Add Task
                </button>
                <button
                  onClick={() => { setShowHomeTemplateModal(true); setSelectedHomeTemplateId(null); setHomeTemplateFilter('All'); setExpandedTemplateTasks({}); setShowAddMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  <LayoutTemplate size={13} className="text-indigo-500" /> Use Template
                </button>
                {checklistTemplates.length > 0 && canCreateChecklists && (
                  <button
                    onClick={() => { openNewChecklistModal(); setShowAddMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                  >
                    <ClipboardList size={13} className="text-teal-500" /> New Checklist
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BATCH ACTION BAR */}
      {selectMode && selectedTaskIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 rounded-xl text-white shadow-lg">
          <span className="text-sm font-bold flex-shrink-0">{selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''} selected</span>
          <div className="flex-1" />
          <button
            onClick={() => {
              const all = new Set(filteredMyTasks.map(t => t.id));
              setSelectedTaskIds(all);
            }}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-400 transition-all whitespace-nowrap"
          >
            Select All ({filteredMyTasks.length})
          </button>
          <div className="flex items-center gap-1">
            {['Pending','WIP','Done'].map(s => (
              <button
                key={s}
                onClick={() => handleBatchStatus(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  s === 'Done' ? 'bg-emerald-500 hover:bg-emerald-400' :
                  s === 'WIP' ? 'bg-sky-500 hover:bg-sky-400' : 'bg-orange-500 hover:bg-orange-400'
                }`}
              >
                → {s}
              </button>
            ))}
          </div>
          {isManagement && (
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 transition-all"
            >
              <Trash2 size={11} /> Delete
            </button>
          )}
          <button
            onClick={() => { setSelectedTaskIds(new Set()); setSelectMode(false); }}
            className="p-1 rounded-lg hover:bg-blue-500 transition-all"
            title="Cancel selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* TASK LIST */}
      {filteredMyTasks.length === 0 && tasksByClient.every(g => (g.taskGroups || []).length === 0) ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white/60 rounded-2xl border border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckCircle size={24} className="text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-500">
            {showArchived ? 'No archived tasks' : statusFilter === 'done' ? 'No completed tasks yet' : statusFilter === 'overdue' ? 'No overdue tasks' : 'No tasks here'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {showArchived ? 'Tasks you archive will appear here.' : statusFilter === 'overdue' ? 'Tasks past their due date will appear here.' : statusFilter === 'all' ? 'Tasks assigned to you will appear here.' : 'Switch filter to see other tasks.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {tasksByClient.map(({ clientName, clientId, tasks, taskGroups: clientGroups = [] }) => {
            const client = accessibleClients.find(c => c.id === clientId);
            const isCollapsed = collapsedClients.has(clientId);
            const toggleCollapse = () => setCollapsedClients(prev => {
              const next = new Set(prev);
              next.has(clientId) ? next.delete(clientId) : next.add(clientId);
              return next;
            });
            // Per-client summary counts
            const clientOverdue = tasks.filter(t => {
              if (!t.dueDate || t.status === 'Done') return false;
              try { const d = parse(t.dueDate, 'do MMM yyyy', new Date()); d.setHours(0,0,0,0); return d < todayStart; } catch { return false; }
            }).length + clientGroups.filter(g => {
              if (!g.date || g.status === 'done') return false;
              try { const d = parse(g.date, 'do MMM yyyy', new Date()); d.setHours(0,0,0,0); return d < todayStart; } catch { return false; }
            }).length;
            const clientDueToday = tasks.filter(t => t.dueDate === todayStr && t.status !== 'Done').length
              + clientGroups.filter(g => {
                if (!g.date || g.status === 'done') return false;
                try { const d = parse(g.date, 'do MMM yyyy', new Date()); d.setHours(0,0,0,0); return d.getTime() === todayStart.getTime(); } catch { return false; }
              }).length;
            const clientPending = tasks.filter(t => t.status === 'Pending').length;
            const clientWIP = tasks.filter(t => t.status === 'WIP').length;
            return (
              <div key={clientId}>
                {/* Client header — click to collapse/expand */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={toggleCollapse}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-black text-indigo-700">
                        {(clientName || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">{clientName}</span>
                    <span className="text-xs text-slate-400">({tasks.length + clientGroups.length})</span>
                    {/* Summary badges — visible when collapsed or always */}
                    <div className="flex items-center gap-1 ml-1">
                      {clientOverdue > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">{clientOverdue} overdue</span>}
                      {clientDueToday > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{clientDueToday} today</span>}
                      {clientWIP > 0 && !isCollapsed && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{clientWIP} WIP</span>}
                      {clientPending > 0 && isCollapsed && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{clientPending} pending</span>}
                    </div>
                    {isCollapsed ? <ChevronDown size={13} className="text-slate-400 ml-auto flex-shrink-0" /> : <ChevronUp size={13} className="text-slate-400 ml-auto flex-shrink-0" />}
                  </button>
                  {client && (
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedClient(client); }}
                      className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-blue-600 transition-colors bg-white border border-slate-200 px-2.5 py-1 rounded-lg ml-2 flex-shrink-0"
                    >
                      View client <ChevronRight size={11}/>
                    </button>
                  )}
                </div>

                {/* Interleaved sorted list — groups and tasks ordered by due date */}
                {!isCollapsed && <div className="space-y-2 pl-9">
                  {[
                    ...clientGroups.map(g => ({ _type: 'group', item: g, _sortKey: g.dueDate || g.date || '' })),
                    ...tasks.map(t => ({ _type: 'task', item: t, _sortKey: t.dueDate || t.date || '' })),
                  ].sort(compareByDate).map(({ _type, item }) => {
                    if (_type === 'group') {
                      const group = item;
                      const children = getGroupChildren(group);
                      const checklistChildren = children.filter(t => t.taskType === 'checklist');
                      const answeredCount = checklistChildren.filter(t =>
                        t.requiresInput ? t.checklistNote?.trim() : t.checklistAnswer != null
                      ).length;
                      const totalCount = checklistChildren.length;
                      const isDone = group.status === 'done';
                      const progressPct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
                      const GRP_CADENCE_COLORS = { Daily: 'bg-emerald-100 text-emerald-700', Weekly: 'bg-blue-100 text-blue-700', Monthly: 'bg-purple-100 text-purple-700' };
                      return (
                        <div
                          key={group.id}
                          onClick={() => setDetailGroup(group)}
                          className={`bg-white rounded-xl border shadow-sm px-4 py-3 cursor-pointer transition-all hover:shadow-md hover:border-teal-300 border-l-4 ${
                            isDone ? 'border-l-emerald-400 opacity-75' : 'border-l-teal-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center">
                              <ClipboardList size={14} className="text-teal-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-800 truncate">{group.name}</p>
                                {isDone && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">Done</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {group.repeatFrequency && group.repeatFrequency !== 'Once' && (
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${GRP_CADENCE_COLORS[group.repeatFrequency] || 'bg-slate-100 text-slate-600'}`}>
                                    {group.repeatFrequency}
                                  </span>
                                )}
                                {group.date && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                    <Calendar size={9} /> {group.date}
                                  </span>
                                )}
                              </div>
                              {totalCount > 0 && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-teal-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                                  </div>
                                  <span className="text-[10px] font-semibold text-slate-500 flex-shrink-0">{answeredCount} / {totalCount}</span>
                                </div>
                              )}
                            </div>
                            <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                          </div>
                        </div>
                      );
                    }
                    const task = item;
                    const elapsed = getElapsedMs(task);
                    const isRunning = task.timerState === 'running';
                    const isPaused = task.timerState === 'paused';
                    const isStopped = task.timerState === 'stopped';
                    const showTimer = !task.archived && task.status !== 'Done';
                    const isSelected = selectedTaskIds.has(task.id);
                    return (
                      <div
                        key={task.id}
                        className={`bg-white rounded-xl border shadow-sm px-4 py-3 transition-all ${
                          selectMode && isSelected
                            ? 'border-blue-400 bg-blue-50 shadow-blue-100'
                            : isRunning ? 'border-blue-300 shadow-blue-100' : 'border-slate-100 hover:border-slate-200 hover:shadow-md'
                        } ${selectMode ? 'cursor-pointer' : ''}`}
                        onClick={selectMode ? () => {
                          setSelectedTaskIds(prev => {
                            const next = new Set(prev);
                            next.has(task.id) ? next.delete(task.id) : next.add(task.id);
                            return next;
                          });
                        } : undefined}
                      >
                        <div className="flex items-center gap-3">
                          {/* Select checkbox */}
                          {selectMode && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              onClick={e => e.stopPropagation()}
                              className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0 rounded"
                            />
                          )}
                          {/* Status dot */}
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            task.status === 'Done' ? 'bg-emerald-400' :
                            task.status === 'WIP' ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]' : 'bg-orange-400'
                          }`} />

                          {/* Task name — clickable opens detail panel */}
                          <div
                            className={`flex-1 min-w-0 ${selectMode ? '' : 'cursor-pointer'}`}
                            onClick={selectMode ? undefined : () => setDetailTask(task)}
                          >
                            <p className="text-sm font-semibold text-slate-800 truncate">{task.name || task.comment}</p>
                            {task.name && task.comment && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">{task.comment}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {task.category && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                                  <Tag size={9} /> {task.category}
                                </span>
                              )}
                              {task.dueDate && (
                                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isTaskOverdue(task) ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'
                                }`}>
                                  <Calendar size={9} /> {task.dueDate}
                                </span>
                              )}
                              {task.repeatGroupId && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                                  <RotateCcw size={9} /> Series
                                </span>
                              )}
                              {elapsed > 0 && (
                                <span className={`flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                                  isRunning ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-500'
                                }`}>
                                  <Clock size={9} /> {formatDuration(elapsed)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0" onClick={selectMode ? e => e.stopPropagation() : undefined}>
                            {/* Status dropdown */}
                            {!task.archived ? (
                              <select
                                className={`text-[10px] border-none rounded-md px-1.5 py-1 font-semibold outline-none cursor-pointer ${
                                  task.status === 'Done' ? 'bg-emerald-100 text-emerald-700' :
                                  task.status === 'WIP' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                                }`}
                                value={task.status || 'Pending'}
                                onChange={(e) => handleChangeStatus(task, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="Pending">Pending</option>
                                <option value="WIP">WIP</option>
                                <option value="Done">Done</option>
                              </select>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Archived</span>
                            )}

                            {/* Edit button */}
                            {!task.archived && canFullyEditTaskFor(task, currentUser) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleOpenEditTask(task); }}
                                className="flex items-center gap-0.5 text-[9px] font-semibold bg-slate-50 text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700 transition-all whitespace-nowrap"
                                title="Edit task"
                              >
                                <Pencil size={8} /> Edit
                              </button>
                            )}

                            {/* QC badges */}
                            {task.qcEnabled && task.status === 'Done' && (!task.qcStatus || task.qcStatus === 'rejected') && (String(task.assigneeId) === String(currentUser?.id) || isManagement) && !task.archived && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleUpdateTask(task, { qcStatus: 'sent' }); }}
                                className="flex items-center gap-0.5 text-[9px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-1 py-0.5 hover:bg-indigo-100 transition-all whitespace-nowrap"
                                title="Send for Quality Check"
                              >
                                <Send size={8} /> Send for QC
                              </button>
                            )}
                            {task.qcEnabled && task.qcStatus === 'sent' && !isManagement && (
                              <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded px-1 py-0.5 whitespace-nowrap">
                                <ShieldCheck size={8} /> Pending QC
                              </span>
                            )}
                            {task.qcEnabled && task.qcStatus === 'sent' && isManagement && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setQcReviewingTask(task); setQcReviewDecision('approved'); setQcReviewRating(''); setQcReviewFeedback(''); }}
                                className="flex items-center gap-0.5 text-[9px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded px-1 py-0.5 hover:bg-amber-100 transition-all whitespace-nowrap"
                                title="Review QC submission"
                              >
                                <ShieldCheck size={8} /> Review QC
                              </button>
                            )}
                            {task.qcEnabled && task.qcStatus === 'approved' && (
                              <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-1 py-0.5 whitespace-nowrap">
                                <ThumbsUp size={8} /> Approved{task.qcRating ? ` · ${task.qcRating}/10` : ''}
                              </span>
                            )}
                            {task.qcEnabled && task.qcStatus === 'rejected' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleUpdateTask(task, { qcStatus: 'sent' }); }}
                                className="flex items-center gap-0.5 text-[9px] font-semibold bg-red-50 text-red-600 border border-red-200 rounded px-1 py-0.5 hover:bg-red-100 transition-all whitespace-nowrap"
                                title="Resubmit for QC"
                              >
                                <RotateCcw size={8} /> Returned
                              </button>
                            )}

                            {/* Timer controls */}
                            {showTimer && (
                              <div className="flex items-center gap-1">
                                {(task.timerState === 'idle' || task.timerState === 'stopped' || !task.timerState) && (
                                  <button onClick={(e) => { e.stopPropagation(); startTaskTimer(task); }} className="p-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all" title="Start timer">
                                    <Play size={11} />
                                  </button>
                                )}
                                {isRunning && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); pauseTaskTimer(task); }} className="p-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all" title="Pause timer">
                                      <Pause size={11} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); stopTaskTimer(task); }} className="p-1 rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all" title="Stop timer">
                                      <Square size={11} />
                                    </button>
                                  </>
                                )}
                                {isPaused && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); startTaskTimer(task); }} className="p-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all" title="Resume timer">
                                      <Play size={11} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); stopTaskTimer(task); }} className="p-1 rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all" title="Stop timer">
                                      <Square size={11} />
                                    </button>
                                  </>
                                )}
                                {/* Archive */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleArchiveTask(task); }}
                                  className="p-1 rounded-md text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-all"
                                  title="Archive task"
                                >
                                  <Archive size={11}/>
                                </button>
                              </div>
                            )}
                            {!showTimer && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleArchiveTask(task); }}
                                className={`p-1 rounded-md transition-all ${
                                  task.archived
                                    ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                                    : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
                                }`}
                                title={task.archived ? 'Unarchive task' : 'Archive task'}
                              >
                                {task.archived ? <ArchiveRestore size={11}/> : <Archive size={11}/>}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>}
              </div>
            );
          })}
        </div>
      )}

      {/* HOME TEMPLATE PICKER MODAL */}
      {showHomeTemplateModal && (
        <div className="fixed inset-0 z-[750] flex items-start justify-center bg-slate-900/30 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 my-8 flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <LayoutTemplate size={15} className="text-indigo-600" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Apply Role Template</h3>
              </div>
              <button
                onClick={() => { setShowHomeTemplateModal(false); setSelectedHomeTemplateId(null); }}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Frequency filter tabs */}
            <div className="px-6 pt-4 pb-2 flex-shrink-0">
              <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
                {['All', 'Daily', 'Weekly', 'Monthly'].map(f => (
                  <button
                    key={f}
                    onClick={() => { setHomeTemplateFilter(f); setSelectedHomeTemplateId(null); }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      homeTemplateFilter === f
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Template list */}
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
              {filteredHomeTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <LayoutTemplate size={32} className="text-slate-200 mb-3" />
                  {roleHomeTemplates.length === 0 ? (
                    <>
                      <p className="text-sm font-semibold text-slate-500">No templates available</p>
                      <p className="text-xs text-slate-400 mt-1">Ask your admin to create templates in the Control Center and assign them to your role.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-slate-500">No templates for this frequency</p>
                      <p className="text-xs text-slate-400 mt-1">Try switching to "All" to see all available templates.</p>
                    </>
                  )}
                </div>
              ) : (
                filteredHomeTemplates.map(tpl => {
                  const isSelected = selectedHomeTemplateId === tpl.id;
                  const tasksToShow = homeTemplateFilter === 'All'
                    ? tpl.tasks || []
                    : (tpl.tasks || []).filter(t => t.repeatFrequency === homeTemplateFilter);
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedHomeTemplateId(isSelected ? null : tpl.id)}
                      className={`border rounded-xl p-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{tpl.name}</p>
                          {tpl.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{tpl.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {tasksToShow.length} task{tasksToShow.length !== 1 ? 's' : ''}
                          </span>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                          }`}>
                            {isSelected && <CheckCircle size={12} className="text-white" />}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {tasksToShow.map((task, idx) => {
                          const taskKey = `${tpl.id}-${idx}`;
                          const isExpanded = expandedTemplateTasks[taskKey];
                          return (
                            <div key={idx} className="bg-white border border-slate-100 rounded-lg p-2.5">
                              <div
                                className="flex items-start gap-2 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedTemplateTasks(prev => ({ ...prev, [taskKey]: !prev[taskKey] }));
                                }}
                              >
                                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 justify-between">
                                    <p className="text-[11px] font-semibold text-slate-800 leading-snug">{task.name || task.comment}</p>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                                        task.repeatFrequency === 'Daily' ? 'bg-emerald-100 text-emerald-700' :
                                        task.repeatFrequency === 'Weekly' ? 'bg-blue-100 text-blue-700' :
                                        task.repeatFrequency === 'Monthly' ? 'bg-purple-100 text-purple-700' :
                                        'bg-slate-100 text-slate-600'
                                      }`}>{task.repeatFrequency}</span>
                                      {(task.steps || []).length > 0 && (
                                        <ChevronDown size={11} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      )}
                                    </div>
                                  </div>
                                  {task.name && task.comment && task.name !== task.comment && (
                                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{task.comment}</p>
                                  )}
                                </div>
                              </div>
                              {isExpanded && (task.steps || []).length > 0 && (
                                <div className="mt-2 pl-6 space-y-1">
                                  {task.steps.map((step, si) => (
                                    <div key={si} className="flex items-start gap-1.5">
                                      <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                                      <p className="text-[10px] text-slate-600 leading-snug">{step}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <p className="text-xs text-slate-500">
                {selectedHomeTemplateId
                  ? `${(roleHomeTemplates.find(t => t.id === selectedHomeTemplateId)?.tasks || []).length} task(s) will be added to Ethinos (Internal), self-assigned, dated today.`
                  : 'Select a template above to apply it.'
                }
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowHomeTemplateModal(false); setSelectedHomeTemplateId(null); }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyHomeTemplate}
                  disabled={!selectedHomeTemplateId}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD TASK MODAL */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/10 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-5xl border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95 flex flex-col" style={{maxHeight:'92vh'}}>
            <div className="flex-shrink-0 flex justify-between items-center px-8 pt-7 pb-5 border-b border-slate-100">
              <h4 className="text-lg font-semibold text-slate-900">New Task</h4>
              <button onClick={closeModal} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTaskFromHome} className="flex-1 overflow-y-auto space-y-6 px-8 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">

                {/* LEFT: Client + Date Picker */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client <span className="text-red-500">*</span></label>
                    <select
                      value={selectedClientId}
                      onChange={e => {
                        const newId = e.target.value;
                        setSelectedClientId(newId);
                        if (!isManagement) {
                          setAssigneeId(currentUser?.id || '');
                          setAssigneeName(currentUser?.name || '');
                          setAssigneeQuery(currentUser?.name || '');
                        } else {
                          setAssigneeId(''); setAssigneeName(''); setAssigneeQuery('');
                        }
                        if (newId === '__ethinos__') setTaskBillable(false);
                        if (taskError) setTaskError('');
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    >
                      {allClientOptions.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.isPersonal ? 'Personal (My Tasks)' : client.isEthinos ? 'Ethinos (Internal)' : client.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-start gap-3">
                    <DatePicker
                      selected={selectedDate}
                      onChange={date => {
                        setSelectedDate(date);
                        if (taskDueDate && date && date > taskDueDate) setTaskDueDate(null);
                      }}
                      inline
                    />
                    <div className="flex flex-col gap-1.5 pt-1 min-w-[90px]">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-0.5">Quick</p>
                      {[
                        { label: 'Today', days: 0 },
                        { label: 'Tomorrow', days: 1 },
                        { label: 'Next Week', days: 7 },
                        { label: 'Next Month', days: 30 },
                      ].map(({ label, days }) => {
                        const target = new Date(new Date().setDate(new Date().getDate() + days));
                        const isActive = selectedDate && selectedDate.toDateString() === target.toDateString();
                        return (
                          <button key={label} type="button"
                            onClick={() => setSelectedDate(target)}
                            className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-all text-left ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600'}`}
                          >{label}</button>
                        );
                      })}
                    </div>

                    {/* Repeat + Due Date — fills whitespace to the right of Quick buttons */}
                    <div className="flex-1 flex flex-col gap-3 pt-1 min-w-0">
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Repeat</p>
                        <div className="flex gap-1">
                          {['Once', 'Daily', 'Weekly', 'Monthly'].map(freq => (
                            <button key={freq} type="button"
                              onClick={() => { setTaskRepeat(freq); if (freq === 'Once') { setTaskRepeatEnd(null); setTaskRepeatDays([]); } }}
                              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${taskRepeat === freq ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600'}`}
                            >{freq}</button>
                          ))}
                        </div>
                        {taskRepeat === 'Weekly' && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Repeat on Days</p>
                            <div className="flex gap-1 flex-wrap">
                              {HV_WEEKDAY_SHORT.map((d, i) => (
                                <button key={i} type="button"
                                  onClick={() => setTaskRepeatDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                                  className={`px-2 py-1 rounded text-[11px] font-semibold border transition-all ${taskRepeatDays.includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                                >{d}</button>
                              ))}
                            </div>
                            {taskRepeatDays.length === 0 && <p className="text-[10px] text-slate-400">No days — defaults to Mon–Fri</p>}
                          </div>
                        )}
                        {taskRepeat === 'Monthly' && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Repeat on</p>
                            <div className="flex gap-2 items-center">
                              <select value={taskRepeatMonthlyWeek} onChange={e => setTaskRepeatMonthlyWeek(Number(e.target.value))}
                                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 bg-white">
                                {HV_WEEK_ORDINALS.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
                              </select>
                              <select value={taskRepeatMonthlyDay} onChange={e => setTaskRepeatMonthlyDay(Number(e.target.value))}
                                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 bg-white">
                                {HV_WEEKDAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                              </select>
                            </div>
                            <p className="text-[10px] text-blue-600 font-medium">{HV_WEEK_ORDINALS[taskRepeatMonthlyWeek - 1]} {HV_WEEKDAY_FULL[taskRepeatMonthlyDay]} of each month</p>
                          </div>
                        )}
                        {taskRepeat !== 'Once' && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Repeat Until <span className="normal-case font-normal">(end date)</span></p>
                            <DatePicker
                              selected={taskRepeatEnd}
                              onChange={date => setTaskRepeatEnd(date)}
                              placeholderText="Select end date"
                              dateFormat="do MMM yyyy"
                              minDate={selectedDate || new Date()}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                            />
                            {taskRepeatEnd && (
                              <div className="flex items-center justify-between flex-wrap gap-1">
                                <button type="button" onClick={() => setTaskRepeatEnd(null)} className="text-xs font-semibold text-red-600 hover:text-red-700">Clear End Date</button>
                                {hvRecurringCount > 0 && (
                                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                    {hvRecurringCount} task{hvRecurringCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Due Date</p>
                        <DueDateInput
                          startDate={selectedDate || new Date()}
                          value={taskDueDate}
                          onChange={setTaskDueDate}
                          minDate={selectedDate || new Date()}
                        />
                        {taskDueDate && (
                          <button type="button" onClick={() => { setTaskDueDate(null); setTaskReminders([]); }} className="text-xs font-semibold text-red-600 hover:text-red-700">
                            Clear Due Date
                          </button>
                        )}
                        {leaveConflict && taskDueDate && (() => {
                          const t = leaveConflict.type;
                          const isHard = t === 'full-leave' || t === 'holiday';
                          const isPending = t === 'pending-leave';
                          const bg = isHard ? 'bg-red-50 border-red-200 text-red-700' : isPending ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700';
                          const label = t === 'holiday' ? `Public holiday: ${leaveConflict.holidayName || 'Holiday'}` : t === 'full-leave' ? `${assigneeName || 'Assignee'} is on full-day leave` : t === 'half-leave' ? `${assigneeName || 'Assignee'} is on half-day leave (${leaveConflict.session})` : `${assigneeName || 'Assignee'} has a pending leave request`;
                          return (
                            <div className={`mt-1.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${bg}`}>
                              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                              <span>{label}</span>
                            </div>
                          );
                        })()}
                      </div>

                      {taskDueDate && (
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            Reminders <span className="normal-case font-normal text-slate-400">— "after" go to QC too</span>
                          </p>
                          <ReminderPills selected={taskReminders} onChange={setTaskReminders} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT: All task fields */}
                <div className="flex-1 space-y-5">

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="Short title for this task"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                      value={taskName}
                      onChange={e => { setTaskName(e.target.value); if (taskError) setTaskError(''); }}
                      required
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
                        onChange={e => { setTaskCategoryQuery(e.target.value); setTaskCategory(''); setShowCategoryMenu(true); if (taskError) setTaskError(''); }}
                      />
                      {showCategoryMenu && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                          {filteredTaskCategories.length ? filteredTaskCategories.map(cat => (
                            <button key={cat} type="button"
                              onClick={() => { setTaskCategory(cat); setTaskCategoryQuery(cat); setShowCategoryMenu(false); if (taskError) setTaskError(''); }}
                              className="w-full text-left px-3 py-2 text-sm font-medium text-black bg-white hover:bg-slate-50 transition-all"
                            >{cat}</button>
                          )) : <p className="px-3 py-2 text-sm text-slate-500">No categories found</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign To <span className="text-red-500">*</span></label>
                    {!isManagement ? (
                      <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 flex items-center gap-2 select-none">
                        <Users size={14} className="text-slate-400 flex-shrink-0"/>
                        <span className="flex-1">{currentUser?.name || 'You'}</span>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Self only</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search assignee"
                          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                          value={assigneeQuery}
                          onFocus={() => setShowAssigneeMenu(true)}
                          onChange={e => { setAssigneeQuery(e.target.value); setAssigneeId(''); setShowAssigneeMenu(true); if (taskError) setTaskError(''); }}
                        />
                        {showAssigneeMenu && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                            {filteredAssignees.length ? filteredAssignees.map(u => (
                              <button key={u.id} type="button"
                                onClick={() => { setAssigneeId(u.id); setAssigneeName(u.name); setAssigneeQuery(u.name); setShowAssigneeMenu(false); if (taskError) setTaskError(''); }}
                                className="w-full text-left px-3 py-2 bg-white hover:bg-slate-50 transition-all"
                              >
                                <p className="text-sm font-semibold text-slate-700">{u.name}</p>
                                <p className="text-xs text-slate-500">{u.email || u.role || ''}</p>
                              </button>
                            )) : (
                              <p className="px-3 py-2 text-sm text-slate-500">
                                {assignableUsers.length ? 'No matching assignee found' : 'No team members assigned to this client'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Description <span className="text-red-500">*</span></label>
                    <textarea
                      value={taskComment}
                      onChange={e => { setTaskComment(e.target.value); if (taskError) setTaskError(''); }}
                      placeholder="Describe the task details"
                      className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none bg-slate-100"
                    />
                  </div>

                  {/* Billable Toggle */}
                  <div className={`flex items-center justify-between border rounded-xl px-4 py-3 ${selectedClientId === '__ethinos__' ? 'border-slate-100 bg-slate-50/40 opacity-70' : 'border-slate-200 bg-slate-50/60'}`}>
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                        Billable
                        {selectedClientId === '__ethinos__' && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md tracking-wide">Locked — non-billable</span>}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {selectedClientId === '__ethinos__' ? 'Ethinos internal tasks are always non-billable' : taskBillable ? 'This task is client-chargeable' : 'This task is internal / non-billable'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={taskBillable}
                      aria-label="Toggle billable"
                      disabled={selectedClientId === '__ethinos__'}
                      onClick={() => selectedClientId !== '__ethinos__' && setTaskBillable(b => !b)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${taskBillable ? 'bg-emerald-500' : 'bg-slate-300'} ${selectedClientId === '__ethinos__' ? 'cursor-not-allowed' : ''}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${taskBillable ? 'translate-x-4' : 'translate-x-1'}`} />
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
                          value={estimatedHrs}
                          onChange={e => setEstimatedHrs(e.target.value)}
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
                          value={estimatedMins}
                          onChange={e => setEstimatedMins(e.target.value)}
                        />
                        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">mins</span>
                      </div>
                    </div>
                  </div>

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
                        onClick={() => { setQcEnabled(!qcEnabled); if (qcEnabled) { setQcAssigneeId(''); setQcAssigneeName(''); } }}
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
                          onClick={() => { setQcPickerSearch(''); setShowQcPicker(true); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${qcAssigneeId ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40'}`}
                        >
                          <Users size={13} className={qcAssigneeId ? 'text-indigo-600' : 'text-slate-400'} />
                          {qcAssigneeId ? qcAssigneeName : 'Select a reviewer (optional)'}
                          {qcAssigneeId && (
                            <span role="button" onClick={e => { e.stopPropagation(); setQcAssigneeId(''); setQcAssigneeName(''); }} className="ml-auto text-indigo-400 hover:text-indigo-600 cursor-pointer flex items-center">
                              <X size={12} />
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {departments.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Departments</label>
                      <div className="flex flex-wrap gap-2">
                        {departments.map(dept => {
                          const isSelected = taskDepartments.includes(dept);
                          const isCreatorDept = dept === currentUser?.department;
                          return (
                            <button
                              key={dept}
                              type="button"
                              disabled={isCreatorDept}
                              onClick={() => {
                                if (isCreatorDept) return;
                                setTaskDepartments(prev =>
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

              {taskError && <p className="text-sm font-medium text-red-600">{taskError}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeModal} className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all">
                  Add to Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQcPicker && (
        <UserPickerModal
          title="Select QC Reviewer"
          users={users}
          selected={qcAssigneeId ? [qcAssigneeId] : []}
          onToggle={id => {
            const picked = users.find(u => u.id === id);
            if (picked) {
              setQcAssigneeId(qcAssigneeId === id ? '' : id);
              setQcAssigneeName(qcAssigneeId === id ? '' : picked.name);
            }
            setShowQcPicker(false);
          }}
          onClose={() => setShowQcPicker(false)}
          pickerSearch={qcPickerSearch}
          setPickerSearch={setQcPickerSearch}
        />
      )}

      {qcReviewingTask && (() => {
        const handleSubmitQcReview = () => {
          const ratingNum = parseInt(qcReviewRating, 10);
          const validRating = !isNaN(ratingNum) && ratingNum >= 1 && ratingNum <= 10 ? ratingNum : null;
          if (qcReviewDecision === 'rejected' && !qcReviewFeedback.trim()) return;
          const feedbackText = qcReviewFeedback.trim();
          const existing = Array.isArray(qcReviewingTask.feedbackThread) ? qcReviewingTask.feedbackThread : [];
          const entry = feedbackText ? {
            id: `fb-${Date.now()}`,
            authorId: currentUser?.id || null,
            authorName: currentUser?.name || 'Reviewer',
            text: feedbackText,
            type: qcReviewDecision,
            timestamp: new Date().toISOString(),
          } : null;
          handleUpdateTask(qcReviewingTask, {
            ...(qcReviewDecision === 'rejected' ? { status: 'Pending' } : {}),
            qcStatus: qcReviewDecision,
            qcRating: validRating,
            qcFeedback: feedbackText || null,
            qcReviewedAt: new Date().toISOString(),
            qcReviewerName: currentUser?.name || null,
            feedbackThread: entry ? [...existing, entry] : existing,
          });
          setQcReviewingTask(null);
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
                <button onClick={() => setQcReviewingTask(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"><X size={16}/></button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Task</p>
                  <p className="text-sm font-medium text-slate-700 line-clamp-3">{qcReviewingTask.name || qcReviewingTask.comment}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Assigned to: {qcReviewingTask.assigneeName}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision</label>
                  <div className="flex gap-3">
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all flex-1 justify-center ${qcReviewDecision === 'approved' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <input type="radio" name="homeQcDecision" value="approved" checked={qcReviewDecision === 'approved'} onChange={() => setQcReviewDecision('approved')} className="sr-only" />
                      <ThumbsUp size={14} /> <span className="text-xs font-semibold">Approve</span>
                    </label>
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all flex-1 justify-center ${qcReviewDecision === 'rejected' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <input type="radio" name="homeQcDecision" value="rejected" checked={qcReviewDecision === 'rejected'} onChange={() => setQcReviewDecision('rejected')} className="sr-only" />
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
                    value={qcReviewFeedback}
                    onChange={e => setQcReviewFeedback(e.target.value)}
                    placeholder={qcReviewDecision === 'rejected' ? 'Required — describe what needs to be fixed' : 'Optional comments…'}
                    rows={3}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 ring-indigo-300/30 resize-none"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                <button onClick={() => setQcReviewingTask(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
                <button
                  onClick={handleSubmitQcReview}
                  disabled={qcReviewDecision === 'rejected' && !qcReviewFeedback.trim()}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all ${qcReviewDecision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {qcReviewDecision === 'approved' ? 'Approve' : 'Return for Revision'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* EDIT TASK MODAL */}
      {editingTask && editDraft && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/20 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95 flex flex-col" style={{maxHeight:'90vh'}}>
            {/* Header */}
            <div className="flex-shrink-0 flex justify-between items-center px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Edit Task</h4>
                <p className="text-xs text-slate-400 mt-0.5">{editingTask.name || editingTask.comment}</p>
              </div>
              <button
                onClick={() => { setEditingTask(null); setEditDraft(null); }}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
              >
                <X size={16}/>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5">
              {/* Task Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Name</label>
                <input
                  type="text"
                  value={editDraft.name}
                  onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:ring-2 ring-blue-500/20 bg-white"
                  placeholder="Task name"
                />
              </div>
              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
                <textarea
                  value={editDraft.comment}
                  onChange={e => setEditDraft(d => ({ ...d, comment: e.target.value }))}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 ring-blue-500/20 bg-white resize-none"
                  placeholder="Description"
                />
              </div>
              {/* Category */}
              <div className="space-y-1 relative">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</label>
                <input
                  type="text"
                  value={editDraftCategoryQuery}
                  onChange={e => { setEditDraftCategoryQuery(e.target.value); setEditDraftShowCategoryMenu(true); }}
                  onFocus={() => setEditDraftShowCategoryMenu(true)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 ring-blue-500/20 bg-white"
                  placeholder="Search category…"
                />
                {editDraftShowCategoryMenu && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {(taskCategories || []).filter(c => c.toLowerCase().includes(editDraftCategoryQuery.toLowerCase())).map(c => (
                      <button
                        key={c} type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${editDraft.category === c ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}
                        onClick={() => { setEditDraft(d => ({ ...d, category: c })); setEditDraftCategoryQuery(c); setEditDraftShowCategoryMenu(false); }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Due Date */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                <DueDateInput
                  key={editingTask.id}
                  startDate={hvTryParse(editingTask.date) || new Date()}
                  value={editDraft.dueDate}
                  onChange={date => setEditDraft(d => ({ ...d, dueDate: date }))}
                  minDate={hvTryParse(editingTask.date) || new Date()}
                />
                {editDraft.dueDate && (
                  <button type="button" onClick={() => setEditDraft(d => ({ ...d, dueDate: null }))} className="text-xs font-semibold text-red-500 hover:text-red-700">
                    Clear due date
                  </button>
                )}
              </div>
              {/* Status */}
              <div className="space-y-1">
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
              {/* Series scope */}
              {editingTask.repeatGroupId && (
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apply changes to</label>
                  <div className="flex gap-2">
                    {[{ id: 'one', label: 'This task only' }, { id: 'all', label: 'All tasks in this series' }].map(opt => (
                      <label
                        key={opt.id}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs font-semibold transition-all ${
                          editScope === opt.id
                            ? opt.id === 'all' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <input type="radio" name="hvEditScope" value={opt.id} checked={editScope === opt.id} onChange={() => setEditScope(opt.id)} className="w-3.5 h-3.5 accent-blue-600" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {editScope === 'all' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                      Name, description and category will be updated on all tasks in this series. Due date and status apply to this task only.
                    </p>
                  )}
                </div>
              )}
              {editDraftError && <p className="text-xs text-red-600 font-semibold">{editDraftError}</p>}
            </div>
            {/* Footer */}
            <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => { setEditingTask(null); setEditDraft(null); }} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={handleSaveEditTask} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all">Save</button>
            </div>
          </div>
        </div>
      )}

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          currentUser={currentUser}
          users={users}
          canEdit={canFullyEditTaskFor(detailTask, currentUser)}
          canEditDueDate={false}
          setNotifications={setNotifications}
          seriesCount={
            detailTask.repeatGroupId
              ? (clientLogs[detailTask.cid] || []).filter(t => t.repeatGroupId === detailTask.repeatGroupId).length
              : 0
          }
          onClose={() => setDetailTask(null)}
          onUpdate={(updatedTask, scope) => {
            if (scope === 'all' && updatedTask.repeatGroupId) {
              const sharedFields = {
                steps: updatedTask.steps,
                links: updatedTask.links,
              };
              const nextLogs = {};
              const taskCid = updatedTask.cid;
              Object.entries(clientLogs).forEach(([cid, logs]) => {
                nextLogs[cid] = (logs || []).map(t => {
                  if (t.id === updatedTask.id && cid === taskCid) return { ...t, ...updatedTask };
                  if (cid === taskCid && t.repeatGroupId === updatedTask.repeatGroupId) return { ...t, ...sharedFields };
                  return t;
                });
              });
              setClientLogs(nextLogs);
            } else {
              handleUpdateTask(updatedTask, updatedTask);
            }
            setDetailTask(updatedTask);
          }}
        />
      )}

      {/* CHECKLIST GROUP DETAIL PANEL */}
      {detailGroup && (
        <ChecklistGroupDetailPanel
          group={detailGroup}
          childTasks={getGroupChildren(detailGroup)}
          currentUser={currentUser}
          users={users}
          taskCategories={taskCategories}
          onClose={() => setDetailGroup(null)}
          onUpdateChildTask={handleUpdateGroupChildTask}
          onUpdateGroup={(updatedGroup) => {
            handleUpdateGroup(updatedGroup);
            setDetailGroup(updatedGroup);
          }}
          onOpenTask={(task) => {
            setDetailGroup(null);
            setDetailTask(task);
          }}
          onCreateTaskFromItem={handleCreateTaskFromItem}
          onDeleteGroup={handleDeleteGroup}
        />
      )}

      {/* NEW CHECKLIST MODAL */}
      {showNewChecklistModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/10 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95 flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex-shrink-0 flex justify-between items-center px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                  <ClipboardList size={16} className="text-teal-600" />
                </div>
                <h4 className="text-base font-bold text-slate-900">New Checklist Group</h4>
              </div>
              <button onClick={closeNewChecklistModal} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Template */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist Template <span className="text-red-500">*</span></label>
                <select
                  value={clSelectedTemplateId}
                  onChange={e => { setClSelectedTemplateId(e.target.value); if (clError) setClError(''); }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                >
                  <option value="">— Select template —</option>
                  {checklistTemplates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name} ({tpl.departmentId || tpl.cadence})</option>
                  ))}
                </select>
                {clSelectedTemplateId && (() => {
                  const tpl = checklistTemplates.find(t => t.id === clSelectedTemplateId);
                  return tpl ? (
                    <p className="text-[11px] text-slate-500">{(tpl.questions || []).length} question{(tpl.questions || []).length !== 1 ? 's' : ''} · {tpl.cadence}</p>
                  ) : null;
                })()}
              </div>

              {/* Client */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client <span className="text-red-500">*</span></label>
                <select
                  value={clSelectedClientId}
                  onChange={e => { setClSelectedClientId(e.target.value); if (clError) setClError(''); }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                >
                  <option value="">— Select client —</option>
                  {allClientOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.isPersonal ? 'Personal (My Tasks)' : c.isEthinos ? 'Ethinos (Internal)' : c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assignee */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign To <span className="text-red-500">*</span></label>
                {!isManagement ? (
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 flex items-center gap-2 select-none">
                    <Users size={14} className="text-slate-400 flex-shrink-0" />
                    <span className="flex-1">{currentUser?.name || 'You'}</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Self only</span>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search assignee"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                      value={clAssigneeQuery}
                      onFocus={() => setClShowAssigneeMenu(true)}
                      onChange={e => { setClAssigneeQuery(e.target.value); setClAssigneeId(''); setClShowAssigneeMenu(true); if (clError) setClError(''); }}
                    />
                    {clShowAssigneeMenu && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                        {users.filter(u => !clAssigneeQuery.trim() || (u.name || '').toLowerCase().includes(clAssigneeQuery.toLowerCase())).length
                          ? users.filter(u => !clAssigneeQuery.trim() || (u.name || '').toLowerCase().includes(clAssigneeQuery.toLowerCase())).map(u => (
                            <button key={u.id} type="button"
                              onClick={() => { setClAssigneeId(u.id); setClAssigneeName(u.name); setClAssigneeQuery(u.name); setClShowAssigneeMenu(false); if (clError) setClError(''); }}
                              className="w-full text-left px-3 py-2 bg-white hover:bg-slate-50 transition-all"
                            >
                              <p className="text-sm font-semibold text-slate-700">{u.name}</p>
                              <p className="text-xs text-slate-500">{u.email || u.role || ''}</p>
                            </button>
                          ))
                          : <p className="px-3 py-2 text-sm text-slate-500">No users found</p>
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</label>
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <DatePicker
                    selected={clSelectedDate}
                    onChange={date => setClSelectedDate(date)}
                    inline
                  />
                </div>
              </div>

              {/* Repeat Frequency */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat Frequency</label>
                <div className="flex flex-wrap gap-2">
                  {['Once', 'Daily', 'Weekly', 'Monthly'].map(freq => (
                    <label key={freq} className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50 transition-all"
                      style={clRepeatFreq === freq ? { borderColor: '#2563eb', backgroundColor: '#eff6ff' } : { borderColor: '#e2e8f0' }}
                    >
                      <input type="radio" name="clRepeatFreq" value={freq} checked={clRepeatFreq === freq}
                        onChange={e => { setClRepeatFreq(e.target.value); if (e.target.value === 'Once') setClRepeatEnd(null); }}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-700">{freq}</span>
                    </label>
                  ))}
                </div>
                {clRepeatFreq !== 'Once' && (
                  <div className="mt-2 space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat Until</label>
                    <DatePicker
                      selected={clRepeatEnd}
                      onChange={date => setClRepeatEnd(date)}
                      placeholderText="Select end date"
                      dateFormat="do MMM yyyy"
                      minDate={clSelectedDate || new Date()}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    />
                  </div>
                )}
              </div>

              {clError && (
                <p className="text-xs font-semibold text-red-500">{clError}</p>
              )}
            </div>

            <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={closeNewChecklistModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                Cancel
              </button>
              <button
                onClick={handleCreateChecklistGroup}
                className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-all shadow-sm"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveConflict && leaveModalOpen && (
        <LeaveConflictModal
          conflict={leaveConflict}
          userName={assigneeName || users.find(u => String(u.id) === String(assigneeId))?.name || 'Assignee'}
          onProceed={() => {
            const id = (assigneeId || '').toString();
            const dateKey = toDateKey(taskDueDate);
            acknowledgedLeaveRef.current = `${id}__${dateKey}`;
            setLeaveModalOpen(false);
          }}
          onCancel={() => {
            setLeaveConflict(null);
            setLeaveModalOpen(false);
            setTaskDueDate(null);
          }}
        />
      )}

      {editLeaveConflict && (
        <LeaveConflictModal
          conflict={editLeaveConflict}
          userName={currentUser?.name || 'Assignee'}
          onProceed={() => {
            const id = String(currentUser?.id || '');
            const dateKey = toDateKey(editDraft?.dueDate);
            editAcknowledgedLeaveRef.current = `${id}__${dateKey}`;
            setEditLeaveConflict(null);
          }}
          onCancel={() => {
            setEditLeaveConflict(null);
            setEditDraft(prev => prev ? { ...prev, dueDate: null } : prev);
          }}
        />
      )}
    </div>
  );
};

export default HomeView;
