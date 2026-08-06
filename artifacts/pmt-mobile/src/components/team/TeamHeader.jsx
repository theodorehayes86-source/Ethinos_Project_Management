import React, { useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';

/**
 * Compact mobile Team header: title, visible member count,
 * expandable search, and Filter button with active-filter count.
 */
export default function TeamHeader({
  visibleCount,
  searchQuery,
  onSearchChange,
  activeFilterCount,
  onOpenFilters,
}) {
  const [searchOpen, setSearchOpen] = useState(!!searchQuery);
  const inputRef = useRef(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-slate-900 leading-tight">Team</h2>
          <p className="text-[11px] text-slate-400 font-medium">
            {visibleCount} visible {visibleCount === 1 ? 'member' : 'members'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (searchOpen && searchQuery) onSearchChange('');
            setSearchOpen(v => !v);
          }}
          aria-label={searchOpen ? 'Close search' : 'Search members'}
          className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
            searchOpen ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Search size={17} />
        </button>
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label={`Open filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
          className="relative flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-slate-100 text-slate-600 flex-shrink-0"
        >
          <SlidersHorizontal size={15} />
          <span className="text-xs font-bold">Filter</span>
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {searchOpen && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search employees…"
            className="w-full pl-8 pr-9 py-2.5 min-h-[44px] text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
            >
              <X size={12} className="text-slate-500" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
