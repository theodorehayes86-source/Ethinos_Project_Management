import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLACEHOLDER_MEANINGS } from '../lib/creativeStudio/StudioControlPanel.jsx';

describe('Creative Studio email variables and deadline input', () => {
  it('explains each live email variable', () => {
    expect(PLACEHOLDER_MEANINGS).toEqual({
      '{{recipientName}}': 'Recipient first and last name', '{{firstName}}': 'Recipient first name', '{{lastName}}': 'Recipient last name',
      '{{client}}': 'Client company name', '{{post}}': 'Post name', '{{date}}': 'Posting date',
      '{{type}}': 'Story, Reel or Post', '{{deadline}}': 'Deadline time and date',
    });
  });
  it('keeps deadline editing and the variable legend identical on desktop and mobile', () => {
    for (const file of ['StudioControlPanel.jsx', 'StudioWorkspace.jsx']) {
      const desktop = readFileSync(new URL(`../lib/creativeStudio/${file}`, import.meta.url), 'utf8');
      const mobile = readFileSync(new URL(`../../../pmt-mobile/src/lib/creativeStudio/${file}`, import.meta.url), 'utf8');
      expect(mobile).toBe(desktop);
      if (file === 'StudioWorkspace.jsx') {
        expect(desktop).toContain('data-testid="input-due-time" type="time"');
        expect(desktop).toContain('productionDueTime: f.productionDueDate && f.productionDueTime ? f.productionDueTime : null');
      } else {
        expect(desktop).toContain('Send time, timezone and cadence apply to both reminders.');
        expect(desktop).toContain('Variables are replaced with the client and post details when the email is sent.');
      }
    }
  });
});
