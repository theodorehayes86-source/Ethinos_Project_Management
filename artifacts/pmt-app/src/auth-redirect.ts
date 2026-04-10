// Popup / new-tab redirect handler for Microsoft login.
// Azure redirects here after the user completes sign-in.
// Strategy:
//   1. postMessage to window.opener (works when opened as a true popup)
//   2. localStorage + storage event (works when opened as a new tab, since
//      storage events fire in all other tabs of the same origin)

const log = (msg: string, isError = false) => {
  console[isError ? 'error' : 'log']('[auth-redirect]', msg);
  const el = document.getElementById('log');
  if (el) {
    const row = document.createElement('div');
    row.style.cssText = `font-family:monospace;font-size:12px;margin:3px 0;color:${isError ? '#dc2626' : '#374151'}`;
    row.textContent = msg;
    el.appendChild(row);
  }
};

const url = new URL(window.location.href);
const qs  = url.searchParams;
const hashParams = new URLSearchParams(url.hash.slice(1));

const code      = qs.get('code')              ?? hashParams.get('code');
const state     = qs.get('state')             ?? hashParams.get('state');
const error     = qs.get('error')             ?? hashParams.get('error');
const errorDesc = qs.get('error_description') ?? hashParams.get('error_description');

log(`URL: ${window.location.pathname}${window.location.search.slice(0, 60)}`);
log(`code:  ${code      ? code.slice(0, 24) + '…'  : 'MISSING'}`);
log(`state: ${state     ? state.slice(0, 24) + '…' : 'MISSING'}`);
log(`error: ${error || 'none'}`);
log(`window.opener: ${window.opener ? 'present ✓' : 'NULL — new-tab mode, using localStorage fallback'}`);

if (error) {
  log(`Auth error: ${errorDesc || error}`, true);
  // Still notify the parent so it can show the error.
}

const payload = { type: 'ms-auth-callback', code, state, error, errorDesc, ts: Date.now() };

// --- Primary: postMessage (popup mode) ---
if (window.opener) {
  try {
    (window.opener as Window).postMessage(payload, window.location.origin);
    log('postMessage sent to opener ✓ — closing…');
    setTimeout(() => window.close(), 800);
  } catch (e: any) {
    log(`postMessage failed: ${e.message}`, true);
  }
}

// --- Fallback: localStorage (new-tab mode) ---
// Even if postMessage was sent, also write to localStorage so the parent
// picks it up via the storage event regardless of opener availability.
try {
  localStorage.setItem('ms_auth_result', JSON.stringify(payload));
  log('localStorage fallback written ✓');
  setTimeout(() => {
    window.close();
    // If close() is blocked (e.g. tab not opened by script), tell the user.
    setTimeout(() => {
      const el = document.getElementById('close-msg');
      if (el) el.style.display = 'block';
    }, 1200);
  }, 1200);
} catch (e: any) {
  log(`localStorage write failed: ${e.message}`, true);
}
