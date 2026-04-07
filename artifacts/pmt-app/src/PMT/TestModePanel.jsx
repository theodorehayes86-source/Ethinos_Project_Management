import React, { useState } from 'react';
import { FlaskConical, X, ChevronDown, ChevronUp } from 'lucide-react';

const TEST_USERS = [
  {
    id: 'test-super-admin',
    name: 'Test Super Admin',
    email: 'theo.hayes@ethinos.com',
    role: 'Super Admin',
    assignedProjects: [],
    department: 'Growth',
    region: 'North',
  },
  {
    id: 'test-employee',
    name: 'Test Employee',
    email: 'test.employee@ethinos.com',
    role: 'Employee',
    assignedProjects: ['Test Client'],
    department: 'Creative',
    region: 'North',
  },
  {
    id: 'test-manager',
    name: 'Test Manager',
    email: 'test.manager@ethinos.com',
    role: 'Manager',
    assignedProjects: ['Test Client'],
    department: 'Biddable',
    region: 'South',
  },
  {
    id: 'test-director',
    name: 'Test Director',
    email: 'test.director@ethinos.com',
    role: 'Director',
    assignedProjects: ['Test Client'],
    department: 'Growth',
    region: 'West',
  },
];

const ROLE_COLORS = {
  'Super Admin': 'bg-red-100 text-red-700',
  Employee: 'bg-blue-100 text-blue-700',
  Manager: 'bg-purple-100 text-purple-700',
  Director: 'bg-amber-100 text-amber-700',
};

const TestModePanel = ({ currentUser, onImpersonate, onExit, isTestMode }) => {
  const [open, setOpen] = useState(false);

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden w-64 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="px-4 py-3 bg-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical size={14} className="text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Test Mode</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {isTestMode && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-amber-700">
                Impersonating: {currentUser?.name}
              </span>
              <button
                onClick={() => { onExit(); setOpen(false); }}
                className="text-[11px] font-semibold text-amber-700 underline hover:text-amber-900"
              >
                Exit
              </button>
            </div>
          )}

          <div className="p-3 space-y-2">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Switch to test user</p>
            {TEST_USERS.map(user => (
              <button
                key={user.id}
                onClick={() => { onImpersonate(user); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm ${
                  currentUser?.id === user.id
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{user.name}</span>
                  {currentUser?.id === user.id && (
                    <span className="text-[10px] font-bold text-slate-500">ACTIVE</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600'}`}>
                    {user.role}
                  </span>
                  <span className="text-[10px] text-slate-400">{user.email}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Dev-only. Not visible in production builds. Switching roles does not touch Firebase auth.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(prev => !prev)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-full shadow-lg text-xs font-bold transition-all ${
          isTestMode
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-slate-900 text-white hover:bg-slate-700'
        }`}
      >
        <FlaskConical size={13} />
        {isTestMode ? `Test: ${currentUser?.role}` : 'Test Mode'}
        {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>
    </div>
  );
};

export { TEST_USERS };
export default TestModePanel;
