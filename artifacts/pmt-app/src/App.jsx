import React, { useEffect, useRef, useState } from 'react';
import { ref, onValue, set, get } from 'firebase/database';
import { signInWithEmailAndPassword, signInWithCustomToken, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, updateProfile, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { db, auth } from './firebase.js';
// MSAL import removed — we use a direct PKCE+postMessage popup flow instead.

import HomeView from './PMT/HomeView';
import ClientView from './PMT/ClientView';
import EmployeeView from './PMT/EmployeeView';
import MasterDataView from './PMT/MasterDataView';
import UserMetricsView from './PMT/UserMetricsView';
import ReportsView from './PMT/ReportsView';
import ApprovalsView from './PMT/ApprovalsView';
import TeamView from './PMT/TeamView';
import Sidebar from './PMT/Sidebar';
import Notifications from './PMT/Notifications';
import ProfileDropdown from './PMT/ProfileDropdown';
import LoginView from './PMT/LoginView';
import TestModePanel, { TEST_USERS } from './PMT/TestModePanel';

const DEFAULT_USERS = [
  { id: 1, name: "Theo", email: "theo.hayes@ethinos.com", role: 'Super Admin', assignedProjects: [], department: 'Growth', region: 'North' },
  ...TEST_USERS,
];

// Categories are stored as objects: { name: string, departments: string[] }
// departments: [] means Universal (visible to all)
const DEFAULT_TASK_CATEGORIES = [
  { name: 'Strategy & Planning', departments: [] },
  { name: 'Campaign Setup', departments: [] },
  { name: 'Campaign Optimization', departments: [] },
  { name: 'Reporting & Analysis', departments: [] },
  { name: 'Client Communication', departments: [] },
  { name: 'Content Creation', departments: [] },
  { name: 'Creatives & Assets', departments: [] },
  { name: 'Research', departments: [] },
  { name: 'Budget Management', departments: [] },
  { name: 'Technical Setup', departments: [] },
  { name: 'Training & Development', departments: [] },
  { name: 'Other', departments: [] },
];

// Migrate legacy string categories to the new object format.
// Also normalizes malformed objects (missing name or departments field).
const migrateCategoryList = (val) => {
  if (!Array.isArray(val)) return DEFAULT_TASK_CATEGORIES;
  return val.map(item => {
    if (typeof item === 'string') return { name: item, departments: [] };
    if (item && typeof item === 'object') {
      return {
        name: typeof item.name === 'string' ? item.name : String(item.name || ''),
        departments: Array.isArray(item.departments) ? item.departments : [],
      };
    }
    return null;
  }).filter(Boolean);
};

const DEFAULT_TASK_TEMPLATES = [
  {
    id: 'prebuilt-1',
    name: 'Monthly Digital Report',
    description: 'Standard end-of-month reporting tasks for digital campaigns.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Pull performance data from all ad platforms', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
      { comment: 'Compile monthly KPI summary deck', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
      { comment: 'Share report with client and collect feedback', category: 'Client Communication', repeatFrequency: 'Monthly' },
      { comment: 'Update internal performance tracker', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
    ],
  },
  {
    id: 'prebuilt-2',
    name: 'New Client Onboarding',
    description: 'Tasks to onboard a new client onto the platform and align on strategy.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Kick-off call and introductions', category: 'Client Communication', repeatFrequency: 'Once' },
      { comment: 'Collect brand guidelines and assets', category: 'Creatives & Assets', repeatFrequency: 'Once' },
      { comment: 'Set up ad accounts and grant access', category: 'Technical Setup', repeatFrequency: 'Once' },
      { comment: 'Define goals, KPIs and reporting cadence', category: 'Strategy & Planning', repeatFrequency: 'Once' },
      { comment: 'Create onboarding summary doc and share with team', category: 'Client Communication', repeatFrequency: 'Once' },
    ],
  },
  {
    id: 'prebuilt-3',
    name: 'Campaign Launch',
    description: 'Pre-launch and go-live checklist for a new campaign.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Brief creative team on campaign requirements', category: 'Creatives & Assets', repeatFrequency: 'Once' },
      { comment: 'Set up campaign in ad platform with correct targeting', category: 'Campaign Setup', repeatFrequency: 'Once' },
      { comment: 'QA all creatives, copy and tracking links', category: 'Campaign Setup', repeatFrequency: 'Once' },
      { comment: 'Get client approval on launch plan', category: 'Client Communication', repeatFrequency: 'Once' },
      { comment: 'Launch campaign and monitor initial delivery', category: 'Campaign Optimization', repeatFrequency: 'Once' },
    ],
  },
  {
    id: 'prebuilt-4',
    name: 'Weekly Performance Review',
    description: 'Recurring weekly tasks to monitor and optimise live campaigns.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Review weekly spend vs. budget pacing', category: 'Budget Management', repeatFrequency: 'Weekly' },
      { comment: 'Check CTR, CPC and conversion metrics', category: 'Campaign Optimization', repeatFrequency: 'Weekly' },
      { comment: 'Pause underperforming ad sets and reallocate budget', category: 'Campaign Optimization', repeatFrequency: 'Weekly' },
      { comment: 'Send weekly performance update to client', category: 'Client Communication', repeatFrequency: 'Weekly' },
    ],
  },
  {
    id: 'prebuilt-5',
    name: 'Social Media Monthly Plan',
    description: 'Monthly content planning and scheduling tasks for social channels.',
    isPrebuilt: true,
    createdBy: null,
    tasks: [
      { comment: 'Plan content calendar for the month', category: 'Content Creation', repeatFrequency: 'Monthly' },
      { comment: 'Create and design post creatives', category: 'Creatives & Assets', repeatFrequency: 'Monthly' },
      { comment: 'Write captions and get client approval', category: 'Client Communication', repeatFrequency: 'Monthly' },
      { comment: 'Schedule posts across platforms', category: 'Content Creation', repeatFrequency: 'Monthly' },
      { comment: 'Review previous month engagement and refine strategy', category: 'Reporting & Analysis', repeatFrequency: 'Monthly' },
    ],
  },
  // --- Director Home Templates ---
  {
    id: 'director-daily-1',
    name: 'Portfolio KPI Review',
    description: 'Daily portfolio pacing and flag check across all T1 clients.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Director'],
    createdBy: null,
    tasks: [
      {
        name: 'Portfolio KPI Review',
        comment: 'Daily portfolio pacing and flag check across all T1 clients.',
        category: 'Portfolio KPI Review',
        repeatFrequency: 'Daily',
        steps: [
          'Scan SM-submitted daily pacing summary',
          'Check any T1 client has pacing efficiency below 80% or above 130%',
          'Check any T1 client\'s CPL is above target by 20%',
          'Note any platform outages, policy flags, or billing issues escalated by team',
          'No action on individual accounts — escalate all findings to SM',
        ],
      },
    ],
  },
  {
    id: 'director-weekly-1',
    name: 'Director Weekly Bundle',
    description: 'Weekly KPI reviews, QC, client strategy, budget sign-offs, and team check-in for Directors.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Director'],
    createdBy: null,
    tasks: [
      {
        name: 'Portfolio KPI Review',
        comment: 'Weekly KPI review — CPL / CPT target vs achieved across fleet.',
        category: 'Portfolio KPI Review',
        repeatFrequency: 'Weekly',
        steps: [
          'Review T1 clients actual CPL vs agreed target (Baja Nri, Chennai)',
          'Review Baja Auto actual CPT vs agreed target',
          'Review T2 client (Tata Group) CPL actual vs target',
          'Review T3 portfolio — flag clients consistently missing CPL target 2 weeks in a row',
          'Review total lead / conversion volume vs weekly target per client',
          'Review spend pacing across portfolio',
          'Read lead quality signals from disposition / CRM',
          'Note macro factors affecting performance',
        ],
      },
      {
        name: 'Team Output & QC',
        comment: 'QC weekly performance reports — strategic layer before client delivery.',
        category: 'Reporting & Analysis',
        repeatFrequency: 'Weekly',
        steps: [
          'Review SM-submitted weekly reports for T1 and T2 clients',
          'Check if report explains performance in context of business objective',
          'Check if risks and next actions are commercially sound and prioritised',
          'Add strategic comments where SM flagged data without interpretation',
          'Approve reports or return to SM with specific written comments',
          'Spot-check one T3 report per week',
        ],
      },
      {
        name: 'Client Strategy',
        comment: 'Provide strategic direction to client servicing for client-facing interactions.',
        category: 'Strategy & Planning',
        repeatFrequency: 'Weekly',
        steps: [
          'Brief client servicing team on strategic narrative for T1/T2 weekly interactions',
          'Flag any client where strategy needs to shift based on this week\'s performance',
          'Input on T1 clients where Director is cc\'d or expected to comment on comms',
          'Confirm strategic position before any pitch, upsell, or scope change conversation',
        ],
      },
      {
        name: 'Budget & Commercial',
        comment: 'Sign off all material budget shifts across portfolio.',
        category: 'Budget Management',
        repeatFrequency: 'Weekly',
        steps: [
          'Review budget shift proposals >15% flagged by SM for Director sign-off',
          'Validate rationale: CPL trend, lead quality, disposition data — is it justified?',
          'Approve or reject — communicate decision with clear rationale to SM same day',
          'Log all Director-level budget decisions in shared account notes',
        ],
      },
      {
        name: 'Team Management',
        comment: 'Weekly team check-in — SM and team leads.',
        category: 'Other',
        repeatFrequency: 'Weekly',
        steps: [
          'Weekly 1:1 or team standing with Senior Managers',
          'Review blockers: any client, capacity, or delivery issue that needs Director decision?',
          'Check team morale and workload — flag any team member at risk',
          'Confirm priorities for the coming week — align SM on what needs most attention',
        ],
      },
    ],
  },
  {
    id: 'director-monthly-1',
    name: 'Director Monthly Bundle',
    description: 'Monthly portfolio review, strategic direction, QC, commercial review, team development, and forward planning for Directors.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Director'],
    createdBy: null,
    tasks: [
      {
        name: 'Portfolio KPI Review',
        comment: 'Monthly portfolio KPI review — CPL / CPT target vs achieved.',
        category: 'Portfolio KPI Review',
        repeatFrequency: 'Monthly',
        steps: [
          'Review CPL / CPT actual vs agreed target for every client T1, T2, T3',
          'Identify clients missing target for 2+ consecutive months',
          'Review lead / conversion volume trend per client (growing, stable, or declining)',
          'Review lead quality trend: is % junk leads improving or deteriorating?',
          'Review spend efficiency: is the R2.5L blended revenue target being met per person?',
          'Identify clients at risk of churn based on performance trend + client feedback',
          'Identify clients showing strong performance — flag upsell or scope expansion',
        ],
      },
      {
        name: 'Client Strategy',
        comment: 'Set monthly strategic direction — input to ops team for month.',
        category: 'Strategy & Planning',
        repeatFrequency: 'Monthly',
        steps: [
          'Review monthly data pack submitted by ops team (Sr Exec / Manager level)',
          'Identify 2–3 strategic themes from the month\'s data per T1 client',
          'Flag strategic recommendations per client: what should change next month?',
          'Input on test and learn agenda: which hypotheses are worth headlining next month?',
          'Input on client servicing on strategic talking points for monthly review meetings',
          'Flag any T1 client where Director should attend the monthly review call',
        ],
      },
      {
        name: 'Team Output & QC',
        comment: 'QC monthly data inputs from ops before handoff to client servicing.',
        category: 'Reporting & Analysis',
        repeatFrequency: 'Monthly',
        steps: [
          'Review monthly data pack from ops — is data complete, accurate, and structured?',
          'Check strategic warnings section: is the interpretation commercially sound?',
          'Check next month action plan: is it prioritised by business impact?',
          'Approve data pack for handoff to client servicing — or return with comments',
          'Spot-check one T3 monthly data submission per month',
        ],
      },
      {
        name: 'Budget & Commercial',
        comment: 'Monthly commercial review — revenue, capacity, and portfolio.',
        category: 'Budget Management',
        repeatFrequency: 'Monthly',
        steps: [
          'Review total portfolio revenue vs target — are we on track for the month?',
          'Review hours per person vs R2.5L blended revenue target',
          'Review COD model efficiency: junior hours vs senior hours per tier',
          'Identify accounts over-serviced relative to their revenue contribution',
          'Identify accounts under-serviced — risk to retention',
          'Agree resourcing plan for the coming month with SM',
        ],
      },
      {
        name: 'Team Management',
        comment: 'Monthly team performance and development review.',
        category: 'Other',
        repeatFrequency: 'Monthly',
        steps: [
          'Review output quality per team member — based on SM feedback',
          'Check if any team member\'s performance volume is declining',
          'Review test and learn results: are the team generating meaningful hypotheses?',
          'Set priorities and goals for the team for next month',
          'Celebrate wins — share top performance moments across the team',
        ],
      },
      {
        name: 'Internal & Planning',
        comment: 'Forward planning — next month strategy and commercial pipeline.',
        category: 'Strategy & Planning',
        repeatFrequency: 'Monthly',
        steps: [
          'Review any upcoming client briefs, campaigns, or seasonal moments',
          'Flag resource needs before they become delivery problems',
          'Identify new business or upsell opportunities from this month\'s performance',
          'Review platform updates, product changes, or market developments relevant to client strategy',
        ],
      },
    ],
  },

  // --- Snr Executive / Executive / Intern Home Templates ---
  {
    id: 'snr-exec-daily-1',
    name: 'Sr Exec Daily Bundle',
    description: 'Daily pacing checks, conversion monitoring, and platform signal reviews for Sr Executives.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Snr Executive', 'Executive', 'Intern'],
    createdBy: null,
    tasks: [
      {
        name: 'Budget & planning check — all active campaigns',
        comment: 'Daily pacing check across all active campaigns — flag issues to Manager by 2 PM.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Daily',
        steps: [
          'Flag campaigns pacing >130% or <70% spend by 2 PM',
          'Flag campaigns where CPL is more than 15% above target',
          'Flag any campaign with zero spend before midday',
          'Note any disapproved ads, billing holds, or platform errors',
          'Alert Manager to any critical pacing or spend issue immediately',
        ],
      },
      {
        name: 'Conversion volume intraday check',
        comment: 'Check conversion volume across all accounts by midday — flag anomalies to Manager.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Daily',
        steps: [
          'Flag any account with zero conversions by 12 PM',
          'Cross-check with last week\'s same-day conversion volume for context',
          'Flag tracking discrepancies between platform, GA, and CRM where visible',
          'Alert Manager if conversion drop exceeds 30% week-on-week',
        ],
      },
      {
        name: 'Learning phase monitoring (Meta)',
        comment: 'Flag Meta ad sets in Learning phase and avoid edits that reset the learning clock.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Daily',
        steps: [
          'Flag any ad sets currently showing "Learning" status in Meta Ads Manager',
          'Check if learning phase was triggered by a recent edit — note what changed',
          'Avoid further edits to learning ad sets unless directed by Manager',
          'Log all learning-phase ad sets and expected exit date in daily tracker',
        ],
      },
      {
        name: 'Smart Bidding signals check (Google)',
        comment: 'Check Google accounts for bid strategy learning status and flag instability to Manager.',
        category: 'Internal & Strategy',
        repeatFrequency: 'Daily',
        steps: [
          'Flag any Google accounts showing "Learning" or "Learning Limited" bid strategy status',
          'Check if bid strategy or target was changed in the last 7 days',
          'Confirm conversion volume — tCPA / tROAS needs 30+ conversions in last 30 days',
          'Escalate to Manager if any account has been in learning phase for more than 5 days',
        ],
      },
    ],
  },
  {
    id: 'snr-exec-weekly-1',
    name: 'Sr Exec Weekly Bundle',
    description: 'Weekly SQR review, placement exclusions, creative checks, quality scores, bid adjustments, budget reviews, and report drafts for Sr Executives.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Snr Executive', 'Executive', 'Intern'],
    createdBy: null,
    tasks: [
      {
        name: 'Search Term Report (SQR) — full review',
        comment: 'Download and review last 7 days SQR — submit proposed negatives to Manager for approval.',
        category: 'Search Term Analysis',
        repeatFrequency: 'Weekly',
        steps: [
          'Download last 7 days SQR from Google Ads (min 5 clicks filter)',
          'Apply irrelevant / low-intent query filter — flag for negatives',
          'Identify high-intent queries to upgrade to exact match or add as keywords',
          'Cross-check proposed negatives: confirm none risk blocking converting queries',
          'Submit proposed negative additions to Manager for approval before applying',
          'Log all new keyword additions in keyword tracker',
        ],
      },
      {
        name: 'GDN/PMax placement exclusions',
        comment: 'Review GDN and PMax placement reports — flag low-quality placements for exclusion.',
        category: 'Placement & Exclusions',
        repeatFrequency: 'Weekly',
        steps: [
          'Download placement report for all GDN and PMax campaigns (last 7 days)',
          'Flag placements with zero conversions and spend above 1x CPL target',
          'Flag app placements, parked domains, and clearly low-quality sites',
          'Share proposed exclusion list with Manager for approval before applying',
          'Log all confirmed exclusions in placement exclusion tracker',
        ],
      },
      {
        name: 'Meta creative performance review',
        comment: 'Review Meta ad performance by creative — flag underperformers and recommend refresh.',
        category: 'Placement & Exclusions',
        repeatFrequency: 'Weekly',
        steps: [
          'Pull creative performance by ad for last 7 days: CPL, CTR, Frequency',
          'Flag ads with Frequency >3 and declining CTR — recommend pausing',
          'Flag ads where CPL exceeds account target by 20%+',
          'Identify top-performing creative hooks and note for next brief',
          'Share recommendations with Manager before making any changes',
        ],
      },
      {
        name: 'Meta combined performance review',
        comment: 'Review Meta campaign and ad set performance holistically — CPL, volume, and audience fatigue.',
        category: 'Placement & Exclusions',
        repeatFrequency: 'Weekly',
        steps: [
          'Pull ad set level data: CPL, volume, CTR, and CPM trends',
          'Flag ad sets showing audience fatigue (rising CPM + falling CTR)',
          'Flag ad sets with conversion volume below 5 for the week — consider pausing or consolidating',
          'Note best-performing audience + creative combinations for scaling discussion with Manager',
        ],
      },
      {
        name: 'Quality Score analysis',
        comment: 'Review keyword-level Quality Scores across Google accounts — flag low scores to Manager.',
        category: 'Quality & Bid Strategy',
        repeatFrequency: 'Weekly',
        steps: [
          'Pull Quality Score report for all active keywords across Google accounts',
          'Flag keywords with QS ≤4 — note which component is failing (CTR, relevance, landing page)',
          'Cross-check low-QS keywords against ad copy and landing page alignment',
          'Submit recommendations to Manager: pause, rewrite ad copy, or improve landing page',
        ],
      },
      {
        name: 'Auction Insights report',
        comment: 'Review Auction Insights across key campaigns — flag competitor movement to Manager.',
        category: 'Quality & Bid Strategy',
        repeatFrequency: 'Weekly',
        steps: [
          'Pull Auction Insights report for T1/T2 campaigns (last 7 days)',
          'Compare impression share, overlap rate, and outranking share vs key competitors',
          'Flag any competitor with significant increase in impression share week-on-week',
          'Note if our impression share has dropped — flag to Manager with budget or bid context',
        ],
      },
      {
        name: 'Device-level CPL adjustments',
        comment: 'Review device-level CPL performance and propose bid modifier adjustments to Manager.',
        category: 'Quality & Bid Strategy',
        repeatFrequency: 'Weekly',
        steps: [
          'Pull device performance report (last 14 days): desktop, mobile, tablet',
          'Flag devices where CPL exceeds target by 20% or more',
          'Calculate recommended bid modifier adjustment — share with Manager for approval',
          'Log current modifiers and proposed changes in bid adjustment tracker',
        ],
      },
      {
        name: 'Geo / device CPL alignment',
        comment: 'Review geo and device CPL vs targets — flag and propose adjustments to Manager.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Weekly',
        steps: [
          'Pull geographic performance breakdown (last 14 days): CPL, volume, conversion rate',
          'Flag locations with CPL >20% above target',
          'Flag locations delivering high volume at or below CPL — flag for potential budget increase',
          'Submit geo bid modifier recommendations to Manager before any changes',
        ],
      },
      {
        name: 'Budget adjustments & disposition review',
        comment: 'Review weekly spend pacing and disposition data — propose budget shifts to Manager.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Weekly',
        steps: [
          'Check weekly spend pacing per campaign vs agreed monthly budget allocation',
          'Review disposition data: lead quality signals from CRM / client feedback',
          'Identify campaigns underspending on high-quality conversion sources — flag for budget increase',
          'Prepare budget reallocation proposal for Manager with clear rationale (CPL, quality, volume)',
          'Log all proposed changes in recommendation tab — do not implement without Manager sign-off',
        ],
      },
      {
        name: 'Weekly performance report — draft',
        comment: 'Draft weekly performance report for all accounts — submit to Manager for QC before client send.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Weekly',
        steps: [
          'Pull weekly KPIs: spend, CPL, CPT, conversion volume vs target per account',
          'Write narrative: explain what drove performance this week (not just data)',
          'Flag risks and recommended next actions — commercially framed',
          'Include disposition data or lead quality notes where available',
          'Submit to Manager for QC review — must be approved before client send',
        ],
      },
      {
        name: 'Client call — preparation & delivery',
        comment: 'Prepare weekly client call agenda and attend call — notes submitted to Manager within 2 hours.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Weekly',
        steps: [
          'Prepare call agenda: key metrics, wins, risks, and next steps',
          'Confirm latest data is pulled and slides / report are ready before call',
          'Attend weekly client call — dial in, take notes, and log action items',
          'Send call summary with all actions and owners within 2 hours of call ending',
          'Flag any client risk signals or concerns to Manager immediately after call',
        ],
      },
    ],
  },
  {
    id: 'snr-exec-monthly-1',
    name: 'Sr Exec Monthly Bundle',
    description: 'Monthly SQR audit, keyword review, creative brief, bid strategy, tracking audit, reconciliation, disposition analysis, monthly deck, account health, and test roadmap for Sr Executives.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Snr Executive', 'Executive', 'Intern'],
    createdBy: null,
    tasks: [
      {
        name: 'End-of-month SQR & negative keyword audit',
        comment: 'Full month SQR review — clean up negatives and surface structural keyword insights.',
        category: 'Search Term Analysis',
        repeatFrequency: 'Monthly',
        steps: [
          'Download full month SQR across all Google accounts',
          'Identify recurring irrelevant queries — propose permanent negative additions',
          'Identify high-converting queries not yet captured as keywords — flag for addition',
          'Review current negative keyword lists — flag outdated or overly broad negatives',
          'Submit full audit to Manager for review before any changes are applied',
        ],
      },
      {
        name: 'Keyword structural review & restructure',
        comment: 'Review keyword structure across campaigns — flag low performers and gaps to Manager.',
        category: 'Search Term Analysis',
        repeatFrequency: 'Monthly',
        steps: [
          'Pull keyword performance report (last 30 days): impressions, clicks, conversions, CPL',
          'Flag keywords with zero conversions and spend >1x CPL — recommend pause',
          'Flag keyword duplication across ad groups — propose consolidation',
          'Identify gaps: high-intent queries not covered by current keyword set',
          'Submit restructure recommendations to Manager with rationale',
        ],
      },
      {
        name: 'Creative refresh & monthly creative brief',
        comment: 'Identify creatives due for refresh and submit monthly brief to Manager / client.',
        category: 'Placement & Exclusions',
        repeatFrequency: 'Monthly',
        steps: [
          'Pull creative performance for the month — identify ads with Frequency >5 or falling CTR',
          'Flag all creatives running for 4+ weeks without refresh',
          'Note top-performing hooks, formats, and angles from the month',
          'Draft creative brief with performance insights — submit to Manager for approval',
          'Follow up on brief delivery timeline with Manager before end of month',
        ],
      },
      {
        name: 'Bid strategy review & TCPA calibration',
        comment: 'Review bid strategy performance and prepare TCPA calibration proposals for Manager sign-off.',
        category: 'Quality & Bid Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Pull bid strategy performance report: target vs actual CPL / CPT / ROAS per account',
          'Validate conversion volume: 30+ conversions in last 30 days before proposing any change',
          'Identify accounts where tCPA needs calibration — calculate proposed new target',
          'Prepare calibration proposal with rationale — submit to Manager for approval',
          'Do not implement any target changes without Manager sign-off',
        ],
      },
      {
        name: 'Conversion tracking & pixel / tag audit',
        comment: 'Audit all conversion tracking across platforms — flag discrepancies to Manager.',
        category: 'Quality & Bid Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Verify all conversion actions are firing correctly across Google Ads and Meta',
          'Cross-check platform conversion data vs GA vs CRM (last 30 days)',
          'Flag any tracking gaps, double-counting, or discrepancies',
          'Check pixel / tag is correctly installed on all key landing pages',
          'Submit tracking audit report to Manager — flag any action items',
        ],
      },
      {
        name: 'Full recon & process audit',
        comment: 'Full monthly account reconciliation — spend, billing, and process compliance check.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Monthly',
        steps: [
          'Reconcile total spend per account vs agreed monthly budget',
          'Identify overspend or underspend vs target — note cause and corrective action',
          'Check all billing accounts are active and no credit limit issues are flagged',
          'Confirm all budget changes made this month are logged in recommendation tab',
          'Submit recon summary to Manager before end-of-month close',
        ],
      },
      {
        name: 'Full disposition & lead quality analysis',
        comment: 'Analyse lead quality and disposition signals for the month — submit insights to Manager.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Monthly',
        steps: [
          'Pull disposition data from CRM: lead quality breakdown by campaign / source',
          'Calculate % junk leads per campaign — flag campaigns with junk rate >30%',
          'Identify campaigns delivering the highest quality leads at or below CPL target',
          'Prepare disposition analysis and recommendation — submit to Manager',
          'Flag any accounts where lead quality trend is deteriorating month-on-month',
        ],
      },
      {
        name: 'Monthly review deck — draft',
        comment: 'Draft monthly performance review deck for all accounts — submit to Manager for QC.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Monthly',
        steps: [
          'Pull monthly KPIs: spend, CPL, CPT, conversion volume vs target per account',
          'Build data section: charts and tables for all key metrics',
          'Write narrative: learnings, key wins, risks, and recommended next steps',
          'Include disposition insights and test & learn results where applicable',
          'Submit draft to Manager for QC and strategic layer before client delivery',
        ],
      },
      {
        name: 'Account health audit',
        comment: 'Conduct monthly account health audit across all accounts — flag issues to Manager.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Monthly',
        steps: [
          'Check account structure: campaign, ad group, and keyword organisation',
          'Review ad copy freshness: flag ads running unchanged for 60+ days',
          'Check audience lists, remarketing tags, and customer match uploads',
          'Review extensions / assets: sitelinks, callouts, structured snippets up to date?',
          'Submit audit findings to Manager — flag any structural issues needing sign-off',
        ],
      },
      {
        name: 'Test & learn roadmap — inputs',
        comment: 'Submit monthly test & learn hypotheses to Manager for roadmap inclusion.',
        category: 'Internal & Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Review account performance data — identify one clear hypothesis to test next month',
          'Confirm hypothesis is specific: one variable isolated, clear success metric defined',
          'Draft test proposal: hypothesis, method, duration, and expected outcome',
          'Submit to Manager for approval before adding to roadmap',
          'Review results of any tests that concluded this month — document learnings',
        ],
      },
    ],
  },

  // --- Manager Home Templates ---
  {
    id: 'manager-weekly-1',
    name: 'Manager Weekly Bundle',
    description: 'Weekly QC, budget approvals, SQR review, and T3 client calls for Managers.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Manager'],
    createdBy: null,
    tasks: [
      {
        name: 'QC — weekly performance report before client',
        comment: 'QC Sr Exec weekly report draft for accuracy and narrative before client send.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Weekly',
        steps: [
          'Review Sr Exec draft for data accuracy and correct metrics',
          'Check narrative: does it clearly explain what moved and why?',
          'Ensure risks and next actions are commercially sound',
          'Return with comments or approve — must be done before client send',
          'Add strategic context where Sr Exec has flagged numbers only',
        ],
      },
      {
        name: 'Approve and execute budget adjustments',
        comment: 'Review Sr Exec budget reallocation recommendation and approve or action.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Weekly',
        steps: [
          'Review Sr Exec budget reallocation recommendation',
          'Validate against disposition data and lead quality findings',
          'Approve, modify, or reject — communicate rationale to Sr Exec',
          'Action approved shifts or direct Sr Exec to implement',
          'Log decision in recommendation tab',
        ],
      },
      {
        name: 'QC — SQR negative additions before applying',
        comment: 'Review and approve negative keyword recommendations from Sr Exec before applying.',
        category: 'Search Term Analysis',
        repeatFrequency: 'Weekly',
        steps: [
          'Review all negative keyword recommendations from Sr Exec',
          'Check: do any negatives risk blocking converting queries?',
          'Approve list and direct Sr Exec to implement',
          'Add any additional negatives identified in review',
        ],
      },
      {
        name: 'Lead T3 client call',
        comment: 'Lead weekly T3 client call — Sr Exec to dial in and take notes.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Weekly',
        steps: [
          'Review call agenda prepared by Sr Exec',
          'Lead 30-min weekly call — Sr Exec to dial in and take notes',
          'Send call summary with actions within 2 hours',
          'Flag any client risk signals to SM after call',
        ],
      },
    ],
  },
  {
    id: 'manager-monthly-1',
    name: 'Manager Monthly Bundle',
    description: 'Monthly review deck, bid strategy approval, and account health audit sign-off for Managers.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Manager'],
    createdBy: null,
    tasks: [
      {
        name: 'Build and present monthly review deck (T3)',
        comment: 'QC, build, and present the monthly review deck for T3 clients.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Monthly',
        steps: [
          'QC Sr Exec data inputs and narrative draft',
          'Add strategic layer: what do the learnings mean for next month?',
          'Build executive summary slide: 5 bullets, leadership-ready',
          'Present to T3 client — Sr Exec to support on data queries',
          'Debrief with Sr Exec post-call: what to improve next month',
        ],
      },
      {
        name: 'Approve bid strategy changes',
        comment: 'Review and approve TCPA calibration proposals from Sr Exec before any changes.',
        category: 'Quality & Bid Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Review TCPA calibration proposals from Sr Exec',
          'Validate: 30+ conversions in 30 days before switching',
          'Approve target CPL / CPT — sign off before any changes made',
          'Monitor for 14 days post-change — flag instability to SM',
        ],
      },
      {
        name: 'Account health audit — review and sign-off',
        comment: 'Review Sr Exec account audit, add recommendations, and sign off before client / SM.',
        category: 'Internal & Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Review Sr Exec account audit submission',
          'Add structural recommendations where needed',
          'Flag any accounts showing churn risk signals to SM',
          'Sign off audit before it goes to client / SM',
        ],
      },
    ],
  },

  // --- Snr Manager Home Templates ---
  {
    id: 'snr-manager-weekly-1',
    name: 'Snr Manager Weekly Bundle',
    description: 'Weekly QC, client calls, and budget approvals for Senior Managers across T1/T2 accounts.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Snr Manager'],
    createdBy: null,
    tasks: [
      {
        name: 'QC — T1/T2 weekly report before client send',
        comment: 'QC Manager-submitted weekly report for commercial framing before client delivery.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Weekly',
        steps: [
          'Review Manager-QC\'d report for commercial framing and accuracy',
          'Check: does the narrative explain performance in client-friendly language?',
          'Ensure strategic recommendations are present — not just data',
          'Approve or return to Manager with specific comments',
          'T1: also pass to Director for final sign-off before sending',
        ],
      },
      {
        name: 'Lead T1/T2 client call',
        comment: 'Lead weekly client call for T1/T2 accounts — Manager to dial in, notes taken.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Weekly',
        steps: [
          'Review agenda and latest metrics before call',
          'Lead 30-min call — Manager to dial in, Sr Exec takes notes',
          'T1: Director to join key calls (strategy, monthly, escalation)',
          'Send call summary with actions within 2 hours',
          'Flag any client risk to Director after call',
        ],
      },
      {
        name: 'QC — budget adjustment approvals (T1/T2)',
        comment: 'Review and approve Manager\'s budget reallocation proposals for T1/T2.',
        category: 'Budget & Disposition',
        repeatFrequency: 'Weekly',
        steps: [
          'Review Manager\'s budget reallocation proposal for T1/T2',
          'Cross-check against disposition quality data and CPL trends',
          'Approve, modify, or escalate to Director if >15% total shift',
          'Ensure changes are commercially justified and logged',
        ],
      },
    ],
  },
  {
    id: 'snr-manager-monthly-1',
    name: 'Snr Manager Monthly Bundle',
    description: 'Monthly review deck, bid strategy sign-off, test roadmap approval, and client health review for Senior Managers.',
    isPrebuilt: true,
    isHomeTemplate: true,
    targetRoles: ['Snr Manager'],
    createdBy: null,
    tasks: [
      {
        name: 'Build and present monthly review deck (T1/T2)',
        comment: 'Build, QC, and present the monthly review deck for T1/T2 clients.',
        category: 'Reporting & Calls',
        repeatFrequency: 'Monthly',
        steps: [
          'QC Sr Exec draft — check all data, narrative, and structure',
          'Add strategic layer: learnings, test results, next month plan',
          'Build executive summary slide: 5 bullets, leadership-ready',
          'T1: Director to present / co-present — SM to support',
          'T2: SM to present — Manager to support on data queries',
          'Debrief with team post-call',
        ],
      },
      {
        name: 'Sign off bid strategy changes (T1/T2)',
        comment: 'Review and approve Manager\'s TCPA calibration and bid strategy proposals.',
        category: 'Quality & Bid Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Review Manager\'s TCPA calibration proposals',
          'Validate conversion volume: 30+ in 30 days minimum',
          'Approve target — document rationale in account notes',
          'Monitor post-change performance for 14 days',
          'Escalate to Director if Smart Bidding causes material volume drop',
        ],
      },
      {
        name: 'Test & learn roadmap approval',
        comment: 'Review and approve test proposals from Manager / Sr Exec before running.',
        category: 'Internal & Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Review test proposals submitted by Manager / Sr Exec',
          'Challenge: is hypothesis clear? Is only one variable isolated?',
          'Approve, modify, or defer tests',
          'Update test roadmap and share with Director monthly',
        ],
      },
      {
        name: 'Capacity & client health review',
        comment: 'Review team hours vs budget and flag over-serviced or at-risk accounts.',
        category: 'Internal & Strategy',
        repeatFrequency: 'Monthly',
        steps: [
          'Review hours logged per client vs hours budgeted for the month',
          'Flag over-serviced accounts relative to revenue',
          'Flag accounts showing early churn signals — share plan with Director',
          'Update client health tracker: RAG status per client',
          'Raise resourcing needs before they become delivery issues',
        ],
      },
    ],
  },
];

