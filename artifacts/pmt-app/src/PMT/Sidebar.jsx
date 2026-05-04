import React, { useState, useEffect } from 'react';
import { Home, Briefcase, Network, SlidersHorizontal, BarChart3, FileSpreadsheet, ChevronLeft, ChevronRight, ClipboardCheck, Download, Monitor, Apple, Info, X, Users, Loader2, ClipboardList } from 'lucide-react';

const REPO = 'theodorehayes86-source/Ethinos_Project_Management';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const LIST_API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=10`;

function useLatestRelease() {
  const [data, setData] = useState({ winUrl: null, macUrl: null, linuxUrl: null, winVersion: null, macVersion: null, version: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch(LIST_API_URL, { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => r.json())
      .then(releases => {
        if (cancelled) return;
        if (!Array.isArray(releases)) {
          setData(d => ({ ...d, loading: false }));
          return;
        }
        const findInReleases = (ext) => {
          for (const rel of releases) {
            const asset = (rel.assets || []).find(a => a.name.endsWith(ext));
            if (asset) return { url: asset.browser_download_url, version: rel.tag_name };
          }
          return null;
        };
        const win   = findInReleases('.exe');
        const mac   = findInReleases('.dmg');
        const linux = findInReleases('.AppImage');
        setData({
          winUrl:     win?.url   || null,
          macUrl:     mac?.url   || null,
          linuxUrl:   linux?.url || null,
          winVersion: win?.version  || null,
          macVersion: mac?.version  || null,
          version:    releases[0]?.tag_name || null,
          loading:    false,
        });
      })
      .catch(() => {
        if (!cancelled) setData({ winUrl: null, macUrl: null, linuxUrl: null, winVersion: null, macVersion: null, version: null, loading: false });
      });
    return () => { cancelled = true; };
  }, []);

  return data;
}

const Sidebar = ({ activeTab, setActiveTab, setSelectedClient, isMinimized, setIsMinimized, canSeeControlCenter = false, canSeeEmployeeView = true, canSeeMetrics = true, canSeeReports = true, canSeeApprovals = false, canSeeTeam = false, canSeeChecklist = false, pendingApprovalsCount = 0 }) => {
  const [logoError, setLogoError] = useState(false);
  const [showMacInfo, setShowMacInfo] = useState(false);
  const { winUrl, macUrl, linuxUrl, winVersion, macVersion, version, loading } = useLatestRelease();

  const menuItems = [
    { id: 'home', label: 'Home', icon: <Home size={18}/> },
    { id: 'clients', label: 'Clients', icon: <Briefcase size={18}/> },
    { id: 'approvals', label: 'Approvals', icon: <ClipboardCheck size={18}/>, badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null },
    { id: 'team', label: 'Team', icon: <Users size={18}/> },
    { id: 'metrics', label: 'Metrics', icon: <BarChart3 size={18}/> },
    { id: 'reports', label: 'Reports', icon: <FileSpreadsheet size={18}/> },
    { id: 'checklist', label: 'Checklist', icon: <ClipboardList size={18}/> },
    { id: 'employees', label: 'Employee View', icon: <Network size={18} /> },
    { id: 'master-data', label: 'Control Center', icon: <SlidersHorizontal size={18}/> }
  ].filter(item => {
    if (item.id === 'approvals') return canSeeApprovals;
    if (item.id === 'team') return canSeeTeam;
    if (item.id === 'checklist') return canSeeChecklist;
    if (item.id === 'master-data') return canSeeControlCenter;
    if (item.id === 'employees') return canSeeEmployeeView;
    if (item.id === 'metrics') return canSeeMetrics;
    if (item.id === 'reports') return canSeeReports;
    return true;
  });

  const dlBtn = (href, icon, label, title) => (
    <a
      href={href || RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-[9px] font-bold text-slate-600 hover:text-indigo-700"
      title={title}
    >
      {icon}
      {label}
    </a>
  );

  return (
    <aside
      className={`${isMinimized ? 'w-20' : 'w-64'} relative border-r border-white/45 bg-white/30 backdrop-blur-sm flex flex-col transition-all duration-300 z-30`}
    >
      {/* Collapse / expand tab on the outer right edge */}
      <button
        onClick={() => setIsMinimized && setIsMinimized(!isMinimized)}
        title={isMinimized ? 'Expand Sidebar' : 'Minimize Sidebar'}
        className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-40 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:shadow-indigo-100 transition-all duration-200"
      >
        {isMinimized ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
      {/* XP Logo Section */}
      <div className={`flex-shrink-0 ${isMinimized ? 'p-4 flex justify-center' : 'p-7 flex justify-start pl-7'}`}>
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
      <nav className="flex-1 min-h-0 overflow-y-auto px-3.5 py-1 space-y-2.5">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if(setSelectedClient) setSelectedClient(null);
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
      <div className="flex-shrink-0 p-4 space-y-3">

        {/* Download Timer Widget card */}
        {!isMinimized ? (
          <div className="px-3 py-3 bg-indigo-50/80 rounded-2xl border border-indigo-200/60 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-white border border-indigo-200/60 flex items-center justify-center flex-shrink-0 overflow-hidden p-0.5">
                <img src="/ethinos-icon.png" alt="Ethinos" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest leading-none">Ethinos Timer Pro</p>
                <p className="text-[8px] text-slate-400 leading-none mt-0.5">
                  {loading ? (
                    <span className="flex items-center gap-0.5"><Loader2 size={7} className="animate-spin" /> checking…</span>
                  ) : (winVersion && macVersion && winVersion !== macVersion) ? (
                    `Mac ${macVersion} · Win ${winVersion}`
                  ) : version ? (
                    `${version} · always on top`
                  ) : (
                    'Desktop app · always on top'
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-1.5">
              {dlBtn(winUrl,   <Monitor size={10} />, 'Win',   'Download for Windows')}
              {dlBtn(macUrl,   <Apple   size={10} />, 'Mac',   'Download for Mac')}
              {dlBtn(linuxUrl, <Download size={10}/>, 'Linux', 'Download for Linux (AppImage)')}
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
            title={version ? `Download Ethinos Timer Pro ${version}` : 'Download Ethinos Timer Pro'}
            className="w-full flex items-center justify-center py-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200/60 hover:bg-indigo-100/80 transition-all"
          >
            <Download size={14} className="text-indigo-500" />
          </a>
        )}

        {!isMinimized && (
          <div className="px-3 py-3 bg-white/60 rounded-2xl border border-white/80 shadow-sm backdrop-blur-sm text-center">
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Powered by</p>
            <p className="text-[10px] font-bold text-slate-600 leading-snug">Ethinos Digital Marketing Pvt Ltd</p>
            <p className="text-[8px] text-slate-400 mt-1 leading-none">Flow Pro v{__APP_VERSION__}</p>
          </div>
        )}

      </div>
    </aside>
  );
};

export default Sidebar;
