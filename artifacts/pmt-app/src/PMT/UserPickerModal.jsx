import React from 'react';
import { Search, X, Users, Check } from 'lucide-react';

const roleColor = (role = '') => {
  if (['Super Admin'].includes(role)) return 'bg-purple-100 text-purple-700';
  if (['Director', 'Business Head'].includes(role)) return 'bg-blue-100 text-blue-700';
  if (['Manager', 'Snr Manager', 'Project Manager', 'CSM'].includes(role)) return 'bg-indigo-100 text-indigo-700';
  return 'bg-slate-100 text-slate-600';
};

const UserPickerModal = ({ title, users, selected, onToggle, onClose, pickerSearch, setPickerSearch }) => {
  const q = pickerSearch.toLowerCase().trim();
  const filtered = (users || []).filter(u =>
    !q ||
    (u.name || '').toLowerCase().includes(q) ||
    (u.role || '').toLowerCase().includes(q) ||
    (u.department || '').toLowerCase().includes(q)
  );
  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col" style={{maxHeight:'80vh'}}>
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

export default UserPickerModal;