const MicrosoftProfileSetup = ({ firebaseUser, departments, regions, onComplete, onSignOut }) => {
  const [department, setDepartment] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const displayName = firebaseUser.displayName || firebaseUser.email.split('@')[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!department) { setError('Please select your department.'); return; }
    if (!region) { setError('Please select your region.'); return; }
    setSaving(true);
    setError('');
    try {
      await onComplete({ department, region });
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="relative min-h-screen w-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'radial-gradient(58% 72% at 8% 16%, rgba(241, 94, 88, 0.92) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(52% 64% at 52% 88%, rgba(82, 110, 255, 0.78) 0%, rgba(82, 110, 255, 0) 66%), linear-gradient(140deg, #eb6f7a 0%, #c86ea0 33%, #8c7fd1 58%, #8ca3d4 74%, #d5dca8 100%)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/35 bg-white/90 shadow-2xl backdrop-blur-xl p-10">
        <div className="mb-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 mb-4">
            <svg className="h-7 w-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Complete Your Profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Welcome, <strong className="text-slate-700">{displayName}</strong>! Select your department and region to get started.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">Department</label>
            <select value={department} onChange={e => setDepartment(e.target.value)} className={inputCls} required>
              <option value="">Select department…</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">Region</label>
            <select value={region} onChange={e => setRegion(e.target.value)} className={inputCls} required>
              <option value="">Select region…</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs text-indigo-700">
              <span className="font-bold">Employee access.</span> Your manager will assign clients and update your role once your account is reviewed.
            </p>
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-rose-500 via-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {saving ? 'Setting up…' : 'Continue to Workspace'}
          </button>
        </form>

        <button onClick={onSignOut} className="mt-4 w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
};

// Detect if this window was opened as a popup (e.g. by our MS login flow).
// We render a minimal "Completing sign-in…" screen so the user doesn't see
// the full login page flash inside the popup.
const isPopupWindow = (() => {
  try { return !!window.opener && window.opener !== window; } catch { return false; }
})();

// ---------------------------------------------------------------------------
// PKCE helpers for the custom Microsoft popup login flow.
// We build the auth URL ourselves and communicate via postMessage so the flow
// works even inside sandboxed iframes (MSAL's popup monitor does not).
// ---------------------------------------------------------------------------

async function generatePkce() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hashed)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [msLoginPending, setMsLoginPending] = useState(false);
  const [msLoginStatus, setMsLoginStatus] = useState('');

  // True when this window was opened by Microsoft's redirect after auth.
  // We detect it once at init time (before React clears the URL).
  const [isAuthRedirectMode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return !!(p.get('code') && p.get('state'));
  });
  const [msAuthRedirectError, setMsAuthRedirectError] = useState('');

  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [taskCategories, setTaskCategories] = useState(DEFAULT_TASK_CATEGORIES);
  const [departments, setDepartments] = useState([]);
  const [regions, setRegions] = useState([]);
  const DEFAULT_CC_TAB_ACCESS = { users: ['Super Admin', 'Director'], clients: ['Super Admin', 'Director'], categories: ['Super Admin', 'Director'], departments: ['Super Admin', 'Director'], regions: ['Super Admin', 'Director'], conditions: ['Super Admin'], templates: ['Super Admin', 'Director'], checklistTemplates: ['Super Admin', 'Director'], feedback: ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM', 'Employee', 'Snr Executive', 'Executive', 'Intern'] };
  const [controlCenterTabAccess, setControlCenterTabAccess] = useState(DEFAULT_CC_TAB_ACCESS);
  const [userManagementAccessRoles, setUserManagementAccessRoles] = useState(['Super Admin', 'Director']);
  const [employeeViewAccessRoles, setEmployeeViewAccessRoles] = useState(['Super Admin', 'Director']);
  const [teamViewAccessRoles, setTeamViewAccessRoles] = useState(['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Asst Manager', 'Project Manager', 'CSM']);
  const [metricsAccessRoles, setMetricsAccessRoles] = useState(['Super Admin', 'Director']);
  const [reportsAccessRoles, setReportsAccessRoles] = useState(['Super Admin', 'Director']);
  const [metricsAllDataRoles, setMetricsAllDataRoles] = useState(['Super Admin', 'Director']);
  const [reportsAllDataRoles, setReportsAllDataRoles] = useState(['Super Admin', 'Director']);
  const [clientLogs, setClientLogs] = useState({});
  const [taskTemplates, setTaskTemplates] = useState(DEFAULT_TASK_TEMPLATES);
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [checklistAccessRoles, setChecklistAccessRoles] = useState(['Super Admin', 'Director']);
  const [taskGroups, setTaskGroups] = useState([]);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [digestGlobalEnabled, setDigestGlobalEnabled] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState({});
  const DEFAULT_HIERARCHY_ORDER = ['Director', 'Snr Manager', 'Manager', 'Asst Manager', 'Snr Executive', 'Executive', 'Employee', 'Intern'];
  const [hierarchyOrder, setHierarchyOrder] = useState(DEFAULT_HIERARCHY_ORDER);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Permissions system active", time: "Just now", read: false },
  ]);

  const [selectedClient, setSelectedClient] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [testModeUserId, setTestModeUserId] = useState(null);

  // --- FIREBASE AUTH LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setCurrentUserId(null);
      }
    });
    return unsubscribe;
  }, []);




  // --- Pre-login fetch: load regions & departments so the registration form is accurate ---
  useEffect(() => {
    const fetchPublicLists = async () => {
      try {
        const [dSnap, rSnap] = await Promise.all([
          get(ref(db, 'departments')),
          get(ref(db, 'regions')),
        ]);
        if (dSnap.exists()) {
          const val = dSnap.val();
          setDepartments(Array.isArray(val) ? val : Object.values(val));
        }
        if (rSnap.exists()) {
          const val = rSnap.val();
          setRegions(Array.isArray(val) ? val : Object.values(val));
        }
      } catch {
        // Non-critical — logged-in listeners will populate these after sign-in
      }
    };
    fetchPublicLists();
  }, []);

  // --- FIREBASE DATA SYNC (read once on auth) ---
  useEffect(() => {
    if (!firebaseUser) return;

    const syncRef = (path, setter) => {
      const dbRef = ref(db, path);
      return onValue(dbRef, (snapshot) => {
        const val = snapshot.val();
        if (val !== null && val !== undefined) setter(val);
      });
    };

    // Seed DEFAULT_USERS into Firebase; also upsert test users by email
    const seedUsers = async () => {
      const snap = await get(ref(db, 'users'));
      if (!snap.exists()) {
        await set(ref(db, 'users'), DEFAULT_USERS);
      }
    };
    seedUsers();

    // Seed DEFAULT_TASK_TEMPLATES into Firebase; merge-add any missing prebuilt IDs
    const seedTaskTemplates = async () => {
      try {
        const snap = await get(ref(db, 'taskTemplates'));
        const existing = snap.val();
        if (!existing) {
          await set(ref(db, 'taskTemplates'), DEFAULT_TASK_TEMPLATES);
          return;
        }
        const existingList = Array.isArray(existing) ? existing : Object.values(existing);
        const existingIds = new Set(existingList.map(t => t.id));
        const missing = DEFAULT_TASK_TEMPLATES.filter(t => !existingIds.has(t.id));
        if (missing.length > 0) {
          await set(ref(db, 'taskTemplates'), [...existingList, ...missing]);
        }
      } catch (err) {
        console.error('[PMT] Failed to seed task templates into Firebase:', err);
      }
    };
    seedTaskTemplates();

    // Migrate category data: if Firebase has legacy string arrays, write back as objects
    const migrateCategoriesInFirebase = async () => {
      const snap = await get(ref(db, 'taskCategories'));
      if (!snap.exists()) {
        await set(ref(db, 'taskCategories'), sanitizeForFirebase(DEFAULT_TASK_CATEGORIES));
        return;
      }
      const val = snap.val();
      const list = Array.isArray(val) ? val : null;
      if (list && list.some(item => typeof item === 'string')) {
        // Legacy string format detected — migrate and persist
        const migrated = migrateCategoryList(list);
        await set(ref(db, 'taskCategories'), sanitizeForFirebase(migrated));
      }
    };
    migrateCategoriesInFirebase();

    // Seed default departments & regions only if they don't exist yet.
    // Never force-add items to an existing list — admins manage the lists via Control Centre.
    const SEED_DEPARTMENTS = ['Analytics', 'Biddable', 'Client Servicing', 'Content', 'Creative', 'Growth', 'Performance', 'SEO', 'Technology'];
    const SEED_REGIONS = ['North', 'South', 'West'];

    const seedDepartmentsRegions = async () => {
      const dSnap = await get(ref(db, 'departments'));
      if (!dSnap.exists()) {
        await set(ref(db, 'departments'), SEED_DEPARTMENTS);
      }

      const rSnap = await get(ref(db, 'regions'));
      if (!rSnap.exists()) {
        await set(ref(db, 'regions'), SEED_REGIONS);
      }
    };
    seedDepartmentsRegions();

    // Seed /checklistTemplates as empty array if the path doesn't exist yet.
    // Also seed /settings/conditions/checklistAccess with default roles if absent.
    const seedChecklistPaths = async () => {
      try {
        const [ctSnap, caSnap] = await Promise.all([
          get(ref(db, 'checklistTemplates')),
          get(ref(db, 'settings/conditions/checklistAccess')),
        ]);
        if (!ctSnap.exists()) {
          await set(ref(db, 'checklistTemplates'), []);
        }
        if (!caSnap.exists()) {
          await set(ref(db, 'settings/conditions/checklistAccess'), ['Super Admin', 'Director']);
        }
      } catch (err) {
        console.error('[PMT] Failed to seed checklist paths:', err);
      }
    };
    seedChecklistPaths();

    // Only mark DB as ready after the first real users payload arrives —
    // previously setDbReady(true) ran synchronously before any data came back,
    // which caused the "Access Not Set Up" screen to flash during load.
    let dbReadyOnce = false;

    const unsubs = [
      syncRef('users', (val) => {
        const firebaseList = Array.isArray(val) ? val : Object.values(val);
        setUsers(firebaseList);
        if (!dbReadyOnce) { dbReadyOnce = true; setDbReady(true); }
      }),
      syncRef('clients', (val) => setClients(Array.isArray(val) ? val : Object.values(val))),
      syncRef('clientLogs', (val) => setClientLogs(val || {})),
      syncRef('taskCategories', (val) => setTaskCategories(migrateCategoryList(val))),
      syncRef('taskTemplates', (val) => setTaskTemplates(Array.isArray(val) ? val : Object.values(val))),
      syncRef('departments', (val) => setDepartments(Array.isArray(val) ? val : Object.values(val))),
      syncRef('regions', (val) => setRegions(Array.isArray(val) ? val : Object.values(val))),
      syncRef('controlCenterTabAccess', (val) => { if (val && typeof val === 'object' && !Array.isArray(val)) setControlCenterTabAccess(prev => ({ ...prev, ...val })); }),
      syncRef('userManagementAccessRoles', (val) => setUserManagementAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('employeeViewAccessRoles', (val) => setEmployeeViewAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('teamViewAccessRoles', (val) => setTeamViewAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Asst Manager', 'Project Manager', 'CSM'])),
      syncRef('metricsAccessRoles', (val) => setMetricsAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('reportsAccessRoles', (val) => setReportsAccessRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('metricsAllDataRoles', (val) => setMetricsAllDataRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('reportsAllDataRoles', (val) => setReportsAllDataRoles(Array.isArray(val) ? val : ['Super Admin', 'Director'])),
      syncRef('feedbackItems', (val) => setFeedbackItems(val && typeof val === 'object' ? (Array.isArray(val) ? val : Object.values(val)) : [])),
      syncRef('checklistTemplates', (val) => { if (val && typeof val === 'object') setChecklistTemplates(Array.isArray(val) ? val : Object.values(val)); }),
      syncRef('settings/conditions/checklistAccess', (val) => { if (Array.isArray(val)) setChecklistAccessRoles(val); }),
      syncRef('taskGroups', (val) => { if (val && typeof val === 'object') setTaskGroups(Array.isArray(val) ? val : Object.values(val)); }),
      syncRef('settings/hierarchyOrder', (val) => { if (Array.isArray(val) && val.length > 0) setHierarchyOrder(val); }),
      syncRef('settings/notifications', (val) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          setNotificationSettings(val);
          if (typeof val['weekly-digest']?.enabled === 'boolean') {
            setDigestGlobalEnabled(val['weekly-digest'].enabled);
          }
        }
      }),
    ];

    return () => unsubs.forEach(u => u());
  }, [firebaseUser]);

  // --- FIREBASE WRITE HELPERS ---
  // Firebase rejects `undefined` values — replace them recursively with `null`
  const sanitizeForFirebase = (value) => {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitizeForFirebase);
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeForFirebase(v)])
    );
  };

  const persistUsers = (nextUsers) => {
    setUsers(nextUsers);
    if (firebaseUser) set(ref(db, 'users'), sanitizeForFirebase(nextUsers));
  };
  const persistClients = (nextClients) => {
    setClients(nextClients);
    if (firebaseUser) set(ref(db, 'clients'), sanitizeForFirebase(nextClients));
  };
  const persistClientLogs = (nextLogs) => {
    setClientLogs(nextLogs);
    if (firebaseUser) set(ref(db, 'clientLogs'), sanitizeForFirebase(nextLogs));
  };
  const persistTaskCategories = (val) => {
    setTaskCategories(val);
    if (firebaseUser) set(ref(db, 'taskCategories'), sanitizeForFirebase(val));
  };
  const persistTaskTemplates = (val) => {
    setTaskTemplates(val);
    if (firebaseUser) {
      set(ref(db, 'taskTemplates'), sanitizeForFirebase(val))
        .catch(err => console.error('[PMT] Failed to save templates to Firebase:', err));
    } else {
      console.warn('[PMT] persistTaskTemplates called without firebaseUser — Firebase write skipped');
    }
  };
  const persistDigestGlobal = (enabled) => {
    setDigestGlobalEnabled(enabled);
    // Use persistNotificationSetting pattern to merge — avoids wiping scheduleTimezone/scheduleHour
    setNotificationSettings(prev => {
      const updated = { ...(prev['weekly-digest'] || {}), enabled };
      if (firebaseUser) set(ref(db, 'settings/notifications/weekly-digest'), sanitizeForFirebase(updated));
      return { ...prev, 'weekly-digest': updated };
    });
  };
  const persistNotificationSetting = (eventType, patch) => {
    setNotificationSettings(prev => {
      const updated = { ...(prev[eventType] || {}), ...patch };
      if (firebaseUser) set(ref(db, `settings/notifications/${eventType}`), sanitizeForFirebase(updated));
      return { ...prev, [eventType]: updated };
    });
  };
  const persistDepartments = (val, prevVal) => {
    setDepartments(val);
    if (firebaseUser) set(ref(db, 'departments'), sanitizeForFirebase(val)).catch(() => {
      if (prevVal !== undefined) setDepartments(prevVal);
    });
  };
  const persistRegions = (val, prevVal) => {
    setRegions(val);
    if (firebaseUser) set(ref(db, 'regions'), sanitizeForFirebase(val)).catch(() => {
      if (prevVal !== undefined) setRegions(prevVal);
    });
  };
  const persistControlCenterTabAccess = (val) => {
    setControlCenterTabAccess(val);
    if (firebaseUser) set(ref(db, 'controlCenterTabAccess'), sanitizeForFirebase(val));
  };
  const persistUserManagementRoles = (val) => {
    setUserManagementAccessRoles(val);
    if (firebaseUser) set(ref(db, 'userManagementAccessRoles'), val);
  };
  const persistEmployeeViewRoles = (val) => {
    setEmployeeViewAccessRoles(val);
    if (firebaseUser) set(ref(db, 'employeeViewAccessRoles'), val);
  };
  const persistTeamViewRoles = (val) => {
    setTeamViewAccessRoles(val);
    if (firebaseUser) set(ref(db, 'teamViewAccessRoles'), val);
  };
  const persistMetricsRoles = (val) => {
    setMetricsAccessRoles(val);
    if (firebaseUser) set(ref(db, 'metricsAccessRoles'), val);
  };
  const persistReportsRoles = (val) => {
    setReportsAccessRoles(val);
    if (firebaseUser) set(ref(db, 'reportsAccessRoles'), val);
  };
  const persistMetricsAllDataRoles = (val) => {
    setMetricsAllDataRoles(val);
    if (firebaseUser) set(ref(db, 'metricsAllDataRoles'), val);
  };
  const persistReportsAllDataRoles = (val) => {
    setReportsAllDataRoles(val);
    if (firebaseUser) set(ref(db, 'reportsAllDataRoles'), val);
  };
  const persistFeedbackItems = (val) => {
    setFeedbackItems(val);
    if (firebaseUser) set(ref(db, 'feedbackItems'), sanitizeForFirebase(val));
  };
  const persistHierarchyOrder = (val) => {
    setHierarchyOrder(val);
    if (firebaseUser) set(ref(db, 'settings/hierarchyOrder'), val);
  };
  const persistChecklistTemplates = (val) => {
    setChecklistTemplates(val);
    if (firebaseUser) {
      set(ref(db, 'checklistTemplates'), sanitizeForFirebase(val))
        .catch(err => console.error('[PMT] Failed to save checklist templates to Firebase:', err));
    }
  };
  const persistChecklistAccessRoles = (val) => {
    setChecklistAccessRoles(val);
    if (firebaseUser) set(ref(db, 'settings/conditions/checklistAccess'), val);
  };
  const persistTaskGroups = (val) => {
    setTaskGroups(val);
    if (firebaseUser) {
      set(ref(db, 'taskGroups'), sanitizeForFirebase(val))
        .catch(err => console.error('[PMT] Failed to save task groups to Firebase:', err));
    }
  };

  // --- MATCH FIREBASE AUTH USER → PMT USER RECORD ---
  // Runs whenever auth state changes, the users list loads from Firebase, or dbReady changes.
  useEffect(() => {
    if (!firebaseUser) { setCurrentUserId(null); return; }
    // Wait until Firebase data has finished loading before making a role decision.
    // Without this guard the effect runs with an empty users list and can't find
    // the real record — previously it fell through to create a fake Super Admin.
    if (!dbReady) return;

    const email = firebaseUser.email?.toLowerCase();
    if (!email) return;
    // Check Firebase users first, then fall back to DEFAULT_USERS
    const firebaseMatch = users.find(u => u.email?.toLowerCase() === email);
    const defaultMatch = DEFAULT_USERS.find(u => u.email?.toLowerCase() === email);
    const matched = firebaseMatch || defaultMatch;

    if (matched) {
      setMsLoginPending(false);
      // Build a merged record for first-time login (when user isn't in the DB yet).
      // For existing records the PMT database is the source of truth for the name —
      // we only keep the email in sync from Firebase Auth to avoid Auth display-name
      // changes overwriting names edited in the Control Center.
      const mergedRecord = {
        ...matched,
        name: firebaseUser.displayName || matched.name,
        email: firebaseUser.email,
        _id: matched.id,
      };
      // Ensure the record is in the users state so currentUser resolves correctly
      setUsers(prev => {
        const exists = prev.find(u => u.id === matched.id);
        if (exists) {
          // Only sync email — never override an admin-edited name with the Auth displayName
          if (exists.email === mergedRecord.email) return prev;
          return prev.map(u => u.id === matched.id
            ? { ...u, email: mergedRecord.email }
            : u
          );
        }
        // New record (first login) — use Firebase Auth displayName as starting name
        return [...prev, mergedRecord];
      });
      setCurrentUserId(matched.id);
    } else {
      // Valid @ethinos.com account but not yet added to the PMT system by an admin.
      // Leave currentUserId as null → shows the "Access Not Set Up" screen.
      setCurrentUserId(null);
    }
  }, [firebaseUser, users, dbReady]);

  // --- SHARED LOGIC ---
  const effectiveUserId = testModeUserId || currentUserId;
  const currentUser = users.find(u => u.id === effectiveUserId) || null;
  const isTestMode = !!testModeUserId;
  const canSeeAllMetricsData = metricsAllDataRoles.includes(currentUser?.role);
  const canSeeAllReportsData = reportsAllDataRoles.includes(currentUser?.role);
  const canSeeControlCenter = currentUser?.role === 'Super Admin' || Object.values(controlCenterTabAccess).some(roles => (roles || []).includes(currentUser?.role));
  const canSeeUserManagement = userManagementAccessRoles.includes(currentUser?.role);
  const canSeeEmployeeView = employeeViewAccessRoles.includes(currentUser?.role);
  const canSeeMetrics = metricsAccessRoles.includes(currentUser?.role);
  const canSeeReports = reportsAccessRoles.includes(currentUser?.role);
  const availableRoles = [...new Set(users.map(u => u.role))];

  const accessibleClients = !currentUser
    ? []
    : currentUser.role === 'Super Admin'
      ? clients
      : clients.filter(c => currentUser.assignedProjects?.includes(c.name) || currentUser.assignedProjects?.includes('All'));

  const SYNTHETIC_CLIENTS = [
    { id: '__personal__', name: 'Personal', synthetic: true, isPersonal: true },
    { id: '__ethinos__', name: 'Ethinos', synthetic: true, isEthinos: true, nonBillableLocked: true },
  ];

  const allTasks = [
    ...accessibleClients.flatMap(c => (clientLogs[c.id] || []).map(t => ({ ...t, cid: c.id, cName: c.name }))),
    ...SYNTHETIC_CLIENTS.flatMap(c => (clientLogs[c.id] || []).map(t => ({ ...t, cid: c.id, cName: c.name }))),
  ];

  const managementRoles = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];
  const canSeeApprovals = managementRoles.includes(currentUser?.role);
  const canSeeTeam = teamViewAccessRoles.includes(currentUser?.role);

  const CROSS_DEPT_ROLES_APP = ['Super Admin', 'Admin', 'Director', 'Business Head'];
  const isCrossDeptApp = CROSS_DEPT_ROLES_APP.includes(currentUser?.role) || currentUser?.department === 'All';
  const userDeptApp = currentUser?.department;

  // Filtered category names for task creation/editing (scoped to user's department)
  // Cross-dept roles see all categories; others see Universal + their department's categories
  const filteredTaskCategoryNames = taskCategories
    .filter(cat => {
      if (isCrossDeptApp) return true;
      const depts = cat.departments || [];
      return depts.length === 0 || depts.includes(userDeptApp);
    })
    .map(cat => cat.name);
  const myClientNames = (currentUser?.assignedProjects || []);
  const pendingApprovalsCount = canSeeApprovals
    ? Object.entries(clientLogs || {}).reduce((total, [clientId, logs]) => {
        const client = clients.find(c => String(c.id) === String(clientId));
        const qcCount = (logs || []).filter(t => {
          if (String(t.qcAssigneeId) !== String(currentUser?.id) || t.qcStatus !== 'sent') return false;
          if (isCrossDeptApp) return true;
          if (!Array.isArray(t.departments)) return true;
          return t.departments.includes(userDeptApp);
        }).length;
        const assignReqCount = (isCrossDeptApp || (client && myClientNames.includes(client.name)))
          ? (logs || []).reduce((n, t) => n + (t.assignmentRequests?.length || 0), 0)
          : 0;
        return total + qcCount + assignReqCount;
      }, 0)
      + (clients || []).reduce((n, c) => {
          if (!isCrossDeptApp && !myClientNames.includes(c.name)) return n;
          return n + (c.joinRequests?.length || 0);
        }, 0)
    : 0;

  const tabTitles = {
    home: 'Home',
    clients: 'Clients',
    approvals: 'Approvals',
    team: 'Team',
    metrics: 'Metrics',
    reports: 'Reports',
    employees: 'Employees',
    settings: 'Settings',
    'master-data': 'Control Center',
  };

  const isMinimized = sidebarMinimized || activeTab === 'clients' || selectedClient !== null;

  const handleUpdateProfile = ({ name, secondaryEmail, phone, photoURL }) => {
    if (!currentUser) return;
    const updated = {
      ...currentUser,
      ...(name?.trim() ? { name: name.trim() } : {}),
      secondaryEmail: (secondaryEmail || '').trim(),
      phone: (phone || '').trim(),
      photoURL: photoURL || '',
    };
    persistUsers(users.map(u => u.id === currentUser.id ? updated : u));
    if (firebaseUser && name?.trim()) {
      updateProfile(firebaseUser, { displayName: name.trim() }).catch(() => {});
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    if (!firebaseUser || !currentPassword || !newPassword) throw new Error('All fields are required.');
    const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
    await reauthenticateWithCredential(firebaseUser, credential);
    await updatePassword(firebaseUser, newPassword);
  };

  const handleResetPassword = async (email) => {
    if (!email) throw new Error('Please enter your email address.');
    if (!email.toLowerCase().endsWith('@ethinos.com')) {
      throw new Error('Password reset is only available for Ethinos work accounts (@ethinos.com).');
    }
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    const resp = await fetch(`${apiBase}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to send reset email');
    }
  };

  const isEthinosDomain = (email) => email?.toLowerCase().endsWith('@ethinos.com');

  const handleLogin = async (email, password) => {
    if (!email || !password) {
      setLoginError('Enter both email and password');
      return;
    }
    if (!isEthinosDomain(email)) {
      setLoginError('Access is restricted to Ethinos work accounts (@ethinos.com).');
      return;
    }
    try {
      setLoginError('');
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setLoginError('Invalid email or password. Please try again.');
    }
  };

  // Exchange a Microsoft access token for a Firebase custom token and sign in.
  const finishMsLogin = async ({ accessToken }) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    const resp = await fetch(`${apiBase}/auth/ms-token-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msAccessToken: accessToken }),
    });
    if (resp.ok) {
      const { customToken } = await resp.json();
      setMsLoginPending(true);
      await signInWithCustomToken(auth, customToken);
    } else {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Microsoft sign-in failed. Please contact your administrator.');
    }
  };

  // Stable ref so the auth-redirect useEffect can call finishMsLogin safely.
  const finishMsLoginRef = useRef(finishMsLogin);
  finishMsLoginRef.current = finishMsLogin;

  // -------------------------------------------------------------------------
  // Auth-redirect processing — runs once on mount when this tab is the one
  // Azure redirected back to (URL has ?code=&state=).
  // Strategy: redirect back to the ROOT URL of the main app (already registered
  // in Azure). The app running in this auth tab exchanges the PKCE code for a
  // token, signs in with Firebase, then tries to close itself.
  // The ORIGINAL tab detects the sign-in via Firebase's cross-tab auth
  // persistence (onAuthStateChanged fires there within ~1 s). No postMessage
  // or storage events needed.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthRedirectMode) return;

    const p           = new URLSearchParams(window.location.search);
    const code        = p.get('code');
    const state       = p.get('state');
    const error       = p.get('error');
    const errorDesc   = p.get('error_description');

    // Clean the URL so a manual reload doesn't re-trigger this.
    window.history.replaceState({}, '', window.location.pathname);

    console.log('[MS auth-redirect] code present:', !!code, 'state present:', !!state, 'error:', error);

    if (error) {
      setMsAuthRedirectError(errorDesc || error);
      return;
    }

    // Decode verifier and redirectUri from the state param — they were embedded
    // by handleMicrosoftLogin so no localStorage (cross-partition) access is needed.
    let verifier, redirectUri, returnTo;
    try {
      const padded = state.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(padded + '='.repeat((4 - padded.length % 4) % 4)));
      verifier    = decoded.v;
      redirectUri = decoded.r;
      returnTo    = decoded.rt || null;
    } catch {
      verifier = null;
    }

    console.log('[MS auth-redirect] verifier decoded from state:', !!verifier, 'redirectUri:', redirectUri, 'returnTo:', returnTo);

    if (!verifier || !redirectUri) {
      setMsAuthRedirectError('Invalid authentication state — please close this tab and try again.');
      return;
    }

    // Server-side exchange: our API calls Azure's token endpoint server-to-server,
    // avoiding the AADSTS9002326 cross-origin restriction on Web-type redirect URIs.
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

    (async () => {
      try {
        console.log('[MS auth-redirect] Sending code to server for exchange…');
        const exchangeRes = await fetch(`${apiBase}/auth/ms-code-exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, verifier, redirectUri }),
        });
        const exchangeData = await exchangeRes.json();
        console.log('[MS auth-redirect] Server exchange response:', exchangeRes.status, exchangeData.error || 'OK');
        if (!exchangeRes.ok) throw new Error(exchangeData.error || 'Sign-in failed — server error');

        const { customToken } = exchangeData;
        console.log('[MS auth-redirect] Signing in with Firebase custom token…');
        setMsLoginPending(true);
        await signInWithCustomToken(auth, customToken);
        console.log('[MS auth-redirect] Firebase sign-in complete ✓');

        // Relay the token to any companion app (e.g. pmt-mobile) that opened this
        // popup and is listening via postMessage / storage event.
        try {
          if (window.opener) {
            window.opener.postMessage({ type: 'pmt-ms-token', customToken }, window.location.origin);
          }
        } catch {}
        try {
          localStorage.setItem('pmt_ms_token', JSON.stringify({ customToken, ts: Date.now() }));
        } catch {}

        // returnTo is set when the request came from a full-page redirect flow.
        if (returnTo) {
          window.location.replace(returnTo);
          return;
        }
        // In production the original tab updates via Firebase cross-tab auth
        // sync and window.close() removes this auth tab — leaving just one window.
        // In dev (Replit preview iframe, partitioned storage), window.close()
        // may be blocked; fall back to redirecting this tab to the app root.
        window.close();
        setTimeout(() => {
          // Only reached if window.close() was blocked.
          window.location.replace(window.location.origin + '/');
        }, 1000);
      } catch (err) {
        console.error('[MS auth-redirect] Error:', err);
        setMsAuthRedirectError(err.message || 'Sign-in failed. Please close this tab and try again.');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open a Microsoft login tab using a custom PKCE flow.
  // The PKCE verifier and redirectUri are encoded inside the OAuth `state`
  // parameter so they travel through Azure's redirect URL with zero reliance
  // on localStorage (which is storage-partitioned when the app runs inside
  // a Replit preview iframe on a different top-level origin).
  const handleMicrosoftLogin = async () => {
    setLoginError('');
    setMsLoginStatus('');
    const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;
    const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;

    console.log('[MS login] clientId present:', !!clientId, 'tenantId present:', !!tenantId);

    if (!clientId || !tenantId) {
      setLoginError('Microsoft login is not configured. Please use email/password to sign in.');
      return;
    }

    const redirectUri = window.location.origin + '/';
    const { verifier, challenge } = await generatePkce();

    // Encode verifier + redirectUri into the state string so the auth tab
    // can read them directly from the URL — no cross-partition storage needed.
    const statePayload = btoa(JSON.stringify({ v: verifier, r: redirectUri }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id',             clientId);
    authUrl.searchParams.set('response_type',         'code');
    authUrl.searchParams.set('redirect_uri',          redirectUri);
    authUrl.searchParams.set('scope',                 'openid profile email User.Read');
    authUrl.searchParams.set('state',                 statePayload);
    authUrl.searchParams.set('code_challenge',        challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('response_mode',         'query');
    authUrl.searchParams.set('prompt',                'select_account');

    console.log('[MS login] Opening auth URL, redirectUri:', redirectUri);

    const tab = window.open(
      authUrl.toString(),
      'ms-auth-tab',
      'width=520,height=680,menubar=no,toolbar=no,location=no,resizable=yes',
    );

    if (!tab) {
      console.warn('[MS login] Popup blocked, falling back to same-window redirect');
      window.location.href = authUrl.toString();
      return;
    }

    console.log('[MS login] Auth tab opened — waiting for Firebase cross-tab auth-state sync…');
    setMsLoginStatus('Waiting for Microsoft sign-in… (you can return to this tab after signing in)');
  };

  const handleCreateAccount = async ({ name, email, password, department, region }) => {
    if (!isEthinosDomain(email)) {
      setLoginError('Registration is restricted to Ethinos work accounts (@ethinos.com).');
      return;
    }
    try {
      setLoginError('');
      // 1. Create the Firebase Auth account (auto signs them in)
      await createUserWithEmailAndPassword(auth, email, password);

      // 2. Once authenticated, read current users and append the new record
      const snap = await get(ref(db, 'users'));
      const existing = snap.val();
      const currentList = Array.isArray(existing)
        ? existing
        : existing ? Object.values(existing) : DEFAULT_USERS;

      const newUser = {
        id: Date.now(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'Employee',
        assignedProjects: [],
        department: department || 'Growth',
        region: region || 'North',
      };

      const updated = [...currentList, newUser];
      await set(ref(db, 'users'), updated);
      // The onValue listener will pick this up and trigger the matching effect
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setLoginError('An account with this email already exists. Try signing in instead.');
      } else if (err.code === 'auth/weak-password') {
        setLoginError('Password must be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setLoginError('Please enter a valid email address.');
      } else {
        setLoginError('Could not create account. Please try again.');
      }
    }
  };

  const handleLogout = async () => {
    setIsProfileOpen(false);
    setIsNotifOpen(false);
    setSelectedClient(null);
    setActiveTab('home');
    setCurrentUserId(null);
    setDbReady(false);
    setMsLoginPending(false);
    await signOut(auth);
  };

  useEffect(() => {
    if (activeTab === 'master-data' && !canSeeControlCenter) setActiveTab('home');
    if (activeTab === 'employees' && !canSeeEmployeeView) setActiveTab('home');
    if (activeTab === 'metrics' && !canSeeMetrics) setActiveTab('home');
    if (activeTab === 'reports' && !canSeeReports) setActiveTab('home');
    if (activeTab === 'approvals' && !canSeeApprovals) setActiveTab('home');
    if (activeTab === 'team' && !canSeeTeam) setActiveTab('home');
  }, [activeTab, canSeeControlCenter, canSeeEmployeeView, canSeeMetrics, canSeeReports, canSeeApprovals, canSeeTeam]);

  // This tab was the Azure redirect target.
  // While processing: show the same spinner as the normal loading state (seamless).
  // On error: show a minimal error message.
  if (isAuthRedirectMode && !firebaseUser) {
    if (msAuthRedirectError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3 p-8 text-center">
          <div className="text-sm font-semibold text-red-600">Sign-in error</div>
          <div className="text-sm text-slate-500 max-w-xs">{msAuthRedirectError}</div>
          <div className="text-xs text-slate-400">You can close this tab and try again.</div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-sm font-semibold text-slate-500">Loading…</div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-sm font-semibold text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!firebaseUser && !testModeUserId) {
    return (
      <>
        <LoginView onLogin={handleLogin} onMicrosoftLogin={handleMicrosoftLogin} onCreateAccount={handleCreateAccount} onResetPassword={handleResetPassword} loginError={loginError} msLoginStatus={msLoginStatus} onCancelMsLogin={() => setMsLoginStatus('')} departments={departments} regions={regions} />
        <TestModePanel
          currentUser={null}
          isTestMode={false}
          onImpersonate={(testUser) => {
            if (!users.find(u => u.id === testUser.id)) {
              setUsers(prev => [...prev, testUser]);
            }
            setTestModeUserId(testUser.id);
            setActiveTab('home');
            setSelectedClient(null);
          }}
          onExit={() => setTestModeUserId(null)}
        />
      </>
    );
  }

  if (!testModeUserId && firebaseUser && !currentUser) {
    // Firebase DB hasn't finished loading yet — keep showing the spinner rather
    // than flashing the "Access Not Set Up" screen prematurely.
    if (!dbReady || departments.length === 0 || regions.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
          <div className="text-sm font-semibold text-slate-500">Loading…</div>
        </div>
      );
    }

    return (
      <MicrosoftProfileSetup
          firebaseUser={firebaseUser}
          departments={departments}
          regions={regions}
          onComplete={async ({ department, region }) => {
            const displayName = firebaseUser.displayName || firebaseUser.email.split('@')[0];
            const newUser = {
              id: `user-${Date.now()}`,
              name: displayName,
              email: firebaseUser.email.toLowerCase(),
              role: 'Employee',
              assignedProjects: [],
              department,
              region,
            };
            const snap = await get(ref(db, 'users'));
            const existing = snap.val();
            const currentList = Array.isArray(existing)
              ? existing
              : existing ? Object.values(existing) : DEFAULT_USERS;
            const updated = [...currentList, newUser];
            await set(ref(db, 'users'), updated);
            setMsLoginPending(false);
          }}
          onSignOut={handleLogout}
        />
      );
  }

  return (
    <div
      className="flex w-screen h-screen text-black text-sm overflow-hidden font-sans"
      style={{
        background:
          'radial-gradient(58% 64% at 8% 10%, rgba(241, 94, 88, 0.14) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(48% 56% at 52% 92%, rgba(82, 110, 255, 0.13) 0%, rgba(82, 110, 255, 0) 64%), radial-gradient(36% 48% at 96% 12%, rgba(236, 232, 123, 0.15) 0%, rgba(236, 232, 123, 0) 62%), linear-gradient(140deg, #fff7f8 0%, #f7f8ff 58%, #fffde9 100%)'
      }}
    >
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setSelectedClient={setSelectedClient}
        isMinimized={isMinimized}
        setIsMinimized={setSidebarMinimized}
        canSeeControlCenter={canSeeControlCenter}
        canSeeEmployeeView={canSeeEmployeeView}
        canSeeMetrics={canSeeMetrics}
        canSeeReports={canSeeReports}
        canSeeApprovals={canSeeApprovals}
        canSeeTeam={canSeeTeam}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      <div className="flex-1 flex flex-col bg-transparent overflow-hidden relative border-l border-white/40">
        <header className="h-16 px-8 flex items-center justify-between border-b border-white/50 font-black bg-white/45 backdrop-blur-sm uppercase sticky top-0 z-20">
          <h2 className="tracking-tight text-black">
            {selectedClient ? selectedClient.name : (tabTitles[activeTab] || activeTab)}
          </h2>
          <div className="flex items-center gap-4">
            <Notifications
              isNotifOpen={isNotifOpen}
              setIsNotifOpen={setIsNotifOpen}
              setIsProfileOpen={setIsProfileOpen}
              notifications={notifications}
              setNotifications={setNotifications}
              currentUser={currentUser}
              users={users}
              clients={clients}
              clientLogs={clientLogs}
              setActiveTab={setActiveTab}
              setSelectedClient={setSelectedClient}
            />
            <ProfileDropdown
              isProfileOpen={isProfileOpen}
              setIsProfileOpen={setIsProfileOpen}
              setIsNotifOpen={setIsNotifOpen}
              currentUser={currentUser}
              onUpdateProfile={handleUpdateProfile}
              onChangePassword={handleChangePassword}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="p-6 overflow-y-auto flex-1 bg-transparent">
          {activeTab === 'home' && !selectedClient && (
            <HomeView
              accessibleClients={accessibleClients}
              syntheticClients={SYNTHETIC_CLIENTS}
              allTasks={allTasks}
              clientLogs={clientLogs}
              setSelectedClient={setSelectedClient}
              setClientLogs={persistClientLogs}
              currentUser={currentUser}
              taskCategories={filteredTaskCategoryNames}
              users={users}
              departments={departments}
              onNavigateToClients={() => setActiveTab('clients')}
              taskTemplates={taskTemplates}
              checklistTemplates={checklistTemplates}
              taskGroups={taskGroups}
              setTaskGroups={persistTaskGroups}
            />
          )}

          {activeTab === 'approvals' && !selectedClient && canSeeApprovals && (
            <ApprovalsView
              clientLogs={clientLogs}
              clients={clients}
              syntheticClients={SYNTHETIC_CLIENTS}
              users={users}
              currentUser={currentUser}
              persistClientLogs={persistClientLogs}
              setClients={persistClients}
              setUsers={persistUsers}
            />
          )}

          {activeTab === 'team' && !selectedClient && canSeeTeam && (
            <TeamView
              currentUser={currentUser}
              users={users}
              clients={clients}
              syntheticClients={SYNTHETIC_CLIENTS}
              clientLogs={clientLogs}
              setClientLogs={persistClientLogs}
              taskCategories={filteredTaskCategoryNames}
              hierarchyOrder={hierarchyOrder}
            />
          )}

          {(activeTab === 'clients' || selectedClient) && (
            <ClientView
              selectedClient={selectedClient}
              setSelectedClient={setSelectedClient}
              clients={clients}
              setClients={persistClients}
              clientLogs={clientLogs}
              setClientLogs={persistClientLogs}
              clientSearch={clientSearch}
              setClientSearch={setClientSearch}
              users={users}
              setUsers={persistUsers}
              currentUser={currentUser}
              taskCategories={filteredTaskCategoryNames}
              taskTemplates={taskTemplates}
              setNotifications={setNotifications}
              accessibleClients={accessibleClients}
              departments={departments}
              regions={regions}
              syntheticClients={SYNTHETIC_CLIENTS}
            />
          )}

          {activeTab === 'employees' && !selectedClient && canSeeEmployeeView && (
            <EmployeeView users={users} clients={clients} clientLogs={clientLogs} currentUser={currentUser} />
          )}

          {activeTab === 'metrics' && !selectedClient && canSeeMetrics && (
            <UserMetricsView users={users} clients={clients} clientLogs={clientLogs} currentUser={currentUser} departments={departments} canSeeAllData={canSeeAllMetricsData} />
          )}

          {activeTab === 'reports' && !selectedClient && canSeeReports && (
            <ReportsView users={users} clients={clients} clientLogs={clientLogs} currentUser={currentUser} departments={departments} canSeeAllData={canSeeAllReportsData} />
          )}

          {activeTab === 'master-data' && !selectedClient && canSeeControlCenter && (
            <MasterDataView
              taskCategories={taskCategories}
              setTaskCategories={persistTaskCategories}
              taskTemplates={taskTemplates}
              setTaskTemplates={persistTaskTemplates}
              currentUser={currentUser}
              departments={departments}
              setDepartments={persistDepartments}
              regions={regions}
              setRegions={persistRegions}
              availableRoles={availableRoles}
              controlCenterTabAccess={controlCenterTabAccess}
              setControlCenterTabAccess={persistControlCenterTabAccess}
              userManagementAccessRoles={userManagementAccessRoles}
              setUserManagementAccessRoles={persistUserManagementRoles}
              employeeViewAccessRoles={employeeViewAccessRoles}
              setEmployeeViewAccessRoles={persistEmployeeViewRoles}
              teamViewAccessRoles={teamViewAccessRoles}
              setTeamViewAccessRoles={persistTeamViewRoles}
              metricsAccessRoles={metricsAccessRoles}
              setMetricsAccessRoles={persistMetricsRoles}
              reportsAccessRoles={reportsAccessRoles}
              setReportsAccessRoles={persistReportsRoles}
              metricsAllDataRoles={metricsAllDataRoles}
              setMetricsAllDataRoles={persistMetricsAllDataRoles}
              reportsAllDataRoles={reportsAllDataRoles}
              setReportsAllDataRoles={persistReportsAllDataRoles}
              clients={clients}
              setClients={persistClients}
              users={users}
              setUsers={persistUsers}
              clientLogs={clientLogs}
              setClientLogs={persistClientLogs}
              digestGlobalEnabled={digestGlobalEnabled}
              onDigestGlobalToggle={persistDigestGlobal}
              notificationSettings={notificationSettings}
              onUpdateNotificationSetting={persistNotificationSetting}
              createFirebaseUser={async (email, name) => {
                const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
                const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
                const resp = await fetch(`${apiBase}/auth/create-user`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                  },
                  body: JSON.stringify({ email, name }),
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                  const err = new Error(data.error || 'Failed to create user');
                  err.code = data.error;
                  throw err;
                }
                return data;
              }}
              feedbackItems={feedbackItems}
              setFeedbackItems={persistFeedbackItems}
              onSendPasswordReset={currentUser?.role === 'Super Admin' ? handleResetPassword : null}
              hierarchyOrder={hierarchyOrder}
              setHierarchyOrder={persistHierarchyOrder}
              checklistTemplates={checklistTemplates}
              setChecklistTemplates={persistChecklistTemplates}
              checklistAccessRoles={checklistAccessRoles}
              setChecklistAccessRoles={persistChecklistAccessRoles}
            />
          )}
        </main>
      </div>

      <TestModePanel
        currentUser={currentUser}
        isTestMode={isTestMode}
        onImpersonate={(testUser) => {
          if (!users.find(u => u.id === testUser.id)) {
            setUsers(prev => [...prev, testUser]);
          }
          setTestModeUserId(testUser.id);
          setActiveTab('home');
          setSelectedClient(null);
        }}
        onExit={() => setTestModeUserId(null)}
      />
    </div>
  );
};

export default App;
