import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Search, ShieldCheck, Edit2, X, ChevronUp, ChevronDown, Lock } from 'lucide-react';

const REPEAT_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Once'];

const emptyTask = () => ({ comment: '', category: '', repeatFrequency: 'Monthly' });

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
  controlCenterAccessRoles = [],
  setControlCenterAccessRoles,
  settingsAccessRoles = [],
  setSettingsAccessRoles,
  userManagementAccessRoles = [],
  setUserManagementAccessRoles,
  employeeViewAccessRoles = [],
  setEmployeeViewAccessRoles,
  metricsAccessRoles = [],
  setMetricsAccessRoles,
  reportsAccessRoles = [],
  setReportsAccessRoles
}) => {
  const [activeTab, setActiveTab] = useState('categories');
  const [categoryInput, setCategoryInput] = useState('');
  const [departmentInput, setDepartmentInput] = useState('');
  const [regionInput, setRegionInput] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [regionFilter, setRegionFilter] = useState('All');

  // --- TEMPLATE STATE ---
  const [templateSearch, setTemplateSearch] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // null = new, object = editing
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateTasks, setTemplateTasks] = useState([emptyTask()]);
  const [templateFormError, setTemplateFormError] = useState('');

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
    if (!category) return 'Other';
    const [prefix] = category.split(' - ');
    return prefix?.trim() || 'Other';
  };

  const categoryGroups = useMemo(() => {
    return [...new Set(taskCategories.map(getCategoryGroup))].sort((left, right) => left.localeCompare(right));
  }, [taskCategories]);

  const addItem = (value, list, setter, clear) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (list.some(item => item.toLowerCase() === trimmed.toLowerCase())) return;
    setter([...list, trimmed]);
    clear('');
  };

  const removeCategory = (category) => {
    if (taskCategories.length <= 1) return;
    setTaskCategories(taskCategories.filter(item => item !== category));
  };

  const removeDepartment = (department) => {
    if (departments.length <= 1) return;
    setDepartments(departments.filter(item => item !== department));
  };

  const addRegion = () => {
    const trimmed = regionInput.trim();
    if (!trimmed) return;
    if (regions.some(item => item.toLowerCase() === trimmed.toLowerCase())) return;
    setRegions([...regions, trimmed]);
    setRegionInput('');
  };

  const toggleControlCenterRole = (role) => {
    if (controlCenterAccessRoles.includes(role)) {
      if (controlCenterAccessRoles.length <= 1) return;
      setControlCenterAccessRoles(controlCenterAccessRoles.filter(item => item !== role));
      return;
    }
    setControlCenterAccessRoles([...controlCenterAccessRoles, role]);
  };

  const toggleSettingsRole = (role) => {
    if (settingsAccessRoles.includes(role)) {
      if (settingsAccessRoles.length <= 1) return;
      setSettingsAccessRoles(settingsAccessRoles.filter(item => item !== role));
      return;
    }
    setSettingsAccessRoles([...settingsAccessRoles, role]);
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
    setTemplateTasks(tpl.tasks.map(t => ({ ...t })));
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
    if (templateTasks.some(t => !t.comment.trim())) {
      setTemplateFormError('All task rows must have a description.');
      return;
    }
    if (templateTasks.length === 0) { setTemplateFormError('Add at least one task.'); return; }

    const cleanTasks = templateTasks.map(t => ({
      comment: t.comment.trim(),
      category: t.category || taskCategories[0] || 'Other',
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
    <div className="min-h-full p-4 space-y-4 text-left">
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        {[
          { id: 'categories', label: 'Task Categories' },
          { id: 'departments', label: 'Departments' },
          { id: 'regions', label: 'Regions' },
          { id: 'conditions', label: 'Conditions' },
          { id: 'templates', label: 'Templates' },
        ].map(tab => (
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

      {activeTab === 'categories' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Category Filters</p>
              <p className="text-[11px] text-slate-500">Filter task categories by type to review what is already added and what is still missing.</p>
            </div>
            <div className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200">
              Showing {filteredCategories.length} of {taskCategories.length}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none"
            >
              <option value="All">All Categories</option>
              {categoryGroups.map(group => <option key={group} value={group}>{group}</option>)}
            </select>
            <div className="relative w-full max-w-md">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                placeholder="Add task category"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              onClick={() => addItem(categoryInput, taskCategories, setTaskCategories, setCategoryInput)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2 text-left">Task Category</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map(category => (
                  <tr key={category}>
                    <td className="px-3 py-2 text-sm font-medium text-slate-700">{category}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeCategory(category)} className="p-1.5 text-slate-400 hover:text-red-500 transition-all">
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

      {activeTab === 'departments' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none"
            >
              <option value="All">All Departments</option>
              {departments.map(department => <option key={department} value={department}>{department}</option>)}
            </select>
            <div className="relative w-full max-w-md">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={departmentInput}
                onChange={(e) => setDepartmentInput(e.target.value)}
                placeholder="Add department"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              onClick={() => addItem(departmentInput, departments, setDepartments, setDepartmentInput)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
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
              {regions.map(region => <option key={region} value={region}>{region}</option>)}
            </select>
            <div className="relative w-full max-w-md">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                placeholder="Add region"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              onClick={addRegion}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2 text-left">Region</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRegions.map(region => (
                  <tr key={region}>
                    <td className="px-3 py-2 text-sm font-medium text-slate-700">{region}</td>
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
            <p className="text-sm font-semibold">Control Center Visibility by Role</p>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Can Access Control Center</th>
                  <th className="px-3 py-2 text-left">Can Access Settings</th>
                  <th className="px-3 py-2 text-left">Can Access User Management</th>
                  <th className="px-3 py-2 text-left">Can Access Employee View</th>
                  <th className="px-3 py-2 text-left">Can Access Metrics</th>
                  <th className="px-3 py-2 text-left">Can Access Reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {normalizedRoles.map(role => {
                  const controlCenterChecked = controlCenterAccessRoles.includes(role);
                  const settingsChecked = settingsAccessRoles.includes(role);
                  const userManagementChecked = userManagementAccessRoles.includes(role);
                  const employeeViewChecked = employeeViewAccessRoles.includes(role);
                  const metricsChecked = metricsAccessRoles.includes(role);
                  const reportsChecked = reportsAccessRoles.includes(role);
                  return (
                    <tr key={role}>
                      <td className="px-3 py-2 text-sm font-medium text-slate-700">{role}</td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={controlCenterChecked}
                            onChange={() => toggleControlCenterRole(role)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-xs font-medium text-slate-600">{controlCenterChecked ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settingsChecked}
                            onChange={() => toggleSettingsRole(role)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-xs font-medium text-slate-600">{settingsChecked ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={userManagementChecked}
                            onChange={() => toggleUserManagementRole(role)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-xs font-medium text-slate-600">{userManagementChecked ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={employeeViewChecked}
                            onChange={() => toggleEmployeeViewRole(role)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-xs font-medium text-slate-600">{employeeViewChecked ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={metricsChecked}
                            onChange={() => toggleMetricsRole(role)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-xs font-medium text-slate-600">{metricsChecked ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reportsChecked}
                            onChange={() => toggleReportsRole(role)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-xs font-medium text-slate-600">{reportsChecked ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs font-medium text-slate-500">
            Recommended: keep Super Admin and Director enabled to match governance controls.
          </p>
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
                        <p className="text-[11px] font-medium text-slate-700 leading-snug">{task.comment}</p>
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
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
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
                          {taskCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <select
                          value={task.repeatFrequency}
                          onChange={e => updateTaskRow(idx, 'repeatFrequency', e.target.value)}
                          className="border border-slate-200 rounded-lg px-2 py-2 text-xs font-medium text-slate-700 outline-none bg-white"
                        >
                          {REPEAT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
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
    </div>
  );
};

export default MasterDataView;
