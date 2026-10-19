import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planClientShare, applyClientShare, shareIneligibleReason } from '../lib/clientPortal/core.js';

const src = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const logs = [
  { id: 1, name: 'Brief', comment: 'INTERNAL SECRET', status: 'WIP', creatorId: 'u1' },
  { id: 2, name: 'Shared', visibility: 'client', clientDescription: 'Existing copy', creatorId: 'u1' },
  { id: 3, name: 'Check', taskType: 'checklist', creatorId: 'u1' },
  { id: 4, name: 'Child', taskGroupId: 'g', creatorId: 'u1' },
  { id: 5, name: 'Old', archived: true, creatorId: 'u1' },
  { id: 6, name: 'Boss task', creatorId: 'boss' },
  { id: 7, name: 'Not selected', creatorId: 'u1', repeatFrequency: 'Weekly' },
];
const canEdit = (t) => t.creatorId === 'u1';
const opts = { clientId: 'c1', canEdit };

describe('share eligibility', () => {
  it('splits selected rows into eligible and skipped with reasons', () => {
    const { eligible, skipped } = planClientShare(logs, new Set(['1', '2', '3', '4', '5', '6', '99']), opts);
    expect(eligible.map(e => e.id)).toEqual(['1', '2']);
    expect(eligible[1].alreadyShared).toBe(true);
    expect(Object.fromEntries(skipped.map(s => [s.id, s.reason]))).toEqual({ 3: 'checklist', 4: 'grouped', 5: 'archived', 6: 'permission', 99: 'missing' });
  });
  it('synthetic client ids are never shareable', () => {
    expect(shareIneligibleReason(logs[0], { clientId: '__personal__', canEdit })).toBe('synthetic');
    expect(planClientShare(logs, ['1'], { clientId: '__ethinos__', canEdit }).eligible).toHaveLength(0);
  });
  it('never prefills the internal comment', () => {
    const { eligible } = planClientShare(logs, ['1'], opts);
    expect(eligible[0].clientDescription).toBe('');
  });
});

describe('share persistence payload', () => {
  it('only changes selected eligible rows and writes visibility + clientDescription', () => {
    const { updated, shared } = applyClientShare(logs, { 1: ' For you ', 2: '' }, opts);
    expect(shared).toEqual(['1', '2']);
    expect(updated[0]).toMatchObject({ visibility: 'client', clientDescription: 'For you', comment: 'INTERNAL SECRET' });
    expect(updated[1].clientDescription).toBe('Existing copy'); // blank draft keeps existing
    expect(updated[6]).toBe(logs[6]); // unselected (incl. repeat series) untouched
    expect(updated[2]).toBe(logs[2]);
  });
  it('re-checks at save: removed, archived meanwhile, or permission lost', () => {
    const later = logs.map(t => (t.id === 1 ? { ...t, archived: true } : t)).filter(t => t.id !== 2);
    const { shared, skipped } = applyClientShare(later, { 1: 'x', 2: 'y', 6: 'z' }, opts);
    expect(shared).toEqual([]);
    expect(skipped.map(s => s.reason).sort()).toEqual(['archived', 'missing', 'permission']);
  });
  it('allows editing an existing client description', () => {
    expect(applyClientShare(logs, { 2: 'New copy' }, opts).updated[1].clientDescription).toBe('New copy');
  });
});

describe('wiring', () => {
  const cv = src('PMT/ClientView.jsx');
  it('bulk toolbar + detail share use canFullyEditTask, not the time-management canEdit', () => {
    expect(cv).toMatch(/button-bulk-share-client/);
    expect(cv).toMatch(/openShareDialog\(\[\.\.\.selectedTaskIds\], 'bulk'\)/);
    expect(cv).toMatch(/onShare=\{isRealClientId\(selectedClient\?\.id\) && canFullyEditTask\(detailTask\)/);
    expect(cv).toMatch(/planClientShare\(clientLogs\[cid\] \|\| \[\], ids, \{ clientId: cid, canEdit: canFullyEditTask \}\)/);
  });
  it('saves through setClientLogs with saving guard; clears selection and closes only on success', () => {
    const h = cv.slice(cv.indexOf('const handleConfirmShare'), cv.indexOf('const canChangeTaskStatus'));
    expect(h).toMatch(/savingRef\.current\) return/);
    expect(h).toMatch(/applyClientShare\(clientLogs\[cid\]/);
    const tryBlock = h.slice(h.indexOf('try {'), h.indexOf('} catch'));
    expect(tryBlock.indexOf('await setClientLogs')).toBeLessThan(tryBlock.indexOf('setSelectedTaskIds(new Set())'));
    expect(tryBlock.indexOf('await setClientLogs')).toBeLessThan(tryBlock.indexOf('setShareDialog(null)'));
    const catchBlock = h.slice(h.indexOf('} catch'), h.indexOf('} finally'));
    expect(catchBlock).toMatch(/setShareError/);
    expect(catchBlock).not.toMatch(/setShareDialog\(null\)|setSelectedTaskIds/);
  });
  it('panel share button exists only via optional onShare; dialog states privacy', () => {
    const p = src('PMT/TaskDetailPanel.jsx');
    expect(p).toMatch(/\{onShare && \(/);
    const d = src('PMT/ShareWithClientDialog.jsx');
    expect(d).toMatch(/Internal comments, assignees, time logs, QC and checklists stay private/);
    expect(d).not.toMatch(/\.comment\b/);
    expect(d).toMatch(/text-share-none-eligible/);
  });
  it('mobile quick share reuses the existing confirm/save flow', () => {
    const m = readFileSync(resolve(__dirname, '../../../pmt-mobile/src/components/TaskDetailSheet.jsx'), 'utf8');
    expect(m).toMatch(/button-quick-share-client/);
    expect(m).toMatch(/onClick=\{\(\) => \{ setVisibility\('client'\)/);
    expect(m).toMatch(/sharingConfirmMessage/);
  });
  it('core helpers mirrored', () => {
    expect(readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/clientPortal/core.js'), 'utf8')).toBe(src('lib/clientPortal/core.js'));
  });
});
