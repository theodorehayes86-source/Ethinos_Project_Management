import { PublicClientApplication } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;

// Dedicated popup redirect page — a Vite entry point with minimal MSAL code.
// MSAL v5 requires its own code running in the popup's redirect page to:
//   1. Exchange the auth code for tokens (reads PKCE verifier from localStorage)
//   2. Post the result back to window.opener (the parent window)
//   3. Close itself
// auth-redirect.html does exactly that (see src/auth-redirect.ts).
export const popupRedirectUri =
  window.location.origin + (import.meta.env.BASE_URL || '/') + 'auth-redirect.html';

export const msalConfig = {
  auth: {
    clientId: clientId || '',
    authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    redirectUri: popupRedirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true,
  },
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
  redirectUri: popupRedirectUri,
};

let _msalInstance = null;

export function getMsalInstance() {
  if (!_msalInstance) {
    if (!clientId) {
      throw new Error(
        'VITE_AZURE_CLIENT_ID is not set. Microsoft login is not configured.'
      );
    }
    if (!tenantId) {
      throw new Error(
        'VITE_AZURE_TENANT_ID is not set. Microsoft login is not configured.'
      );
    }
    _msalInstance = new PublicClientApplication(msalConfig);
  }
  return _msalInstance;
}
