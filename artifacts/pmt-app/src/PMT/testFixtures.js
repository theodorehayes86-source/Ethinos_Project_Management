export const TEST_CLIENT_ID = 'test-client-001';

export const TEST_CLIENT = {
  id: TEST_CLIENT_ID,
  name: 'Test Client',
  industry: 'Testing',
  region: 'All',
};

const fmtDate = (d) => {
  const day = d.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31 ? 'st' :
    day === 2 || day === 22 ? 'nd' :
    day === 3 || day === 23 ? 'rd' : 'th';
  return `${day}${suffix} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
};

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

export const buildTestTasks = () => [
  {
    id: 'tt-001', comment: 'Write Q1 campaign report', category: 'Reporting & Analysis',
    date: fmtDate(daysAgo(2)), status: 'done', result: '',
    creatorId: 'test-employee', creatorName: 'Test Employee', creatorRole: 'Employee',
    elapsedMs: 5400000, timeTaken: '01:30:00',
    qcEnabled: true, qcAssigneeId: 'test-manager', qcAssigneeName: 'Test Manager',
    qcStatus: 'approved', qcRating: 8, qcFeedback: 'Well structured report.',
    qcReviewedAt: daysAgo(1).toISOString(), qcReviewerName: 'Test Manager',
  },
  {
    id: 'tt-002', comment: 'Set up Google Ads campaign', category: 'Campaign Setup',
    date: fmtDate(daysAgo(3)), status: 'done', result: '',
    creatorId: 'test-employee', creatorName: 'Test Employee', creatorRole: 'Employee',
    elapsedMs: 3600000, timeTaken: '01:00:00',
    qcEnabled: true, qcAssigneeId: 'test-manager', qcAssigneeName: 'Test Manager',
    qcStatus: 'rejected', qcRating: 4, qcFeedback: 'Targeting settings need revision.',
    qcReviewedAt: daysAgo(2).toISOString(), qcReviewerName: 'Test Manager',
  },
  {
    id: 'tt-003', comment: 'Client onboarding kick-off call', category: 'Client Communication',
    date: fmtDate(daysAgo(1)), status: 'done', result: '',
    creatorId: 'test-manager', creatorName: 'Test Manager', creatorRole: 'Manager',
    elapsedMs: 1800000, timeTaken: '00:30:00',
    qcEnabled: true, qcAssigneeId: 'test-director', qcAssigneeName: 'Test Director',
    qcStatus: 'approved', qcRating: 9, qcFeedback: 'Excellent client communication.',
    qcReviewedAt: daysAgo(0).toISOString(), qcReviewerName: 'Test Director',
  },
  {
    id: 'tt-004', comment: 'Weekly budget pacing review', category: 'Budget Management',
    date: fmtDate(daysAgo(4)), status: 'done', result: '',
    creatorId: 'test-employee', creatorName: 'Test Employee', creatorRole: 'Employee',
    elapsedMs: 2700000, timeTaken: '00:45:00',
    qcEnabled: true, qcAssigneeId: 'test-manager', qcAssigneeName: 'Test Manager',
    qcStatus: 'sent', qcRating: null, qcFeedback: null, qcReviewedAt: null, qcReviewerName: null,
  },
  {
    id: 'tt-005', comment: 'Prepare social content calendar', category: 'Content Creation',
    date: fmtDate(daysAgo(5)), status: 'done', result: '',
    creatorId: 'test-manager', creatorName: 'Test Manager', creatorRole: 'Manager',
    elapsedMs: 7200000, timeTaken: '02:00:00',
    qcEnabled: true, qcAssigneeId: 'test-director', qcAssigneeName: 'Test Director',
    qcStatus: null, qcRating: null, qcFeedback: null, qcReviewedAt: null, qcReviewerName: null,
  },
  {
    id: 'tt-006', comment: 'Optimise underperforming ad sets', category: 'Campaign Optimization',
    date: fmtDate(daysAgo(6)), status: 'done', result: '',
    creatorId: 'test-employee', creatorName: 'Test Employee', creatorRole: 'Employee',
    elapsedMs: 4500000, timeTaken: '01:15:00',
    qcEnabled: true, qcAssigneeId: 'test-manager', qcAssigneeName: 'Test Manager',
    qcStatus: 'approved', qcRating: 7, qcFeedback: 'Good optimisation decisions.',
    qcReviewedAt: daysAgo(5).toISOString(), qcReviewerName: 'Test Manager',
  },
  {
    id: 'tt-007', comment: 'Research competitor campaigns', category: 'Research',
    date: fmtDate(daysAgo(7)), status: 'done', result: '',
    creatorId: 'test-manager', creatorName: 'Test Manager', creatorRole: 'Manager',
    elapsedMs: 5400000, timeTaken: '01:30:00',
    qcEnabled: false, qcAssigneeId: null, qcAssigneeName: null,
    qcStatus: null, qcRating: null, qcFeedback: null, qcReviewedAt: null, qcReviewerName: null,
  },
];
