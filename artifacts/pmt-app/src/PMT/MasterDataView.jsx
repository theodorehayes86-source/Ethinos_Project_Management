import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Search, ShieldCheck } from 'lucide-react';

const MasterDataView = ({
  taskCategories = [],
  setTaskCategories,
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

  return (
    <div className="min-h-full p-4 space-y-4 text-left">
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2">
        {[
          { id: 'categories', label: 'Task Categories' },
          { id: 'departments', label: 'Departments' },
          { id: 'regions', label: 'Regions' },
          { id: 'conditions', label: 'Conditions' }
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
    </div>
  );
};

export default MasterDataView;
