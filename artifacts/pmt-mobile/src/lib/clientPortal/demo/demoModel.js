// DEV-ONLY in-memory client portal demo. Imported solely through a lazy
// import guarded by import.meta.env.DEV, so production builds drop it.
// No fetch, no Firebase, no tokens: every method resolves local copies.

export const DEMO_EMAIL = 'client@example.test';
export const DEMO_UID = 'demo-client-user';
export const DEMO_CLIENTS = [
  { id: 'demo-harbour', name: 'Harbour & Pine Interiors' }, // Creative Studio enabled
  { id: 'demo-kestrel', name: 'Kestrel Cycle Co.' },        // tasks only
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const DAY = 86400000;
// Local calendar day (never toISOString, which shifts across midnight in IST etc).
const isoDay = (offset, now) => {
  const d = new Date(now + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Mirrors the backend: client sets these, server stores canonical staff values.
const CLIENT_TO_CANONICAL = { Pending: 'Pending', 'In Progress': 'WIP', Completed: 'Done' };

class DemoError extends Error { constructor(m, status) { super(m); this.status = status; } }

function seed(now) {
  const t = (id, clientId, title, status, due, category, description, extra = {}) => ({ id, clientId, title, category, status, dueDate: due, description, statusEditable: true, ...extra });
  const at = (h) => new Date(now + h * 3600000).toISOString();
  return {
    seq: 100,
    tasks: [
      t('t1', 'demo-harbour', 'Approve spring catalogue copy', 'Pending', isoDay(2, now), 'Content', 'Final copy for the spring catalogue landing page. Please flag any product names that changed.'),
      t('t2', 'demo-harbour', 'Share store opening photos', 'WIP', isoDay(-1, now), 'Social Media', 'Upload 10 to 15 photos from the Bandra opening to the shared folder.'),
      t('t3', 'demo-harbour', 'Monthly performance review', 'Done', isoDay(-6, now), 'Reporting', 'Reviewed September results with the team.'),
      t('t6', 'demo-harbour', 'Homepage banner refresh', 'WIP', isoDay(9, now), 'Website', 'Swap the hero banner for the monsoon collection.', { statusEditable: false, statusEditReason: 'Your agency is tracking time on this task right now.' }),
      t('t7', 'demo-harbour', 'Brand guideline PDF', 'Pending', null, 'Branding', 'Send the latest logo files and colour codes when convenient.'),
      t('t8', 'demo-harbour', 'Festive campaign moodboard', 'On Hold', isoDay(14, now), 'Creative', 'Paused until the festive budget is confirmed.', { statusEditable: false, statusEditReason: 'In quality review with your agency.' }),
      t('t4', 'demo-kestrel', 'Confirm festive offer pricing', 'Pending', isoDay(0, now), 'Performance Marketing', 'Need the final discount slabs for Diwali.'),
      t('t5', 'demo-kestrel', 'Review search ad keywords', 'WIP', isoDay(5, now), 'SEO', ''),
    ],
    deliverables: [
      {
        id: 'd-ref', clientId: 'demo-harbour', title: 'Monsoon linen collection teaser', type: 'Reel', platforms: ['Instagram'],
        stage: 'awaiting_reference', revision: 2, shared: true, archived: false, timezone: 'Asia/Kolkata', plannedAt: at(24 * 4),
        caption: 'Soft linen, slow mornings. The monsoon edit drops Friday.',
        assets: [{ id: 'a1', kind: 'thumbnail', label: 'Moodboard v2', url: 'https://example.test/moodboard' }],
        approvals: { reference: { status: 'pending', approverUid: DEMO_UID, requestedAt: now - 5 * 3600000, snapshot: null } },
      },
      {
        id: 'd-final', clientId: 'demo-harbour', title: 'Walnut dining set carousel', type: 'Post', platforms: ['Instagram', 'Facebook'],
        stage: 'awaiting_final', revision: 3, shared: true, archived: false, timezone: 'Asia/Kolkata', plannedAt: at(30),
        caption: 'Gather round. Solid walnut, made to last decades of dinners.',
        assets: [{ id: 'a2', kind: 'main', label: 'Carousel final (5 slides)', url: 'https://example.test/carousel' }],
        approvals: { final: { status: 'pending', approverUid: DEMO_UID, requestedAt: now - 2 * 3600000, snapshot: null } },
      },
      {
        id: 'd-done', clientId: 'demo-harbour', title: 'Festive gifting guide story', type: 'Story', platforms: ['Instagram'],
        stage: 'final_approved', revision: 1, shared: true, archived: false, timezone: 'Asia/Kolkata', plannedAt: at(-48),
        caption: 'Five gifts under 5k.', assets: [], approvals: {},
      },
    ],
    messages: { 'd-ref': [{ id: 'm1', author: 'Priya (Harbour account team)', text: 'Two moodboard directions are in the deck. Happy to talk through them.', at: now - 4 * 3600000 }] },
  };
}

const NEXT = { reference: { approved: 'in_production', changes_requested: 'reference_changes' }, final: { approved: 'final_approved', changes_requested: 'final_changes' } };

export function createDemoStore({ now = () => Date.now() } = {}) {
  let state = seed(now());
  const assigned = (clientId) => DEMO_CLIENTS.some(c => c.id === clientId);
  const studioClient = (clientId) => clientId === 'demo-harbour';
  const deny = () => { throw new DemoError('Not available in this demo workspace.', 403); };

  const portalApi = {
    me: async () => ({ email: DEMO_EMAIL, clients: clone(DEMO_CLIENTS) }),
    listTasks: async (clientId) => { if (!assigned(clientId)) deny(); return { tasks: clone(state.tasks.filter(x => x.clientId === clientId)) }; },
    createTask: async (clientId, { title, description, dueDate, category }) => {
      if (!assigned(clientId)) deny();
      if (!String(title || '').trim()) throw new DemoError('Title is required.', 400);
      const cat = String(category || '').trim();
      if (cat.length > 100) throw new DemoError('Category must be 100 characters or fewer.', 400);
      const task = { id: `t${++state.seq}`, clientId, title: String(title).trim(), category: cat, status: 'Pending', dueDate: dueDate || null, description: description || '', statusEditable: true };
      state.tasks = [...state.tasks, task];
      return { task: clone(task) };
    },
    updateTaskStatus: async (clientId, taskId, status) => {
      if (!assigned(clientId)) deny();
      const task = state.tasks.find(x => x.id === taskId && x.clientId === clientId);
      if (!task) throw new DemoError('Task not found.', 404);
      const canonical = CLIENT_TO_CANONICAL[status];
      if (!canonical) throw new DemoError('Unsupported status.', 400);
      if (task.statusEditable === false) throw new DemoError(task.statusEditReason || 'This status is managed by your agency.', 409);
      const updated = { ...task, status: canonical };
      state.tasks = state.tasks.map(x => (x === task ? updated : x));
      return { task: clone(updated) };
    },
  };

  const studioApi = {
    bootstrap: async () => ({
      clients: clone(DEMO_CLIENTS.filter(c => studioClient(c.id))),
      configs: Object.fromEntries(DEMO_CLIENTS.map(c => [c.id, { enabled: studioClient(c.id) }])),
      capabilities: {},
    }),
    list: async (clientId) => {
      if (!studioClient(clientId)) deny();
      return { deliverables: clone(state.deliverables.filter(d => d.clientId === clientId && d.shared && !d.archived)) };
    },
    action: async (clientId, id, body) => {
      const d = state.deliverables.find(x => x.id === id && x.clientId === clientId);
      if (!d || !studioClient(clientId)) deny();
      if (body.revision !== d.revision) throw new DemoError('This item changed. Reload and try again.', 409);
      const ap = d.approvals?.[body.phase];
      if (body.action !== 'decide' || !ap || ap.status !== 'pending' || ap.approverUid !== DEMO_UID) throw new DemoError('No pending approval for you.', 409);
      if (body.decision === 'changes_requested' && !String(body.feedback || '').trim()) throw new DemoError('Feedback is required.', 400);
      const next = NEXT[body.phase]?.[body.decision];
      if (!next) throw new DemoError('Unknown decision.', 400);
      const updated = { ...d, stage: next, revision: d.revision + 1, approvals: { ...d.approvals, [body.phase]: { ...ap, status: body.decision, decidedAt: now(), feedback: body.feedback || null } } };
      state.deliverables = state.deliverables.map(x => (x.id === id ? updated : x));
      return { deliverable: clone(updated) };
    },
    messages: async (clientId, id, thread) => {
      if (thread !== 'client' || !studioClient(clientId)) deny();
      return { messages: clone(state.messages[id] || []) };
    },
    send: async (clientId, id, thread, { idempotencyKey, text }) => {
      if (thread !== 'client' || !studioClient(clientId)) deny();
      const list = state.messages[id] || [];
      const existing = list.find(m => m.id === idempotencyKey);
      if (existing) return { message: clone(existing) };
      const message = { id: idempotencyKey, author: 'You (demo client)', text: String(text || '').slice(0, 5000), at: now() };
      state.messages = { ...state.messages, [id]: [...list, message] };
      return { message: clone(message) };
    },
  };

  return { portalApi, studioApi, reset: () => { state = seed(now()); }, snapshot: () => clone(state) };
}

export const demoAuth = () => ({ currentUser: { uid: DEMO_UID, email: DEMO_EMAIL, emailVerified: true } });
