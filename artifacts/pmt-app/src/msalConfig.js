import { PublicClientApplication } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;

export const msalConfig = {
  auth: {
    clientId: clientId || '',
    authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    redirectUri: window.location.origin + (import.meta.env.BASE_URL || '/'),
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
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
