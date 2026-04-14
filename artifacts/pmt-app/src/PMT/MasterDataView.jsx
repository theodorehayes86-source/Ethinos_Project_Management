import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Search, ShieldCheck, Edit2, X, ChevronUp, ChevronDown, Lock, Users, Crown, Check, Star, UserCheck, UserPlus, Edit3, Mail, MessageSquare, Bug, Lightbulb, AlertCircle, CheckCircle2, Clock, Filter, Eye, EyeOff, FlaskConical, Archive, ArchiveRestore, ChevronRight, CornerDownLeft, Send, Upload } from 'lucide-react';
import UserPickerModal from './UserPickerModal';
import CsvImportModal from './CsvImportModal';

const REPEAT_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Once'];

const emptyTask = () => ({ name: '', comment: '', category: '', repeatFrequency: 'Monthly' });

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
  { id: 'templates', label: 'Templates' },
  { id: 'feedback', label: 'Feedback' },
];

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
}) => {
  const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
  const executionRoles = ['Employee', 'Snr Executive', 'Executive', 'Intern'];

  const [activeTab, setActiveTab] = useState(() => {
    const accessible = CC_TABS.filter(tab => {
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
  const emptyNewUser = () => ({ name: '', email: '', password: '', role: 'Executive', department: '', region: '', position: '', assignedProjects: [] });
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
  const [replyDraft, setReplyDraft] = useState('');

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
    if (!window.confirm('Delete this client? This cannot be undone.')) return;
    const clientToDelete = (clients || []).find(c => c.id === clientId);
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
    setNewUser({ name: user.name, email: user.email, role: user.role, department: user.department || '', region: user.region || '', position: user.position || '', assignedProjects: user.assignedProjects || [] });
    setUserProjectSearch('');
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUserId(null);
    setNewUser(emptyNewUser());
    setUserProjectSearch('');
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
        setUsers((users || []).map(u => u.id === editingUserId ? { ...newUser, id: u.id, password: undefined } : u));
        closeUserModal();
      } else {
        let emailWarning = '';
        if (createFirebaseUser) {
          const result = await createFirebaseUser(newUser.email.trim().toLowerCase(), newUser.name.trim());
          if (result?.warning) emailWarning = result.warning;
        }
        const { password: _pw, ...userRecord } = newUser;
        setUsers([...(users || []), { ...userRecord, id: `user-${Date.now()}`, email: userRecord.email.trim().toLowerCase() }]);
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

  const validateCsvClient = (row, idx, allRows) => {
    const errs = [];
    if (!row.entityName?.trim()) errs.push('Entity name required');
    if (!row.clientName?.trim()) errs.push('Client name required');
    else if ((clients || []).some(c => c.name.toLowerCase() === row.clientName.trim().toLowerCase())) errs.push('Client name already exists');
    else if (allRows.slice(0, idx).some(r => r.clientName?.trim().toLowerCase() === row.clientName?.trim().toLowerCase())) errs.push('Duplicate in file');
    return errs;
  };

  const validateCsvCombined = (row, idx, allRows) => {
    const errs = [];
    if (!row.entityName?.trim()) errs.push('Entity name required');
    if (!row.clientName?.trim()) errs.push('Client name required');
    else if (allRows.slice(0, idx).some(r => r.clientName?.trim().toLowerCase() === row.clientName?.trim().toLowerCase())) errs.push('Duplicate in file');
    return errs;
  };

  const handleCsvImportUsers = async (rows) => {
    const results = [];
    const newUserRecords = [];
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
        });
        results.push({ label, success: true, warning: emailWarning || undefined });
      } catch (err) {
        results.push({ label, success: false, error: err.message || 'Failed to create user' });
      }
    }
    if (newUserRecords.length > 0 && setUsers) {
      setUsers([...(users || []), ...newUserRecords]);
    }
    return results;
  };

  const handleCsvImportClients = async (rows) => {
    const newClients = rows.map(row => ({
      id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: row.clientName.trim(),
      entityName: row.entityName.trim(),
    }));
    if (setClients) setClients([...(clients || []), ...newClients]);
    return newClients.map(c => ({ label: c.name, success: true }));
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
    setShowTemplateForm(true);
  };

  const openEditTemplateForm = (tpl) => {
    setEditingTemplate(tpl);
    setTemplateName(tpl.name);
    setTemplateDesc(tpl.description || '');
    setTemplateTasks(tpl.tasks.map(t => ({ name: t.name || '', ...t })));
    setTemplateFormError('');
    setShowTemplateForm(true);
  };

  const closeTemplateForm = () => {
    setShowTemplateForm(false);
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateDesc('');
    setTemplateTasks([emptyTask()]);
    setTemplateFormError('');
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

    const cleanTasks = templateTasks.map(t => ({
      name: t.name.trim(),
      comment: t.comment.trim(),
      category: t.category || (taskCategories[0] && (typeof taskCategories[0] === 'object' ? taskCategories[0].name : taskCategories[0])) || 'Other',
      repeatFrequency: t.repeatFrequency || 'Monthly',
    }));

    if (editingTemplate) {
      if (editingTemplate.isPrebuilt) { setTemplateFormError('Pre-built templates cannot be edited.'); return; }
      const updated = taskTemplates.map(tpl =>
        tpl.id === editingTemplate.id
          ? { ...tpl, name: trimmedName, description: templateDesc.trim(), tasks: cleanTasks }
          : tpl
      );
      setTaskTemplates(updated);
    } else {
      const newTpl = {
        id: `custom-${Date.now()}`,
        name: trimmedName,
        description: templateDesc.trim(),
        isPrebuilt: false,
        createdBy: currentUser?.id || null,
        tasks: cleanTasks,
      };
      setTaskTemplates([...taskTemplates, newTpl]);
    }
    closeTemplateForm();
  };

  const handleDeleteTemplate = (id) => {
    const tpl = taskTemplates.find(t => t.id === id);
    if (tpl?.isPrebuilt) return;
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
          if (currentUser?.role === 'Super Admin') return true;
          if (tab.id === 'conditions') return false;
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
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditUser(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Edit3 size={14}/>
                          </button>
                          {onSendPasswordReset && user.email && (
                            <button
                              onClick={async () => {
                                try {
                                  await onSendPasswordReset(user.email);
                                  alert(`Password reset email sent to ${user.email}`);
                                } catch {
                                  alert('Failed to send reset email. Please try again.');
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Send password reset email"
                            >
                              <Mail size={14}/>
                            </button>
                          )}
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
                    </div>
                    {tpl.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{tpl.description}</p>
                    )}
                  </div>
                  {!tpl.isPrebuilt && (
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
          .filter(f => !f.archived && (fbAdminFilter === 'All' || f.status === fbAdminFilter))
          .sort((a,b) => b.timestamp - a.timestamp);
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

        const saveReply = (id) => {
          if (!replyDraft.trim()) return;
          setFeedbackItems(feedbackItems.map(f => f.id === id ? {
            ...f,
            reply: replyDraft.trim(),
            replyTimestamp: Date.now(),
            replyAdminName: currentUser?.name || currentUser?.email,
          } : f));
          setReplyingFbId(null);
          setReplyDraft('');
        };
        const deleteReply = (id) => {
          setFeedbackItems(feedbackItems.map(f => f.id === id ? {
            ...f, reply: null, replyTimestamp: null, replyAdminName: null,
          } : f));
        };
        const startReply = (item) => {
          setReplyingFbId(item.id);
          setReplyDraft(item.reply || '');
          setEditingFbId(null);
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
                    {['All','New','In Progress','Awaiting Testing','Resolved'].map(s => (
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
                                  <button onClick={() => startReply(item)} className={`p-1 transition-all ${replyingFbId === item.id ? 'text-indigo-500' : item.reply ? 'text-indigo-400 hover:text-indigo-600' : 'text-slate-300 hover:text-indigo-500'}`} title={item.reply ? 'Edit reply' : 'Reply to user'}>
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
                              {item.reply && replyingFbId !== item.id && (
                                <div className="ml-2 pl-3 border-l-2 border-indigo-200 space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <CornerDownLeft size={10} className="text-indigo-400"/>
                                    <span className="text-[10px] font-semibold text-indigo-600">{item.replyAdminName}</span>
                                    {item.replyTimestamp && (
                                      <span className="text-[10px] text-slate-400">· {new Date(item.replyTimestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span>
                                    )}
                                    <button onClick={() => deleteReply(item.id)} className="ml-auto p-0.5 text-slate-300 hover:text-red-400 transition-all" title="Remove reply">
                                      <X size={10}/>
                                    </button>
                                  </div>
                                  <p className="text-xs text-indigo-800 leading-relaxed">{item.reply}</p>
                                </div>
                              )}
                              {replyingFbId === item.id && (
                                <div className="ml-2 pl-3 border-l-2 border-indigo-300 space-y-2">
                                  <textarea
                                    value={replyDraft}
                                    onChange={e => setReplyDraft(e.target.value)}
                                    placeholder="Write a reply visible to the user..."
                                    rows={3}
                                    autoFocus
                                    className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400 transition-all resize-none"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button type="button" onClick={() => { setReplyingFbId(null); setReplyDraft(''); }}
                                      className="px-3 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                                      Cancel
                                    </button>
                                    <button type="button" onClick={() => saveReply(item.id)} disabled={!replyDraft.trim()}
                                      className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5">
                                      <Send size={10}/> Send Reply
                                    </button>
                                  </div>
                                </div>
                              )}
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
            ) : null}

            {myItems.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-800">My Submissions</h3>
                  <div className="space-y-2">
                    {myItems.map(item => {
                      const typeInfo = TYPES.find(t => t.id === item.type) || TYPES[2];
                      const sm = STATUS_META[item.status] || STATUS_META['New'];
                      return (
                        <div key={item.id} className="border border-slate-100 rounded-xl p-3 space-y-1.5 bg-slate-50/60">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${typeInfo.color}`}>
                                {typeInfo.icon} {item.type}
                              </span>
                              <span className="text-xs font-bold text-slate-800">{item.title}</span>
                            </div>
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${sm.cls}`}>
                              {sm.icon} {item.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                          {item.reply && (
                            <div className="ml-2 pl-3 border-l-2 border-indigo-200 space-y-1 mt-1">
                              <div className="flex items-center gap-1.5">
                                <CornerDownLeft size={10} className="text-indigo-400"/>
                                <span className="text-[10px] font-semibold text-indigo-600">{item.replyAdminName || 'Admin'}</span>
                                {item.replyTimestamp && (
                                  <span className="text-[10px] text-slate-400">· {new Date(item.replyTimestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span>
                                )}
                              </div>
                              <p className="text-xs text-indigo-800 leading-relaxed">{item.reply}</p>
                            </div>
                          )}
                          <p className="text-[10px] text-slate-400 font-medium">{new Date(item.timestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
                        </div>
                      );
                    })}
                  </div>
              </div>
            )}
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
