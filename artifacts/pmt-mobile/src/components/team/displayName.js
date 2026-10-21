// Display-only: keep the original directory name and user identity unchanged.
export function personDisplayName(name) {
  return typeof name === 'string' ? name.split('|', 1)[0].trim() : '';
}
