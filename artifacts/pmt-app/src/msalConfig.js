import { PublicClientApplication } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;

// The popup opens this lightweight page after MS login so MSAL can read the
// auth code without loading our full React app (which avoids Replit's
// "development preview" banner intercepting the redirect).
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
        'VITE_AZURE_CLIENT_ID is not set. Microsoft login is not configured. ' +
        'Set VITE_AZURE_CLIENT_ID in your Replit Secrets.'
      );
    }
    if (!tenantId) {
      throw new Error(
        'VITE_AZURE_TENANT_ID is not set. Microsoft login is not configured. ' +
        'Set VITE_AZURE_TENANT_ID in your Replit Secrets.'
      );
    }
    _msalInstance = new PublicClientApplication(msalConfig);
  }
  return _msalInstance;
}
