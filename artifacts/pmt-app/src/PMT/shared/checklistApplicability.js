/**
 * Checklist template applicability — which "client" a template may be used for.
 *
 * Values stored on template.applicability:
 *   'personal'   — only for personal checklists
 *   'any_client' — any real (external) client
 *   'ethinos'    — only the Ethinos Internal client
 *
 * Legacy templates without the field are usable everywhere.
 */

export const APPLICABILITY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'any_client', label: 'Any client' },
  { value: 'ethinos', label: 'Ethinos Internal' },
];

export function applicabilityLabel(value) {
  if (!value) return 'All';
  return APPLICABILITY_OPTIONS.find(o => o.value === value)?.label || value;
}

/** Whether a template may be used to create a checklist for the given client id. */
export function templateAppliesToClient(tpl, clientId) {
  const a = tpl?.applicability;
  if (!a) return true; // legacy templates: usable everywhere
  if (String(clientId) === '__personal__') return a === 'personal';
  if (String(clientId) === '__ethinos__') return a === 'ethinos';
  return a === 'any_client';
}
