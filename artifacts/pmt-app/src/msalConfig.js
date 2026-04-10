import { PublicClientApplication } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;

// Use the app's own root URL as the popup redirect URI.
// MSAL v5 requires its own code running in the popup page so it can process
// the auth code and post the result back to the parent window.  Redirecting
// to a blank page breaks that mechanism.  By pointing back at our app root,
// the popup loads our React app, MSAL initialises, detects window.opener,
// handles the redirect, messages the parent, and closes itself.
export const popupRedirectUri = window.location.origin + (import.meta.env.BASE_URL || '/');

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
