// Extracted from the production summary.js. Only the static descriptor array is
// needed here: there is no API, Firebase or account state in these previews.
export const STUDIO_CARDS = [
  { key: 'approved', label: 'Approved', count: 'approved' },
  { key: 'wip', label: 'WIP / Awaiting approval', count: 'wip' },
  { key: 'soon', label: 'Close to post date', count: 'atRisk' },
  { key: 'scheduled', label: 'Scheduled', count: 'scheduled' },
  { key: 'ans', label: 'Approved, not scheduled', count: 'approvedNotScheduled' },
];
export const sampleCounts: Record<string, number> = {
  approved: 0, wip: 1, atRisk: 0, scheduled: 0, approvedNotScheduled: 0, overdue: 0,
};
