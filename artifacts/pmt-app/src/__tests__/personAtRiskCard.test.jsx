import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PersonAtRiskCard from '../../../pmt-mobile/src/components/team/PersonAtRiskCard.jsx';

const tasks = [
  { id: 'a', _clientId: 'client-a', name: 'First task', _clientName: 'Client A' },
  { id: 'b', _clientId: 'client-b', comment: 'Second task', _clientName: 'Client B' },
];
describe('per-person At Risk disclosure', () => {
  it('hides directory suffixes but retains the full personal name and pending count', () => {
    const html = renderToStaticMarkup(<PersonAtRiskCard user={{ id: 'u', name: 'Sample Person | Team Ethinos | Design' }} tasks={tasks} accent="red" onTaskClick={() => {}} />);
    const summary = html.match(/<summary[^>]*>(.*?)<\/summary>/s)?.[1];
    expect(summary).toContain('Sample Person');
    expect(summary).toContain('2 pending');
    expect(summary).not.toContain('Team Ethinos');
    expect(summary).not.toContain('|');
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });
  it.each(['red', 'indigo'])('starts collapsed with visible name and pending count (%s)', accent => {
    const html = renderToStaticMarkup(<PersonAtRiskCard user={{ id: 'u', name: 'Sample Person' }} tasks={tasks} accent={accent} onTaskClick={() => {}} />);
    expect(html).toContain('<details');
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
    const summary = html.match(/<summary[^>]*>(.*?)<\/summary>/s)?.[1];
    expect(summary).toContain('Sample Person');
    expect(summary).toContain('2 pending');
    expect(summary).not.toContain('First task');
    expect(html).toContain('First task');
    expect(html).toContain('Second task');
    expect(html).toContain('Client B');
    expect(html).toContain(`2 pending ${accent === 'red' ? 'overdue' : 'due today'} tasks`);
  });
  it('keeps leave status visible without opening a person', () => {
    const html = renderToStaticMarkup(<PersonAtRiskCard user={{ id: 'u', name: 'Sample Person' }} tasks={tasks.slice(0, 1)} accent="red" isOnLeave onTaskClick={() => {}} />);
    expect(html.match(/<summary[^>]*>(.*?)<\/summary>/s)?.[1]).toContain('On Leave');
    expect(html).toContain('1 pending');
  });
  it('retains individual task click callbacks inside the disclosure', () => {
    let selected;
    const element = PersonAtRiskCard({ user: { id: 'u', name: 'Sample Person' }, tasks, accent: 'red', onTaskClick: t => { selected = t; } });
    const buttons = element.props.children[1].props.children;
    buttons[1].props.onClick();
    expect(selected).toBe(tasks[1]);
    expect(buttons[0].key).toBe('client-a-a');
  });
});
