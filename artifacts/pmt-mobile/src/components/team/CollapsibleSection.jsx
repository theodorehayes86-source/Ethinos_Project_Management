import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Generic lazily-rendered collapsible section for the mobile Team View.
 * The body is only mounted after the first open (lazy rendering).
 */
export default function CollapsibleSection({
  icon,
  title,
  count = 0,
  critical = false,
  accent = 'slate', // slate | red | amber | rose | emerald
  defaultOpen = false,
  children,
  sectionRef,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);

  const toggle = () => {
    setOpen(v => !v);
    setEverOpened(true);
  };

  const accents = {
    slate:   { title: 'text-slate-500',  badge: 'text-slate-400 bg-slate-100' },
    red:     { title: 'text-red-500',    badge: 'text-red-500 bg-red-50' },
    amber:   { title: 'text-amber-600',  badge: 'text-amber-500 bg-amber-50' },
    rose:    { title: 'text-rose-600',   badge: 'text-rose-500 bg-rose-50' },
    emerald: { title: 'text-emerald-600', badge: 'text-emerald-500 bg-emerald-50' },
  };
  const c = accents[critical ? 'red' : accent] || accents.slate;

  return (
    <div ref={sectionRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 min-h-[48px] text-left active:bg-slate-50 transition-colors"
      >
        {icon}
        <h3 className={`text-xs font-black uppercase tracking-widest flex-1 min-w-0 truncate ${c.title}`}>{title}</h3>
        <span className={`text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0 ${c.badge}`}>{count}</span>
        {critical && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" aria-label="Needs attention" />}
        {open
          ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" />
          : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
      </button>
      {everOpened && (
        <div className={open ? 'px-4 pb-4' : 'hidden'}>
          {children}
        </div>
      )}
    </div>
  );
}
