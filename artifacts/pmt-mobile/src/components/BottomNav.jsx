import React from 'react';
import { Users, CheckSquare, Star } from 'lucide-react';

export default function BottomNav({ activeTab, onTabChange, isManager, approvalCount = 0 }) {
  const tabs = isManager
    ? [
        { id: 'my-tasks',  label: 'My Tasks',  icon: CheckSquare },
        { id: 'team',      label: 'Team',       icon: Users },
        { id: 'approvals', label: 'Approvals',  icon: Star, badge: approvalCount },
      ]
    : [
        { id: 'my-tasks', label: 'My Tasks', icon: CheckSquare },
      ];

  return (
    <div className="bg-white border-t border-slate-200 safe-bottom">
      <div className="flex">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex-1 flex flex-col items-center gap-1 py-3 min-h-[56px] transition-colors ${
                active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
                {tab.label}
              </span>
              {active && <div className="absolute bottom-0 w-8 h-0.5 bg-indigo-600 rounded-full" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
