import React, { useMemo } from 'react';
import { Bell, Clock, UserPlus, Briefcase, CheckCircle, AlertTriangle } from 'lucide-react';
import { parse, differenceInHours } from 'date-fns';

const Notifications = ({ isNotifOpen, setIsNotifOpen, setIsProfileOpen, currentUser, users = [], clients = [], clientLogs = {}, notifications = [] }) => {

  const getNotificationStyle = (type) => {
    if (type === 'alert') {
      return { icon: <Clock size={12} className="text-orange-500" />, bg: 'bg-orange-50' };
    }
    if (type === 'assignment') {
      return { icon: <Briefcase size={12} className="text-blue-500" />, bg: 'bg-blue-50' };
    }
    if (type === 'team') {
      return { icon: <UserPlus size={12} className="text-emerald-500" />, bg: 'bg-emerald-50' };
    }
    return { icon: <AlertTriangle size={12} className="text-slate-500" />, bg: 'bg-slate-100' };
  };
  
  // --- AUTOMATED TRIGGER LOGIC ---
  const activeNotifications = useMemo(() => {
    const list = [];
    const now = new Date();

    // 0. MANUAL IN-APP NOTIFICATIONS (e.g. task assignment)
    (notifications || []).forEach((item) => {
      const style = getNotificationStyle(item.type);
      list.push({
        id: item.id,
        text: item.text,
        time: item.time || 'recently',
        type: item.type || 'general',
        icon: style.icon,
        bg: style.bg
      });
    });

    // 1. TRIGGER: Pending Tasks > 24 Hours
    Object.keys(clientLogs).forEach(clientId => {
      const client = clients.find(c => c.id === clientId);
      const logs = clientLogs[clientId] || [];
      
      logs.forEach(log => {
        if (log.status === 'Pending') {
          try {
            const taskDate = parse(log.date, 'do MMM yyyy', new Date());
            const hoursOld = differenceInHours(now, taskDate);
            
            if (hoursOld >= 24) {
              list.push({
                id: `task-${log.id}`,
                text: `Urgent: "${log.comment}" for ${client?.name || 'Client'} pending for ${hoursOld}h`,
                time: log.date,
                type: 'alert',
                icon: <Clock size={12} className="text-orange-500" />,
                bg: 'bg-orange-50'
              });
            }
          } catch (e) { /* silent date fail */ }
        }
      });
    });

    // 2. TRIGGER: New Project Assigned to Current User
    if (currentUser?.assignedProjects) {
      currentUser.assignedProjects.forEach((proj, index) => {
        list.push({
          id: `proj-${index}`,
          text: `New Portfolio: You are now managing the ${proj} account`,
          time: 'recently',
          type: 'assignment',
          icon: <Briefcase size={12} className="text-blue-500" />,
          bg: 'bg-blue-50'
        });
      });
    }

    // 3. TRIGGER: Team Member added to Projects (for Leadership)
    if (['Super Admin', 'Director', 'Manager'].includes(currentUser?.role)) {
      users.forEach(u => {
        if (u.id !== currentUser.id && u.assignedProjects?.length > 0) {
          u.assignedProjects.forEach(p => {
            list.push({
              id: `team-${u.id}-${p}`,
              text: `Team Update: ${u.name} was added to ${p}`,
              time: 'system',
              type: 'team',
              icon: <UserPlus size={12} className="text-emerald-500" />,
              bg: 'bg-emerald-50'
            });
          });
        }
      });
    }

    return list.reverse(); // Newest first
  }, [clientLogs, currentUser, users, clients, notifications]);

  return (
    <div className="relative">
      <button 
        onClick={() => { setIsNotifOpen(!isNotifOpen); setIsProfileOpen(false); }} 
        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 relative transition-all hover:bg-slate-100 shadow-sm"
      >
        <Bell size={18} className="text-orange-500" />
        {activeNotifications.length > 0 && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
        )}
      </button>

      {isNotifOpen && (
        <>
          {/* Backdrop to close */}
          <div className="fixed inset-0 z-[290]" onClick={() => setIsNotifOpen(false)} />
          
          <div className="absolute right-0 mt-4 w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[300] overflow-hidden animate-in slide-in-from-top-2 duration-200">
            <div className="p-5 border-b border-slate-200 bg-white flex justify-between items-center">
              <span className="font-semibold text-xs text-slate-600">Activity Alerts</span>
              {activeNotifications.length > 0 && (
                <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg text-[9px] font-semibold">
                  {activeNotifications.length} New
                </span>
              )}
            </div>
            
            <div className="max-h-[450px] overflow-y-auto no-scrollbar">
              {activeNotifications.length > 0 ? (
                activeNotifications.map(n => (
                  <div key={n.id} className="p-5 border-b border-slate-200 hover:bg-slate-50 transition-all bg-white flex gap-4 items-start">
                    <div className={`p-2 rounded-lg shrink-0 ${n.bg}`}>
                      {n.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700 leading-relaxed mb-1">
                        {n.text}
                      </p>
                      <span className="text-xs font-medium text-slate-400">{n.time}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center flex flex-col items-center">
                  <CheckCircle size={32} className="text-slate-100 mb-3" />
                  <p className="text-xs font-semibold text-slate-400">All Caught Up</p>
                </div>
              )}
            </div>
            
            <button className="w-full py-3 bg-slate-100 text-xs font-medium text-slate-600 hover:text-blue-600 transition-colors">
              Clear All Notifications
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Notifications;