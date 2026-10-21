import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MemberCardHeader, { MemberTaskFilter } from '../../../pmt-mobile/src/components/team/MemberCardHeader.jsx';
import { personDisplayName } from '../../../pmt-mobile/src/components/team/displayName.js';

const props = {
  user: { id: 'sample', name: 'Alexandra Samantha Winter', role: 'Director', kekaEmployeeId: 'sample' },
  stats: { pending: 6, today: 1, overdue: 40, pendingQC: 2, avgRating: 8.5 },
  attendanceStatus: { hasArrived: false, clockIn: null, isInOffice: false },
  hasTeam: true, onFilter: () => {}, onOpenTasks: () => {}, onDrillIn: () => {},
};
describe('compact mobile member-card header', () => {
  it.each([
    ['Alexandra Winter | Team Ethinos', 'Alexandra Winter'],
    ['  Alexandra Winter  | Team | Department', 'Alexandra Winter'],
    ['Alexandra Winter|Team Ethinos', 'Alexandra Winter'],
    ['Alexandra Winter', 'Alexandra Winter'],
    ['Renée O’Connor | Team Ethinos', 'Renée O’Connor'],
  ])('shows only the name before the first pipe: %s', (stored, expected) => {
    expect(personDisplayName(stored)).toBe(expected);
    const user = { ...props.user, name: stored };
    const html = renderToStaticMarkup(<MemberCardHeader {...props} user={user} />);
    expect(html).toContain(expected);
    expect(html).not.toContain('Team Ethinos');
    const drill = vi.fn();
    MemberCardHeader({ ...props, user, onDrillIn: drill }).props.children[1].props.children[4].props.onClick();
    expect(drill).toHaveBeenCalledWith(user);
    expect(user.name).toBe(stored);
  });
  it('gives the full name its own line without ellipsis or clipping', () => {
    const html = renderToStaticMarkup(<MemberCardHeader {...props} />);
    const name = html.match(/<span data-testid="text-member-name"[^>]*>.*?<\/span>/)?.[0];
    expect(name).toContain(props.user.name);
    expect(name).toContain('break-words');
    expect(name).toContain('overflow-wrap:anywhere');
    expect(name).not.toContain('truncate');
    expect(html).toContain('w-7 h-7');
    expect(html).toContain('Not Arrived');
    expect(html).toContain('Director');
    expect(html).toContain('Keka');
    expect(html).toContain('8.5');
  });
  it('preserves opening tasks, all four task filters and drilling into the team', () => {
    const onFilter = vi.fn(), onOpenTasks = vi.fn(), onDrillIn = vi.fn();
    const tree = MemberCardHeader({ ...props, onFilter, onOpenTasks, onDrillIn });
    tree.props.children[0].props.onClick();
    expect(onOpenTasks).toHaveBeenCalledOnce();
    const controls = tree.props.children[1].props.children;
    controls.slice(0, 4).forEach(control => control.props.onClick());
    expect(onFilter.mock.calls.map(([filter]) => filter)).toEqual(['pending', 'today', 'overdue', 'awaitingQC']);
    controls[4].props.onClick();
    expect(onDrillIn).toHaveBeenCalledWith(props.user);
  });
  it('keeps filter values inline, marks active filters and hides zero counts', () => {
    const html = renderToStaticMarkup(<MemberTaskFilter label="Overdue" value={1234} red active onClick={() => {}} />);
    expect(html).toContain('inline-flex');
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('1234');
    expect(renderToStaticMarkup(<MemberTaskFilter label="Today" value={0} />)).toBe('');
  });
  it('preserves leave and unlinked-user badges without showing team access for a leaf member', () => {
    const html = renderToStaticMarkup(<MemberCardHeader {...props} user={{ ...props.user, kekaEmployeeId: null }} hasTeam={false} leaveStatus="on_leave" />);
    expect(html).toContain('On Leave');
    expect(html).toContain('No Keka');
    expect(html).not.toContain('Not Arrived');
    expect(html).not.toContain("&#x27;s team");
  });
  it('preserves both clock-in and clock-out times and upcoming leave', () => {
    const html = renderToStaticMarkup(<MemberCardHeader {...props} leaveStatus="leave_soon" leaveDate="2026-11-03"
      attendanceStatus={{ hasArrived: true, isInOffice: false, clockIn: '2026-10-21T04:30:00Z', clockOut: '2026-10-21T12:30:00Z' }} />);
    expect(html.replace(/<!--.*?-->/g, '')).toContain('Leave 3 Nov');
    expect(html).toContain('lucide-log-in');
    expect(html).toContain('lucide-log-out');
    expect(html).not.toContain('Not Arrived');
  });
});
