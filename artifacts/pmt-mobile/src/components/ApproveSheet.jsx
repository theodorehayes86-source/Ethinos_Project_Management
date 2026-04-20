import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Star, Loader2 } from 'lucide-react';
import { updateTaskInFirebase } from '../hooks/useFirebaseData.js';

function StarRating({ value, onChange, disabled = false }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div className="flex gap-0.5 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(n)}
          onMouseEnter={() => !disabled && setHovered(n)}
          onMouseLeave={() => !disabled && setHovered(null)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg text-xl transition-all min-w-[36px] min-h-[44px] ${
            n <= (hovered ?? value) ? 'text-amber-400' : 'text-slate-200'
          }`}
          title={`${n}/10`}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <span className="ml-1 text-sm font-bold text-slate-700 self-center">{value}/10</span>
      )}
    </div>
  );
}

export default function ApproveSheet({ task, onClose, clientLogs, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [feedback, setFeedback] = useState('');
  const [mode, setMode] = useState('decide');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    if (!rating) { setError('Please select a rating.'); return; }
    setError('');
    setSaving(true);
    try {
      await updateTaskInFirebase(task._clientId, task.id, {
        qcStatus: 'approved',
        qcRating: rating,
        qcComment: comment.trim() || '',
        qcReviewedAt: Date.now(),
      }, clientLogs);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async () => {
    if (!rating) { setError('Please select a rating.'); return; }
    if (!feedback.trim()) { setError('Feedback is required when returning a task.'); return; }
    setError('');
    setSaving(true);
    try {
      await updateTaskInFirebase(task._clientId, task.id, {
        status: 'Pending',
        qcStatus: 'rejected',
        qcRating: rating,
        qcFeedback: feedback.trim(),
        qcReviewedAt: Date.now(),
      }, clientLogs);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">QC Review</p>
            <h2 className="text-base font-bold text-slate-900 truncate">{task.name || task.comment}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <X size={16} className="text-slate-600" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quality Rating <span className="text-red-500">*</span></p>
            <StarRating value={rating} onChange={setRating} />
          </div>

          {mode === 'decide' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('approve')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 min-h-[80px] active:scale-[0.97] transition-transform"
              >
                <CheckCircle size={24} />
                <span className="text-sm font-bold">Approve</span>
              </button>
              <button
                onClick={() => setMode('return')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-red-50 border-2 border-red-200 text-red-700 min-h-[80px] active:scale-[0.97] transition-transform"
              >
                <XCircle size={24} />
                <span className="text-sm font-bold">Return</span>
              </button>
            </div>
          )}

          {mode === 'approve' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Comment <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Great work! The deliverable met all requirements..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none outline-none focus:ring-2 ring-emerald-500/20 focus:border-emerald-300 bg-slate-50"
                />
              </div>
              {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
              <button
                onClick={handleApprove}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm min-h-[44px] disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Approve Task
              </button>
              <button onClick={() => setMode('decide')} className="w-full py-3 text-sm text-slate-500 font-semibold">← Back</button>
            </div>
          )}

          {mode === 'return' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Feedback <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Please revise the following sections: ..."
                  rows={4}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none outline-none focus:ring-2 ring-red-500/20 focus:border-red-300 bg-slate-50"
                />
              </div>
              {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
              <button
                onClick={handleReturn}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-red-600 text-white font-bold text-sm min-h-[44px] disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                Return Task
              </button>
              <button onClick={() => setMode('decide')} className="w-full py-3 text-sm text-slate-500 font-semibold">← Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
