// Minimal MSAL initialisation for the popup redirect page.
// This page is opened by MSAL's loginPopup() after Microsoft auth completes.
// Calling handleRedirectPromise() here causes MSAL to:
//   1. Read the auth code from the URL
//   2. Exchange it for tokens (PKCE verifier is in localStorage, shared with parent)
//   3. Post the result back to window.opener (the parent window)
//   4. Close this popup window

import { PublicClientApplication } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string;
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID as string;

if (clientId && tenantId) {
  const redirectUri =
    window.location.origin + (import.meta.env.BASE_URL || '/') + 'auth-redirect.html';

  const app = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: true,
    },
  });

  app
    .initialize()
    .then(() => app.handleRedirectPromise())
    .then((result) => {
      // result is non-null if we processed an auth response.
      // MSAL already posted the result to window.opener — just close.
      if (result) window.close();
    })
    .catch(() => {
      // If something went wrong, close the popup so the parent can show an error.
      window.close();
    });
}
