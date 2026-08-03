import React from 'react';
import { List, LayoutGrid } from 'lucide-react';

/**
 * Small icon-button pair to switch between list view and card (board) view.
 *
 * Props:
 *   view        — 'list' | 'card'
 *   onChange    — (view) => void
 *   storageKey  — optional localStorage key; if provided the value is also saved there
 */
const TaskViewToggle = ({ view, onChange, storageKey }) => {
  const handleChange = (v) => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
    }
    onChange(v);
  };

  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
      <button
        type="button"
        title="List view"
        aria-label="List view"
        onClick={() => handleChange('list')}
        className={`flex items-center justify-center w-6 h-6 rounded-md transition-all ${
          view === 'list'
            ? 'bg-white shadow-sm text-blue-600 border border-slate-200'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <List size={13} />
      </button>
      <button
        type="button"
        title="Card dashboard view"
        aria-label="Card dashboard view"
        onClick={() => handleChange('card')}
        className={`flex items-center justify-center w-6 h-6 rounded-md transition-all ${
          view === 'card'
            ? 'bg-white shadow-sm text-blue-600 border border-slate-200'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <LayoutGrid size={13} />
      </button>
    </div>
  );
};

export default TaskViewToggle;
