// Palette regression: Creative Studio must use the existing Flow Pro
// white/slate/indigo system and stay mirrored between desktop and mobile.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILES = ['core.js', 'StudioUI.jsx', 'StudioWorkspace.jsx', 'StudioControlPanel.jsx', 'PortalStudio.jsx', 'StudioReminderLog.jsx'];
const desktop = (f) => readFileSync(resolve(__dirname, '../lib/creativeStudio', f), 'utf8');
const mobile = (f) => readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/creativeStudio', f), 'utf8');
const all = FILES.map(desktop).join('\n');

describe('Creative Studio palette', () => {
  it('has no black/slate-900 filled controls (backdrop overlay excepted)', () => {
    const fills = all.match(/bg-(?:slate-900|black|slate-800)(?!\/40)\b/g) || [];
    expect(fills).toEqual([]);
    expect(all).not.toMatch(/hover:bg-slate-800/);
  });
  it('primary buttons are indigo', () => {
    const ui = desktop('StudioUI.jsx');
    expect(ui).toMatch(/btnPrimary = '[^']*bg-indigo-600[^']*hover:bg-indigo-700/);
    expect(ui).toMatch(/btnAccent = '[^']*bg-indigo-600/);
  });
  it('does not use off-system colour families or editorial branding', () => {
    expect(all).not.toMatch(/\b(?:rose|sky|stone|orange|violet|fuchsia)-\d/);
    expect(all).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(all).not.toMatch(/Fraunces/);
  });
  it('KPI cards and calendar rows are neutral surfaces, not tinted', () => {
    const ws = desktop('StudioWorkspace.jsx');
    for (const box of ws.match(/box: '[^']*'/g) || []) expect(box).toBe("box: 'bg-white border-slate-200'");
    const rowTone = ws.slice(ws.indexOf('const rowTone'), ws.indexOf('const typeChip'));
    expect(rowTone).not.toMatch(/bg-(?:emerald|amber|red|blue)-\d/);
    expect(all).not.toMatch(/bg-(?:emerald|amber|red|blue)-50\/\d+/);
  });
  it('portal decision panel is light with semantic actions', () => {
    const p = desktop('PortalStudio.jsx');
    const panel = p.slice(p.indexOf('"panel-portal-decision"'), p.indexOf('"panel-portal-decision"') + 1500);
    expect(panel).toMatch(/bg-white border border-slate-200/);
    expect(panel).toMatch(/bg-emerald-600/);
    expect(panel).toMatch(/bg-red-50 text-red-700/);
    expect(panel).not.toMatch(/text-white\/|bg-white\/10/);
  });
  it('desktop and mobile copies are identical', () => {
    for (const f of FILES) expect(mobile(f), f).toBe(desktop(f));
  });
});
