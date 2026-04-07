import React, { useState } from 'react';
import { Search, Plus, X, Star, Trash2, Check, ChevronDown, UserPlus, Mail, Edit3, Crown, UserCheck } from 'lucide-react';

const UserView = ({ users = [], setUsers, clients = [], settingsSearch = "", setSettingsSearch, departments = [], regions = [] }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null); // Track if we are editing
  const [projectSearch, setProjectSearch] = useState("");
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "Executive", department: "", region: "", assignedProjects: [] });

  // --- CORE HANDLERS ---
  const handleSaveUser = (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.department || !newUser.region) return;

    if (editingUserId) {
      // Update existing user logic
      setUsers(users.map(u => u.id === editingUserId ? { ...newUser, id: u.id } : u));
    } else {
      // Add new user logic
      setUsers([...users, { ...newUser, id: Date.now() }]);
    }

    closeModal();
  };

  const openEditModal = (user) => {
    setEditingUserId(user.id);
    setNewUser({ name: user.name, email: user.email, role: user.role, department: user.department || "", region: user.region || "", assignedProjects: user.assignedProjects || [] });
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingUserId(null);
    setNewUser({ name: "", email: "", role: "Executive", department: "", region: "", assignedProjects: [] });
    setProjectSearch("");
  };

  const toggleProject = (projectName) => {
    const updated = newUser.assignedProjects.includes(projectName)
      ? newUser.assignedProjects.filter(p => p !== projectName)
      : [...newUser.assignedProjects, projectName];
    setNewUser({ ...newUser, assignedProjects: updated });
  };

  const confirmDelete = () => {
    setUsers(users.filter(u => u.id !== showDeleteConfirm));
    setShowDeleteConfirm(null);
  };

  const filteredUsers = (users || []).filter(u => 
    u.name.toLowerCase().includes(settingsSearch.toLowerCase()) || 
    u.email.toLowerCase().includes(settingsSearch.toLowerCase())
  );

  const filteredProjects = (clients || []).filter(c => 
    c.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const getRoleStyle = (role) => {
    switch(role) {
      case 'Super Admin': return 'bg-red-600 text-white ring-red-100 shadow-red-100';
      case 'Director':
      case 'Business Head': return 'bg-orange-500 text-white ring-orange-100 shadow-orange-100';
      case 'Manager':
      case 'Snr Manager':
      case 'CSM': return 'bg-emerald-500 text-white ring-emerald-100 shadow-emerald-100';
      default: return 'bg-slate-500 text-white ring-slate-100 shadow-slate-100';
    }
  };

  return (
    <div className="w-full space-y-4 p-4 min-h-full font-sans text-left animate-in fade-in duration-500">
      
      {/* 1. HEADER SECTION */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">User Directory</h2>
          <p className="text-xs font-medium text-slate-500 mt-1">Manage Agency Access & Permissions</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input 
              type="text" 
              placeholder="Filter users..." 
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 ring-blue-500/20 shadow-sm text-slate-700" 
              value={settingsSearch} 
              onChange={(e) => setSettingsSearch(e.target.value)} 
            />
          </div>
          <button 
            onClick={() => setShowAddModal(true)} 
            className="bg-blue-600 text-white px-3 py-2 rounded-lg font-semibold text-xs hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-md"
          >
            <UserPlus size={14}/> Add User
          </button>
        </div>
      </div>

      {/* 2. USER TABLE */}
      <div className="flex-1 border border-slate-200 rounded-xl overflow-x-auto overflow-y-hidden bg-white shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr className="text-xs font-semibold text-slate-600">
              <th className="px-5 py-2">User Identity</th>
              <th className="px-5 py-2">Access Level</th>
              <th className="px-5 py-2">Portfolio</th>
              <th className="px-5 py-2 text-right w-24">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredUsers.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-all bg-white">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900 leading-none">{user.name}</span>
                      <span className="text-xs text-slate-500 mt-0.5">{user.email}</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{user.department || 'No Dept'}</span>
                        <span className="text-[10px] font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">{user.region || 'No Region'}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-medium text-xs ring-2 ${getRoleStyle(user.role)}`}>
                    {user.role === 'Super Admin' ? <Crown size={12}/> : user.role === 'Director' ? <Star size={12}/> : <UserCheck size={12}/>}
                    {user.role}
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    {user.assignedProjects.map(p => (
                      <span key={p} className="text-xs font-medium border border-blue-300 px-2 py-1 rounded-full text-blue-700 bg-blue-100 shadow-sm">
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
                  <td className="px-5 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    {/* Fixed Edit Icon */}
                    <button 
                      onClick={() => openEditModal(user)}
                      className="p-1.5 bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg transition-all"
                    >
                      <Edit3 size={14}/>
                    </button>
                    <button 
                      onClick={() => setShowDeleteConfirm(user.id)} 
                      className="p-1.5 bg-red-50 text-red-300 hover:text-red-500 rounded-lg transition-all"
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

      {/* 3. MODAL (ADD & EDIT) */}
      {showAddModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/10 backdrop-blur-md p-4">
          <div className="bg-white w-[900px] p-12 border border-slate-100 shadow-2xl rounded-[3rem] flex flex-col animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-10">
              <h4 className="text-xl font-bold text-slate-900">
                {editingUserId ? "Edit User Details" : "Add New User"}
              </h4>
              <button onClick={closeModal} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-all text-slate-400 hover:text-slate-900">
                <X size={28}/>
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-8 text-left">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 ml-1">User Name</label>
                  <input type="text" placeholder="Full Name..." className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 ring-blue-500/5 font-bold transition-all" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 ml-1">Work Email</label>
                  <input type="email" placeholder="Email Address..." className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 ring-blue-500/5 font-bold transition-all" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8 h-80">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 ml-1">Designation</label>
                  <div className="relative">
                    <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-medium text-sm appearance-none cursor-pointer" onChange={e => setNewUser({...newUser, role: e.target.value})} value={newUser.role}>
                      <option value="Super Admin">Super Admin</option>
                      <option value="Director">Director</option>
                      <option value="Business Head">Business Head</option>
                      <option value="Snr Manager">Snr Manager</option>
                      <option value="Manager">Manager</option>
                      <option value="CSM">CSM</option>
                      <option value="Snr Executive">Snr Executive</option>
                      <option value="Executive">Executive</option>
                      <option value="Intern">Intern</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  <label className="text-sm font-semibold text-slate-600 ml-1 mt-4 block">Department</label>
                  <div className="relative">
                    <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-medium text-sm appearance-none cursor-pointer" onChange={e => setNewUser({...newUser, department: e.target.value})} value={newUser.department} required>
                      <option value="">Select Department</option>
                      {departments.map(department => <option key={department} value={department}>{department}</option>)}
                    </select>
                    <ChevronDown size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  <label className="text-sm font-semibold text-slate-600 ml-1 mt-4 block">Region</label>
                  <div className="relative">
                    <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-medium text-sm appearance-none cursor-pointer" onChange={e => setNewUser({...newUser, region: e.target.value})} value={newUser.region} required>
                      <option value="">Select Region</option>
                      {regions.map(region => <option key={region} value={region}>{region}</option>)}
                    </select>
                    <ChevronDown size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-3 flex flex-col h-full">
                  <label className="text-sm font-semibold text-slate-600 ml-1">Assign Projects</label>
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input type="text" placeholder="Search..." className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm font-medium outline-none" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}/>
                  </div>
                  <div className="flex-1 overflow-y-auto border border-slate-50 rounded-2xl p-4 space-y-2 bg-slate-50/20 custom-scrollbar">
                    {filteredProjects.map(client => (
                      <div key={client.id} onClick={() => toggleProject(client.name)} className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${newUser.assignedProjects.includes(client.name) ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-300'}`}>
                        <span className="text-sm font-medium text-slate-700">{client.name}</span>
                        {newUser.assignedProjects.includes(client.name) && <Check size={14} className="text-white" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm tracking-wide shadow-md hover:bg-blue-700 transition-all">
                {editingUserId ? "Update User Access" : "Confirm Launch"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. DELETE CONFIRMATION */}
      {showDeleteConfirm && (
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
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-semibold text-sm hover:bg-slate-200 hover:text-slate-700 transition-all">Cancel</button>
                <button onClick={confirmDelete} className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-semibold text-sm shadow-lg shadow-red-100 hover:bg-red-700 transition-all">Delete</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserView;