import React, { useState } from 'react';
import { Home, Briefcase, Users, Settings, Network, SlidersHorizontal, BarChart3, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab, setSelectedClient, isMinimized, setIsMinimized, canSeeControlCenter = false, canSeeSettings = true, canSeeUserManagement = true, canSeeEmployeeView = true, canSeeMetrics = true, canSeeReports = true }) => {
  const [logoError, setLogoError] = useState(false);

  // Corrected array syntax and updated icons for better visual distinction
  const menuItems = [
    { id: 'home', label: 'Home', icon: <Home size={18}/> },
    { id: 'clients', label: 'Clients', icon: <Briefcase size={18}/> },
    { id: 'users', label: 'User Management', icon: <Users size={18}/> },
    { id: 'metrics', label: 'Metrics', icon: <BarChart3 size={18}/> },
    { id: 'reports', label: 'Reports', icon: <FileSpreadsheet size={18}/> },
    { id: 'employees', label: 'Employee View', icon: <Network size={18} /> }, // Changed to Network icon for flowchart feel
    { id: 'settings', label: 'Settings', icon: <Settings size={18}/> },
    { id: 'master-data', label: 'Control Center', icon: <SlidersHorizontal size={18}/> }
  ].filter(item => {
    if (item.id === 'master-data') return canSeeControlCenter;
    if (item.id === 'settings') return canSeeSettings;
    if (item.id === 'users') return canSeeUserManagement;
    if (item.id === 'employees') return canSeeEmployeeView;
    if (item.id === 'metrics') return canSeeMetrics;
    if (item.id === 'reports') return canSeeReports;
    return true;
  });

  return (
    <aside
      className={`${isMinimized ? 'w-20' : 'w-64'} border-r border-white/45 bg-white/30 backdrop-blur-sm flex flex-col transition-all duration-300 z-30`}
    >
      {/* XP Logo Section - Maintained professional black/white style */}
      <div className={`${isMinimized ? 'p-4 flex justify-center' : 'p-7 flex justify-start pl-7'}`}>
        <div
          className={`${
            isMinimized
              ? 'w-12 h-12 rounded-2xl'
              : 'w-40 h-10 rounded-xl'
          } border border-white/80 bg-white/75 backdrop-blur-sm flex items-center justify-center font-black text-slate-900 tracking-tighter shadow-sm`}
        >
          {!logoError ? (
            <img
              src="/company-logo.png"
              alt="Company Logo"
              className={`${isMinimized ? 'h-6' : 'h-7'} w-auto object-contain`}
              onError={() => setLogoError(true)}
            />
          ) : (
            <span className={`${isMinimized ? 'text-base' : 'text-sm'}`}>{isMinimized ? 'E' : 'Ethinos'}</span>
          )}
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3.5 space-y-2.5">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          
          return (
            <button 
              key={item.id} 
              onClick={() => { 
                setActiveTab(item.id); 
                if(setSelectedClient) setSelectedClient(null); // Safety check
              }} 
              className={`w-full flex items-center ${isMinimized ? 'justify-center' : 'gap-4'} py-3.5 px-4 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 ${
                isActive 
                  ? 'border border-indigo-200/70 text-slate-900 bg-white/80 backdrop-blur-sm shadow-sm' 
                  : 'text-slate-600 border border-transparent hover:text-slate-900 hover:bg-white/65 hover:border-white/80 bg-transparent'
              }`}
            >
              <div className={`${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>
                {item.icon}
              </div>
              
              {!isMinimized && (
                <span className="whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4">
        {!isMinimized && (
          <div className="p-4 bg-white/70 rounded-2xl border border-white/80 mb-3 shadow-sm backdrop-blur-sm">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Powered by Ethinos</p>
          </div>
        )}
        <button
          onClick={() => setIsMinimized && setIsMinimized(!isMinimized)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-[11px] uppercase tracking-widest text-slate-600 border border-white/80 hover:bg-white/90 hover:border-indigo-200/70 hover:text-slate-900 transition-all duration-200 bg-white/70 shadow-sm backdrop-blur-sm"
          title={isMinimized ? 'Expand Sidebar' : 'Minimize Sidebar'}
        >
          {isMinimized ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;