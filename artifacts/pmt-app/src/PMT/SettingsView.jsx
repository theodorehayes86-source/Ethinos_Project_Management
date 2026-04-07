import React, { useEffect, useState } from 'react';
import { Search, Edit2, Trash2, Crown, Users } from 'lucide-react';

const SettingsView = ({ users = [], setUsers, currentUser, clients = [], setClients, setClientLogs }) => {
  const [settingsSearch, setSettingsSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [activeSection, setActiveSection] = useState('user-control');
  const [clientSearch, setClientSearch] = useState('');
  const [leadershipSearch, setLeadershipSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientIndustry, setEditClientIndustry] = useState('');
  const [clientEditError, setClientEditError] = useState('');
  const [draftAssignedMemberIds, setDraftAssignedMemberIds] = useState([]);

  const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];

  const availableRoles = [
    { id: 'Super Admin', label: 'Super Admin' },
    { id: 'Director', label: 'Director' },
    { id: 'Business Head', label: 'Business Head' },
    { id: 'Snr Manager', label: 'Snr Manager' },
    { id: 'Project Manager', label: 'Project Manager' },
    { id: 'CSM', label: 'CSM' },
    { id: 'Manager', label: 'Manager' },
    { id: 'Snr Executive', label: 'Snr Executive' },
    { id: 'Executive', label: 'Executive' },
    { id: 'Intern', label: 'Intern' }
  ];

  const canEditRoles = currentUser?.role === 'Super Admin' || currentUser?.role === 'Director';
  const canManageClients = canEditRoles;

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(settingsSearch.toLowerCase());
    const matchesRole = roleFilter === "All" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredClients = clients.filter(client => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      client.name.toLowerCase().includes(query) ||
      (client.industry || '').toLowerCase().includes(query)
    );
  });

  const selectedClient = clients.find(client => client.id === selectedClientId) || null;

  useEffect(() => {
    if (!selectedClient) {
      setEditClientName('');
      setEditClientIndustry('');
      setClientEditError('');
      setLeadershipSearch('');
      setTeamSearch('');
      setDraftAssignedMemberIds([]);
      return;
    }

    const assignedUsers = users.filter(user => (user.assignedProjects || []).includes(selectedClient.name));
    setEditClientName(selectedClient.name || '');
    setEditClientIndustry(selectedClient.industry || '');
    setClientEditError('');
    setLeadershipSearch('');
    setTeamSearch('');
    setDraftAssignedMemberIds(assignedUsers.map(user => user.id));
  }, [selectedClient, users]);

  const getClientAssignments = (clientName) => {
    const assignedUsers = users.filter(user => (user.assignedProjects || []).includes(clientName));
    return {
      leadership: assignedUsers.filter(user => managementRoles.includes(user.role)),
      team: assignedUsers.filter(user => !managementRoles.includes(user.role))
    };
  };

  const matchesUserQuery = (user, query) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return (
      user.name.toLowerCase().includes(normalizedQuery) ||
      user.email.toLowerCase().includes(normalizedQuery) ||
      user.role.toLowerCase().includes(normalizedQuery)
    );
  };

  const getUserSearchScore = (user, query) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return Number.POSITIVE_INFINITY;

    const name = user.name.toLowerCase();
    const email = user.email.toLowerCase();
    const role = user.role.toLowerCase();
    const compactName = name.replace(/\s+/g, '');
    const compactQuery = normalizedQuery.replace(/\s+/g, '');

    if (name === normalizedQuery) return 0;
    if (name.startsWith(normalizedQuery)) return 1;
    if (name.includes(normalizedQuery)) return 2;
    if (compactName.includes(compactQuery)) return 3;
    if (email.startsWith(normalizedQuery)) return 4;
    if (email.includes(normalizedQuery)) return 5;
    if (role.includes(normalizedQuery)) return 6;

    const nameTokens = name.split(/\s+/);
    if (nameTokens.some(token => token.startsWith(normalizedQuery))) return 7;

    let queryIndex = 0;
    for (const char of compactName) {
      if (char === compactQuery[queryIndex]) {
        queryIndex += 1;
      }
      if (queryIndex === compactQuery.length) return 8;
    }

    return Number.POSITIVE_INFINITY;
  };

  const selectedAssignments = selectedClient
    ? getClientAssignments(selectedClient.name)
    : { leadership: [], team: [] };

  const modalAssignments = {
    leadership: users.filter(user => draftAssignedMemberIds.includes(user.id) && managementRoles.includes(user.role)),
    team: users.filter(user => draftAssignedMemberIds.includes(user.id) && !managementRoles.includes(user.role))
  };

  const leadershipSearchResults = !selectedClient || !leadershipSearch.trim()
    ? []
    : users
        .map(user => ({ user, score: managementRoles.includes(user.role) ? getUserSearchScore(user, leadershipSearch) : Number.POSITIVE_INFINITY }))
        .filter(({ score }) => Number.isFinite(score))
        .sort((left, right) => left.score - right.score || left.user.name.localeCompare(right.user.name))
        .slice(0, 8)
        .map(({ user }) => user);

  const teamSearchResults = !selectedClient || !teamSearch.trim()
    ? []
    : users
        .map(user => ({ user, score: !managementRoles.includes(user.role) ? getUserSearchScore(user, teamSearch) : Number.POSITIVE_INFINITY }))
        .filter(({ score }) => Number.isFinite(score))
        .sort((left, right) => left.score - right.score || left.user.name.localeCompare(right.user.name))
        .slice(0, 8)
        .map(({ user }) => user);

  const openClientEditor = (clientId) => {
    setSelectedClientId(clientId);
    setLeadershipSearch('');
    setTeamSearch('');
    setClientEditError('');
    setShowEditClientModal(true);
  };

  const closeClientEditor = () => {
    setShowEditClientModal(false);
    setLeadershipSearch('');
    setTeamSearch('');
    setClientEditError('');
  };

  const toggleMemberForClient = (memberId) => {
    if (!canManageClients || !selectedClient) return;
    setDraftAssignedMemberIds((prevIds) => (
      prevIds.includes(memberId)
        ? prevIds.filter((id) => id !== memberId)
        : [...prevIds, memberId]
    ));
  };

  const saveClientDetails = () => {
    if (!canManageClients || !selectedClient) return;

    const trimmedName = editClientName.trim();
    const trimmedIndustry = editClientIndustry.trim();

    if (!trimmedName) {
      setClientEditError('Client name is required.');
      return false;
    }

    const duplicateClient = clients.find(client =>
      client.id !== selectedClient.id && client.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicateClient) {
      setClientEditError('A client with this name already exists.');
      return false;
    }

    const previousClientName = selectedClient.name;
    const nextClientName = trimmedName;

    setClients(prevClients => prevClients.map(client =>
      client.id === selectedClient.id
        ? { ...client, name: trimmedName, industry: trimmedIndustry }
        : client
    ));

    setUsers(prevUsers => prevUsers.map(member => {
      const currentAssignments = member.assignedProjects || [];
      const baseAssignments = currentAssignments.filter(project => project !== previousClientName && project !== nextClientName);
      const shouldBeAssigned = draftAssignedMemberIds.includes(member.id);

      return {
        ...member,
        assignedProjects: shouldBeAssigned
          ? [...baseAssignments, nextClientName]
          : baseAssignments
      };
    }));

    setClientEditError('');
    return true;
  };

  const resetClientEditor = () => {
    if (!selectedClient) return;
    const assignedUsers = users.filter(user => (user.assignedProjects || []).includes(selectedClient.name));
    setEditClientName(selectedClient.name || '');
    setEditClientIndustry(selectedClient.industry || '');
    setClientEditError('');
    setLeadershipSearch('');
    setTeamSearch('');
    setDraftAssignedMemberIds(assignedUsers.map(user => user.id));
  };

  const deleteSelectedClient = () => {
    if (!canManageClients || !selectedClient) return;

    setClients((prevClients) => prevClients.filter(client => client.id !== selectedClient.id));
    setUsers((prevUsers) => prevUsers.map((member) => ({
      ...member,
      assignedProjects: (member.assignedProjects || []).filter(project => project !== selectedClient.name)
    })));
    setClientLogs((prevLogs) => {
      const nextLogs = { ...prevLogs };
      delete nextLogs[selectedClient.id];
      return nextLogs;
    });
    setShowDeleteConfirm(false);
    setSelectedClientId(null);
    setEditClientName('');
    setEditClientIndustry('');
    setClientEditError('');
  };

  return (
    <div className="w-full h-full flex flex-col font-sans text-left p-2">
      <div className="flex justify-between items-center mb-3 gap-4">
        <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveSection('user-control')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${activeSection === 'user-control' ? 'bg-white text-slate-900 border-slate-900' : 'bg-white text-slate-700 border-transparent hover:border-slate-300'}`}
          >
            User Status Control
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('client-control')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${activeSection === 'client-control' ? 'bg-white text-slate-900 border-slate-900' : 'bg-white text-slate-700 border-transparent hover:border-slate-300'}`}
          >
            Client Control View
          </button>
        </div>
      </div>

      {activeSection === 'user-control' && (
      <>
      <div className="flex justify-between items-start mb-6 border-b border-slate-200 pb-4 gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900">User Status Control</h3>
          <p className="text-xs font-medium text-slate-500 mt-1">Logged in as: {currentUser?.name}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative w-56">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input 
              type="text" 
              placeholder="Filter members..." 
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-lg pl-12 pr-4 py-2 text-sm outline-none focus:border-green-500 font-medium" 
              value={settingsSearch} 
              onChange={(e) => setSettingsSearch(e.target.value)}
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none min-w-[160px]"
          >
            <option value="All">All Designations</option>
            {availableRoles.map(role => (
              <option key={role.id} value={role.id}>{role.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
            <tr className="text-xs font-semibold text-slate-600">
              <th className="px-6 py-1">Agency Member</th>
              <th className="px-6 py-1 text-right">Assign Designation</th>
            </tr>
          </thead>
        </table>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-all bg-white">
                  <td className="px-6 py-1">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900">{u.name}</span>
                      <span className="text-xs font-medium text-slate-500 mt-0.5">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-1 text-right">
                    <select
                      value={u.role}
                      disabled={!canEditRoles}
                      onChange={(e) => canEditRoles && setUsers(users.map(item => item.id === u.id ? { ...item, role: e.target.value } : item))}
                      className={`bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none min-w-[180px] ${!canEditRoles ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {availableRoles.map(role => (
                        <option key={role.id} value={role.id}>{role.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeSection === 'client-control' && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Client Control View</h3>
              <p className="text-xs font-medium text-slate-500 mt-1">Assign people to clients or remove a client fully.</p>
            </div>
            <div className="relative w-64">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                type="text"
                placeholder="Search clients..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-12 pr-4 py-2 text-sm outline-none focus:border-green-500 font-medium"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col min-h-[280px]">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">All Clients Overview</div>
                <div className="text-xs text-slate-500 mt-0.5">View every client, leadership owners, working team, and quick actions in one place.</div>
              </div>
              <div className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                {filteredClients.length} client{filteredClients.length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Leadership</th>
                    <th className="px-4 py-3 text-left">Working Team</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map(client => {
                    const assignments = getClientAssignments(client.name);
                    const isSelected = selectedClientId === client.id;

                    return (
                      <tr key={client.id} className={`${isSelected ? 'bg-blue-50/60' : 'bg-white'} hover:bg-slate-50 transition-all`}>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm font-semibold text-slate-900">{client.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{client.industry || 'General'}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {assignments.leadership.length ? assignments.leadership.map(member => (
                              <span key={member.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700">
                                <Crown size={10} />
                                {member.name}
                              </span>
                            )) : (
                              <span className="text-xs text-slate-400">No leadership assigned</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {assignments.team.length ? assignments.team.map(member => (
                              <span key={member.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                <Users size={10} />
                                {member.name}
                              </span>
                            )) : (
                              <span className="text-xs text-slate-400">No team assigned</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openClientEditor(client.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Edit2 size={12} />
                                Edit
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={!canManageClients}
                              onClick={() => {
                                setSelectedClientId(client.id);
                                setShowDeleteConfirm(true);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${canManageClients ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <Trash2 size={12} />
                                Delete
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!filteredClients.length && (
                <div className="px-4 py-8 text-sm font-medium text-slate-500">No clients found.</div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 gap-4">
            <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selectedClient ? selectedClient.name : 'Select a client'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {selectedClient ? 'Open the editor to update client details, leadership and team members.' : 'Choose Edit on a client from the overview above.'}
                  </div>
                </div>
                {selectedClient && (
                  <button
                    type="button"
                    onClick={() => openClientEditor(selectedClient.id)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
                  >
                    Open Editor
                  </button>
                )}
              </div>

              {selectedClient ? (
                <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 p-4 bg-white">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-3">Leadership</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedAssignments.leadership.length ? selectedAssignments.leadership.map(member => (
                        <span key={member.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700">
                          <Crown size={10} />
                          {member.name}
                        </span>
                      )) : (
                        <span className="text-xs text-slate-400">No leadership assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 bg-white">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700 mb-3">Working Team</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedAssignments.team.length ? selectedAssignments.team.map(member => (
                        <span key={member.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700">
                          <Users size={10} />
                          {member.name}
                        </span>
                      )) : (
                        <span className="text-xs text-slate-400">No team assigned</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-8 text-sm font-medium text-slate-500">Select a client from the overview table to see its summary.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-5">
            <h4 className="text-base font-bold text-slate-900">Delete Client</h4>
            <p className="text-sm text-slate-600 mt-2">
              Are you sure you want to delete <span className="font-semibold text-slate-900">{selectedClient.name}</span>? This will remove it from all assigned users.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteSelectedClient}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditClientModal && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-6xl max-h-full overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">Edit Client</h4>
                <p className="text-xs text-slate-500 mt-1">Update client details, leadership and working team from one place.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetClientEditor}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const didSave = saveClientDetails();
                    if (didSave) closeClientEditor();
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={closeClientEditor}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 border-b border-slate-200 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Client Name</label>
                  <input
                    type="text"
                    placeholder="Enter client name"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium"
                    value={editClientName}
                    onChange={(e) => {
                      setEditClientName(e.target.value);
                      if (clientEditError) setClientEditError('');
                    }}
                    disabled={!canManageClients}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Industry</label>
                  <input
                    type="text"
                    placeholder="Enter industry"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium"
                    value={editClientIndustry}
                    onChange={(e) => setEditClientIndustry(e.target.value)}
                    disabled={!canManageClients}
                  />
                </div>
              </div>

              {clientEditError && (
                <div className="text-xs font-semibold text-red-600">{clientEditError}</div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-1.5">Search Leadership To Add</label>
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      type="text"
                      placeholder="Search leadership members..."
                      className="w-full bg-white border border-slate-200 rounded-lg pl-12 pr-4 py-2 text-sm outline-none focus:border-green-500 font-medium"
                      value={leadershipSearch}
                      onChange={(e) => setLeadershipSearch(e.target.value)}
                    />

                    {!!leadershipSearch.trim() && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                        {leadershipSearchResults.length ? leadershipSearchResults.map(member => {
                          const isAssigned = draftAssignedMemberIds.includes(member.id);

                          return (
                            <button
                              key={member.id}
                              type="button"
                              disabled={!canManageClients || isAssigned}
                              onClick={() => {
                                if (!isAssigned) {
                                  toggleMemberForClient(member.id);
                                  setLeadershipSearch('');
                                }
                              }}
                              className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 border-b border-slate-100 last:border-b-0 ${!canManageClients ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-50'} ${isAssigned ? 'bg-blue-50/50' : 'bg-white'}`}
                            >
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{member.name}</div>
                                <div className="text-xs text-slate-500">{member.role} • {member.email}</div>
                              </div>
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isAssigned ? 'bg-blue-100 text-blue-700' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                                {isAssigned ? 'Assigned' : 'Add'}
                              </span>
                            </button>
                          );
                        }) : (
                          <div className="px-3 py-3 text-xs text-slate-400">No matching leadership members found.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1.5">Search Team Member To Add</label>
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      type="text"
                      placeholder="Search team members..."
                      className="w-full bg-white border border-slate-200 rounded-lg pl-12 pr-4 py-2 text-sm outline-none focus:border-green-500 font-medium"
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                    />

                    {!!teamSearch.trim() && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                        {teamSearchResults.length ? teamSearchResults.map(member => {
                          const isAssigned = draftAssignedMemberIds.includes(member.id);

                          return (
                            <button
                              key={member.id}
                              type="button"
                              disabled={!canManageClients || isAssigned}
                              onClick={() => {
                                if (!isAssigned) {
                                  toggleMemberForClient(member.id);
                                  setTeamSearch('');
                                }
                              }}
                              className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 border-b border-slate-100 last:border-b-0 ${!canManageClients ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-50'} ${isAssigned ? 'bg-blue-50/50' : 'bg-white'}`}
                            >
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{member.name}</div>
                                <div className="text-xs text-slate-500">{member.role} • {member.email}</div>
                              </div>
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isAssigned ? 'bg-blue-100 text-blue-700' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                                {isAssigned ? 'Assigned' : 'Add'}
                              </span>
                            </button>
                          );
                        }) : (
                          <div className="px-3 py-3 text-xs text-slate-400">No matching team members found.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-slate-200">
              <div className="min-h-0">
                <div className="px-4 py-3 border-b border-slate-200 bg-blue-50/60 sticky top-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Leadership</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Assigned leadership members</div>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="px-4 py-3 bg-white">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Assigned</div>
                    <div className="space-y-2">
                      {modalAssignments.leadership.length ? modalAssignments.leadership.map(member => (
                        <button
                          key={member.id}
                          type="button"
                          disabled={!canManageClients}
                          onClick={() => toggleMemberForClient(member.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between gap-3 ${!canManageClients ? 'bg-slate-50 cursor-not-allowed opacity-70' : 'bg-blue-50 hover:bg-blue-100'}`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{member.name}</div>
                            <div className="text-xs text-slate-500">{member.role} • {member.email}</div>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700">
                            Remove
                          </span>
                        </button>
                      )) : (
                        <div className="text-xs text-slate-400">No leadership assigned</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 sticky top-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Working Team</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Assigned working team members</div>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="px-4 py-3 bg-white">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Assigned</div>
                    <div className="space-y-2">
                      {modalAssignments.team.length ? modalAssignments.team.map(member => (
                        <button
                          key={member.id}
                          type="button"
                          disabled={!canManageClients}
                          onClick={() => toggleMemberForClient(member.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between gap-3 ${!canManageClients ? 'bg-slate-50 cursor-not-allowed opacity-70' : 'bg-slate-50 hover:bg-slate-100'}`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{member.name}</div>
                            <div className="text-xs text-slate-500">{member.role} • {member.email}</div>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700">
                            Remove
                          </span>
                        </button>
                      )) : (
                        <div className="text-xs text-slate-400">No team assigned</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView;