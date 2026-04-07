import React, { useState } from 'react';
import { CheckCircle, XCircle, Star, ChevronDown, ChevronUp, Clock, User, Tag, Calendar, MessageSquare, UserPlus, UserCheck, UserX, Check, X } from 'lucide-react';

const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];

const StarRating = ({ value, onChange, disabled = false }) => {
  const [hovered, setHovered] = useState(null);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(n)}
          onMouseEnter={() => !disabled && setHovered(n)}
          onMouseLeave={() => !disabled && setHovered(null)}
          className={`w-7 h-7 flex items-center justify-center rounded-md text-lg transition-all ${
            disabled ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          } ${
            n <= (hovered ?? value)
              ? 'text-amber-400'
              : 'text-slate-200'
          }`}
          title={`${n}/10`}
        >
          ★
        </button>
      ))}
      <span className="ml-2 text-sm font-bold text-slate-700 self-center">
        {value ? `${value}/10` : '—'}
      </span>
    </div>
  );
};

const ApproveModal = ({ task, onConfirm, onClose }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!rating) { setError('Please select a rating before approving.'); return; }
    onConfirm({ rating, comment: comment.trim() });
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle size={20} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Approve Task</h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{task.comment}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
              Quality Rating <span className="text-red-500">*</span>
            </label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Comment <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none outline-none focus:ring-2 ring-emerald-500/20 focus:border-emerald-300 bg-slate-50"
              placeholder="Great work! The deliverable met all the requirements..."
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-sm"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
};

const ReturnModal = ({ task, onConfirm, onClose }) => {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!rating) { setError('A rating is required when returning a task.'); return; }
    if (!feedback.trim()) { setError('Feedback is required when returning a task.'); return; }
    onConfirm({ rating, feedback: feedback.trim() });
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle size={20} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Return for Revision</h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{task.comment}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
              Quality Rating <span className="text-red-500">*</span>
            </label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Feedback <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none outline-none focus:ring-2 ring-red-500/20 focus:border-red-300 bg-slate-50"
              placeholder="Please revise the following sections: ..."
              rows={4}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all shadow-sm"
          >
            Return Task
          </button>
        </div>
      </div>
    </div>
  );
};

const TaskCard = ({ task, client, users, onApprove, onReturn, isReviewed }) => {
  const [expanded, setExpanded] = useState(false);
  const assignee = users.find(u => String(u.id) === String(task.assigneeId));

  const formatMs = (ms = 0) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const statusBadge = () => {
    if (task.qcStatus === 'approved') return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle size={10} /> Approved
      </span>
    );
    if (task.qcStatus === 'rejected') return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
        <XCircle size={10} /> Returned
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
        <Clock size={10} /> Awaiting Review
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {statusBadge()}
              {task.category && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                  <Tag size={9} />
                  {task.category}
                </span>
              )}
              {Array.isArray(task.departments) && task.departments.map(dept => (
                <span key={dept} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                  {dept}
                </span>
              ))}
            </div>
            <p className="text-sm font-semibold text-slate-800 leading-snug mb-2">{task.comment}</p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <User size={11} />
                {task.assigneeName || assignee?.name || 'Unknown'}
              </span>
              {task.elapsedMs > 0 && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {formatMs(task.elapsedMs)}
                </span>
              )}
              {task.qcSubmittedAt && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  Sent {new Date(task.qcSubmittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            {!isReviewed && (
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(task)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
                >
                  <CheckCircle size={13} /> Approve
                </button>
                <button
                  onClick={() => onReturn(task)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition-all"
                >
                  <XCircle size={13} /> Return
                </button>
              </div>
            )}
            {isReviewed && task.qcRating && (
              <div className="flex items-center gap-1">
                <Star size={13} className="text-amber-400 fill-amber-400" />
                <span className="text-sm font-bold text-slate-700">{task.qcRating}/10</span>
              </div>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Less' : 'Details'}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Client</p>
              <p className="text-slate-700 font-semibold">{client?.name || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Task Date</p>
              <p className="text-slate-700 font-semibold">{task.date || '—'}</p>
            </div>
            {task.dueDate && (
              <div>
                <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Due Date</p>
                <p className="text-slate-700 font-semibold">{task.dueDate}</p>
              </div>
            )}
            {isReviewed && task.qcReviewedAt && (
              <div>
                <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Reviewed At</p>
                <p className="text-slate-700 font-semibold">
                  {new Date(task.qcReviewedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>

          {isReviewed && task.qcStatus === 'approved' && task.qcComment && (
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider text-xs mb-1">Approval Comment</p>
              <p className="text-sm text-slate-700 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">{task.qcComment}</p>
            </div>
          )}

          {isReviewed && task.qcStatus === 'rejected' && task.qcFeedback && (
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider text-xs mb-1">Return Feedback</p>
              <p className="text-sm text-slate-700 bg-red-50 rounded-xl px-4 py-3 border border-red-100">{task.qcFeedback}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AssignmentRequestCard = ({ task, client, request, onAccept, onDecline }) => {
  return (
    <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <UserPlus size={16} className="text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                <UserPlus size={9} /> Assignment Request
              </span>
              {task.category && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                  <Tag size={9} /> {task.category}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800 leading-snug mb-1">{task.comment}</p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <User size={11} />
                <span className="font-semibold text-violet-700">{request.requesterName}</span>
                <span>wants to be assigned</span>
              </span>
              {client && (
                <span className="flex items-center gap-1">
                  <Tag size={11} /> {client.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {new Date(request.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {task.assigneeName && (
              <p className="text-xs text-slate-400 mt-1">Currently assigned to: <span className="font-semibold text-slate-500">{task.assigneeName}</span></p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => onAccept(task, request)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all shadow-sm"
            >
              <UserCheck size={13} /> Assign
            </button>
            <button
              onClick={() => onDecline(task, request)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 transition-all"
            >
              <UserX size={13} /> Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CROSS_DEPT_ROLES = ['Super Admin', 'Admin', 'Business Head'];

const ApprovalsView = ({ clientLogs, clients, users, currentUser, persistClientLogs, setClients, setUsers }) => {
  const [activeSubTab, setActiveSubTab] = useState('pending');
  const [approvingTask, setApprovingTask] = useState(null);
  const [returningTask, setReturningTask] = useState(null);

  const isManager = managementRoles.includes(currentUser?.role);
  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-400 text-sm">You do not have permission to view this page.</p>
      </div>
    );
  }

  const isCrossDept = CROSS_DEPT_ROLES.includes(currentUser?.role);
  const userDept = currentUser?.department;

  // --- QC tasks ---
  const allTasksFlat = [];
  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const client = clients.find(c => String(c.id) === String(clientId));
    (logs || []).forEach(task => {
      if (String(task.qcAssigneeId) === String(currentUser.id)) {
        if (!isCrossDept && Array.isArray(task.departments) && !task.departments.includes(userDept)) return;
        allTasksFlat.push({ ...task, _clientId: clientId, _client: client });
      }
    });
  });

  const pendingTasks = allTasksFlat
    .filter(t => t.qcStatus === 'sent')
    .sort((a, b) => (b.qcSubmittedAt || 0) - (a.qcSubmittedAt || 0));

  const reviewedTasks = allTasksFlat
    .filter(t => t.qcStatus === 'approved' || t.qcStatus === 'rejected')
    .sort((a, b) => (b.qcReviewedAt || 0) - (a.qcReviewedAt || 0));

  // --- Assignment requests: all tasks on clients where currentUser is assigned (as management) ---
  const assignmentRequestItems = [];
  const myClientNames = (currentUser?.assignedProjects || []);
  Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!isCrossDept && client && !myClientNames.includes(client.name)) return;
    (logs || []).forEach(task => {
      (task.assignmentRequests || []).forEach(req => {
        assignmentRequestItems.push({ task: { ...task, _clientId: clientId, _client: client }, client, request: req });
      });
    });
  });
  assignmentRequestItems.sort((a, b) => b.request.timestamp - a.request.timestamp);

  // --- Client join requests: collected from all accessible clients ---
  const clientJoinRequestItems = [];
  (clients || []).forEach(client => {
    if (!isCrossDept && !myClientNames.includes(client.name)) return;
    (client.joinRequests || []).forEach(req => {
      clientJoinRequestItems.push({ client, request: req });
    });
  });
  clientJoinRequestItems.sort((a, b) => b.request.timestamp - a.request.timestamp);

  const totalAssignmentBadge = assignmentRequestItems.length + clientJoinRequestItems.length;

  const handleAcceptClientJoin = (client, request) => {
    if (!setClients || !setUsers) return;
    const updatedClient = { ...client, joinRequests: (client.joinRequests || []).filter(r => String(r.requesterId) !== String(request.requesterId)) };
    setClients((clients || []).map(c => String(c.id) === String(client.id) ? updatedClient : c));
    if (setUsers) {
      setUsers(prev => prev.map(u => String(u.id) === String(request.requesterId)
        ? { ...u, assignedProjects: [...new Set([...(u.assignedProjects || []), client.name])] }
        : u
      ));
    }
  };

  const handleDeclineClientJoin = (client, request) => {
    if (!setClients) return;
    const updatedClient = { ...client, joinRequests: (client.joinRequests || []).filter(r => String(r.requesterId) !== String(request.requesterId)) };
    setClients((clients || []).map(c => String(c.id) === String(client.id) ? updatedClient : c));
  };

  const groupByClient = (tasks) => {
    const groups = {};
    tasks.forEach(task => {
      const key = task._clientId;
      if (!groups[key]) groups[key] = { client: task._client, tasks: [], latestTs: 0 };
      groups[key].tasks.push(task);
      const ts = task.qcReviewedAt || task.qcSubmittedAt || 0;
      if (ts > groups[key].latestTs) groups[key].latestTs = ts;
    });
    return Object.values(groups).sort((a, b) => b.latestTs - a.latestTs);
  };

  const pendingGroups = groupByClient(pendingTasks);
  const reviewedGroups = groupByClient(reviewedTasks);

  const updateTask = (task, updates) => {
    const updatedLogs = { ...clientLogs };
    const clientId = task._clientId;
    updatedLogs[clientId] = (updatedLogs[clientId] || []).map(t =>
      String(t.id) === String(task.id) ? { ...t, ...updates } : t
    );
    persistClientLogs(updatedLogs);
  };

  const handleApproveConfirm = ({ rating, comment }) => {
    updateTask(approvingTask, {
      qcStatus: 'approved',
      qcRating: rating,
      qcComment: comment || '',
      qcReviewedAt: Date.now(),
    });
    setApprovingTask(null);
  };

  const handleReturnConfirm = ({ rating, feedback }) => {
    updateTask(returningTask, {
      qcStatus: 'rejected',
      qcRating: rating,
      qcFeedback: feedback,
      qcReviewedAt: Date.now(),
    });
    setReturningTask(null);
  };

  const handleAcceptAssignment = (task, request) => {
    updateTask(task, {
      assigneeId: request.requesterId,
      assigneeName: request.requesterName,
      assignmentRequests: (task.assignmentRequests || []).filter(r => String(r.requesterId) !== String(request.requesterId)),
    });
  };

  const handleDeclineAssignment = (task, request) => {
    updateTask(task, {
      assignmentRequests: (task.assignmentRequests || []).filter(r => String(r.requesterId) !== String(request.requesterId)),
    });
  };

  const renderGroups = (groups, isReviewed) => {
    if (groups.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            {isReviewed
              ? <CheckCircle size={24} className="text-slate-400" />
              : <Clock size={24} className="text-slate-400" />
            }
          </div>
          <p className="text-sm font-semibold text-slate-500">
            {isReviewed ? 'No reviewed tasks yet' : 'No tasks awaiting review'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {isReviewed
              ? 'Tasks you approve or return will appear here.'
              : 'Tasks sent to you for QC will appear here.'
            }
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {groups.map(({ client, tasks }) => (
          <div key={client?.id || 'unknown'}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-black text-indigo-700">
                  {(client?.name || '?')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{client?.name || 'Unknown Client'}</h3>
                <p className="text-xs text-slate-400">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="space-y-3 pl-11">
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  client={client}
                  users={users}
                  onApprove={setApprovingTask}
                  onReturn={setReturningTask}
                  isReviewed={isReviewed}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAssignmentRequests = () => {
    const hasTaskRequests = assignmentRequestItems.length > 0;
    const hasClientRequests = clientJoinRequestItems.length > 0;

    if (!hasTaskRequests && !hasClientRequests) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <UserPlus size={24} className="text-violet-300" />
          </div>
          <p className="text-sm font-semibold text-slate-500">No assignment requests</p>
          <p className="text-xs text-slate-400 mt-1">Employees who request to join a task or client will appear here.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {hasClientRequests && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-violet-600 mb-3 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-black text-violet-700">{clientJoinRequestItems.length}</span>
              Client Requests
            </h3>
            <div className="space-y-2">
              {clientJoinRequestItems.map(({ client, request }) => (
                <div key={`${client.id}-${request.requesterId}`} className="bg-white border border-violet-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-black text-violet-700">{(request.requesterName || '?')[0].toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{request.requesterName}</p>
                      <p className="text-xs text-slate-500 truncate">Requesting to join <span className="font-semibold text-violet-700">{client.name}</span></p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAcceptClientJoin(client, request)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                    >
                      <Check size={12} /> Accept
                    </button>
                    <button
                      onClick={() => handleDeclineClientJoin(client, request)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all"
                    >
                      <X size={12} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasTaskRequests && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-600">{assignmentRequestItems.length}</span>
              Task Requests
            </h3>
            <div className="space-y-3">
              {assignmentRequestItems.map(({ task, client, request }) => (
                <AssignmentRequestCard
                  key={`${task.id}-${request.requesterId}`}
                  task={task}
                  client={client}
                  request={request}
                  onAccept={handleAcceptAssignment}
                  onDecline={handleDeclineAssignment}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">Approvals</h1>
        <p className="text-sm text-slate-500 mt-1">Review and action tasks submitted for QC.</p>
      </div>

      <div className="flex gap-2 bg-white/60 backdrop-blur-sm border border-white/60 rounded-2xl p-1.5 w-fit shadow-sm">
        <button
          onClick={() => setActiveSubTab('pending')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeSubTab === 'pending'
              ? 'bg-white border border-indigo-200/70 text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending
          {pendingTasks.length > 0 && (
            <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
              {pendingTasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('reviewed')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeSubTab === 'reviewed'
              ? 'bg-white border border-indigo-200/70 text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Reviewed
          {reviewedTasks.length > 0 && (
            <span className="bg-slate-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
              {reviewedTasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('assignments')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeSubTab === 'assignments'
              ? 'bg-white border border-violet-200/70 text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Assignments
          {totalAssignmentBadge > 0 && (
            <span className="bg-violet-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
              {totalAssignmentBadge}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === 'pending' && renderGroups(pendingGroups, false)}
      {activeSubTab === 'reviewed' && renderGroups(reviewedGroups, true)}
      {activeSubTab === 'assignments' && renderAssignmentRequests()}

      {approvingTask && (
        <ApproveModal
          task={approvingTask}
          onConfirm={handleApproveConfirm}
          onClose={() => setApprovingTask(null)}
        />
      )}
      {returningTask && (
        <ReturnModal
          task={returningTask}
          onConfirm={handleReturnConfirm}
          onClose={() => setReturningTask(null)}
        />
      )}
    </div>
  );
};

export default ApprovalsView;
