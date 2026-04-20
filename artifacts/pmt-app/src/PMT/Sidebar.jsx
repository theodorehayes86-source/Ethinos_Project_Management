import React, { useState } from 'react';
import { Home, Briefcase, Network, SlidersHorizontal, BarChart3, FileSpreadsheet, ChevronLeft, ChevronRight, ClipboardCheck, Download, Monitor, Apple, Info, X, Users } from 'lucide-react';

const RELEASES_URL = 'https://github.com/theodorehayes86-source/Ethinos_Project_Management/releases/latest';
const WIN_URL = 'https://github.com/theodorehayes86-source/Ethinos_Project_Management/releases/download/v1.0.22/Ethinos.Timer.Pro.Setup.1.0.22.exe';
const MAC_URL = 'https://github.com/theodorehayes86-source/Ethinos_Project_Management/releases/download/v1.0.22/Ethinos.Timer.Pro-1.0.22-universal.dmg';
const LINUX_URL = 'https://github.com/theodorehayes86-source/Ethinos_Project_Management/releases/download/v1.0.22/Ethinos.Timer.Pro-1.0.22-x86_64.AppImage';

const Sidebar = ({ activeTab, setActiveTab, setSelectedClient, isMinimized, setIsMinimized, canSeeControlCenter = false, canSeeEmployeeView = true, canSeeMetrics = true, canSeeReports = true, canSeeApprovals = false, canSeeTeam = false, pendingApprovalsCount = 0 }) => {
  const [logoError, setLogoError] = useState(false);
  const [showMacInfo, setShowMacInfo] = useState(false);

  const menuItems = [
    { id: 'home', label: 'Home', icon: <Home size={18}/> },
    { id: 'clients', label: 'Clients', icon: <Briefcase size={18}/> },
    { id: 'approvals', label: 'Approvals', icon: <ClipboardCheck size={18}/>, badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null },
    { id: 'team', label: 'Team', icon: <Users size={18}/> },
    { id: 'metrics', label: 'Metrics', icon: <BarChart3 size={18}/> },
    { id: 'reports', label: 'Reports', icon: <FileSpreadsheet size={18}/> },
    { id: 'employees', label: 'Employee View', icon: <Network size={18} /> },
    { id: 'master-data', label: 'Control Center', icon: <SlidersHorizontal size={18}/> }
  ].filter(item => {
    if (item.id === 'approvals') return canSeeApprovals;
    if (item.id === 'team') return canSeeTeam;
    if (item.id === 'master-data') return canSeeControlCenter;
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
          } border border-white/80 bg-white/75 backdrop-blur-sm flex items-center justify-center font-black text-slate-900 tracking-tighter shadow-sm overflow-hidden`}
        >
          {!logoError ? (
            <img
              src={isMinimized ? '/ethinos-icon.png' : '/ethinos-logo.png'}
              alt="Ethinos"
              className={`${isMinimized ? 'h-8 w-8' : 'h-8 w-auto'} object-contain`}
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
              <div className={`relative ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>
                {item.icon}
                {item.badge && isMinimized && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              
              {!isMinimized && (
                <span className="whitespace-nowrap flex-1 text-left">
                  {item.label}
                </span>
              )}
              {!isMinimized && item.badge && (
                <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 space-y-3">

        {/* Download Timer Widget card */}
        {!isMinimized ? (
          <div className="px-3 py-3 bg-indigo-50/80 rounded-2xl border border-indigo-200/60 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-white border border-indigo-200/60 flex items-center justify-center flex-shrink-0 overflow-hidden p-0.5">
                <img src="/ethinos-icon.png" alt="Ethinos" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest leading-none">Ethinos Timer Pro</p>
                <p className="text-[8px] text-slate-400 leading-none mt-0.5">Desktop app · always on top</p>
              </div>
            </div>

            <div className="flex gap-1.5">
              <a
                href={WIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-[9px] font-bold text-slate-600 hover:text-indigo-700"
                title="Download for Windows"
              >
                <Monitor size={10} />
                Win
              </a>
              <a
                href={MAC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-[9px] font-bold text-slate-600 hover:text-indigo-700"
                title="Download for Mac"
              >
                <Apple size={10} />
                Mac
              </a>
              <a
                href={LINUX_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-[9px] font-bold text-slate-600 hover:text-indigo-700"
                title="Download for Linux (AppImage)"
              >
                <Download size={10} />
                Linux
              </a>
              <button
                onClick={() => setShowMacInfo(v => !v)}
                className="w-6 flex items-center justify-center rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all"
                title="Mac installation help"
              >
                {showMacInfo ? <X size={9} className="text-amber-600" /> : <Info size={9} className="text-amber-500" />}
              </button>
            </div>

            {/* Mac Gatekeeper bypass instructions */}
            {showMacInfo && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200/80 rounded-xl">
                <p className="text-[8px] font-black text-amber-700 uppercase tracking-widest mb-1.5">Mac installation fix</p>
                <ol className="space-y-1">
                  {[
                    'Download the .dmg and drag app to Applications',
                    'Try to open it — macOS will block it',
                    'Go to System Settings → Privacy & Security',
                    'Scroll down and click "Open Anyway"',
                    'Confirm by clicking Open — done ✓',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-[7px] font-black text-amber-500 mt-0.5 flex-shrink-0">{i + 1}.</span>
                      <span className="text-[7.5px] text-amber-800 leading-tight">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Download Ethinos Timer Pro"
            className="w-full flex items-center justify-center py-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200/60 hover:bg-indigo-100/80 transition-all"
          >
            <Download size={14} className="text-indigo-500" />
          </a>
        )}

        {!isMinimized && (
          <div className="px-3 py-3 bg-white/60 rounded-2xl border border-white/80 shadow-sm backdrop-blur-sm text-center">
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Powered by</p>
            <p className="text-[10px] font-bold text-slate-600 leading-snug">Ethinos Digital Marketing Pvt Ltd</p>
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