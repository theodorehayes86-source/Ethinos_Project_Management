// Popup redirect handler — no MSAL needed here.
// Azure redirects the popup to this page with the auth code in the URL.
// We extract it and postMessage it to window.opener (the parent app),
// then close. postMessage works even inside sandboxed iframes.

const url = new URL(window.location.href);
const qs = url.searchParams;
const hash = new URLSearchParams(url.hash.slice(1));

const code = qs.get('code') ?? hash.get('code');
const state = qs.get('state') ?? hash.get('state');
const error = qs.get('error') ?? hash.get('error');
const errorDesc = qs.get('error_description') ?? hash.get('error_description');

const statusEl = document.getElementById('status');

if (!window.opener) {
  if (statusEl) statusEl.textContent = 'Popup error: no parent window found. Please close this tab and try again.';
} else {
  (window.opener as Window).postMessage(
    { type: 'ms-auth-callback', code, state, error, errorDesc },
    window.location.origin,
  );
  window.close();
}
