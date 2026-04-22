import React, { useMemo, useState, useEffect } from 'react';
import { Plus, Trash2, Search, ShieldCheck, Edit2, X, ChevronUp, ChevronDown, Lock, Users, Crown, Check, Star, UserCheck, UserPlus, Edit3, Mail, MessageSquare, Bug, Lightbulb, AlertCircle, CheckCircle2, Clock, Filter, Eye, EyeOff, FlaskConical, Archive, ArchiveRestore, ChevronRight, CornerDownLeft, Send, Upload, Pencil } from 'lucide-react';
import UserPickerModal from './UserPickerModal';
import CsvImportModal from './CsvImportModal';
import { sendNotification } from '../utils/notify';

const REPEAT_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Once'];

const emptyTask = () => ({ name: '', comment: '', category: '', repeatFrequency: 'Monthly', steps: [] });

const OffDeptAllToggle = ({ value, onChange, locked }) => {
  const opts = ['off', 'dept', 'all'];
  const styles = {
    off:  { active: 'bg-slate-700 text-white', inactive: 'bg-white text-slate-400 hover:bg-slate-50' },
    dept: { active: 'bg-amber-500 text-white', inactive: 'bg-white text-slate-400 hover:bg-slate-50' },
    all:  { active: 'bg-blue-600 text-white',  inactive: 'bg-white text-slate-400 hover:bg-slate-50' },
  };
  const labels = { off: 'Off', dept: 'Dept', all: 'All' };
  return (
    <div className={`inline-flex rounded-full border border-slate-200 text-[10px] font-semibold overflow-hidden ${locked ? 'opacity-60 pointer-events-none' : ''}`}>
      {opts.map(opt => (
        <button key={opt} type="button" onClick={() => value !== opt && onChange(opt)}
          className={`px-2.5 py-1 transition-all ${value === opt ? styles[opt].active : styles[opt].inactive}`}>
          {labels[opt]}
        </button>
      ))}
    </div>
  );
};

const CC_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'clients', label: 'Clients' },
  { id: 'categories', label: 'Task Categories' },
  { id: 'departments', label: 'Departments' },
  { id: 'regions', label: 'Regions' },
  { id: 'conditions', label: 'Access Control' },
  { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'templates', label: 'Templates' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'feedback', label: 'Feedback' },
];

const DEFAULT_STANDARD_TRACK = ['Director', 'Snr Manager', 'Manager', 'Asst Manager', 'Snr Executive', 'Executive', 'Employee', 'Intern'];
const CS_TRACK_FIXED = [{ role: 'Business Head', level: 1 }, { role: 'CSM / Project Manager', level: 2 }];

