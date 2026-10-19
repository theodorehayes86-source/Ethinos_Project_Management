import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import AddTaskModal from '../lib/clientPortal/AddTaskModal.jsx';
import { validatePortalTask, buildCreateTaskPayload, createPortalApi, safeLinkUrl } from '../lib/clientPortal/core.js';

describe('expanded client task form rendering', () => {
  it('renders all requested fields with IST as the default timezone', () => {
    const html = renderToStaticMarkup(React.createElement(AddTaskModal, {
      clientName: 'Example client', onClose: vi.fn(), onSubmit: vi.fn(),
    }));
    for (const field of ['input-portal-task-due', 'input-portal-task-reminder-date',
      'input-portal-task-reminder-time', 'select-portal-task-reminder-tz',
      'button-portal-task-subtask-add', 'button-portal-task-link-add']) {
      expect(html).toContain(field);
    }
    expect(html).toMatch(/value="Asia\/Kolkata" selected/);
    expect(html).toContain('value="09:00"');
  });
  it('keeps desktop and mobile client task creation and detail identical', () => {
    for (const name of ['AddTaskModal.jsx', 'ClientTasks.jsx', 'core.js']) {
      const desktop = readFileSync(new URL(`../lib/clientPortal/${name}`, import.meta.url), 'utf8');
      const mobile = readFileSync(new URL(`../../../pmt-mobile/src/lib/clientPortal/${name}`, import.meta.url), 'utf8');
      expect(mobile).toBe(desktop);
    }
  });
});

describe('validatePortalTask expanded', () => {
  it('requires dueDate for reminder and ordering', () => {
    expect(validatePortalTask({ title: 'a', reminderDate: '2030-01-01' }).reminderDate).toMatch(/due date/);
    expect(validatePortalTask({ title: 'a', dueDate: '2030-01-01', reminderDate: '2030-01-02' }).reminderDate).toMatch(/on or before/);
    expect(validatePortalTask({ title: 'a', dueDate: '2030-01-02', reminderDate: '2030-01-02' })).toEqual({});
    expect(validatePortalTask({ title: 'a', dueDate: '2030-02-30' }).dueDate).toBeTruthy();
  });
  it('validates time and timezone', () => {
    const b = { title: 'a', dueDate: '2030-01-02', reminderDate: '2030-01-01' };
    expect(validatePortalTask({ ...b, reminderTime: '25:00' }).reminderTime).toBeTruthy();
    expect(validatePortalTask({ ...b, reminderTimezone: 'Nope/Zone' }).reminderTimezone).toBeTruthy();
  });
  it('validates links and subtasks', () => {
    expect(safeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(safeLinkUrl('https://u:p@x.com')).toBeNull();
    expect(safeLinkUrl('https://x.com/a b')).toBeNull();
    expect(validatePortalTask({ title: 'a', links: [{ text: '', url: 'ftp://x' }] }).links[0].url).toBeTruthy();
    expect(validatePortalTask({ title: 'a', subtasks: ['x'.repeat(301)] }).subtasks[0]).toBeTruthy();
    expect(validatePortalTask({ title: 'a', subtasks: Array(101).fill('x') }).subtasksTotal).toBeTruthy();
  });
});

describe('payload', () => {
  it('drops blanks, defaults link text and reminder fields', () => {
    const p = buildCreateTaskPayload({ title: ' T ', description: '', dueDate: '2030-01-02', reminderDate: '2030-01-01', reminderTime: '', subtasks: [' a ', ' '], links: [{ text: '', url: ' https://x.com ' }, { text: '', url: '' }] });
    expect(p).toMatchObject({ title: 'T', reminderTime: '09:00', reminderTimezone: 'Asia/Kolkata', subtasks: ['a'], links: [{ text: 'https://x.com', url: 'https://x.com' }] });
  });
  it('createTask forwards allowlisted fields in one POST', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const api = createPortalApi({ base: '/api', getToken: async () => 't', fetchImpl: f });
    await api.createTask('c1', { title: 'T', description: '', dueDate: '2030-01-02', reminderDate: '2030-01-01', reminderTime: '09:00', reminderTimezone: 'Asia/Kolkata', subtasks: ['a'], links: [{ text: 'x', url: 'https://x.com', evil: 1 }], admin: true });
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body).toEqual({ title: 'T', description: '', dueDate: '2030-01-02', reminderDate: '2030-01-01', reminderTime: '09:00', reminderTimezone: 'Asia/Kolkata', subtasks: ['a'], links: [{ text: 'x', url: 'https://x.com' }] });
  });
});

import { reminderSummary } from '../lib/clientPortal/core.js';
describe('reminderSummary', () => {
  it('null without reminder; defaults time/tz', () => {
    expect(reminderSummary({})).toBeNull();
    expect(reminderSummary({ reminderDate: '2030-01-01' }).text).toMatch(/09:00 \(IST/);
    expect(reminderSummary({ reminderDate: '2030-01-01', reminderTime: '14:30', reminderTimezone: 'Europe/London' }).text).toMatch(/14:30 \(GMT/);
  });
});
