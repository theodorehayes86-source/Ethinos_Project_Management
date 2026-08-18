import { describe, it, expect } from 'vitest';
import { templateAppliesToClient, applicabilityLabel } from '../PMT/shared/checklistApplicability';

describe('templateAppliesToClient', () => {
  const personalTpl = { applicability: 'personal' };
  const anyClientTpl = { applicability: 'any_client' };
  const ethinosTpl = { applicability: 'ethinos' };
  const legacyTpl = {}; // no applicability field

  it('legacy templates (no field) apply everywhere', () => {
    expect(templateAppliesToClient(legacyTpl, '__personal__')).toBe(true);
    expect(templateAppliesToClient(legacyTpl, '__ethinos__')).toBe(true);
    expect(templateAppliesToClient(legacyTpl, 'client-1')).toBe(true);
  });

  it('personal templates apply only to personal', () => {
    expect(templateAppliesToClient(personalTpl, '__personal__')).toBe(true);
    expect(templateAppliesToClient(personalTpl, '__ethinos__')).toBe(false);
    expect(templateAppliesToClient(personalTpl, 'client-1')).toBe(false);
  });

  it('any_client templates apply only to real clients', () => {
    expect(templateAppliesToClient(anyClientTpl, 'client-1')).toBe(true);
    expect(templateAppliesToClient(anyClientTpl, '__personal__')).toBe(false);
    expect(templateAppliesToClient(anyClientTpl, '__ethinos__')).toBe(false);
  });

  it('ethinos templates apply only to Ethinos Internal', () => {
    expect(templateAppliesToClient(ethinosTpl, '__ethinos__')).toBe(true);
    expect(templateAppliesToClient(ethinosTpl, '__personal__')).toBe(false);
    expect(templateAppliesToClient(ethinosTpl, 'client-1')).toBe(false);
  });

  it('handles numeric client ids via string normalization', () => {
    expect(templateAppliesToClient(anyClientTpl, 123)).toBe(true);
  });

  it('applicabilityLabel maps values and defaults to All', () => {
    expect(applicabilityLabel(undefined)).toBe('All');
    expect(applicabilityLabel('')).toBe('All');
    expect(applicabilityLabel('personal')).toBe('Personal');
    expect(applicabilityLabel('any_client')).toBe('Any client');
    expect(applicabilityLabel('ethinos')).toBe('Ethinos Internal');
  });
});
