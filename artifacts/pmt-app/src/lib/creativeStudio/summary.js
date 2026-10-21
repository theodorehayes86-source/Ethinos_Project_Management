import { urgency } from './core.js';

export const STUDIO_CARDS = [
  { key: 'approved', label: 'Approved', count: 'approved' },
  { key: 'wip', label: 'WIP / Awaiting approval', count: 'wip' },
  { key: 'soon', label: 'Close to post date', count: 'atRisk' },
  { key: 'scheduled', label: 'Scheduled', count: 'scheduled' },
  { key: 'ans', label: 'Approved, not scheduled', count: 'approvedNotScheduled' },
];

export const isStudioCard = key => STUDIO_CARDS.some(c => c.key === key);

// These predicates feed both the counts and results, so a card always matches
// the records it represents. Counts deliberately exclude the active card filter.
export function matchesStudioCard(item, key, now = Date.now()) {
  if (key === 'all') return true;
  if (!item || item.archived) return false;
  switch (key) {
    case 'approved': return item.stage === 'final_approved';
    case 'wip': return item.stage !== 'final_approved';
    case 'soon': return ['soon', 'overdue'].includes(urgency(item, now));
    case 'scheduled': return !!item.scheduled;
    case 'ans': return item.stage === 'final_approved' && !item.scheduled;
    default: return false;
  }
}

export function studioCardCounts(items, now = Date.now()) {
  return Object.fromEntries(STUDIO_CARDS.map(c => [c.count, items.filter(i => matchesStudioCard(i, c.key, now)).length]));
}
