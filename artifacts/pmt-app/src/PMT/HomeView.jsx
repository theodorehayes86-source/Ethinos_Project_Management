import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { format, parse, isBefore } from 'date-fns';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Briefcase, Clock, Activity, AlertTriangle, ChevronRight, Plus, X, Search, ShieldCheck, Users, CheckCircle, Tag, Calendar, Archive, ArchiveRestore, LayoutTemplate, ChevronDown, Play, Square, Pause } from 'lucide-react';
import UserPickerModal from './UserPickerModal';
import TaskDetailPanel from './TaskDetailPanel';

const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];

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
  setNotifications = () => {},
  taskTemplates = [],
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
  const [taskDepartments, setTaskDepartments] = useState([]);
  const [taskBillable, setTaskBillable] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [estimatedHrs, setEstimatedHrs] = useState('');
  const [estimatedMins, setEstimatedMins] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [detailTask, setDetailTask] = useState(null);

  // --- Home Template state ---
  const [showHomeTemplateModal, setShowHomeTemplateModal] = useState(false);
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
  };

  const openAddTaskModal = () => { resetModal(); setShowAddTaskModal(true); };
  const closeModal = () => { setShowAddTaskModal(false); resetModal(); };

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
    };
    const nextLogs = { ...clientLogs, [selectedClientId]: [newTask, ...(clientLogs[selectedClientId] || [])] };
    setClientLogs(nextLogs);
    closeModal();
  };

  // --- Personal task data ---
  const myTasks = useMemo(() => {
    return allTasks.filter(t => String(t.assigneeId) === String(currentUser?.id) && !t.archived);
  }, [allTasks, currentUser]);

  const myArchivedTasks = useMemo(() => {
    return allTasks.filter(t => String(t.assigneeId) === String(currentUser?.id) && t.archived);
  }, [allTasks, currentUser]);

  const myOpenTasks = myTasks.filter(t => t.status !== 'Done');
  const myWip = myTasks.filter(t => t.status === 'WIP');
  const myPending = myTasks.filter(t => t.status === 'Pending');
  const myDone = myTasks.filter(t => t.status === 'Done');

  const filteredMyTasks = useMemo(() => {
    if (showArchived) return myArchivedTasks;
    if (statusFilter === 'all') return myTasks.filter(t => t.status !== 'Done');
    if (statusFilter === 'done') return myDone;
    return myTasks.filter(t => t.status === statusFilter);
  }, [myTasks, myDone, myArchivedTasks, statusFilter, showArchived]);

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

  // Timer tick for live display
  const [timerTick, setTimerTick] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTimerTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
  }, [clientLogs]);

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
    handleUpdateTask(task, { status: newStatus, ...timerUpdate });
    setDetailTask(prev => prev?.id === task.id ? { ...prev, status: newStatus, ...timerUpdate } : prev);
  };

  // Group tasks by client
  const tasksByClient = useMemo(() => {
    const groups = {};
    filteredMyTasks.forEach(task => {
      const key = task.cid || 'unknown';
      if (!groups[key]) groups[key] = { clientName: task.cName || 'Unknown Client', clientId: task.cid, tasks: [] };
      groups[key].tasks.push(task);
    });
    return Object.values(groups);
  }, [filteredMyTasks]);

  const statusColor = (status) => {
    if (status === 'Done') return 'bg-emerald-100 text-emerald-700';
    if (status === 'WIP') return 'bg-blue-100 text-blue-700';
    return 'bg-orange-100 text-orange-700';
  };

  const isTaskOverdue = (task) => {
    if (!task.dueDate || task.status === 'Done') return false;
    try {
      const due = parse(task.dueDate, 'do MMM yyyy', new Date());
      return isBefore(due, new Date());
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
          { label: 'My Clients', value: accessibleClients.length, icon: <Briefcase size={16} className="text-blue-600"/>, bgColor: 'bg-blue-50', iconBgColor: 'bg-blue-100', border: 'border-blue-100', onClick: onNavigateToClients },
          { label: 'Open Tasks', value: myOpenTasks.length, icon: <Clock size={16} className="text-green-600"/>, bgColor: 'bg-green-50', iconBgColor: 'bg-green-100', border: 'border-green-100' },
          { label: 'WIP', value: myWip.length, icon: <Activity size={16} className="text-orange-500"/>, bgColor: 'bg-orange-50', iconBgColor: 'bg-orange-100', border: 'border-orange-100' },
          { label: 'Pending', value: myPending.length, icon: <AlertTriangle size={16} className="text-red-500"/>, bgColor: 'bg-red-50', iconBgColor: 'bg-red-100', border: 'border-red-100' },
        ].map((stat, i) => (
          <div
            key={i}
            onClick={stat.onClick}
            className={`${stat.bgColor} p-4 rounded-2xl shadow-sm border ${stat.border} flex flex-col justify-between h-24 ${stat.onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all' : ''}`}
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500">{stat.label}</span>
              <div className={`p-2 ${stat.iconBgColor} rounded-lg`}>{stat.icon}</div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* TASK LIST HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800">My Tasks</h2>
          <span className="text-xs text-slate-400 font-medium">({myTasks.length} total)</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Status filter pills */}
          {!showArchived && (
            <div className="flex gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {[
                { key: 'all', label: 'Open' },
                { key: 'WIP', label: 'WIP' },
                { key: 'Pending', label: 'Pending' },
                { key: 'done', label: 'Done' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    statusFilter === f.key
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border transition-all ${
              showArchived
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
            title={showArchived ? 'Back to active tasks' : 'Show archived tasks'}
          >
            {showArchived ? <ArchiveRestore size={12}/> : <Archive size={12}/>}
            {showArchived ? 'Hide Archived' : `Archived${myArchivedTasks.length > 0 ? ` (${myArchivedTasks.length})` : ''}`}
          </button>
          {roleHomeTemplates.length > 0 && (
            <button
              onClick={() => { setShowHomeTemplateModal(true); setSelectedHomeTemplateId(null); setHomeTemplateFilter('All'); setExpandedTemplateTasks({}); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all"
            >
              <LayoutTemplate size={12} /> Use Template
            </button>
          )}
          <button
            onClick={openAddTaskModal}
            className="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={13} /> Add Task
          </button>
        </div>
      </div>

      {/* TASK LIST */}
      {filteredMyTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white/60 rounded-2xl border border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckCircle size={24} className="text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-500">
            {showArchived ? 'No archived tasks' : statusFilter === 'done' ? 'No completed tasks yet' : 'No tasks here'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {showArchived ? 'Tasks you archive will appear here.' : statusFilter === 'all' ? 'Tasks assigned to you will appear here.' : 'Switch filter to see other tasks.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {tasksByClient.map(({ clientName, clientId, tasks }) => {
            const client = accessibleClients.find(c => c.id === clientId);
            return (
              <div key={clientId}>
                {/* Client header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-black text-indigo-700">
                        {(clientName || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{clientName}</span>
                    <span className="text-xs text-slate-400">({tasks.length})</span>
                  </div>
                  {client && (
                    <button
                      onClick={() => setSelectedClient(client)}
                      className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-blue-600 transition-colors bg-white border border-slate-200 px-2.5 py-1 rounded-lg"
                    >
                      View client <ChevronRight size={11}/>
                    </button>
                  )}
                </div>

                {/* Task rows — same functionality as client view */}
                <div className="space-y-2 pl-9">
                  {tasks.map(task => {
                    const elapsed = getElapsedMs(task);
                    const isRunning = task.timerState === 'running';
                    const isPaused = task.timerState === 'paused';
                    const isStopped = task.timerState === 'stopped';
                    const showTimer = !task.archived && task.status !== 'Done';
                    return (
                      <div
                        key={task.id}
                        className={`bg-white rounded-xl border shadow-sm px-4 py-3 transition-all ${
                          isRunning ? 'border-blue-300 shadow-blue-100' : 'border-slate-100 hover:border-slate-200 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Status dot */}
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            task.status === 'Done' ? 'bg-emerald-400' :
                            task.status === 'WIP' ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]' : 'bg-orange-400'
                          }`} />

                          {/* Task name — clickable opens detail panel */}
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailTask(task)}>
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
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
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
                </div>
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
                  <p className="text-sm font-semibold text-slate-500">No templates for this frequency</p>
                  <p className="text-xs text-slate-400 mt-1">Try switching to "All" to see all available templates.</p>
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

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Select</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Today', days: 0 },
                        { label: 'Tomorrow', days: 1 },
                        { label: 'Next Week', days: 7 },
                        { label: 'Next Month', days: 30 },
                      ].map(({ label, days }) => (
                        <button key={label} type="button"
                          onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() + days)))}
                          className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                    <DatePicker
                      selected={selectedDate}
                      onChange={date => {
                        setSelectedDate(date);
                        if (taskDueDate && date && date > taskDueDate) setTaskDueDate(null);
                      }}
                      inline
                    />
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

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat Frequency</label>
                    <div className="flex flex-wrap gap-3">
                      {['Once', 'Daily', 'Weekly', 'Monthly'].map(freq => (
                        <label key={freq} className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50 transition-all"
                          style={taskRepeat === freq ? { borderColor: '#2563eb', backgroundColor: '#eff6ff' } : { borderColor: '#e2e8f0' }}
                        >
                          <input type="radio" name="homeTaskRepeat" value={freq} checked={taskRepeat === freq} onChange={e => setTaskRepeat(e.target.value)} className="w-4 h-4 accent-blue-600 cursor-pointer"/>
                          <span className="text-xs font-semibold text-slate-700">{freq}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                    <DatePicker
                      selected={taskDueDate}
                      onChange={date => setTaskDueDate(date)}
                      placeholderText="Select due date"
                      dateFormat="do MMM yyyy"
                      minDate={selectedDate || new Date()}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    />
                    {taskDueDate && (
                      <button type="button" onClick={() => setTaskDueDate(null)} className="text-xs font-semibold text-red-600 hover:text-red-700">
                        Clear Due Date
                      </button>
                    )}
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

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          currentUser={currentUser}
          users={users}
          setNotifications={setNotifications}
          onClose={() => setDetailTask(null)}
          onUpdate={(updatedTask) => {
            handleUpdateTask(updatedTask, updatedTask);
            setDetailTask(updatedTask);
          }}
        />
      )}
    </div>
  );
};

export default HomeView;
