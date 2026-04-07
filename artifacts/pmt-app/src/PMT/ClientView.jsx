import React, { useEffect, useState } from 'react';
import { Search, ChevronLeft, Plus, Clock, Activity, CheckCircle, X, Star, Edit2, Trash2, Eye, Crown, AlertCircle, Play, Pause, Square, Check, Users, ShieldCheck, RotateCcw, ThumbsUp, ThumbsDown, Send } from 'lucide-react';

/* ─── Reusable User Picker Modal ─── */
const UserPickerModal = ({ title, users, selected, onToggle, onClose, pickerSearch, setPickerSearch }) => {
  const q = pickerSearch.toLowerCase().trim();
  const filtered = (users || []).filter(u =>
    !q ||
    (u.name || '').toLowerCase().includes(q) ||
    (u.role || '').toLowerCase().includes(q) ||
    (u.department || '').toLowerCase().includes(q)
  );
  const roleColor = (role = '') => {
    if (['Super Admin'].includes(role)) return 'bg-purple-100 text-purple-700';
    if (['Director','Business Head'].includes(role)) return 'bg-blue-100 text-blue-700';
    if (['Manager','Snr Manager','Project Manager','CSM'].includes(role)) return 'bg-indigo-100 text-indigo-700';
    return 'bg-slate-100 text-slate-600';
  };
  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col" style={{maxHeight:'80vh'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            {selected.length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{selected.length}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"><X size={16}/></button>
        </div>
        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input
              autoFocus
              type="text"
              placeholder="Search by name, role, or department..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-300"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
            />
          </div>
        </div>
        {/* User List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No users found</p>
          )}
          {filtered.map(u => {
            const isSelected = selected.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggle(u.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                  isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {isSelected ? <Check size={14}/> : (u.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{u.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleColor(u.role)}`}>{u.role}</span>
                    {u.department && <span className="text-[10px] text-slate-400">{u.department}</span>}
                  </div>
                </div>
                {isSelected && <Check size={14} className="text-blue-600 flex-shrink-0"/>}
              </button>
            );
          })}
        </div>
        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-lg transition-all shadow-sm"
          >
            Done — {selected.length} selected
          </button>
        </div>
      </div>
    </div>
  );
};
import DatePicker from "react-datepicker";
import { format, subDays, parse } from 'date-fns';
import "react-datepicker/dist/react-datepicker.css";

const ClientView = ({ 
  selectedClient, setSelectedClient, clients = [], setClients, 
  clientLogs = {}, setClientLogs, clientSearch = "", setClientSearch,
  users = [], setUsers, currentUser, taskCategories = [], taskTemplates = [], setNotifications = () => {}
}) => {
  const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
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
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [activePicker, setActivePicker] = useState(null); // 'addLeadership'|'addTeam'|'qcReviewer'
  const [pickerSearch, setPickerSearch] = useState("");

  // QC form state (for new task creation)
  const [qcEnabled, setQcEnabled] = useState(true);
  const [qcAssigneeId, setQcAssigneeId] = useState('');
  const [qcAssigneeName, setQcAssigneeName] = useState('');

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
  const [templateStartDate, setTemplateStartDate] = useState(new Date());
  const [templateAssigneeId, setTemplateAssigneeId] = useState('');
  const [templateAssigneeQuery, setTemplateAssigneeQuery] = useState('');
  const [templateApplyError, setTemplateApplyError] = useState('');

  const isManagement = managementRoles.includes(currentUser?.role);

  // Permission helpers for task-level access
  const canFullyEditTask = (log) => {
    if (!currentUser) return false;
    if (managementRoles.includes(currentUser.role)) return true;
    return String(log.creatorId) === String(currentUser.id);
  };
  const canChangeTaskStatus = (log) => {
    if (canFullyEditTask(log)) return true;
    return String(log.assigneeId) === String(currentUser?.id);
  };

  const openEditModal = (log) => {
    const tryParse = (str) => {
      if (!str) return null;
      try { return parse(str, 'do MMM yyyy', new Date()); } catch { return null; }
    };
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
      status: log.status || 'Pending',
      qcEnabled: log.qcEnabled ?? true,
      qcAssigneeId: log.qcAssigneeId || '',
      qcAssigneeName: log.qcAssigneeName || '',
    });
    setEditDraftCategoryQuery(log.category || '');
    setEditDraftAssigneeQuery(log.assigneeName || '');
    setEditDraftShowCategoryMenu(false);
    setEditDraftShowAssigneeMenu(false);
    setEditDraftError('');
  };

  const handleSaveEditTask = () => {
    if (!editDraft) return;
    if (!editDraft.name.trim() || !editDraft.comment.trim() || !editDraft.category || !editDraft.assigneeId) {
      setEditDraftError('Task name, description, category and assignee are all required.');
      return;
    }
    const assignee = (users || []).find(u => String(u.id) === String(editDraft.assigneeId));
    const updated = (clientLogs[selectedClient.id] || []).map(l =>
      l.id === editingTask.id ? {
        ...l,
        name: editDraft.name.trim() || '',
        comment: editDraft.comment.trim(),
        category: editDraft.category,
        assigneeId: editDraft.assigneeId,
        assigneeName: assignee?.name || l.assigneeName,
        assigneeEmail: assignee?.email || l.assigneeEmail,
        date: format(editDraft.date || new Date(), 'do MMM yyyy'),
        dueDate: editDraft.dueDate ? format(editDraft.dueDate, 'do MMM yyyy') : null,
        repeatFrequency: editDraft.repeatFrequency,
        status: editDraft.status,
        qcEnabled: editDraft.qcEnabled,
        qcAssigneeId: editDraft.qcEnabled && editDraft.qcAssigneeId ? editDraft.qcAssigneeId : null,
        qcAssigneeName: editDraft.qcEnabled && editDraft.qcAssigneeName ? editDraft.qcAssigneeName : null,
      } : l
    );
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

  useEffect(() => {
    setExpandedTaskId(null);
  }, [selectedClient?.id, taskStatusFilter]);

  const formatDuration = (milliseconds = 0) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
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
      const shouldReset = log.timerState === 'stopped';
      return {
        ...log,
        timerState: 'running',
        timerStartedAt: Date.now(),
        elapsedMs: shouldReset ? 0 : (log.elapsedMs || 0),
        timeTaken: shouldReset ? null : log.timeTaken
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
    const logs = clientLogs[clientId] || [];
    const twoDaysAgo = subDays(new Date(), 2);

    return {
      open: logs.filter(l => l.status === 'Pending').length,
      wip: logs.filter(l => l.timerState === 'running').length,
      done: logs.filter(l => l.status === 'Done').length,
      // Tasks older than 48 hours and not completed yet
      recentPending: logs.filter(l => {
        if (l.status === 'Done') return false;
        try {
          const taskDate = parse(l.date, 'do MMM yyyy', new Date());
          return taskDate <= twoDaysAgo;
        } catch (e) { return false; }
      }).length
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
      qcReviewedAt: null
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

    setClientLogs({
      ...clientLogs,
      [selectedClient.id]: [newLog, ...(clientLogs[selectedClient.id] || [])]
    });
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
    setTaskDueDate(null);
    setQcEnabled(true);
    setQcAssigneeId('');
    setQcAssigneeName('');
    setShowTaskForm(false);
  };

  // --- TEMPLATE APPLY HELPERS ---
  const openTemplateModal = () => {
    setTemplateSearch('');
    setSelectedTemplateId(null);
    setTemplateStep(1);
    setTemplateStartDate(new Date());
    setTemplateAssigneeId('');
    setTemplateAssigneeQuery('');
    setTemplateApplyError('');
    setShowTemplateModal(true);
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setSelectedTemplateId(null);
    setTemplateStep(1);
    setTemplateSearch('');
    setTemplateAssigneeId('');
    setTemplateAssigneeQuery('');
    setTemplateApplyError('');
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplateId || !selectedClient) return;
    const tpl = taskTemplates.find(t => t.id === selectedTemplateId);
    if (!tpl) return;
    const assignee = (users || []).find(u => String(u.id) === String(templateAssigneeId));
    if (!assignee) { setTemplateApplyError('Please select an assignee.'); return; }
    const clientTeam = getProjectStaff(selectedClient.name);
    const clientMemberIds = new Set([
      ...clientTeam.admins.map(u => String(u.id)),
      ...clientTeam.employees.map(u => String(u.id)),
    ]);
    if (!clientMemberIds.has(String(assignee.id))) {
      setTemplateApplyError('The selected assignee is not on this client\'s team.');
      return;
    }

    const dateStr = format(templateStartDate, 'do MMM yyyy');
    const newTasks = tpl.tasks.map(taskItem => ({
      id: Date.now() + Math.random(),
      date: dateStr,
      dueDate: null,
      comment: taskItem.comment,
      result: '',
      status: 'Pending',
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || 'Employee',
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email || '',
      category: taskItem.category || '',
      repeatFrequency: taskItem.repeatFrequency || 'Once',
      timerState: 'idle',
      timerStartedAt: null,
      elapsedMs: 0,
      timeTaken: null,
    }));

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
    const filteredTaskLogs = (clientLogs[selectedClient.id] || []).filter(log =>
      taskStatusFilter === 'All' ? true : log.status === taskStatusFilter
    );
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
            <select
              value={taskStatusFilter}
              onChange={(e) => setTaskStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
            >
              <option value="All">All Tasks</option>
              <option value="Pending">Pending</option>
              <option value="WIP">WIP</option>
              <option value="Done">Completed</option>
            </select>
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
                setTaskDueDate(null);
                setQcEnabled(true);
                setQcAssigneeId('');
                setQcAssigneeName('');
                setShowTaskForm(true);
              }}
              className="bg-blue-600 text-white px-3.5 py-2 rounded-lg font-semibold text-xs hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-md"
            >
              <Plus size={14}/> Add Task
            </button>
          </div>
        </div>

        {/* --- OVERALL NUMBERS ROW --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                  const isExpanded = expandedTaskId === log.id;
                  const timerState = log.timerState || (log.elapsedMs > 0 ? 'paused' : 'idle');

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setExpandedTaskId(isExpanded ? null : log.id)}
                      className={`hover:bg-slate-50 transition-all group align-top cursor-pointer ${isExpanded ? 'bg-slate-50/70' : ''}`}
                    >
                      {/* Date */}
                      <td className="px-1.5 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">{String(log.date || '').replace(/\s+\d{4}$/, '')}</td>

                      {/* Task name */}
                      <td className="px-1.5 py-2">
                        <p className={`text-xs font-semibold text-slate-800 leading-4 break-words ${isExpanded ? '' : 'line-clamp-2'}`}>{log.name || '—'}</p>
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
                          {isExpanded && log.assigneeEmail && (
                            <p className="text-[10px] text-slate-500 truncate">{log.assigneeEmail}</p>
                          )}
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-2 py-2">
                        <p className={`text-xs text-slate-600 leading-4 break-words ${isExpanded ? '' : 'line-clamp-2'}`}>{log.comment}</p>
                        {isExpanded && log.qcEnabled && log.qcAssigneeName && (
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

                      {/* Edit / Delete */}
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {canFullyEditTask(log) && (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEditModal(log)}
                              className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                              title="Edit task"
                            >
                              <Edit2 size={12}/>
                            </button>
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
                          </div>
                        )}
                      </td>

                      {/* Timer display */}
                      <td className="px-1.5 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] font-semibold text-slate-700">{formatDuration(getElapsedMs(log))}</span>
                          {isExpanded && timerState === 'stopped' && log.timeTaken && (
                            <span className="text-[8px] font-medium text-emerald-600">Time: {log.timeTaken}</span>
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
                                const updated = clientLogs[selectedClient.id].map(l =>
                                  l.id === log.id ? {
                                    ...l,
                                    status: newStatus,
                                    qcStatus: newStatus !== 'Done' && l.qcStatus === 'sent' ? null : l.qcStatus
                                  } : l
                                );
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
                          {log.qcEnabled && log.status === 'Done' && !log.qcStatus && canChangeTaskStatus(log) && (
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
                          {/* Timer controls */}
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
          <div className="fixed inset-0 z-[600] flex items-start justify-center bg-slate-900/10 backdrop-blur-md overflow-y-auto p-4">
            <div className="bg-white w-full max-w-5xl border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95 flex flex-col my-auto">
              {/* Sticky header */}
              <div className="flex justify-between items-center px-8 pt-7 pb-5 border-b border-slate-100">
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
              <form onSubmit={addTaskEntry} className="space-y-6 px-8 py-6 overflow-y-auto">
                <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Select</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDate(new Date())}
                          className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() + 1)))}
                          className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                          Tomorrow
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() + 7)))}
                          className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                          Next Week
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() + 30)))}
                          className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                          Next Month
                        </button>
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                      <DatePicker selected={selectedDate} onChange={(date) => setSelectedDate(date)} inline />
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
                        <p className="text-[11px] text-blue-600 font-medium">Task will repeat every week on the same day</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                      <DatePicker
                        selected={taskDueDate}
                        onChange={(date) => setTaskDueDate(date)}
                        placeholderText="Select due date"
                        dateFormat="do MMM yyyy"
                        minDate={new Date()}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
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
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setQcAssigneeId(''); setQcAssigneeName(''); }}
                                className="ml-auto text-indigo-400 hover:text-indigo-600"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
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
            <div className="fixed inset-0 z-[700] flex items-start justify-center bg-slate-900/20 backdrop-blur-md overflow-y-auto p-4">
              <div className="bg-white w-full max-w-5xl border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95 flex flex-col my-auto">
                {/* Header */}
                <div className="flex justify-between items-center px-8 pt-7 pb-5 border-b border-slate-100">
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
                <div className="space-y-6 px-8 py-6 overflow-y-auto">
                  <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-6">
                    {/* Left column: dates + status */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Date</label>
                        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                          <DatePicker
                            selected={editDraft.date}
                            onChange={date => setEditDraft(d => ({ ...d, date: date || new Date() }))}
                            inline
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                        <DatePicker
                          selected={editDraft.dueDate}
                          onChange={date => setEditDraft(d => ({ ...d, dueDate: date }))}
                          placeholderText="Select due date"
                          dateFormat="do MMM yyyy"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                        />
                        {editDraft.dueDate && (
                          <button type="button" onClick={() => setEditDraft(d => ({ ...d, dueDate: null }))} className="text-xs font-semibold text-red-600 hover:text-red-700">
                            Clear Due Date
                          </button>
                        )}
                      </div>
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
            const updated = clientLogs[selectedClient.id].map(l =>
              l.id === qcReviewingTaskId ? {
                ...l,
                qcStatus: qcReviewDecision,
                qcRating: validRating,
                qcFeedback: qcReviewFeedback.trim() || null,
                qcReviewedAt: new Date().toISOString(),
                qcReviewerName: currentUser?.name || null
              } : l
            );
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

        {/* ─── TEMPLATE PICKER MODAL ─── */}
        {showTemplateModal && (() => {
          const projectStaffForTpl = getProjectStaff(selectedClient.name);
          const assignableForTpl = [...projectStaffForTpl.admins, ...projectStaffForTpl.employees];
          const filteredAssigneesForTpl = templateAssigneeQuery.trim()
            ? assignableForTpl.filter(u => u.name.toLowerCase().includes(templateAssigneeQuery.toLowerCase()))
            : assignableForTpl;
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
                        : 'Set the start date and assignee for all tasks.'}
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
                            <div key={idx} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-700 leading-snug">{task.comment}</p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {task.category && (
                                    <span className="text-[9px] font-medium text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">{task.category}</span>
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

                {/* Step 2: Date + assignee */}
                {templateStep === 2 && (
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Date */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">Start Date</label>
                      <DatePicker
                        selected={templateStartDate}
                        onChange={date => setTemplateStartDate(date)}
                        dateFormat="do MMM yyyy"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
                      />
                    </div>

                    {/* Assignee */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">Assignee <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input
                          value={templateAssigneeQuery}
                          onChange={e => { setTemplateAssigneeQuery(e.target.value); setTemplateAssigneeId(''); }}
                          placeholder="Search team member..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
                        />
                      </div>
                      <div className="space-y-1 max-h-52 overflow-y-auto">
                        {filteredAssigneesForTpl.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => { setTemplateAssigneeId(u.id); setTemplateAssigneeQuery(u.name); setTemplateApplyError(''); }}
                            className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                              String(templateAssigneeId) === String(u.id)
                                ? 'bg-blue-50 border-blue-200'
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${String(templateAssigneeId) === String(u.id) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                              {(u.name || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-800">{u.name}</p>
                              <p className="text-[10px] text-slate-400">{u.role}</p>
                            </div>
                          </button>
                        ))}
                        {filteredAssigneesForTpl.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-4">No team members found</p>
                        )}
                      </div>
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
                      onClick={() => setTemplateStep(2)}
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
      </div>
    );
  }

  // --- GRID VIEW (ALL CLIENTS) ---
  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));

  // --- PICKER CONFIG (only qcReviewer remains here) ---
  const pickerAllUsers = users || [];

  return (
    <div className="p-3 space-y-5 animate-in fade-in duration-500 text-left min-h-full">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input type="text" placeholder="Filter Clients..." className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 ring-blue-500/20 shadow-sm text-slate-700" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredClients.map(c => {
          const counts = getTaskCounts(c.id);
          const staff = getProjectStaff(c.name);
          
          // Calculate average time spent per day
          const projectLogs = clientLogs[c.id] || [];
          const dailyTotals = {};
          projectLogs.forEach(log => {
            if (!dailyTotals[log.date]) {
              dailyTotals[log.date] = 0;
            }
            dailyTotals[log.date] += log.elapsedMs || 0;
          });
          const uniqueDays = Object.keys(dailyTotals).length || 1;
          const totalMs = Object.values(dailyTotals).reduce((sum, ms) => sum + ms, 0);
          const avgMs = totalMs / uniqueDays;
          const avgHours = Math.floor(avgMs / 3600000);
          const avgMinutes = Math.floor((avgMs % 3600000) / 60000);
          const avgTimeStr = avgHours > 0 ? `${avgHours}h ${avgMinutes}m` : `${avgMinutes}m`;
          
          return (
            <div
              key={c.id}
              onClick={() => setSelectedClient(c)}
              className="group bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer"
            >
              {/* Header with Account Name and Avg Time */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900 uppercase tracking-tight group-hover:text-blue-600 transition-all">{c.name}</h3>
                <div className="bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200 flex-shrink-0">
                  <p className="text-[8px] font-semibold text-purple-600">AVG</p>
                  <p className="text-xs font-bold text-purple-700">{avgTimeStr}</p>
                </div>
              </div>

              {/* Leadership Section */}
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

              {/* Team Section */}
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

              {/* Status Cards */}
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                <div className="bg-orange-50 px-2 py-2 rounded-xl border border-orange-200 text-center">
                  <Clock size={14} className="text-orange-500 mx-auto mb-0.5" />
                  <p className="text-xs font-bold text-orange-600">{counts.open}</p>
                  <p className="text-[9px] text-orange-500 font-medium">Pending</p>
                </div>
                <div className="bg-blue-50 px-2 py-2 rounded-xl border border-blue-200 text-center">
                  <Activity size={14} className="text-blue-500 mx-auto mb-0.5" />
                  <p className="text-xs font-bold text-blue-600">{counts.wip}</p>
                  <p className="text-[9px] text-blue-500 font-medium">WIP</p>
                </div>
                <div className="bg-emerald-50 px-2 py-2 rounded-xl border border-emerald-200 text-center">
                  <CheckCircle size={14} className="text-emerald-500 mx-auto mb-0.5" />
                  <p className="text-xs font-bold text-emerald-600">{counts.done}</p>
                  <p className="text-[9px] text-emerald-500 font-medium">Done</p>
                </div>
              </div>

              {/* View Tasks Button */}
              <button
                onClick={() => setSelectedClient(c)}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:from-blue-700 hover:to-blue-600 transition-all shadow-md group-hover:shadow-lg"
              >
                <Eye size={15} /> View Tasks
              </button>
            </div>
          );
        })}
      </div>

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