const MasterDataView = ({
  taskCategories = [],
  setTaskCategories,
  taskTemplates = [],
  setTaskTemplates,
  currentUser,
  departments = [],
  setDepartments,
  regions = [],
  setRegions,
  availableRoles = [],
  controlCenterTabAccess = {},
  setControlCenterTabAccess,
  userManagementAccessRoles = [],
  setUserManagementAccessRoles,
  employeeViewAccessRoles = [],
  setEmployeeViewAccessRoles,
  teamViewAccessRoles = [],
  setTeamViewAccessRoles,
  metricsAccessRoles = [],
  setMetricsAccessRoles,
  reportsAccessRoles = [],
  setReportsAccessRoles,
  metricsAllDataRoles = [],
  setMetricsAllDataRoles,
  reportsAllDataRoles = [],
  setReportsAllDataRoles,
  clients = [],
  setClients,
  users = [],
  setUsers,
  clientLogs = {},
  setClientLogs,
  feedbackItems = [],
  setFeedbackItems,
  createFirebaseUser,
  onSendPasswordReset = null,
  hierarchyOrder = [],
  setHierarchyOrder,
  digestGlobalEnabled = true,
  onDigestGlobalToggle = null,
  notificationSettings = {},
  onUpdateNotificationSetting = null,
}) => {
  const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
  const executionRoles = ['Employee', 'Snr Executive', 'Executive', 'Intern'];

  const [activeTab, setActiveTab] = useState(() => {
    const accessible = CC_TABS.filter(tab => {
      if (tab.id === 'notifications') return currentUser?.role === 'Super Admin';
      if (currentUser?.role === 'Super Admin') return true;
      if (tab.id === 'conditions') return false;
      if (tab.id === 'feedback') return true;
      return (controlCenterTabAccess[tab.id] || []).includes(currentUser?.role);
    });
    return accessible[0]?.id || 'feedback';
  });
  const [categoryInput, setCategoryInput] = useState('');
  const [departmentInput, setDepartmentInput] = useState('');
  const [regionInput, setRegionInput] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [regionFilter, setRegionFilter] = useState('All');

  const [catMsg, setCatMsg] = useState('');
  const [deptMsg, setDeptMsg] = useState('');
  const [regionMsg, setRegionMsg] = useState('');

  const flashMsg = (setter, text) => {
    setter(text);
    setTimeout(() => setter(''), 3000);
  };

  const [deleteBlocker, setDeleteBlocker] = useState(null);
  // { kind: 'department'|'region'|'category', name: string, items: string[] }

  // --- CLIENT STATE ---
  const [clientSearch, setClientSearch] = useState('');
  // Edit
  const [editingClientId, setEditingClientId] = useState(null);
  const [editEntityName, setEditEntityName] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientAdmins, setEditClientAdmins] = useState([]);
  const [editClientEmployees, setEditClientEmployees] = useState([]);
  // Add
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [addEntityName, setAddEntityName] = useState('');
  const [addClientName, setAddClientName] = useState('');
  const [addClientAdmins, setAddClientAdmins] = useState([]);
  const [addClientEmployees, setAddClientEmployees] = useState([]);
  // Shared picker — mode: 'edit-leadership' | 'edit-team' | 'add-leadership' | 'add-team'
  const [activePicker, setActivePicker] = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');

  // --- USER STATE ---
  const [userSearch, setUserSearch] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState(null);
  const [userProjectSearch, setUserProjectSearch] = useState('');
  const [managerSearch, setManagerSearch] = useState('');
  const emptyNewUser = () => ({ name: '', email: '', password: '', role: 'Executive', department: '', region: '', position: '', managerId: '', assignedProjects: [] });
  const [newUser, setNewUser] = useState(emptyNewUser());
  const [showPassword, setShowPassword] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [userSaveError, setUserSaveError] = useState('');

  // --- TEMPLATE STATE ---
  const [templateSearch, setTemplateSearch] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // null = new, object = editing
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateTasks, setTemplateTasks] = useState([emptyTask()]);
  const [templateFormError, setTemplateFormError] = useState('');
  const [templateIsHome, setTemplateIsHome] = useState(false);
  const [templateTargetRoles, setTemplateTargetRoles] = useState([]);

  // --- FEEDBACK STATE ---
  const [fbType, setFbType] = useState('Bug');
  const [fbTitle, setFbTitle] = useState('');
  const [fbDesc, setFbDesc] = useState('');
  const [fbSubmitted, setFbSubmitted] = useState(false);
  const [fbAdminFilter, setFbAdminFilter] = useState('All');
  const [showArchived, setShowArchived] = useState(false);
  const [editingFbId, setEditingFbId] = useState(null);
  const [editingFbDraft, setEditingFbDraft] = useState({});
  const [replyingFbId, setReplyingFbId] = useState(null);
  const [replyingFbEntryId, setReplyingFbEntryId] = useState(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editingFbEntryId, setEditingFbEntryId] = useState(null);
  const [editFbEntryText, setEditFbEntryText] = useState('');
  const [fbUserFilter, setFbUserFilter] = useState('All');

  // --- NOTIFICATION SETTINGS STATE ---
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailStatusLoading, setEmailStatusLoading] = useState(false);
  const [bccInputs, setBccInputs] = useState({});
  const [expandedEvents, setExpandedEvents] = useState({});

  const DIGEST_TIMEZONES = [
    { value: 'Europe/London',      label: 'London (GMT / BST)' },
    { value: 'Europe/Dublin',      label: 'Dublin (GMT / IST)' },
    { value: 'Europe/Paris',       label: 'Paris / Berlin (CET / CEST)' },
    { value: 'Europe/Athens',      label: 'Athens / Helsinki (EET / EEST)' },
    { value: 'Europe/Moscow',      label: 'Moscow (MSK)' },
    { value: 'Europe/Istanbul',    label: 'Istanbul (TRT)' },
    { value: 'Asia/Dubai',         label: 'Dubai (GST, UTC+4)' },
    { value: 'Asia/Karachi',       label: 'Karachi (PKT, UTC+5)' },
    { value: 'Asia/Colombo',       label: 'Colombo (SLST, UTC+5:30)' },
    { value: 'Asia/Kolkata',       label: 'Kolkata / Mumbai (IST, UTC+5:30)' },
    { value: 'Asia/Dhaka',         label: 'Dhaka (BST, UTC+6)' },
    { value: 'Asia/Bangkok',       label: 'Bangkok (ICT, UTC+7)' },
    { value: 'Asia/Singapore',     label: 'Singapore (SGT, UTC+8)' },
    { value: 'Asia/Shanghai',      label: 'Beijing / Shanghai (CST, UTC+8)' },
    { value: 'Asia/Tokyo',         label: 'Tokyo (JST, UTC+9)' },
    { value: 'Australia/Sydney',   label: 'Sydney (AEST / AEDT)' },
    { value: 'Pacific/Auckland',   label: 'Auckland (NZST / NZDT)' },
    { value: 'America/New_York',   label: 'New York (EST / EDT)' },
    { value: 'America/Chicago',    label: 'Chicago (CST / CDT)' },
    { value: 'America/Denver',     label: 'Denver (MST / MDT)' },
    { value: 'America/Los_Angeles',label: 'Los Angeles (PST / PDT)' },
    { value: 'America/Sao_Paulo',  label: 'São Paulo (BRT)' },
    { value: 'UTC',                label: 'UTC (no DST)' },
  ];

  const DIGEST_HOURS = [5,6,7,8,9,10,11,12];

  const NOTIFICATION_EVENTS = [
    { id: 'task-assigned', label: 'Task Assigned', description: 'Sent to the assignee when a task is created and assigned to them.', when: 'On task creation / assignment', defaultOn: true },
    { id: 'approval-required', label: 'Approval Required', description: 'Sent to managers when someone requests to be assigned a task.', when: 'On assignment request', defaultOn: true },
    { id: 'qc-submitted', label: 'QC Submitted', description: 'Sent to the QC reviewer when a task is submitted for quality check.', when: 'On QC submission', defaultOn: true },
    { id: 'qc-returned', label: 'QC Returned', description: 'Sent to the assignee when a QC reviewer returns a task for revision. BCC addresses receive a copy.', when: 'On QC rejection', defaultOn: true },
    { id: 'qc-approved', label: 'QC Approved', description: 'Sent to the assignee when a QC reviewer approves their work.', when: 'On QC approval (desktop only)', defaultOn: false },
    { id: 'client-added', label: 'Client Access Granted', description: 'Sent to a user when they are added to a client project.', when: 'On client assignment approval', defaultOn: true },
    { id: 'assignment-accepted', label: 'Assignment Accepted', description: 'Sent to the requester when their task assignment request is approved.', when: 'On assignment approval', defaultOn: true },
    { id: 'mention', label: 'Mention', description: 'Sent to a user when they are @mentioned in a task message.', when: 'On @mention in task message', defaultOn: true },
    { id: 'feedback-response', label: 'Feedback Response', description: 'Sent to users when their PMT feedback receives an admin reply.', when: 'On feedback reply', defaultOn: true },
    { id: 'task-overdue', label: 'Task Overdue', description: 'Daily check — sent to the assignee when a task is past its due date and not complete. Deduplicated daily.', when: 'Daily (07:00)', defaultOn: false },
    { id: 'task-due-soon', label: 'Task Due Soon', description: 'Daily check — sent to the assignee when a task is exactly 2 days from its due date.', when: 'Daily (07:00), 2 days before due date', defaultOn: false },
    { id: 'task-status-changed', label: 'Task Status Changed', description: 'Sent to the assignee when another user changes their task status to WIP or Done.', when: 'On status change to WIP or Done', defaultOn: false },
  ];

  const getEventEnabled = (eventId) => {
    const setting = notificationSettings[eventId];
    if (setting && typeof setting.enabled === 'boolean') return setting.enabled;
    return NOTIFICATION_EVENTS.find(e => e.id === eventId)?.defaultOn ?? true;
  };

  useEffect(() => {
    if (activeTab !== 'notifications') return;
    setEmailStatusLoading(true);
    const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api';
    fetch(`${apiBase}/email-status`)
      .then(r => r.json())
      .then(d => setEmailStatus(d))
      .catch(() => setEmailStatus(null))
      .finally(() => setEmailStatusLoading(false));
  }, [activeTab]);

  const buildFbThread = (item) => {
    const thread = Array.isArray(item.thread) ? [...item.thread] : [];
    if (thread.length === 0 && item.reply) {
      thread.push({
        id: 'legacy-reply',
        authorId: null,
        authorName: item.replyAdminName || 'Admin',
        text: item.reply,
        timestamp: item.replyTimestamp || null,
      });
    }
    return thread;
  };

  // --- HIERARCHY STATE ---
  const effectiveHierarchyOrder = (hierarchyOrder && hierarchyOrder.length > 0) ? hierarchyOrder : DEFAULT_STANDARD_TRACK;
  const [hierarchyDraft, setHierarchyDraft] = useState(() => [...effectiveHierarchyOrder]);
  const [hierarchySaved, setHierarchySaved] = useState(false);
  useEffect(() => { setHierarchyDraft([...effectiveHierarchyOrder]); }, [effectiveHierarchyOrder.join(',')]);  // eslint-disable-line react-hooks/exhaustive-deps

  const moveHierarchyRole = (idx, dir) => {
    setHierarchyDraft(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const saveHierarchyOrder = () => {
    if (setHierarchyOrder) setHierarchyOrder(hierarchyDraft);
    setHierarchySaved(true);
    setTimeout(() => setHierarchySaved(false), 2500);
  };

  const resetHierarchyOrder = () => {
    setHierarchyDraft([...effectiveHierarchyOrder]);
  };

  // --- CSV IMPORT STATE ---
  const [csvMode, setCsvMode] = useState(null); // null | 'users' | 'clients' | 'combined'

  const normalizedRoles = useMemo(() => {
    const defaults = [
      'Super Admin',
      'Director',
      'Business Head',
      'CSM',
      'Snr Manager',
      'Manager',
      'Asst Manager',
      'Snr Executive',
      'Executive',
      'Intern'
    ];
    const merged = [...defaults, ...availableRoles];
    return [...new Set(merged)];
  }, [availableRoles]);

  const getCategoryGroup = (category) => {
    const name = typeof category === 'object' ? category.name : category;
    if (!name) return 'Other';
    const [prefix] = name.split(' - ');
    return prefix?.trim() || 'Other';
  };

  const categoryGroups = useMemo(() => {
    return [...new Set(taskCategories.map(getCategoryGroup))].sort((left, right) => left.localeCompare(right));
  }, [taskCategories]);

  // State for new category department visibility
  const [newCategoryDepts, setNewCategoryDepts] = useState([]); // [] = Universal

  const addCategoryItem = () => {
    const trimmed = categoryInput.trim();
    if (!trimmed) return 'empty';
    if (taskCategories.some(item => (item.name || item).toLowerCase() === trimmed.toLowerCase())) return 'duplicate';
    setTaskCategories([...taskCategories, { name: trimmed, departments: newCategoryDepts }]);
    setCategoryInput('');
    setNewCategoryDepts([]);
    return 'ok';
  };

  const updateCategoryDepts = (catName, depts) => {
    setTaskCategories(taskCategories.map(cat =>
      (cat.name || cat) === catName ? { ...(typeof cat === 'object' ? cat : { name: cat }), departments: depts } : cat
    ));
  };

  const addItem = (value, list, setter, clear, resetFilter) => {
    const trimmed = value.trim();
    if (!trimmed) return 'empty';
    if (list.some(item => item.toLowerCase() === trimmed.toLowerCase())) return 'duplicate';
    setter([...list, trimmed], list);
    clear('');
    if (resetFilter) resetFilter('All');
    return 'ok';
  };

  const removeCategory = (catName) => {
    if (taskCategories.length <= 1) return;
    const allTasks = Object.values(clientLogs).flat();
    const linked = allTasks.filter(t => t.category === catName);
    if (linked.length > 0) {
      const clientNames = [...new Set(
        linked.map(t => {
          const match = Object.entries(clientLogs).find(([, tasks]) => tasks.some(x => x.id === t.id));
          if (!match) return null;
          const client = clients.find(c => c.id === match[0]);
          return client ? client.name : match[0];
        }).filter(Boolean)
      )];
      setDeleteBlocker({
        kind: 'category',
        name: catName,
        items: clientNames.length > 0
          ? [`${linked.length} task${linked.length !== 1 ? 's' : ''} across: ${clientNames.join(', ')}`]
          : [`${linked.length} task${linked.length !== 1 ? 's' : ''}`],
      });
      return;
    }
    setTaskCategories(taskCategories.filter(item => (item.name || item) !== catName));
  };

  const removeDepartment = (department) => {
    if (departments.length <= 1) return;
    const linked = users.filter(u => u.department === department);
    if (linked.length > 0) {
      setDeleteBlocker({
        kind: 'department',
        name: department,
        items: linked.map(u => u.name || u.email),
      });
      return;
    }
    const next = departments.filter(item => item !== department);
    setDepartments(next, departments);
    setDepartmentFilter('All');
  };

  const removeRegion = (region) => {
    if (regions.length <= 1) return;
    const linked = users.filter(u => u.region === region);
    if (linked.length > 0) {
      setDeleteBlocker({
        kind: 'region',
        name: region,
        items: linked.map(u => u.name || u.email),
      });
      return;
    }
    const next = regions.filter(item => item !== region);
    setRegions(next, regions);
    setRegionFilter('All');
  };

  const addRegion = () => {
    const trimmed = regionInput.trim();
    if (!trimmed) return 'empty';
    if (regions.some(item => item.toLowerCase() === trimmed.toLowerCase())) return 'duplicate';
    setRegions([...regions, trimmed], regions);
    setRegionInput('');
    setRegionFilter('All');
    return 'ok';
  };

  const applyViewState = (role, view, state) => {
    if (role === 'Super Admin') return;
    if (view === 'metrics') {
      const inAccess = metricsAccessRoles.includes(role);
      const inAll = metricsAllDataRoles.includes(role);
      if (state === 'off') {
        if (inAccess) setMetricsAccessRoles(metricsAccessRoles.filter(r => r !== role));
        if (inAll) setMetricsAllDataRoles(metricsAllDataRoles.filter(r => r !== role));
      } else if (state === 'dept') {
        if (!inAccess) setMetricsAccessRoles([...metricsAccessRoles, role]);
        if (inAll) setMetricsAllDataRoles(metricsAllDataRoles.filter(r => r !== role));
      } else {
        if (!inAccess) setMetricsAccessRoles([...metricsAccessRoles, role]);
        if (!inAll) setMetricsAllDataRoles([...metricsAllDataRoles, role]);
      }
    } else {
      const inAccess = reportsAccessRoles.includes(role);
      const inAll = reportsAllDataRoles.includes(role);
      if (state === 'off') {
        if (inAccess) setReportsAccessRoles(reportsAccessRoles.filter(r => r !== role));
        if (inAll) setReportsAllDataRoles(reportsAllDataRoles.filter(r => r !== role));
      } else if (state === 'dept') {
        if (!inAccess) setReportsAccessRoles([...reportsAccessRoles, role]);
        if (inAll) setReportsAllDataRoles(reportsAllDataRoles.filter(r => r !== role));
      } else {
        if (!inAccess) setReportsAccessRoles([...reportsAccessRoles, role]);
        if (!inAll) setReportsAllDataRoles([...reportsAllDataRoles, role]);
      }
    }
  };

  const toggleTabAccess = (tabId, role) => {
    if (role === 'Super Admin') return;
    const current = controlCenterTabAccess[tabId] || [];
    const next = current.includes(role)
      ? current.filter(r => r !== role)
      : [...current, role];
    setControlCenterTabAccess({ ...controlCenterTabAccess, [tabId]: next });
  };

  const toggleUserManagementRole = (role) => {
    if (userManagementAccessRoles.includes(role)) {
      if (userManagementAccessRoles.length <= 1) return;
      setUserManagementAccessRoles(userManagementAccessRoles.filter(item => item !== role));
      return;
    }
    setUserManagementAccessRoles([...userManagementAccessRoles, role]);
  };

  const toggleEmployeeViewRole = (role) => {
    if (employeeViewAccessRoles.includes(role)) {
      if (employeeViewAccessRoles.length <= 1) return;
      setEmployeeViewAccessRoles(employeeViewAccessRoles.filter(item => item !== role));
      return;
    }
    setEmployeeViewAccessRoles([...employeeViewAccessRoles, role]);
  };

  const toggleTeamViewRole = (role) => {
    if (teamViewAccessRoles.includes(role)) {
      if (teamViewAccessRoles.length <= 1) return;
      setTeamViewAccessRoles(teamViewAccessRoles.filter(item => item !== role));
      return;
    }
    setTeamViewAccessRoles([...teamViewAccessRoles, role]);
  };

  const toggleMetricsRole = (role) => {
    if (metricsAccessRoles.includes(role)) {
      if (metricsAccessRoles.length <= 1) return;
      setMetricsAccessRoles(metricsAccessRoles.filter(item => item !== role));
      return;
    }
    setMetricsAccessRoles([...metricsAccessRoles, role]);
  };

  const toggleReportsRole = (role) => {
    if (reportsAccessRoles.includes(role)) {
      if (reportsAccessRoles.length <= 1) return;
      setReportsAccessRoles(reportsAccessRoles.filter(item => item !== role));
      return;
    }
    setReportsAccessRoles([...reportsAccessRoles, role]);
  };

  const filteredCategories = categoryFilter === 'All'
    ? taskCategories
    : taskCategories.filter(category => getCategoryGroup(category) === categoryFilter);

  const filteredDepartments = departmentFilter === 'All'
    ? departments
    : departments.filter(department => department === departmentFilter);

  const filteredRegions = regionFilter === 'All'
    ? regions
    : regions.filter(region => region === regionFilter);

  // --- CLIENT HELPERS ---
  const getProjectStaff = (clientName) => {
    const staff = (users || []).filter(u => u.assignedProjects?.includes(clientName));
    return {
      admins: staff.filter(u => managementRoles.includes(u.role)),
      employees: staff.filter(u => executionRoles.includes(u.role)),
    };
  };

  const openEditClient = (client) => {
    const staff = getProjectStaff(client.name);
    setEditingClientId(client.id);
    setEditEntityName(client.entityName || '');
    setEditClientName(client.name);
    setEditClientAdmins(staff.admins.map(a => a.id));
    setEditClientEmployees(staff.employees.map(e => e.id));
    setPickerSearch('');
    setActivePicker(null);
  };

  const handleSaveEditClient = (e) => {
    e.preventDefault();
    if (!editEntityName.trim() || !editClientName.trim()) return;
    const oldClientName = (clients.find(c => c.id === editingClientId) || {}).name || '';
    const newName = editClientName.trim();

    // Update client record
    const updatedClients = clients.map(c =>
      c.id === editingClientId ? { ...c, entityName: editEntityName.trim(), name: newName } : c
    );
    if (setClients) setClients(updatedClients);

    // Sync user assignedProjects
    if (setUsers) {
      const newAdminSet = new Set(editClientAdmins);
      const newEmpSet = new Set(editClientEmployees);
      const oldStaff = getProjectStaff(oldClientName);
      const oldAssignedSet = new Set([...oldStaff.admins, ...oldStaff.employees].map(u => u.id));

      const updatedUsers = (users || []).map(u => {
        // Rename old project name to new name
        let projects = (u.assignedProjects || []).map(p => p === oldClientName ? newName : p);
        const nowAssigned = newAdminSet.has(u.id) || newEmpSet.has(u.id);
        const wasAssigned = oldAssignedSet.has(u.id);
        if (!wasAssigned && nowAssigned) {
          projects = [...projects, newName];
        } else if (wasAssigned && !nowAssigned) {
          projects = projects.filter(p => p !== newName);
        }
        return { ...u, assignedProjects: projects };
      });
      setUsers(updatedUsers);
    }

    closeEditClient();
  };

  const closeEditClient = () => {
    setEditingClientId(null);
    setEditEntityName('');
    setEditClientName('');
    setEditClientAdmins([]);
    setEditClientEmployees([]);
    setActivePicker(null);
    setPickerSearch('');
  };

  const openAddClient = () => {
    setAddEntityName('');
    setAddClientName('');
    setAddClientAdmins([]);
    setAddClientEmployees([]);
    setActivePicker(null);
    setPickerSearch('');
    setShowAddClientModal(true);
  };

  const closeAddClient = () => {
    setShowAddClientModal(false);
    setAddEntityName('');
    setAddClientName('');
    setAddClientAdmins([]);
    setAddClientEmployees([]);
    setActivePicker(null);
    setPickerSearch('');
  };

  const handleSaveNewClient = (e) => {
    e.preventDefault();
    if (!addEntityName.trim() || !addClientName.trim()) return;
    const newClient = { id: `client-${Date.now()}`, name: addClientName.trim(), entityName: addEntityName.trim() };
    if (setClients) setClients([...(clients || []), newClient]);
    if (setUsers) {
      const allAssigned = new Set([...addClientAdmins, ...addClientEmployees]);
      setUsers((users || []).map(u =>
        allAssigned.has(u.id)
          ? { ...u, assignedProjects: [...(u.assignedProjects || []), newClient.name] }
          : u
      ));
    }
    closeAddClient();
  };

  const handleDeleteClient = (clientId) => {
    const clientToDelete = (clients || []).find(c => c.id === clientId);
    const taskCount = ((clientLogs || {})[clientId] || []).filter(t => !t.deleted).length;
    if (taskCount > 0) {
      const proceed = window.confirm(
        `⚠️ Warning: "${clientToDelete?.name || 'This client'}" has ${taskCount} task${taskCount !== 1 ? 's' : ''} that will become orphaned if you delete this client.\n\nPlease reassign or remove all tasks before deleting a client.\n\nClick OK only if you want to proceed anyway.`
      );
      if (!proceed) return;
    } else {
      if (!window.confirm(`Delete "${clientToDelete?.name || 'this client'}"? This cannot be undone.`)) return;
    }
    if (setClients) setClients((clients || []).filter(c => c.id !== clientId));
    if (setUsers && clientToDelete) {
      setUsers((users || []).map(u => ({
        ...u,
        assignedProjects: (u.assignedProjects || []).filter(p => p !== clientToDelete.name),
      })));
    }
    if (setClientLogs) {
      const updated = { ...(clientLogs || {}) };
      delete updated[clientId];
      setClientLogs(updated);
    }
  };

  // Picker helpers for both add and edit flows
  const pickerSelected =
    activePicker === 'edit-leadership' ? editClientAdmins :
    activePicker === 'edit-team' ? editClientEmployees :
    activePicker === 'add-leadership' ? addClientAdmins :
    activePicker === 'add-team' ? addClientEmployees : [];
  const pickerSetSelected =
    activePicker === 'edit-leadership' ? setEditClientAdmins :
    activePicker === 'edit-team' ? setEditClientEmployees :
    activePicker === 'add-leadership' ? setAddClientAdmins :
    activePicker === 'add-team' ? setAddClientEmployees : () => {};
  const pickerTitle =
    activePicker === 'edit-leadership' || activePicker === 'add-leadership'
      ? 'Select Leadership' : 'Select Team Members';

  // --- USER HELPERS ---
  const getRoleStyle = (role) => {
    switch (role) {
      case 'Super Admin': return 'bg-red-600 text-white ring-red-100';
      case 'Director':
      case 'Business Head': return 'bg-orange-500 text-white ring-orange-100';
      case 'Manager':
      case 'Snr Manager':
      case 'CSM': return 'bg-emerald-500 text-white ring-emerald-100';
      default: return 'bg-slate-500 text-white ring-slate-100';
    }
  };

  const openAddUser = () => {
    setEditingUserId(null);
    setNewUser(emptyNewUser());
    setUserProjectSearch('');
    setShowUserModal(true);
  };

  const openEditUser = (user) => {
    setEditingUserId(user.id);
    setNewUser({ name: user.name, email: user.email, role: user.role, department: user.department || '', region: user.region || '', position: user.position || '', managerId: user.managerId || '', assignedProjects: user.assignedProjects || [] });
    setUserProjectSearch('');
    setManagerSearch('');
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUserId(null);
    setNewUser(emptyNewUser());
    setUserProjectSearch('');
    setManagerSearch('');
    setUserSaveError('');
    setShowPassword(false);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.department || !newUser.region) return;
    setUserSaveError('');
    setUserSaving(true);
    try {
      if (editingUserId) {
        const { password: _pw, managerId: rawMid, ...restUser } = newUser;
        const originalUser = (users || []).find(u => u.id === editingUserId);
        const updatedUser = { ...restUser, id: editingUserId };
        if (canEditManagerId) {
          if (rawMid) updatedUser.managerId = rawMid;
        } else if (originalUser?.managerId) {
          updatedUser.managerId = originalUser.managerId;
        }
        setUsers((users || []).map(u => u.id === editingUserId ? updatedUser : u));
        closeUserModal();
      } else {
        let emailWarning = '';
        if (createFirebaseUser) {
          const result = await createFirebaseUser(newUser.email.trim().toLowerCase(), newUser.name.trim());
          if (result?.warning) emailWarning = result.warning;
        }
        const { password: _pw, managerId: newMid, ...userRecord } = newUser;
        const newUserObj = { ...userRecord, id: `user-${Date.now()}`, email: userRecord.email.trim().toLowerCase() };
        if (newMid && canEditManagerId) newUserObj.managerId = newMid;
        setUsers([...(users || []), newUserObj]);
        if (emailWarning) {
          setUserSaveError(emailWarning);
        } else {
          closeUserModal();
        }
      }
    } catch (err) {
      if (err?.code === 'auth/email-already-in-use') {
        setUserSaveError('An account with this email already exists.');
      } else if (err?.code === 'auth/invalid-email') {
        setUserSaveError('Please enter a valid email address.');
      } else {
        setUserSaveError(err?.message || 'Failed to create user. Please try again.');
      }
    } finally {
      setUserSaving(false);
    }
  };

  const confirmDeleteUser = () => {
    setUsers((users || []).filter(u => u.id !== showDeleteUserConfirm));
    setShowDeleteUserConfirm(null);
  };

  const toggleUserProject = (projectName) => {
    setNewUser(prev => {
      const updated = prev.assignedProjects.includes(projectName)
        ? prev.assignedProjects.filter(p => p !== projectName)
        : [...prev.assignedProjects, projectName];
      return { ...prev, assignedProjects: updated };
    });
  };

  // --- CSV IMPORT HANDLERS ---

  const validateCsvUser = (row) => {
    const errs = [];
    if (!row.name?.trim()) errs.push('Name required');
    if (!row.email?.trim()) errs.push('Email required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) errs.push('Invalid email');
    if (!row.role?.trim()) errs.push('Role required');
    if (!row.department?.trim()) errs.push('Department required');
    if (!row.region?.trim()) errs.push('Region required');
    if ((users || []).some(u => u.email?.toLowerCase() === row.email?.trim().toLowerCase())) errs.push('Email already exists');
    return errs;
  };

  const validateCsvClient = (row) => {
    const errs = [];
    if (!row.entityName?.trim()) errs.push('Entity name required');
    if (!row.clientName?.trim()) errs.push('Client name required');
    // Existing clients and within-file duplicates are handled at import time (skipped, not errored)
    return errs;
  };

  const validateCsvCombined = (row) => {
    const errs = [];
    if (!row.entityName?.trim()) errs.push('Entity name required');
    if (!row.clientName?.trim()) errs.push('Client name required');
    // Within-file duplicates are handled at import time (first occurrence wins)
    return errs;
  };

  const handleCsvImportUsers = async (rows) => {
    const results = [];
    const newUserRecords = [];

    // First pass: create all Firebase accounts and build user records (without managerId yet)
    for (const row of rows) {
      const clientNames = (row.clients || '').split('|').map(s => s.trim()).filter(Boolean);
      const assignedProjects = clientNames.filter(name => (clients || []).some(c => c.name === name));
      const label = `${row.name?.trim()} (${row.email?.trim()})`;
      try {
        let emailWarning = '';
        if (createFirebaseUser) {
          const result = await createFirebaseUser(row.email.trim().toLowerCase(), row.name?.trim());
          if (result?.warning) emailWarning = result.warning;
        }
        newUserRecords.push({
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          email: row.email.trim().toLowerCase(),
          name: row.name.trim(),
          role: row.role.trim() || 'Executive',
          department: row.department?.trim() || '',
          region: row.region?.trim() || '',
          position: row.position?.trim() || '',
          assignedProjects,
          _rawManagerEmail: row.reportingManager?.trim().toLowerCase() || '',
        });
        results.push({ label, success: true, warning: emailWarning || undefined });
      } catch (err) {
        results.push({ label, success: false, error: err.message || 'Failed to create user' });
      }
    }

    // Second pass: resolve reportingManager email → managerId
    // Build a combined email→id lookup: existing users + newly imported users in this batch
    const emailToId = {};
    for (const u of (users || [])) {
      if (u.email) emailToId[u.email.toLowerCase()] = u.id;
    }
    for (const u of newUserRecords) {
      if (u.email) emailToId[u.email.toLowerCase()] = u.id;
    }
    for (const u of newUserRecords) {
      const managerEmail = u._rawManagerEmail;
      if (managerEmail && emailToId[managerEmail]) {
        u.managerId = emailToId[managerEmail];
      }
      delete u._rawManagerEmail;
    }

    if (newUserRecords.length > 0 && setUsers) {
      setUsers([...(users || []), ...newUserRecords]);
    }
    return results;
  };

  const handleCsvImportClients = async (rows) => {
    const results = [];
    const seenInFile = new Set();
    const newClients = [];

    for (const row of rows) {
      const name = row.clientName.trim();
      const entityName = row.entityName.trim();
      const nameKey = name.toLowerCase();

      if (seenInFile.has(nameKey)) {
        results.push({ label: name, success: true, skipped: true, reason: 'Duplicate in file — first occurrence used' });
        continue;
      }
      seenInFile.add(nameKey);

      if ((clients || []).some(c => c.name.toLowerCase() === nameKey)) {
        results.push({ label: name, success: true, skipped: true, reason: 'Already exists — skipped' });
        continue;
      }

      newClients.push({ id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, entityName });
      results.push({ label: name, success: true });
    }

    if (setClients && newClients.length > 0) setClients([...(clients || []), ...newClients]);
    return results;
  };

  const handleCsvImportCombined = async (rows) => {
    const newClients = [];
    let updatedUsers = [...(users || [])];
    for (const row of rows) {
      const clientName = row.clientName.trim();
      const entityName = row.entityName.trim();
      const existing = (clients || []).find(c => c.name.toLowerCase() === clientName.toLowerCase());
      if (!existing) {
        newClients.push({ id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: clientName, entityName });
      }
      const emailsToAssign = (row.userEmails || '').split('|').map(e => e.trim().toLowerCase()).filter(Boolean);
      updatedUsers = updatedUsers.map(u => {
        if (emailsToAssign.includes((u.email || '').toLowerCase())) {
          if (!(u.assignedProjects || []).includes(clientName)) {
            return { ...u, assignedProjects: [...(u.assignedProjects || []), clientName] };
          }
        }
        return u;
      });
    }
    if (newClients.length > 0 && setClients) setClients([...(clients || []), ...newClients]);
    if (setUsers) setUsers(updatedUsers);
    return rows.map(row => ({ label: row.clientName.trim(), success: true }));
  };

  const filteredUsers = (users || []).filter(u =>
    !userSearch.trim() ||
    (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.role || '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.department || '').toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredUserProjects = (clients || []).filter(c =>
    !userProjectSearch.trim() || c.name.toLowerCase().includes(userProjectSearch.toLowerCase())
  );

  const ELIGIBLE_MANAGER_ROLES = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
  const ROLE_RANK = {
    'Super Admin': 0, 'Director': 1, 'Business Head': 2, 'Snr Manager': 3,
    'Manager': 4, 'Project Manager': 4, 'CSM': 4, 'Asst Manager': 5,
    'Snr Executive': 6, 'Executive': 7, 'Intern': 8,
  };
  const editingUserRank = ROLE_RANK[newUser.role] ?? 99;
  const eligibleManagers = (users || []).filter(u => {
    if (u.id === editingUserId) return false;
    if (!ELIGIBLE_MANAGER_ROLES.includes(u.role)) return false;
    const mgrRank = ROLE_RANK[u.role] ?? 99;
    return mgrRank <= editingUserRank;
  });
  const filteredEligibleManagers = eligibleManagers.filter(u => {
    if (!managerSearch.trim()) return true;
    const q = managerSearch.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
  });
  const editingUserRecord = editingUserId ? (users || []).find(u => u.id === editingUserId) : null;
  const canEditManagerId = (() => {
    const role = currentUser?.role;
    if (!role) return false;
    if (['Super Admin', 'Director'].includes(role)) return true;
    if (['Manager', 'Snr Manager'].includes(role)) {
      const editedDept = editingUserRecord?.department || newUser.department;
      return !!editedDept && editedDept === currentUser?.department;
    }
    return false;
  })();
  const selectedManager = (users || []).find(u => u.id === newUser.managerId);

  const filteredClients = (clients || []).filter(c =>
    !clientSearch.trim() || c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // --- TEMPLATE HELPERS ---
  const openNewTemplateForm = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateDesc('');
    setTemplateTasks([emptyTask()]);
    setTemplateFormError('');
    setTemplateIsHome(false);
    setTemplateTargetRoles([]);
    setShowTemplateForm(true);
  };

  const openEditTemplateForm = (tpl) => {
    setEditingTemplate(tpl);
    setTemplateName(tpl.name);
    setTemplateDesc(tpl.description || '');
    setTemplateTasks(tpl.tasks.map(t => ({ name: t.name || '', steps: [], ...t })));
    setTemplateFormError('');
    setTemplateIsHome(tpl.isHomeTemplate || false);
    setTemplateTargetRoles(tpl.targetRoles || []);
    setShowTemplateForm(true);
  };

  const closeTemplateForm = () => {
    setShowTemplateForm(false);
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateDesc('');
    setTemplateTasks([emptyTask()]);
    setTemplateFormError('');
    setTemplateIsHome(false);
    setTemplateTargetRoles([]);
  };

  const handleSaveTemplate = () => {
    const trimmedName = templateName.trim();
    if (!trimmedName) { setTemplateFormError('Template name is required.'); return; }
    if (templateTasks.some(t => !t.name?.trim())) {
      setTemplateFormError('All task rows must have a task name.');
      return;
    }
    if (templateTasks.some(t => !t.comment.trim())) {
      setTemplateFormError('All task rows must have a description.');
      return;
    }
    if (templateTasks.length === 0) { setTemplateFormError('Add at least one task.'); return; }

    if (templateIsHome && templateTargetRoles.length > 0) {
      const invalidRoles = templateTargetRoles.filter(r => !normalizedRoles.includes(r));
      if (invalidRoles.length > 0) {
        setTemplateFormError(`Invalid roles: ${invalidRoles.join(', ')}. Remove them before saving.`);
        return;
      }
    }

    const cleanTasks = templateTasks.map(t => ({
      name: t.name.trim(),
      comment: t.comment.trim(),
      category: t.category || (taskCategories[0] && (typeof taskCategories[0] === 'object' ? taskCategories[0].name : taskCategories[0])) || 'Other',
      repeatFrequency: t.repeatFrequency || 'Monthly',
      steps: (t.steps || []).filter(s => s.trim() !== ''),
    }));

    if (editingTemplate) {
      if (editingTemplate.isPrebuilt && currentUser?.role !== 'Super Admin') { setTemplateFormError('Pre-built templates cannot be edited.'); return; }
      const updated = taskTemplates.map(tpl =>
        tpl.id === editingTemplate.id
          ? { ...tpl, name: trimmedName, description: templateDesc.trim(), tasks: cleanTasks, isHomeTemplate: templateIsHome, targetRoles: templateIsHome ? templateTargetRoles : [] }
          : tpl
      );
      setTaskTemplates(updated);
    } else {
      const newTpl = {
        id: `custom-${Date.now()}`,
        name: trimmedName,
        description: templateDesc.trim(),
        isPrebuilt: false,
        isHomeTemplate: templateIsHome,
        targetRoles: templateIsHome ? templateTargetRoles : [],
        createdBy: currentUser?.id || null,
        tasks: cleanTasks,
      };
      setTaskTemplates([...taskTemplates, newTpl]);
    }
    closeTemplateForm();
  };

  const handleDeleteTemplate = (id) => {
    const tpl = taskTemplates.find(t => t.id === id);
    if (tpl?.isPrebuilt && currentUser?.role !== 'Super Admin') return;
    if (window.confirm('Delete this template? This cannot be undone.')) {
      setTaskTemplates(taskTemplates.filter(t => t.id !== id));
    }
  };

  const updateTaskRow = (idx, field, value) => {
    setTemplateTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const addTaskRow = () => setTemplateTasks(prev => [...prev, emptyTask()]);

  const removeTaskRow = (idx) => {
    if (templateTasks.length <= 1) return;
    setTemplateTasks(prev => prev.filter((_, i) => i !== idx));
  };

  const moveTaskRow = (idx, direction) => {
    setTemplateTasks(prev => {
      const next = [...prev];
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const filteredTemplates = templateSearch.trim()
    ? taskTemplates.filter(tpl => tpl.name.toLowerCase().includes(templateSearch.toLowerCase()))
    : taskTemplates;

  const repeatBadgeColor = (freq) => {
    if (freq === 'Daily') return 'bg-rose-100 text-rose-700';
    if (freq === 'Weekly') return 'bg-amber-100 text-amber-700';
    if (freq === 'Monthly') return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <>
    <div className="min-h-full p-4 space-y-4 text-left">
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        {CC_TABS.filter(tab => {
          if (tab.id === 'notifications') return currentUser?.role === 'Super Admin';
          if (currentUser?.role === 'Super Admin') return true;
          if (tab.id === 'conditions') return false;
          if (tab.id === 'hierarchy') return false;
          if (tab.id === 'feedback') return true;
          return (controlCenterTabAccess[tab.id] || []).includes(currentUser?.role);
        }).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-50 text-slate-600 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── USERS TAB ─── */}
      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setCsvMode('users')}
                className="border border-slate-200 text-slate-600 bg-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-all"
              >
                <Upload size={13}/> Import CSV
              </button>
              <button
                onClick={openAddUser}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-700 transition-all shadow-sm"
              >
                <UserPlus size={13}/> Add User
              </button>
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">No users found.</p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Clients</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-0.5">
                        <span>Weekly Digest</span>
                        <div className="flex gap-1 mt-0.5">
                          <button
                            onClick={() => { const next = (users || []).map(u => ({ ...u, weeklyDigestEnabled: true })); setUsers(next); }}
                            className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 hover:bg-emerald-100 transition-all"
                          >All on</button>
                          <button
                            onClick={() => { const next = (users || []).map(u => ({ ...u, weeklyDigestEnabled: false })); setUsers(next); }}
                            className="text-[9px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-100 transition-all"
                          >All off</button>
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-all">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                            {(user.name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 leading-none">{user.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                            {user.managerId && (() => {
                              const mgr = (users || []).find(u2 => u2.id === user.managerId);
                              return mgr ? (
                                <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                  <CornerDownLeft size={9} className="text-slate-300"/>
                                  {mgr.name}
                                </p>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-2 ${getRoleStyle(user.role)}`}>
                          {user.role === 'Super Admin' ? <Crown size={10}/> : user.role === 'Director' ? <Star size={10}/> : <UserCheck size={10}/>}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{user.department || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">{user.region || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(user.assignedProjects || []).length === 0
                            ? <span className="text-xs text-slate-400 italic">None</span>
                            : (user.assignedProjects || []).map(p => (
                              <span key={p} className="text-[10px] font-medium border border-blue-200 px-2 py-0.5 rounded-full text-blue-700 bg-blue-50">{p}</span>
                            ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => {
                            const next = (users || []).map(u =>
                              u.id === user.id ? { ...u, weeklyDigestEnabled: !u.weeklyDigestEnabled } : u
                            );
                            setUsers(next);
                          }}
                          title={user.weeklyDigestEnabled ? 'Disable weekly digest' : 'Enable weekly digest'}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            user.weeklyDigestEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                            user.weeklyDigestEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`}/>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditUser(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Edit3 size={14}/>
                          </button>
                          <button
                            onClick={() => setShowDeleteUserConfirm(user.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Category Filters</p>
              <p className="text-[11px] text-slate-500">Filter task categories by type. Set each category as Universal (visible to all) or limit to specific departments.</p>
            </div>
            <div className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200">
              Showing {filteredCategories.length} of {taskCategories.length}
            </div>
          </div>

          {/* Add category row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none"
              >
                <option value="All">All Categories</option>
                {categoryGroups.map(group => <option key={`opt-${group}`} value={group}>{group}</option>)}
              </select>
              <div className="relative flex-1">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const r = addCategoryItem(); flashMsg(setCatMsg, r === 'ok' ? '✓ Added' : r === 'duplicate' ? 'Already exists' : 'Enter a name first'); } }}
                  placeholder="New category name"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => { const r = addCategoryItem(); flashMsg(setCatMsg, r === 'ok' ? '✓ Added' : r === 'duplicate' ? 'Already exists' : 'Enter a name first'); }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
              >
                <Plus size={12} /> Add
              </button>
              {catMsg && <span className={`text-xs font-medium whitespace-nowrap ${catMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{catMsg}</span>}
            </div>
            {/* Visibility selector for new category */}
            <div className="flex items-center gap-2 pl-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">New category visibility:</span>
              <button
                type="button"
                onClick={() => setNewCategoryDepts([])}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${newCategoryDepts.length === 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                Universal
              </button>
              {departments.map(dept => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setNewCategoryDepts(prev =>
                    prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
                  )}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${newCategoryDepts.includes(dept) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2 text-left">Task Category</th>
                  <th className="px-3 py-2 text-left">Visibility</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map(category => {
                  const catObj = typeof category === 'object' ? category : { name: category, departments: [] };
                  const catName = catObj.name;
                  const catDepts = catObj.departments || [];
                  const isUniversal = catDepts.length === 0;
                  return (
                    <tr key={catName} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-700">{catName}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateCategoryDepts(catName, [])}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${isUniversal ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                          >
                            Universal
                          </button>
                          {departments.map(dept => (
                            <button
                              key={dept}
                              type="button"
                              onClick={() => {
                                const next = catDepts.includes(dept)
                                  ? catDepts.filter(d => d !== dept)
                                  : [...catDepts, dept];
                                updateCategoryDepts(catName, next);
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${catDepts.includes(dept) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                            >
                              {dept}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => removeCategory(catName)} className="p-1.5 text-slate-400 hover:text-red-500 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none"
            >
              <option value="All">All Departments</option>
              {departments.map(department => <option key={`opt-${department}`} value={department}>{department}</option>)}
            </select>
            <div className="relative w-full max-w-md">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={departmentInput}
                onChange={(e) => setDepartmentInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { const r = addItem(departmentInput, departments, setDepartments, setDepartmentInput, setDepartmentFilter); flashMsg(setDeptMsg, r === 'ok' ? '✓ Added' : r === 'duplicate' ? 'Already exists' : 'Enter a name first'); } }}
                placeholder="Add department"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => { const r = addItem(departmentInput, departments, setDepartments, setDepartmentInput, setDepartmentFilter); flashMsg(setDeptMsg, r === 'ok' ? '✓ Added' : r === 'duplicate' ? 'Already exists' : 'Enter a name first'); }}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
            {deptMsg && <span className={`text-xs font-medium ${deptMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{deptMsg}</span>}
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDepartments.map(department => (
                  <tr key={department}>
                    <td className="px-3 py-2 text-sm font-medium text-slate-700">{department}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeDepartment(department)} className="p-1.5 text-slate-400 hover:text-red-500 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'regions' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none"
            >
              <option value="All">All Regions</option>
              {regions.map(region => <option key={`opt-${region}`} value={region}>{region}</option>)}
            </select>
            <div className="relative w-full max-w-md">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { const r = addRegion(); flashMsg(setRegionMsg, r === 'ok' ? '✓ Added' : r === 'duplicate' ? 'Already exists' : 'Enter a name first'); } }}
                placeholder="Add region"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => { const r = addRegion(); flashMsg(setRegionMsg, r === 'ok' ? '✓ Added' : r === 'duplicate' ? 'Already exists' : 'Enter a name first'); }}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
            {regionMsg && <span className={`text-xs font-medium ${regionMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{regionMsg}</span>}
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2 text-left">Region</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRegions.map(region => (
                  <tr key={region}>
                    <td className="px-3 py-2 text-sm font-medium text-slate-700">{region}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeRegion(region)} className="p-1.5 text-slate-400 hover:text-red-500 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'conditions' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <ShieldCheck size={16} className="text-blue-600" />
            <p className="text-sm font-semibold">Control Center Tab Access by Role</p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-slate-100 z-10 min-w-[130px]">Role</th>
                  {CC_TABS.filter(tab => tab.id !== 'conditions').map(tab => (
                    <th key={tab.id} className="px-3 py-2 text-center font-semibold whitespace-nowrap">{tab.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {normalizedRoles.map(role => {
                  const isSuperAdmin = role === 'Super Admin';
                  return (
                    <tr key={role} className={isSuperAdmin ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-inherit z-10 flex items-center gap-1.5">
                        {isSuperAdmin && <Crown size={11} className="text-blue-600 flex-shrink-0" />}
                        {role}
                      </td>
                      {CC_TABS.filter(tab => tab.id !== 'conditions').map(tab => {
                        const checked = isSuperAdmin || (controlCenterTabAccess[tab.id] || []).includes(role);
                        return (
                          <td key={tab.id} className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSuperAdmin}
                              onChange={() => toggleTabAccess(tab.id, role)}
                              className="w-4 h-4 accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">Super Admin always has access to all tabs and cannot be modified.</p>

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Navigation Access — Views</p>
            <p className="text-xs text-slate-500">Control which roles can see each navigation view.</p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-slate-100 z-10 min-w-[130px]">Role</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Team View</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Employee View</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">User Management</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {normalizedRoles.map(role => {
                    const isSuperAdmin = role === 'Super Admin';
                    return (
                      <tr key={role} className={isSuperAdmin ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                        <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-inherit z-10 flex items-center gap-1.5">
                          {isSuperAdmin && <Crown size={11} className="text-blue-600 flex-shrink-0" />}
                          {role}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={isSuperAdmin || teamViewAccessRoles.includes(role)} disabled={isSuperAdmin}
                            onChange={() => toggleTeamViewRole(role)} className="w-4 h-4 accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={isSuperAdmin || employeeViewAccessRoles.includes(role)} disabled={isSuperAdmin}
                            onChange={() => toggleEmployeeViewRole(role)} className="w-4 h-4 accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={isSuperAdmin || userManagementAccessRoles.includes(role)} disabled={isSuperAdmin}
                            onChange={() => toggleUserManagementRole(role)} className="w-4 h-4 accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Data Access — Metrics &amp; Reports</p>
            <p className="text-xs text-slate-500"><strong>Off</strong> = no access &nbsp;·&nbsp; <strong>Dept</strong> = own department only &nbsp;·&nbsp; <strong>All</strong> = all departments</p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-slate-100 z-10 min-w-[130px]">Role</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Metrics</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Reports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {normalizedRoles.map(role => {
                    const isSuperAdmin = role === 'Super Admin';
                    const mState = isSuperAdmin ? 'all' : !metricsAccessRoles.includes(role) ? 'off' : metricsAllDataRoles.includes(role) ? 'all' : 'dept';
                    const rState = isSuperAdmin ? 'all' : !reportsAccessRoles.includes(role) ? 'off' : reportsAllDataRoles.includes(role) ? 'all' : 'dept';
                    return (
                      <tr key={role} className={isSuperAdmin ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                        <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-inherit z-10 flex items-center gap-1.5">
                          {isSuperAdmin && <Crown size={11} className="text-blue-600 flex-shrink-0" />}
                          {role}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <OffDeptAllToggle value={mState} locked={isSuperAdmin} onChange={s => applyViewState(role, 'metrics', s)} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <OffDeptAllToggle value={rState} locked={isSuperAdmin} onChange={s => applyViewState(role, 'reports', s)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── HIERARCHY TAB ─── */}
      {activeTab === 'hierarchy' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Standard Track — Role Order</h3>
                <p className="text-xs text-slate-500 mt-0.5">This determines the hierarchy depth in Team View. Drag using ↑ / ↓ to reorder levels.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={resetHierarchyOrder} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">Reset</button>
                <button onClick={saveHierarchyOrder} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${hierarchySaved ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {hierarchySaved ? '✓ Saved' : 'Save Order'}
                </button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {hierarchyDraft.map((role, idx) => (
                <div key={role} className={`flex items-center justify-between px-4 py-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-100 last:border-b-0`}>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs font-semibold text-slate-700">{role}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => moveHierarchyRole(idx, -1)} disabled={idx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-slate-600">
                      <ChevronUp size={13}/>
                    </button>
                    <button onClick={() => moveHierarchyRole(idx, 1)} disabled={idx === hierarchyDraft.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-slate-600">
                      <ChevronDown size={13}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 opacity-80">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Client Servicing Track — Fixed</h3>
              <p className="text-xs text-slate-500 mt-0.5">This 2-level structure is always fixed and cannot be reordered.</p>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {CS_TRACK_FIXED.map((item, idx) => (
                <div key={item.role} className={`flex items-center gap-3 px-4 py-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-100 last:border-b-0`}>
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{item.level}</span>
                  <span className="text-xs font-semibold text-slate-600">{item.role}</span>
                  <span className="ml-auto text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Fixed</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TEMPLATES TAB ─── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {/* Header + actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
              />
            </div>
            <button
              onClick={openNewTemplateForm}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-700 transition-all shadow-sm"
            >
              <Plus size={13}/> New Template
            </button>
          </div>

          {/* Template cards */}
          {filteredTemplates.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
              No templates found.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTemplates.map(tpl => (
              <div key={tpl.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 flex flex-col shadow-sm">
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 truncate">{tpl.name}</p>
                      {tpl.isPrebuilt && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                          <Lock size={9}/> Prebuilt
                        </span>
                      )}
                      {tpl.isHomeTemplate && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex-shrink-0">
                          Home Template{tpl.targetRoles && tpl.targetRoles.length > 0 ? ` · ${tpl.targetRoles.join(', ')}` : ''}
                        </span>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{tpl.description}</p>
                    )}
                  </div>
                  {(!tpl.isPrebuilt || currentUser?.role === 'Super Admin') && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEditTemplateForm(tpl)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Edit"
                      >
                        <Edit2 size={13}/>
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete"
                      >
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  )}
                </div>

                {/* Task list preview */}
                <div className="flex-1 space-y-1.5">
                  {(tpl.tasks || []).map((task, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        {task.name && <p className="text-[11px] font-semibold text-slate-800 leading-snug">{task.name}</p>}
                        <p className="text-[11px] font-medium text-slate-500 leading-snug mt-0.5">{task.comment}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {task.category && (
                            <span className="text-[9px] font-medium text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">{task.category}</span>
                          )}
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${repeatBadgeColor(task.repeatFrequency)}`}>
                            {task.repeatFrequency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] font-medium text-slate-400">{(tpl.tasks || []).length} task{(tpl.tasks || []).length !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── NOTIFICATIONS TAB ─── */}
      {activeTab === 'notifications' && (() => {
        const activeEvents = NOTIFICATION_EVENTS.filter(e => getEventEnabled(e.id));
        const inactiveEvents = NOTIFICATION_EVENTS.filter(e => !getEventEnabled(e.id));

        const renderEventCard = (event) => {
          const isEnabled = getEventEnabled(event.id);
          const setting = notificationSettings[event.id] || {};
          const bccList = Array.isArray(setting.bccEmails) ? setting.bccEmails : [];
          const isExpanded = !!expandedEvents[event.id];
          const bccInput = bccInputs[event.id] || '';

          return (
            <div key={event.id} className={`rounded-lg border ${isEnabled ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-start gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{event.label}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">{event.when}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{event.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpandedEvents(prev => ({ ...prev, [event.id]: !prev[event.id] }))}
                    className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 transition-all"
                    title="Customise"
                  >
                    <Edit2 size={11} />
                  </button>
                  <button
                    onClick={() => onUpdateNotificationSetting && onUpdateNotificationSetting(event.id, { enabled: !isEnabled })}
                    disabled={!onUpdateNotificationSetting}
                    title={isEnabled ? 'Disable' : 'Enable'}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50 rounded-b-lg">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Subject prefix</label>
                    <input
                      type="text"
                      placeholder="Optional — prepended to the email subject"
                      defaultValue={setting.customSubject || ''}
                      onBlur={e => onUpdateNotificationSetting && onUpdateNotificationSetting(event.id, { customSubject: e.target.value.trim() || null })}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Intro text override</label>
                    <textarea
                      placeholder="Optional — inserted at the top of the email body"
                      defaultValue={setting.customIntroText || ''}
                      onBlur={e => onUpdateNotificationSetting && onUpdateNotificationSetting(event.id, { customIntroText: e.target.value.trim() || null })}
                      rows={2}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 ring-blue-500/20 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">BCC addresses</label>
                    <div className="flex gap-1.5 mb-1.5">
                      <input
                        type="email"
                        placeholder="name@example.com"
                        value={bccInput}
                        onChange={e => setBccInputs(prev => ({ ...prev, [event.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = bccInput.trim().toLowerCase();
                            if (val && !bccList.includes(val)) {
                              const next = [...bccList, val];
                              onUpdateNotificationSetting && onUpdateNotificationSetting(event.id, { bccEmails: next });
                            }
                            setBccInputs(prev => ({ ...prev, [event.id]: '' }));
                          }
                        }}
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 ring-blue-500/20"
                      />
                      <button
                        onClick={() => {
                          const val = bccInput.trim().toLowerCase();
                          if (val && !bccList.includes(val)) {
                            const next = [...bccList, val];
                            onUpdateNotificationSetting && onUpdateNotificationSetting(event.id, { bccEmails: next });
                          }
                          setBccInputs(prev => ({ ...prev, [event.id]: '' }));
                        }}
                        className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold"
                      >Add</button>
                    </div>
                    {bccList.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {bccList.map(addr => (
                          <span key={addr} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 border border-slate-200 text-slate-700 rounded-full px-2 py-0.5">
                            {addr}
                            <button
                              onClick={() => {
                                const next = bccList.filter(a => a !== addr);
                                onUpdateNotificationSetting && onUpdateNotificationSetting(event.id, { bccEmails: next });
                              }}
                              className="text-slate-400 hover:text-red-500 transition-colors"
                            ><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">No BCC addresses — only the primary recipient receives this email.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-4">
            {/* Email status banner */}
            <div className={`rounded-xl border p-3 flex items-center gap-3 ${
              emailStatusLoading ? 'bg-slate-50 border-slate-200' :
              emailStatus?.configured ? 'bg-emerald-50 border-emerald-200' :
              'bg-red-50 border-red-200'
            }`}>
              {emailStatusLoading ? (
                <p className="text-xs text-slate-500">Checking email service…</p>
              ) : emailStatus?.configured ? (
                <>
                  <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                  <p className="text-xs font-semibold text-emerald-700">Email service ready — all notifications will be delivered.</p>
                </>
              ) : emailStatus ? (
                <>
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-red-700">Email not configured — missing: {(emailStatus.missing || []).join(', ')}. Set these in the Secrets panel.</p>
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="text-slate-400 flex-shrink-0" />
                  <p className="text-xs text-slate-500">Unable to check email service status.</p>
                </>
              )}
            </div>

            {/* Weekly Digest card */}
            {(() => {
              const digestSetting = notificationSettings['weekly-digest'] || {};
              const digestTz = digestSetting.scheduleTimezone || 'Europe/London';
              const digestHour = typeof digestSetting.scheduleHour === 'number' ? digestSetting.scheduleHour : 8;
              const tzLabel = DIGEST_TIMEZONES.find(t => t.value === digestTz)?.label || digestTz;
              const isDigestExpanded = !!expandedEvents['weekly-digest'];
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Other</p>
                  </div>
                  <div className={`rounded-lg border ${digestGlobalEnabled ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-start gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">Weekly Hours Digest</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                            Every Monday, {String(digestHour).padStart(2,'0')}:00 — {tzLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Sends each opted-in user a Monday morning email summarising their hours logged for the previous week, broken down by project. Individual opt-in is controlled per user in the Users tab.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setExpandedEvents(prev => ({ ...prev, 'weekly-digest': !prev['weekly-digest'] }))}
                          className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 transition-all"
                          title="Customise schedule"
                        >
                          <Edit2 size={11} />
                        </button>
                        <button
                          onClick={() => onDigestGlobalToggle && onDigestGlobalToggle(!digestGlobalEnabled)}
                          disabled={!onDigestGlobalToggle}
                          title={digestGlobalEnabled ? 'Disable globally' : 'Enable globally'}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${digestGlobalEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${digestGlobalEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>

                    {isDigestExpanded && (
                      <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50 rounded-b-lg">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Send time</label>
                          <div className="flex items-center gap-2">
                            <select
                              value={digestHour}
                              onChange={e => onUpdateNotificationSetting && onUpdateNotificationSetting('weekly-digest', { scheduleHour: Number(e.target.value) })}
                              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 ring-blue-500/20"
                            >
                              {DIGEST_HOURS.map(h => (
                                <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                              ))}
                            </select>
                            <span className="text-xs text-slate-400">on Mondays</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Timezone</label>
                          <select
                            value={digestTz}
                            onChange={e => onUpdateNotificationSetting && onUpdateNotificationSetting('weekly-digest', { scheduleTimezone: e.target.value })}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 ring-blue-500/20"
                          >
                            {DIGEST_TIMEZONES.map(tz => (
                              <option key={tz.value} value={tz.value}>{tz.label}</option>
                            ))}
                          </select>
                          <p className="text-[10px] text-slate-400 mt-1">
                            The digest runs at {String(digestHour).padStart(2,'0')}:00 local time in the selected timezone. Changes take effect from the next Monday check.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Active events */}
            {activeEvents.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Active</p>
                  <span className="text-[11px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">{activeEvents.length}</span>
                </div>
                {activeEvents.map(renderEventCard)}
              </div>
            )}

            {/* Inactive events */}
            {inactiveEvents.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Available</p>
                  <span className="text-[11px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">{inactiveEvents.length}</span>
                </div>
                {inactiveEvents.map(renderEventCard)}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── FEEDBACK TAB ─── */}
      {activeTab === 'feedback' && (() => {
        const TYPES = [
          { id: 'Bug', icon: <Bug size={13}/>, color: 'bg-red-100 text-red-700 border-red-200' },
          { id: 'Suggestion', icon: <Lightbulb size={13}/>, color: 'bg-amber-100 text-amber-700 border-amber-200' },
          { id: 'General', icon: <MessageSquare size={13}/>, color: 'bg-blue-100 text-blue-700 border-blue-200' },
        ];
        const STATUS_META = {
          'New':               { icon: <AlertCircle size={12}/>,    cls: 'bg-red-50 text-red-600 border-red-200' },
          'In Progress':       { icon: <Clock size={12}/>,          cls: 'bg-amber-50 text-amber-600 border-amber-200' },
          'Awaiting Testing':  { icon: <FlaskConical size={12}/>,   cls: 'bg-purple-50 text-purple-600 border-purple-200' },
          'Resolved':          { icon: <CheckCircle2 size={12}/>,   cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        };
        const isAdmin = currentUser?.role === 'Super Admin';
        const myItems = feedbackItems.filter(f => f.userId === currentUser?.id).sort((a,b) => b.timestamp - a.timestamp);
        const adminItems = feedbackItems
          .filter(f => !f.archived && (
            fbAdminFilter === 'All' ? true :
            fbAdminFilter === 'Mine' ? String(f.userId) === String(currentUser?.id) :
            f.status === fbAdminFilter
          ))
          .sort((a,b) => b.timestamp - a.timestamp);
        const myFilteredItems = myItems.filter(f => fbUserFilter === 'All' || f.status === fbUserFilter);
        const archivedItems = feedbackItems
          .filter(f => f.archived)
          .sort((a,b) => b.timestamp - a.timestamp);

        const handleSubmit = (e) => {
          e.preventDefault();
          if (!fbTitle.trim() || !fbDesc.trim()) return;
          const newItem = {
            id: `fb-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
            userId: currentUser?.id,
            userName: currentUser?.name || currentUser?.email,
            userRole: currentUser?.role,
            userDept: currentUser?.department,
            type: fbType,
            title: fbTitle.trim(),
            description: fbDesc.trim(),
            timestamp: Date.now(),
            status: 'New',
          };
          setFeedbackItems([...feedbackItems, newItem]);
          setFbTitle(''); setFbDesc(''); setFbSubmitted(true);
          setTimeout(() => setFbSubmitted(false), 2500);
        };

        const updateStatus = (id, status) => {
          setFeedbackItems(feedbackItems.map(f => f.id === id ? { ...f, status } : f));
        };
        const deleteItem = (id) => {
          setFeedbackItems(feedbackItems.filter(f => f.id !== id));
        };
        const archiveItem = (id) => {
          setFeedbackItems(feedbackItems.map(f => f.id === id ? { ...f, archived: true, archivedAt: Date.now() } : f));
        };
        const unarchiveItem = (id) => {
          setFeedbackItems(feedbackItems.map(f => f.id === id ? { ...f, archived: false, archivedAt: null } : f));
        };
        const startEdit = (item) => {
          setEditingFbId(item.id);
          setEditingFbDraft({ type: item.type, title: item.title, description: item.description });
        };
        const saveEdit = (id) => {
          setFeedbackItems(feedbackItems.map(f => f.id === id ? { ...f, ...editingFbDraft } : f));
          setEditingFbId(null);
        };
        const cancelEdit = () => setEditingFbId(null);

        const addThreadEntry = (itemId, text, replyToEntryId) => {
          if (!text.trim()) return;
          const entry = {
            id: `fbr-${Date.now()}`,
            authorId: currentUser?.id || null,
            authorName: currentUser?.name || currentUser?.email || 'Admin',
            text: text.trim(),
            timestamp: Date.now(),
            ...(replyToEntryId ? { replyToId: replyToEntryId } : {}),
          };
          const targetItem = feedbackItems.find(f => f.id === itemId);
          const existingThread = buildFbThread(targetItem || {});
          const isFirstReply = existingThread.length === 0;
          setFeedbackItems(feedbackItems.map(f => f.id === itemId ? {
            ...f,
            thread: [...existingThread, entry],
          } : f));
          setReplyingFbId(null);
          setReplyingFbEntryId(null);
          setReplyDraft('');
          if (targetItem) {
            const submitter = (users || []).find(u => String(u.id) === String(targetItem.userId));
            const recipientEmail = submitter?.email || targetItem.userEmail;
            if (recipientEmail) {
              sendNotification('feedback-response', {
                recipientEmail,
                recipientName: targetItem.userName || submitter?.name,
                feedbackText: targetItem.description || targetItem.text || '',
                replyText: text.trim(),
                adminName: currentUser?.name,
              });
            }
          }
        };
        const startReply = (itemId, entryId) => {
          setReplyingFbId(itemId);
          setReplyingFbEntryId(entryId || null);
          setReplyDraft('');
          setEditingFbId(null);
        };
        const cancelReply = () => {
          setReplyingFbId(null);
          setReplyingFbEntryId(null);
          setReplyDraft('');
        };
        const saveEditFbEntry = (itemId, entryId) => {
          const text = editFbEntryText.trim();
          if (!text) return;
          setFeedbackItems(feedbackItems.map(f => f.id === itemId ? {
            ...f,
            thread: buildFbThread(f).map(e => e.id === entryId ? { ...e, text, edited: true } : e),
          } : f));
          setEditingFbEntryId(null);
          setEditFbEntryText('');
        };
        const deleteThreadEntry = (itemId, entryId) => {
          const removeIds = new Set([entryId]);
          let changed = true;
          while (changed) {
            changed = false;
            buildFbThread(feedbackItems.find(f => f.id === itemId) || {}).forEach(e => {
              if (e.replyToId && removeIds.has(e.replyToId) && !removeIds.has(e.id)) { removeIds.add(e.id); changed = true; }
            });
          }
          setFeedbackItems(feedbackItems.map(f => f.id === itemId ? {
            ...f,
            thread: buildFbThread(f).filter(e => !removeIds.has(e.id)),
          } : f));
        };
        const renderFbThread = (item, thread, editable = false) => {
          const renderEntry = (entry, allEntries, depth = 0) => {
            const children = allEntries.filter(e => e.replyToId === entry.id);
            const parentEntry = entry.replyToId ? allEntries.find(e => e.id === entry.replyToId) : null;
            const isComposing = replyingFbId === item.id && replyingFbEntryId === entry.id;
            const isEditingEntry = editingFbEntryId === entry.id;
            const isMyEntry = String(entry.authorId) === String(currentUser?.id);
            const indent = depth === 1 ? 'ml-3' : depth >= 2 ? 'ml-5' : '';
            return (
              <div key={entry.id} className="group/fbentry">
                <div className={`pl-3 border-l-2 border-indigo-200 space-y-0.5 py-1 ${indent}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {parentEntry && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400">
                        <CornerDownLeft size={8}/> {parentEntry.authorName}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-indigo-600">{entry.authorName}</span>
                    {entry.timestamp && (
                      <span className="text-[10px] text-slate-400">· {new Date(entry.timestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}{entry.edited ? ' · edited' : ''}</span>
                    )}
                    {editable && !isComposing && !isEditingEntry && (
                      <button
                        onClick={() => startReply(item.id, entry.id)}
                        className="ml-auto flex items-center gap-0.5 text-[10px] text-slate-300 hover:text-indigo-500 transition-colors font-semibold"
                      >
                        <CornerDownLeft size={9}/> Reply
                      </button>
                    )}
                    {isMyEntry && !isEditingEntry && (
                      <div className="hidden group-hover/fbentry:flex items-center gap-0.5 ml-1">
                        <button onClick={() => { setEditingFbEntryId(entry.id); setEditFbEntryText(entry.text); setReplyingFbId(null); }} className="p-0.5 text-slate-300 hover:text-indigo-500 transition-colors" title="Edit"><Pencil size={9}/></button>
                        <button onClick={() => deleteThreadEntry(item.id, entry.id)} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={9}/></button>
                      </div>
                    )}
                  </div>
                  {isEditingEntry ? (
                    <div className="space-y-1.5 pt-0.5">
                      <textarea
                        value={editFbEntryText}
                        onChange={e => setEditFbEntryText(e.target.value)}
                        autoFocus
                        rows={2}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400 transition-all resize-none"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditFbEntry(item.id, entry.id); } if (e.key === 'Escape') setEditingFbEntryId(null); }}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditingFbEntryId(null)} className="px-3 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">Cancel</button>
                        <button onClick={() => saveEditFbEntry(item.id, entry.id)} disabled={!editFbEntryText.trim()} className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5"><Send size={10}/> Save</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-indigo-800 leading-relaxed">{entry.text}</p>
                  )}
                </div>
                {isComposing && (
                  <div className={`mt-1 ${depth > 0 ? 'ml-5' : 'ml-3'} space-y-1.5`}>
                    <textarea
                      value={replyDraft}
                      onChange={e => setReplyDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addThreadEntry(item.id, replyDraft, entry.id); } if (e.key === 'Escape') cancelReply(); }}
                      placeholder={`Reply to ${entry.authorName}…`}
                      rows={2}
                      autoFocus
                      className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400 transition-all resize-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={cancelReply} className="px-3 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">Cancel</button>
                      <button type="button" onClick={() => addThreadEntry(item.id, replyDraft, entry.id)} disabled={!replyDraft.trim()} className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5">
                        <Send size={10}/> Send
                      </button>
                    </div>
                  </div>
                )}
                {children.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {children.map(child => renderEntry(child, allEntries, depth + 1))}
                  </div>
                )}
              </div>
            );
          };
          return (
            <div className="space-y-1 mt-1">
              {thread.filter(e => !e.replyToId).map(entry => renderEntry(entry, thread))}
              {editable && (
                replyingFbId === item.id && replyingFbEntryId === null ? (
                  <div className="ml-3 space-y-1.5 mt-1">
                    <textarea
                      value={replyDraft}
                      onChange={e => setReplyDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addThreadEntry(item.id, replyDraft, null); } if (e.key === 'Escape') cancelReply(); }}
                      placeholder="Write a reply…"
                      rows={2}
                      autoFocus
                      className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400 transition-all resize-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={cancelReply} className="px-3 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">Cancel</button>
                      <button type="button" onClick={() => addThreadEntry(item.id, replyDraft, null)} disabled={!replyDraft.trim()} className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5">
                        <Send size={10}/> Send
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startReply(item.id, null)}
                    className="ml-3 flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-500 font-semibold transition-colors mt-1"
                  >
                    <CornerDownLeft size={10}/> Add comment
                  </button>
                )
              )}
            </div>
          );
        };

        return (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={15} className="text-blue-600"/>
                <h3 className="text-sm font-bold text-slate-800">Submit Feedback or Report a Bug</h3>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.id} type="button"
                      onClick={() => setFbType(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${fbType === t.id ? t.color + ' shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                    >
                      {t.icon} {t.id}
                    </button>
                  ))}
                </div>
                <input
                  value={fbTitle}
                  onChange={e => setFbTitle(e.target.value)}
                  placeholder="Short title — what's the issue or idea?"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all"
                  required
                />
                <textarea
                  value={fbDesc}
                  onChange={e => setFbDesc(e.target.value)}
                  placeholder="Describe in detail — steps to reproduce, expected vs actual, or your suggestion..."
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all resize-none"
                  required
                />
                <div className="flex items-center justify-between">
                  {fbSubmitted && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                      <CheckCircle2 size={13}/> Submitted — thank you!
                    </span>
                  )}
                  {!fbSubmitted && <span/>}
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1.5">
                    <MessageSquare size={12}/> Submit
                  </button>
                </div>
              </form>
            </div>

            {isAdmin ? (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Filter size={14} className="text-slate-500"/> All Feedback
                    <span className="text-xs font-semibold text-slate-400">({adminItems.length})</span>
                  </h3>
                  <div className="flex gap-1">
                    {['All','Mine','New','In Progress','Awaiting Testing','Resolved'].map(s => (
                      <button key={s} type="button" onClick={() => setFbAdminFilter(s)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${fbAdminFilter === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {adminItems.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No feedback yet.</p>
                ) : (
                  <div className="space-y-2">
                    {adminItems.map(item => {
                      const typeInfo = TYPES.find(t => t.id === item.type) || TYPES[2];
                      const sm = STATUS_META[item.status] || STATUS_META['New'];
                      return (
                        <div key={item.id} className="border border-slate-100 rounded-xl p-3 space-y-2 bg-slate-50/60 hover:bg-white transition-all">
                          {editingFbId === item.id ? (
                            <div className="space-y-2">
                              <div className="flex gap-1.5 flex-wrap">
                                {TYPES.map(t => (
                                  <button key={t.id} type="button" onClick={() => setEditingFbDraft(d => ({...d, type: t.id}))}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-all ${editingFbDraft.type === t.id ? t.color : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>
                                    {t.icon} {t.id}
                                  </button>
                                ))}
                              </div>
                              <input
                                value={editingFbDraft.title}
                                onChange={e => setEditingFbDraft(d => ({...d, title: e.target.value}))}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400 transition-all font-semibold"
                                placeholder="Title"
                              />
                              <textarea
                                value={editingFbDraft.description}
                                onChange={e => setEditingFbDraft(d => ({...d, description: e.target.value}))}
                                rows={3}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400 transition-all resize-none"
                                placeholder="Description"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button type="button" onClick={cancelEdit} className="px-3 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                                  Cancel
                                </button>
                                <button type="button" onClick={() => saveEdit(item.id)} disabled={!editingFbDraft.title?.trim() || !editingFbDraft.description?.trim()}
                                  className="px-3 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all disabled:opacity-50">
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${typeInfo.color}`}>
                                    {typeInfo.icon} {item.type}
                                  </span>
                                  <span className="text-xs font-bold text-slate-800">{item.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <select
                                    value={item.status}
                                    onChange={e => updateStatus(item.id, e.target.value)}
                                    className={`text-[10px] font-semibold border rounded-lg px-2 py-1 outline-none cursor-pointer ${sm.cls}`}
                                  >
                                    <option>New</option>
                                    <option>In Progress</option>
                                    <option>Awaiting Testing</option>
                                    <option>Resolved</option>
                                  </select>
                                  <button onClick={() => startReply(item.id, null)} className={`p-1 transition-all ${replyingFbId === item.id ? 'text-indigo-500' : buildFbThread(item).length > 0 ? 'text-indigo-400 hover:text-indigo-600' : 'text-slate-300 hover:text-indigo-500'}`} title="Add to thread">
                                    <CornerDownLeft size={13}/>
                                  </button>
                                  <button onClick={() => startEdit(item)} className="p-1 text-slate-300 hover:text-blue-500 transition-all" title="Edit">
                                    <Edit2 size={13}/>
                                  </button>
                                  {item.status === 'Resolved' && (
                                    <button onClick={() => archiveItem(item.id)} className="p-1 text-slate-300 hover:text-slate-600 transition-all" title="Archive this resolved item">
                                      <Archive size={13}/>
                                    </button>
                                  )}
                                  <button onClick={() => deleteItem(item.id)} className="p-1 text-slate-300 hover:text-red-500 transition-all" title="Delete">
                                    <Trash2 size={13}/>
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                              {renderFbThread(item, buildFbThread(item), true)}
                              <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                                <span>{item.userName} · {item.userRole}{item.userDept ? ` · ${item.userDept}` : ''}</span>
                                <span>{new Date(item.timestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {archivedItems.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 mt-1">
                    <button
                      type="button"
                      onClick={() => setShowArchived(v => !v)}
                      className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-all w-full"
                    >
                      <ChevronRight size={13} className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}/>
                      <Archive size={12}/>
                      Archived ({archivedItems.length})
                    </button>
                    {showArchived && (
                      <div className="space-y-2 mt-2">
                        {archivedItems.map(item => {
                          const typeInfo = TYPES.find(t => t.id === item.type) || TYPES[2];
                          return (
                            <div key={item.id} className="border border-slate-100 rounded-xl p-3 space-y-2 bg-slate-50/40 opacity-70 hover:opacity-100 transition-all">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${typeInfo.color}`}>
                                    {typeInfo.icon} {item.type}
                                  </span>
                                  <span className="text-xs font-bold text-slate-600">{item.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold bg-emerald-50 text-emerald-600 border-emerald-200">
                                    <CheckCircle2 size={10}/> Resolved
                                  </span>
                                  <button onClick={() => unarchiveItem(item.id)} className="p-1 text-slate-300 hover:text-blue-500 transition-all" title="Restore to active list">
                                    <ArchiveRestore size={13}/>
                                  </button>
                                  <button onClick={() => deleteItem(item.id)} className="p-1 text-slate-300 hover:text-red-500 transition-all" title="Delete permanently">
                                    <Trash2 size={13}/>
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                              <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                                <span>{item.userName} · {item.userRole}{item.userDept ? ` · ${item.userDept}` : ''}</span>
                                <span>Submitted: {new Date(item.timestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span>
                                {item.archivedAt && <span>Archived: {new Date(item.archivedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : myItems.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <MessageSquare size={14} className="text-slate-500"/> My Submissions
                    <span className="text-xs font-semibold text-slate-400">({myFilteredItems.length})</span>
                  </h3>
                  <div className="flex gap-1 flex-wrap">
                    {['All','New','In Progress','Awaiting Testing','Resolved'].map(s => (
                      <button key={s} type="button" onClick={() => setFbUserFilter(s)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${fbUserFilter === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {myFilteredItems.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No items match this filter.</p>
                ) : (
                <div className="space-y-2">
                  {myFilteredItems.map(item => {
                    const typeInfo = TYPES.find(t => t.id === item.type) || TYPES[2];
                    const sm = STATUS_META[item.status] || STATUS_META['New'];
                    return (
                      <div key={item.id} className="border border-slate-100 rounded-xl p-3 space-y-1.5 bg-slate-50/60">
                        {editingFbId === item.id ? (
                          <div className="space-y-2">
                            <div className="flex gap-1.5 flex-wrap">
                              {TYPES.map(t => (
                                <button key={t.id} type="button" onClick={() => setEditingFbDraft(d => ({...d, type: t.id}))}
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-all ${editingFbDraft.type === t.id ? t.color : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>
                                  {t.icon} {t.id}
                                </button>
                              ))}
                            </div>
                            <input
                              value={editingFbDraft.title}
                              onChange={e => setEditingFbDraft(d => ({...d, title: e.target.value}))}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400 transition-all font-semibold"
                              placeholder="Title"
                            />
                            <textarea
                              value={editingFbDraft.description}
                              onChange={e => setEditingFbDraft(d => ({...d, description: e.target.value}))}
                              rows={3}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400 transition-all resize-none"
                              placeholder="Description"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button type="button" onClick={cancelEdit} className="px-3 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                                Cancel
                              </button>
                              <button type="button" onClick={() => saveEdit(item.id)} disabled={!editingFbDraft.title?.trim() || !editingFbDraft.description?.trim()}
                                className="px-3 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all disabled:opacity-50">
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${typeInfo.color}`}>
                                  {typeInfo.icon} {item.type}
                                </span>
                                <span className="text-xs font-bold text-slate-800">{item.title}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${sm.cls}`}>
                                  {sm.icon} {item.status}
                                </span>
                                <button onClick={() => startEdit(item)} className="p-1 text-slate-300 hover:text-blue-500 transition-all" title="Edit">
                                  <Edit2 size={13}/>
                                </button>
                                {item.status === 'Resolved' && !item.archived && (
                                  <button onClick={() => archiveItem(item.id)} className="p-1 text-slate-300 hover:text-slate-600 transition-all" title="Archive">
                                    <Archive size={13}/>
                                  </button>
                                )}
                                <button onClick={() => deleteItem(item.id)} className="p-1 text-slate-300 hover:text-red-500 transition-all" title="Delete">
                                  <Trash2 size={13}/>
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                            {buildFbThread(item).length > 0 && renderFbThread(item, buildFbThread(item), false)}
                            <p className="text-[10px] text-slate-400 font-medium">{new Date(item.timestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            ) : null}
          </div>
        );
      })()}

      {/* ─── CLIENTS TAB ─── */}
      {activeTab === 'clients' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Search clients..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">{filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setCsvMode('combined')}
                className="border border-slate-200 text-slate-600 bg-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-all"
              >
                <Upload size={13}/> Clients + Users
              </button>
              <button
                onClick={() => setCsvMode('clients')}
                className="border border-slate-200 text-slate-600 bg-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition-all"
              >
                <Upload size={13}/> Import Clients
              </button>
              <button
                onClick={openAddClient}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-700 transition-all shadow-sm"
              >
                <Plus size={13}/> Add Client
              </button>
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">No clients found.</p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">Entity</th>
                    <th className="px-3 py-2 text-left">Client Name</th>
                    <th className="px-3 py-2 text-left">Leadership</th>
                    <th className="px-3 py-2 text-left">Team</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map(c => {
                    const staff = getProjectStaff(c.name);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-all">
                        <td className="px-3 py-2 text-xs text-slate-500">{c.entityName || '—'}</td>
                        <td className="px-3 py-2 text-sm font-semibold text-slate-800">{c.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {staff.admins.length === 0
                              ? <span className="text-xs text-slate-400 italic">None</span>
                              : staff.admins.map(u => (
                                  <span key={u.id} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">
                                    <Crown size={8} className="text-blue-500"/>{u.name}
                                  </span>
                                ))
                            }
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {staff.employees.length === 0
                              ? <span className="text-xs text-slate-400 italic">None</span>
                              : staff.employees.map(u => (
                                  <span key={u.id} className="inline-flex text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                    {u.name}
                                  </span>
                                ))
                            }
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditClient(c)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Edit"
                            >
                              <Edit2 size={14}/>
                            </button>
                            <button
                              onClick={() => handleDeleteClient(c.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete"
                            >
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── EDIT CLIENT MODAL ─── */}
      {editingClientId && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200" style={{maxHeight:'90vh'}}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Edit Client</h3>
              <button onClick={closeEditClient} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"><X size={16}/></button>
            </div>
            <form onSubmit={handleSaveEditClient} className="flex flex-col flex-1 overflow-y-auto">
              <div className="px-6 py-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Entity Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editEntityName}
                      onChange={e => setEditEntityName(e.target.value)}
                      placeholder="Entity name..."
                      required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Client Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editClientName}
                      onChange={e => setEditClientName(e.target.value)}
                      placeholder="Client name..."
                      required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20 bg-white"
                    />
                  </div>
                </div>

                {/* Leadership */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Leadership</label>
                    <button
                      type="button"
                      onClick={() => { setPickerSearch(''); setActivePicker('edit-leadership'); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Users size={12}/> Select Members
                    </button>
                  </div>
                  <div className="min-h-[52px] max-h-28 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 flex flex-wrap gap-1.5 items-start content-start">
                    {editClientAdmins.length === 0
                      ? <p className="text-xs text-slate-400 italic">No leadership selected</p>
                      : editClientAdmins.map(id => {
                          const u = (users || []).find(x => x.id === id);
                          return u ? (
                            <span key={id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold px-2 py-1 rounded-full">
                              <Crown size={10} className="text-blue-500"/>
                              {u.name}
                              <button type="button" onClick={() => setEditClientAdmins(prev => prev.filter(x => x !== id))} className="ml-0.5 hover:text-blue-900"><X size={10}/></button>
                            </span>
                          ) : null;
                        })
                    }
                  </div>
                </div>

                {/* Team */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Team</label>
                    <button
                      type="button"
                      onClick={() => { setPickerSearch(''); setActivePicker('edit-team'); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Users size={12}/> Select Members
                    </button>
                  </div>
                  <div className="min-h-[52px] max-h-28 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 flex flex-wrap gap-1.5 items-start content-start">
                    {editClientEmployees.length === 0
                      ? <p className="text-xs text-slate-400 italic">No team members selected</p>
                      : editClientEmployees.map(id => {
                          const u = (users || []).find(x => x.id === id);
                          return u ? (
                            <span key={id} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-2 py-1 rounded-full">
                              {u.name}
                              <button type="button" onClick={() => setEditClientEmployees(prev => prev.filter(x => x !== id))} className="ml-0.5 hover:text-slate-900"><X size={10}/></button>
                            </span>
                          ) : null;
                        })
                    }
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                <button type="button" onClick={closeEditClient} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ADD CLIENT MODAL ─── */}
      {showAddClientModal && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200" style={{maxHeight:'90vh'}}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Add New Client</h3>
              <button onClick={closeAddClient} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"><X size={16}/></button>
            </div>
            <form onSubmit={handleSaveNewClient} className="flex flex-col flex-1 overflow-y-auto">
              <div className="px-6 py-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Entity Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={addEntityName}
                      onChange={e => setAddEntityName(e.target.value)}
                      placeholder="Entity name..."
                      required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Client Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={addClientName}
                      onChange={e => setAddClientName(e.target.value)}
                      placeholder="Client name..."
                      required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20 bg-white"
                    />
                  </div>
                </div>

                {/* Leadership */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Leadership</label>
                    <button
                      type="button"
                      onClick={() => { setPickerSearch(''); setActivePicker('add-leadership'); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Users size={12}/> Select Members
                    </button>
                  </div>
                  <div className="min-h-[52px] max-h-28 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 flex flex-wrap gap-1.5 items-start content-start">
                    {addClientAdmins.length === 0
                      ? <p className="text-xs text-slate-400 italic">No leadership selected</p>
                      : addClientAdmins.map(id => {
                          const u = (users || []).find(x => x.id === id);
                          return u ? (
                            <span key={id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold px-2 py-1 rounded-full">
                              <Crown size={10} className="text-blue-500"/>
                              {u.name}
                              <button type="button" onClick={() => setAddClientAdmins(prev => prev.filter(x => x !== id))} className="ml-0.5 hover:text-blue-900"><X size={10}/></button>
                            </span>
                          ) : null;
                        })
                    }
                  </div>
                </div>

                {/* Team */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Team</label>
                    <button
                      type="button"
                      onClick={() => { setPickerSearch(''); setActivePicker('add-team'); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Users size={12}/> Select Members
                    </button>
                  </div>
                  <div className="min-h-[52px] max-h-28 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 flex flex-wrap gap-1.5 items-start content-start">
                    {addClientEmployees.length === 0
                      ? <p className="text-xs text-slate-400 italic">No team members selected</p>
                      : addClientEmployees.map(id => {
                          const u = (users || []).find(x => x.id === id);
                          return u ? (
                            <span key={id} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-2 py-1 rounded-full">
                              {u.name}
                              <button type="button" onClick={() => setAddClientEmployees(prev => prev.filter(x => x !== id))} className="ml-0.5 hover:text-slate-900"><X size={10}/></button>
                            </span>
                          ) : null;
                        })
                    }
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                <button type="button" onClick={closeAddClient} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm">Add Client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── USER PICKER MODAL (add & edit clients) ─── */}
      {activePicker && (
        <UserPickerModal
          title={pickerTitle}
          users={(users || []).filter(u =>
            (activePicker === 'edit-leadership' || activePicker === 'add-leadership')
              ? managementRoles.includes(u.role)
              : executionRoles.includes(u.role)
          )}
          selected={pickerSelected}
          onToggle={id => pickerSetSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
          onClose={() => setActivePicker(null)}
          pickerSearch={pickerSearch}
          setPickerSearch={setPickerSearch}
        />
      )}

      {/* ─── ADD / EDIT USER MODAL ─── */}
      {showUserModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/20 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-[900px] border border-slate-100 shadow-2xl rounded-[3rem] flex flex-col animate-in zoom-in-95 duration-300 overflow-y-auto" style={{maxHeight:'92vh'}}>
            <div className="p-12 pb-0 flex justify-between items-center mb-10">
              <h4 className="text-xl font-bold text-slate-900">
                {editingUserId ? 'Edit User Details' : 'Add New User'}
              </h4>
              <button onClick={closeUserModal} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-all text-slate-400 hover:text-slate-900">
                <X size={28}/>
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-8 text-left px-12 pb-12">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 ml-1">User Name</label>
                  <input
                    type="text"
                    placeholder="Full Name..."
                    className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 ring-blue-500/5 font-bold transition-all"
                    value={newUser.name}
                    onChange={e => setNewUser(prev => ({...prev, name: e.target.value}))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 ml-1">Work Email</label>
                  <input
                    type="email"
                    placeholder="Email Address..."
                    className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 ring-blue-500/5 font-bold transition-all"
                    value={newUser.email}
                    onChange={e => setNewUser(prev => ({...prev, email: e.target.value}))}
                    required
                    disabled={!!editingUserId}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600 ml-1">Position / Job Title <span className="font-normal text-slate-400">(optional — shown on the user's profile)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Senior Account Manager, Digital Strategist..."
                  className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 ring-blue-500/5 font-medium transition-all"
                  value={newUser.position || ''}
                  onChange={e => setNewUser(prev => ({...prev, position: e.target.value}))}
                />
              </div>
              {!editingUserId && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4 flex items-start gap-3">
                  <Mail size={18} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-indigo-700">
                    A secure temporary password will be <strong>auto-generated</strong> and emailed to the user via the Ethinos mail system.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-8 items-start">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 ml-1">Designation</label>
                  <div className="relative">
                    <select
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-medium text-sm appearance-none cursor-pointer"
                      value={newUser.role}
                      onChange={e => setNewUser(prev => ({...prev, role: e.target.value}))}
                    >
                      {normalizedRoles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <ChevronDown size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                  </div>

                  <label className="text-sm font-semibold text-slate-600 ml-1 mt-4 block">Department</label>
                  <div className="relative">
                    <select
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-medium text-sm appearance-none cursor-pointer"
                      value={newUser.department}
                      onChange={e => setNewUser(prev => ({...prev, department: e.target.value}))}
                      required
                    >
                      <option value="">Select Department</option>
                      <option value="All">All Departments</option>
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                  </div>

                  <label className="text-sm font-semibold text-slate-600 ml-1 mt-4 block">Region</label>
                  <div className="relative">
                    <select
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-medium text-sm appearance-none cursor-pointer"
                      value={newUser.region}
                      onChange={e => setNewUser(prev => ({...prev, region: e.target.value}))}
                      required
                    >
                      <option value="">Select Region</option>
                      <option value="All">All Regions</option>
                      {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <ChevronDown size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                  </div>

                  {canEditManagerId && (
                    <>
                      <label className="text-sm font-semibold text-slate-600 ml-1 mt-4 block">
                        Reports To <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <div className="relative">
                        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                        <input
                          type="text"
                          placeholder={selectedManager ? selectedManager.name : 'Search managers…'}
                          className="w-full p-4 pl-10 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-medium text-sm"
                          value={managerSearch}
                          onChange={e => setManagerSearch(e.target.value)}
                        />
                      </div>
                      {selectedManager && !managerSearch && (
                        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                          <span className="text-sm font-semibold text-blue-800">{selectedManager.name}</span>
                          <span className="text-xs text-blue-500 font-medium">{selectedManager.role}</span>
                          <button
                            type="button"
                            onClick={() => setNewUser(prev => ({...prev, managerId: ''}))}
                            className="ml-2 text-blue-400 hover:text-red-500 transition-all"
                            title="Remove manager"
                          >
                            <X size={14}/>
                          </button>
                        </div>
                      )}
                      {managerSearch && (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-40 overflow-y-auto">
                          {filteredEligibleManagers.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-3">No matching managers</p>
                          ) : (
                            filteredEligibleManagers.map(u => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  setNewUser(prev => ({...prev, managerId: u.id}));
                                  setManagerSearch('');
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-all text-left ${newUser.managerId === u.id ? 'bg-blue-50' : ''}`}
                              >
                                <span className="text-sm font-semibold text-slate-800">{u.name}</span>
                                <span className="text-xs text-slate-500 font-medium">{u.role}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      {!selectedManager && !managerSearch && (
                        <p className="text-xs text-slate-400 ml-1">None assigned — type above to search</p>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-3 flex flex-col">
                  <label className="text-sm font-semibold text-slate-600 ml-1">Assign Projects</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      type="text"
                      placeholder="Search clients..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm font-medium outline-none"
                      value={userProjectSearch}
                      onChange={e => setUserProjectSearch(e.target.value)}
                    />
                  </div>
                  <div className="h-64 overflow-y-auto border border-slate-100 rounded-2xl p-4 space-y-2 bg-slate-50/20">
                    {filteredUserProjects.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">No clients found</p>
                    )}
                    {filteredUserProjects.map(client => (
                      <div
                        key={client.id}
                        onClick={() => toggleUserProject(client.name)}
                        className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${
                          newUser.assignedProjects.includes(client.name)
                            ? 'bg-blue-600 shadow-md'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-300'
                        }`}
                      >
                        <span className={`text-sm font-medium ${newUser.assignedProjects.includes(client.name) ? 'text-white' : 'text-slate-700'}`}>{client.name}</span>
                        {newUser.assignedProjects.includes(client.name) && <Check size={14} className="text-white flex-shrink-0"/>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {userSaveError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                  {userSaveError}
                </div>
              )}
              {editingUserId && onSendPasswordReset && newUser.email && (
                <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Mail size={18} className="text-indigo-400 flex-shrink-0"/>
                    <div>
                      <p className="text-sm font-semibold text-indigo-800">Send Password Reset Email</p>
                      <p className="text-xs text-indigo-500 mt-0.5">Sends a reset link to <span className="font-medium">{newUser.email}</span></p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await onSendPasswordReset(newUser.email);
                        alert(`Password reset email sent to ${newUser.email}`);
                      } catch {
                        alert('Failed to send reset email. Please try again.');
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all flex-shrink-0"
                  >
                    Send Reset Link
                  </button>
                </div>
              )}
              <button type="submit" disabled={userSaving} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm tracking-wide shadow-md hover:bg-blue-700 transition-all disabled:opacity-60">
                {userSaving ? 'Creating…' : editingUserId ? 'Update User Access' : 'Confirm Launch'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── DELETE USER CONFIRMATION ─── */}
      {showDeleteUserConfirm && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-sm w-full text-center space-y-6 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32}/>
            </div>
            <div>
              <h4 className="text-xl font-semibold text-slate-900">Confirm Delete</h4>
              <p className="text-sm font-medium text-slate-600 mt-2 leading-relaxed">Are you sure you want to remove this member? This action cannot be undone.</p>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowDeleteUserConfirm(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-semibold text-sm hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={confirmDeleteUser} className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-semibold text-sm shadow-lg shadow-red-100 hover:bg-red-700 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TEMPLATE FORM MODAL ─── */}
      {showTemplateForm && (
        <div className="fixed inset-0 z-[800] flex items-start justify-center bg-slate-900/30 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 my-8">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h3>
              <button onClick={closeTemplateForm} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                <X size={16}/>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Template Name <span className="text-red-500">*</span></label>
                <input
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g. Monthly Digital Report"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                  placeholder="Briefly describe what this template covers..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20 resize-none"
                />
              </div>

              {/* Home Template toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Home / Role Template</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Appears in the "Use Template" picker on the Home screen for the selected roles.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTemplateIsHome(v => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${templateIsHome ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${templateIsHome ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {templateIsHome && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Target Roles <span className="text-slate-400 font-normal">(leave empty = all roles)</span></label>
                    <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-lg bg-white">
                      {normalizedRoles.map(role => {
                        const isChecked = templateTargetRoles.includes(role);
                        return (
                          <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setTemplateTargetRoles(prev =>
                                  isChecked ? prev.filter(r => r !== role) : [...prev, role]
                                );
                              }}
                              className="w-3.5 h-3.5 rounded accent-indigo-600"
                            />
                            <span className="text-xs font-medium text-slate-700">{role}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Task rows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Tasks <span className="text-red-500">*</span></label>
                  <button
                    onClick={addTaskRow}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus size={12}/> Add Row
                  </button>
                </div>

                <div className="space-y-2">
                  {templateTasks.map((task, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex flex-col gap-0.5 mt-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => moveTaskRow(idx, 'up')}
                          disabled={idx === 0}
                          className="p-0.5 text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                          title="Move up"
                        >
                          <ChevronUp size={13}/>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTaskRow(idx, 'down')}
                          disabled={idx === templateTasks.length - 1}
                          className="p-0.5 text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                          title="Move down"
                        >
                          <ChevronDown size={13}/>
                        </button>
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <input
                          value={task.name || ''}
                          onChange={e => updateTaskRow(idx, 'name', e.target.value)}
                          placeholder="Task name (required)..."
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 ring-blue-500/20 bg-white"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                          <input
                            value={task.comment}
                            onChange={e => updateTaskRow(idx, 'comment', e.target.value)}
                            placeholder="Task description..."
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20 bg-white"
                          />
                          <select
                            value={task.category}
                            onChange={e => updateTaskRow(idx, 'category', e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-2 text-xs font-medium text-slate-700 outline-none bg-white"
                          >
                            <option value="">Category</option>
                            {taskCategories.map(cat => {
                              const n = typeof cat === 'object' ? cat.name : cat;
                              return <option key={n} value={n}>{n}</option>;
                            })}
                          </select>
                          <select
                            value={task.repeatFrequency}
                            onChange={e => updateTaskRow(idx, 'repeatFrequency', e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-2 text-xs font-medium text-slate-700 outline-none bg-white"
                          >
                            {REPEAT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </div>
                        {/* Checklist steps */}
                        {templateIsHome && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Checklist Steps</span>
                              <button
                                type="button"
                                onClick={() => updateTaskRow(idx, 'steps', [...(task.steps || []), ''])}
                                className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                              >
                                <Plus size={10}/> Add Step
                              </button>
                            </div>
                            {(task.steps || []).map((step, si) => (
                              <div key={si} className="flex items-center gap-1.5">
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 bg-white flex-shrink-0 text-[8px] font-bold text-slate-400 flex items-center justify-center">{si + 1}</span>
                                <input
                                  value={step}
                                  onChange={e => {
                                    const updated = [...(task.steps || [])];
                                    updated[si] = e.target.value;
                                    updateTaskRow(idx, 'steps', updated);
                                  }}
                                  placeholder={`Step ${si + 1}…`}
                                  className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 ring-blue-500/20 bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (task.steps || []).filter((_, i) => i !== si);
                                    updateTaskRow(idx, 'steps', updated);
                                  }}
                                  className="p-0.5 text-slate-300 hover:text-red-400 transition-all"
                                >
                                  <X size={11}/>
                                </button>
                              </div>
                            ))}
                            {(task.steps || []).length === 0 && (
                              <p className="text-[10px] text-slate-400 italic">No steps yet. Click "Add Step" to add checklist items.</p>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeTaskRow(idx)}
                        disabled={templateTasks.length <= 1}
                        className="p-1.5 text-slate-300 hover:text-red-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed mt-0.5"
                      >
                        <X size={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {templateFormError && (
                <p className="text-xs font-semibold text-red-500">{templateFormError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button
                onClick={closeTemplateForm}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm"
              >
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Association blocker modal */}
      {deleteBlocker && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Cannot delete "{deleteBlocker.name}"</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {deleteBlocker.kind === 'category'
                    ? 'This task category is still in use:'
                    : `The following ${deleteBlocker.kind === 'department' ? 'employees' : 'employees'} are assigned to this ${deleteBlocker.kind}:`}
                </p>
              </div>
            </div>
            <ul className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 space-y-1 max-h-48 overflow-y-auto">
              {deleteBlocker.items.map((item, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              {deleteBlocker.kind === 'category'
                ? 'Reassign those tasks to a different category first, then try again.'
                : `Reassign or remove those employees from this ${deleteBlocker.kind} first, then try again.`}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setDeleteBlocker(null)}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {csvMode && (
      <CsvImportModal
        mode={csvMode}
        onClose={() => setCsvMode(null)}
        validate={
          csvMode === 'users' ? validateCsvUser
          : csvMode === 'clients' ? validateCsvClient
          : validateCsvCombined
        }
        onImport={
          csvMode === 'users' ? handleCsvImportUsers
          : csvMode === 'clients' ? handleCsvImportClients
          : handleCsvImportCombined
        }
      />
    )}
    </>
  );
};

export default MasterDataView;
