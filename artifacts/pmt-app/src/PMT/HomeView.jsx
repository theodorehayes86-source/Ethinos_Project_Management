import React, { useState } from 'react';
import { format } from 'date-fns';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Briefcase, Clock, Activity, AlertTriangle, ChevronRight, Plus, X, Search } from 'lucide-react';

const HomeView = ({
  accessibleClients,
  allTasks,
  clientLogs,
  setSelectedClient,
  setClientLogs,
  currentUser,
  taskCategories = []
}) => {
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(accessibleClients[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskCategory, setTaskCategory] = useState(taskCategories[0] || 'General');
  const [taskCategoryQuery, setTaskCategoryQuery] = useState('');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [taskRepeat, setTaskRepeat] = useState('Once');
  const [taskComment, setTaskComment] = useState('');
  const [taskError, setTaskError] = useState('');

  const openAddTaskModal = () => {
    setSelectedClientId(accessibleClients[0]?.id || '');
    setSelectedDate(new Date());
    setTaskCategory(taskCategories[0] || 'General');
    setTaskCategoryQuery('');
    setShowCategoryMenu(false);
    setTaskRepeat('Once');
    setTaskComment('');
    setTaskError('');
    setShowAddTaskModal(true);
  };

  const handleAddTaskFromHome = (event) => {
    event.preventDefault();

    if (!selectedClientId || !taskCategory || !taskComment.trim() || !selectedDate) {
      setTaskError('Client, date, category and task description are required.');
      return;
    }

    const formattedDate = format(selectedDate, 'do MMM yyyy');
    const newTask = {
      id: Date.now(),
      date: formattedDate,
      comment: taskComment.trim(),
      result: '',
      status: 'Pending',
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || 'Employee',
      category: taskCategory,
      repeatFrequency: taskRepeat,
      timerState: 'idle',
      timerStartedAt: null,
      elapsedMs: 0,
      timeTaken: null
    };

    setClientLogs((prevLogs) => ({
      ...prevLogs,
      [selectedClientId]: [newTask, ...(prevLogs[selectedClientId] || [])]
    }));

    setShowAddTaskModal(false);
  };

  const availableTaskCategories = taskCategories.length ? taskCategories : ['General'];
  const filteredTaskCategories = availableTaskCategories.filter((category) =>
    category.toLowerCase().includes(taskCategoryQuery.toLowerCase())
  );

  return (
    <div
      className="w-full space-y-8 p-6 min-h-screen"
      style={{
        background:
          'radial-gradient(50% 60% at 9% 10%, rgba(241, 94, 88, 0.12) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(44% 52% at 50% 94%, rgba(82, 110, 255, 0.12) 0%, rgba(82, 110, 255, 0) 64%), radial-gradient(38% 46% at 96% 12%, rgba(236, 232, 123, 0.13) 0%, rgba(236, 232, 123, 0) 62%), linear-gradient(140deg, #fff7f8 0%, #f7f8ff 58%, #fffde9 100%)'
      }}
    >
      
      {/* 1. STATISTICS ROW - Clean, Card-Based Design */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Clients', value: accessibleClients.length, icon: <Briefcase size={16} className="text-blue-600"/>, bgColor: 'bg-blue-100', iconBgColor: 'bg-blue-200', trend: '' },
          { label: 'Open Tasks', value: allTasks.filter(t => t.status !== 'Done').length, icon: <Clock size={16} className="text-green-600"/>, bgColor: 'bg-green-100', iconBgColor: 'bg-green-200', trend: '' },
          { label: 'WIP', value: allTasks.filter(t => t.status === 'WIP').length, icon: <Activity size={16} className="text-orange-500"/>, bgColor: 'bg-orange-100', iconBgColor: 'bg-orange-200', trend: '' },
          { label: 'Pending', value: allTasks.filter(t => t.status === 'Pending').length, icon: <AlertTriangle size={16} className="text-red-500"/>, bgColor: 'bg-red-100', iconBgColor: 'bg-red-200', trend: '' }
        ].map((stat, i) => (
          <div key={i} className={`${stat.bgColor} p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between h-28 transition-hover hover:shadow-md`}>
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500">{stat.label}</span>
              <div className={`p-2 ${stat.iconBgColor} rounded-lg`}>{stat.icon}</div>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              {stat.trend && (
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-xs font-medium ${stat.trend.includes('↑') ? 'text-green-500' : 'text-slate-400'}`}>
                    {stat.trend}
                  </span>
                </div>
              )}
            </div>
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

      {/* 2. TASK PIPELINES GRID - Modern Card Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {accessibleClients.map(client => (
          <div key={client.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-lg transition-all duration-300">
            {/* Card Header */}
            <div className="p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-semibold text-slate-900">{client.name}</h4>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-semibold ${
                  (clientLogs[client.id] || []).length > 0 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                }`}>
                  {(clientLogs[client.id] || []).length > 0 ? 'Active' : 'Inactive'}
                </span>
              </div>
              <button 
                onClick={() => setSelectedClient(client)} 
                className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-blue-600 transition-colors bg-slate-50 px-3 py-1.5 rounded-lg"
              >
                View All <ChevronRight size={14}/>
              </button>
            </div>
            
            {/* Card Content - Tasks List */}
            <div className="flex-1 p-5 pt-0">
              <div className="bg-slate-50/50 rounded-2xl p-4 min-h-[140px] flex flex-col justify-center">
                {(clientLogs[client.id] || []).filter(t => t.status !== 'Done').length > 0 ? (
                  <div className="space-y-4">
                    {(clientLogs[client.id] || []).filter(t => t.status !== 'Done').slice(0, 2).map(task => (
                      <div key={task.id} className="flex items-start gap-3 group">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${task.status === 'WIP' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-orange-500'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-600 leading-snug line-clamp-2">{task.comment}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[8px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">New</span>
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

            {/* Card Footer */}
            <div className="px-5 py-4 bg-slate-50/80 border-t border-slate-50 flex items-center gap-2">
              <Clock size={12} className="text-slate-400"/>
              <span className="text-xs font-medium text-slate-500">
                Last activity {(clientLogs[client.id] || []).length > 0 ? 'recently' : '1 week ago'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showAddTaskModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/10 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-5xl p-8 border border-slate-200 shadow-xl rounded-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-lg font-semibold text-slate-900">New Task</h4>
              <button
                onClick={() => {
                  setShowAddTaskModal(false);
                  setTaskError('');
                  setShowCategoryMenu(false);
                }}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTaskFromHome} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client <span className="text-red-500">*</span></label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => {
                        setSelectedClientId(e.target.value);
                        if (taskError) setTaskError('');
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
                    >
                      {accessibleClients.map((client) => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))}
                    </select>
                  </div>

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
                          setTaskCategory('');
                          setShowCategoryMenu(true);
                          if (taskError) setTaskError('');
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
                                  setTaskCategory(category);
                                  setTaskCategoryQuery(category);
                                  setShowCategoryMenu(false);
                                  if (taskError) setTaskError('');
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
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Description <span className="text-red-500">*</span></label>
                    <textarea
                      value={taskComment}
                      onChange={(e) => {
                        setTaskComment(e.target.value);
                        if (taskError) setTaskError('');
                      }}
                      placeholder="Describe the task details"
                      className="w-full h-40 p-4 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20 resize-none bg-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat Frequency</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all" style={taskRepeat === 'Once' ? { borderColor: '#2563eb', backgroundColor: '#eff6ff' } : {}}>
                        <input
                          type="radio"
                          name="homeTaskRepeat"
                          value="Once"
                          checked={taskRepeat === 'Once'}
                          onChange={(e) => setTaskRepeat(e.target.value)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-700">Once</span>
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all" style={taskRepeat === 'Daily' ? { borderColor: '#2563eb', backgroundColor: '#eff6ff' } : {}}>
                        <input
                          type="radio"
                          name="homeTaskRepeat"
                          value="Daily"
                          checked={taskRepeat === 'Daily'}
                          onChange={(e) => setTaskRepeat(e.target.value)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-700">Daily</span>
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all" style={taskRepeat === 'Monthly' ? { borderColor: '#2563eb', backgroundColor: '#eff6ff' } : {}}>
                        <input
                          type="radio"
                          name="homeTaskRepeat"
                          value="Monthly"
                          checked={taskRepeat === 'Monthly'}
                          onChange={(e) => setTaskRepeat(e.target.value)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-700">Monthly</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {taskError && <p className="text-sm font-medium text-red-600">{taskError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTaskModal(false);
                    setTaskError('');
                    setShowCategoryMenu(false);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeView;