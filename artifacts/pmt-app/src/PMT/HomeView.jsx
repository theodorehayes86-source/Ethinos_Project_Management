import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Briefcase, Clock, Activity, AlertTriangle, ChevronRight, Plus, X, Search, ShieldCheck, Users } from 'lucide-react';
import UserPickerModal from './UserPickerModal';

const CROSS_DEPT_ROLES = ['Super Admin', 'Admin', 'Business Head'];

const HomeView = ({
  accessibleClients,
  allTasks,
  clientLogs,
  setSelectedClient,
  setClientLogs,
  currentUser,
  taskCategories = [],
  users = [],
  departments = [],
}) => {
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(accessibleClients[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskCategory, setTaskCategory] = useState('');
  const [taskCategoryQuery, setTaskCategoryQuery] = useState('');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [taskRepeat, setTaskRepeat] = useState('Once');
  const [taskName, setTaskName] = useState('');
  const [taskComment, setTaskComment] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(null);
  // Assignee
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);
  // QC
  const [qcEnabled, setQcEnabled] = useState(false);
  const [qcAssigneeId, setQcAssigneeId] = useState('');
  const [qcAssigneeName, setQcAssigneeName] = useState('');
  const [showQcPicker, setShowQcPicker] = useState(false);
  const [qcPickerSearch, setQcPickerSearch] = useState('');
  const [taskError, setTaskError] = useState('');
  // Departments
  const [taskDepartments, setTaskDepartments] = useState([]);

  const selectedClient = useMemo(
    () => accessibleClients.find(c => c.id === selectedClientId),
    [accessibleClients, selectedClientId]
  );

  const assignableUsers = useMemo(() => {
    if (!selectedClient) return users;
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
    setSelectedClientId(accessibleClients[0]?.id || '');
    setSelectedDate(new Date());
    setTaskCategory('');
    setTaskCategoryQuery('');
    setShowCategoryMenu(false);
    setTaskRepeat('Once');
    setTaskName('');
    setTaskComment('');
    setTaskDueDate(null);
    setAssigneeId('');
    setAssigneeName('');
    setAssigneeQuery('');
    setShowAssigneeMenu(false);
    setQcEnabled(false);
    setQcAssigneeId('');
    setQcAssigneeName('');
    setShowQcPicker(false);
    setQcPickerSearch('');
    setTaskError('');
    setTaskDepartments(currentUser?.department ? [currentUser.department] : []);
  };

  const openAddTaskModal = () => { resetModal(); setShowAddTaskModal(true); };
  const closeModal = () => { setShowAddTaskModal(false); resetModal(); };

  const isCrossDept = CROSS_DEPT_ROLES.includes(currentUser?.role);
  const userDept = currentUser?.department;

  const visibleTasks = useMemo(() => {
    if (isCrossDept) return allTasks;
    return allTasks.filter(t => {
      if (!t.departments || !Array.isArray(t.departments)) return true;
      return t.departments.includes(userDept);
    });
  }, [allTasks, isCrossDept, userDept]);

  const getVisibleClientTasks = (clientId) => {
    const logs = clientLogs[clientId] || [];
    if (isCrossDept) return logs;
    return logs.filter(t => {
      if (!t.departments || !Array.isArray(t.departments)) return true;
      return t.departments.includes(userDept);
    });
  };

  const handleAddTaskFromHome = (event) => {
    event.preventDefault();
    if (!selectedClientId || !taskName.trim() || !taskCategory || !assigneeId || !taskComment.trim() || !selectedDate) {
      setTaskError('Client, task name, category, assignee and description are all required.');
      return;
    }
    const formattedDate = format(selectedDate, 'do MMM yyyy');
    const newTask = {
      id: Date.now(),
      name: taskName.trim(),
      date: formattedDate,
      comment: taskComment.trim(),
      result: '',
      status: 'Pending',
      assigneeId: assigneeId || null,
      assigneeName: assigneeName || null,
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
    };
    const nextLogs = { ...clientLogs, [selectedClientId]: [newTask, ...(clientLogs[selectedClientId] || [])] };
    setClientLogs(nextLogs);
    closeModal();
  };

  return (
    <div
      className="w-full space-y-8 p-6 min-h-screen"
      style={{
        background:
          'radial-gradient(50% 60% at 9% 10%, rgba(241, 94, 88, 0.12) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(44% 52% at 50% 94%, rgba(82, 110, 255, 0.12) 0%, rgba(82, 110, 255, 0) 64%), radial-gradient(38% 46% at 96% 12%, rgba(236, 232, 123, 0.13) 0%, rgba(236, 232, 123, 0) 62%), linear-gradient(140deg, #fff7f8 0%, #f7f8ff 58%, #fffde9 100%)'
      }}
    >
      
      {/* 1. STATISTICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Clients', value: accessibleClients.length, icon: <Briefcase size={16} className="text-blue-600"/>, bgColor: 'bg-blue-100', iconBgColor: 'bg-blue-200' },
          { label: 'Open Tasks', value: visibleTasks.filter(t => t.status !== 'Done').length, icon: <Clock size={16} className="text-green-600"/>, bgColor: 'bg-green-100', iconBgColor: 'bg-green-200' },
          { label: 'WIP', value: visibleTasks.filter(t => t.status === 'WIP').length, icon: <Activity size={16} className="text-orange-500"/>, bgColor: 'bg-orange-100', iconBgColor: 'bg-orange-200' },
          { label: 'Pending', value: visibleTasks.filter(t => t.status === 'Pending').length, icon: <AlertTriangle size={16} className="text-red-500"/>, bgColor: 'bg-red-100', iconBgColor: 'bg-red-200' }
        ].map((stat, i) => (
          <div key={i} className={`${stat.bgColor} p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between h-28 transition-hover hover:shadow-md`}>
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500">{stat.label}</span>
              <div className={`p-2 ${stat.iconBgColor} rounded-lg`}>{stat.icon}</div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end -mt-3">
        <button
          onClick={openAddTaskModal}
          disabled={!accessibleClients.length}
          className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={13} /> Add Task
        </button>
      </div>

      {/* 2. TASK PIPELINES GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {accessibleClients.map(client => {
          const clientTasks = getVisibleClientTasks(client.id);
          const activeTasks = clientTasks.filter(t => t.status !== 'Done');
          return (
          <div key={client.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-lg transition-all duration-300">
            <div className="p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-semibold text-slate-900">{client.name}</h4>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-semibold ${
                  clientTasks.length > 0 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                }`}>
                  {clientTasks.length > 0 ? 'Active' : 'Inactive'}
                </span>
              </div>
              <button onClick={() => setSelectedClient(client)} className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-blue-600 transition-colors bg-slate-50 px-3 py-1.5 rounded-lg">
                View All <ChevronRight size={14}/>
              </button>
            </div>
            <div className="flex-1 p-5 pt-0">
              <div className="bg-slate-50/50 rounded-2xl p-4 min-h-[140px] flex flex-col justify-center">
                {activeTasks.length > 0 ? (
                  <div className="space-y-4">
                    {activeTasks.slice(0, 2).map(task => (
                      <div key={task.id} className="flex items-start gap-3 group">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${task.status === 'WIP' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-orange-500'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-600 leading-snug line-clamp-2">{task.name || task.comment}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[8px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">New</span>
                            {Array.isArray(task.departments) && task.departments.map(dept => (
                              <span key={dept} className="text-[8px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{dept}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center space-y-2 opacity-40">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                      <Briefcase size={16} className="text-slate-400"/>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">No active tasks for this client</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 bg-slate-50/80 border-t border-slate-50 flex items-center gap-2">
              <Clock size={12} className="text-slate-400"/>
              <span className="text-xs font-medium text-slate-500">
                Last activity {clientTasks.length > 0 ? 'recently' : '1 week ago'}
              </span>
            </div>
          </div>
          );
        })}
      </div>

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
                      onChange={e => { setSelectedClientId(e.target.value); setAssigneeId(''); setAssigneeName(''); setAssigneeQuery(''); if (taskError) setTaskError(''); }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    >
                      {accessibleClients.map(client => (
                        <option key={client.id} value={client.id}>{client.name}</option>
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
                    <DatePicker selected={selectedDate} onChange={date => setSelectedDate(date)} inline />
                  </div>
                </div>

                {/* RIGHT: All task fields */}
                <div className="flex-1 space-y-5">

                  {/* Task Name */}
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

                  {/* Task Category */}
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

                  {/* Assign To */}
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
                  </div>

                  {/* Task Description */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Description <span className="text-red-500">*</span></label>
                    <textarea
                      value={taskComment}
                      onChange={e => { setTaskComment(e.target.value); if (taskError) setTaskError(''); }}
                      placeholder="Describe the task details"
                      className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none bg-slate-100"
                    />
                  </div>

                  {/* Repeat Frequency */}
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
                    {taskRepeat === 'Weekly' && <p className="text-[11px] text-blue-600 font-medium">Task will repeat every week on the same day</p>}
                  </div>

                  {/* Due Date */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</label>
                    <DatePicker
                      selected={taskDueDate}
                      onChange={date => setTaskDueDate(date)}
                      placeholderText="Select due date"
                      dateFormat="do MMM yyyy"
                      minDate={new Date()}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    />
                    {taskDueDate && (
                      <button type="button" onClick={() => setTaskDueDate(null)} className="text-xs font-semibold text-red-600 hover:text-red-700">
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

                  {/* Departments */}
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

      {/* QC Reviewer Picker */}
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
    </div>
  );
};

export default HomeView;
