# Ethinos PMT – API Server

Express/TypeScript backend providing auth utilities and Microsoft Graph email delivery for the PMT application.

## Required Environment Secrets

All secrets must be set in the **Replit Secrets panel** before starting the server.
The server will **exit immediately at startup** if any Azure secret is missing.

### Backend (API Server)

| Secret | Description |
|---|---|
| `AZURE_TENANT_ID` | Azure AD tenant GUID (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Used to validate MS ID token `iss`/`tid` claims and to scope Microsoft Graph email sending. |
| `AZURE_CLIENT_ID` | App registration client ID. Used as the `aud` claim when verifying MS ID tokens. |
| `AZURE_CLIENT_SECRET` | App registration client secret. Used for client-credentials flow to obtain Graph API access tokens. |
| `MS_SENDER_EMAIL` | The mailbox from which system emails are sent (e.g. `noreply@ethinos.com`). Must be a licensed Microsoft 365 user/shared mailbox granted `Mail.Send` permission. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON content of the Firebase Admin SDK service account key. |
| `VITE_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL (shared with the frontend). |

### Frontend (pmt-app)

| Variable | Description |
|---|---|
| `VITE_AZURE_TENANT_ID` | Same tenant GUID as `AZURE_TENANT_ID` — used by MSAL to build the authority URL. |
| `VITE_AZURE_CLIENT_ID` | Same client ID as `AZURE_CLIENT_ID` — used by MSAL for the auth redirect. |
| `VITE_API_BASE_URL` | Base URL of the API server (e.g. `https://<replit-domain>/api`). |

## Endpoints

| Method | Path | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/auth/ms-token-exchange` | None (pre-login) | Validates Microsoft ID token via JWKS, returns Firebase custom token. |
| `POST` | `/api/auth/create-user` | Firebase Bearer token — caller must have `Super Admin` or `Admin` PMT role (verified from database) | Creates a Firebase user, auto-generates a password, sends welcome email. Target email must be `@ethinos.com`. |
| `POST` | `/api/auth/reset-password` | None (self-service) | Generates a Firebase password-reset link and emails it via Microsoft Graph. Only `@ethinos.com` addresses accepted. |

## Azure AD App Registration Requirements

- **Supported account types:** Single tenant (your `@ethinos.com` directory only)
- **API permissions:** `Mail.Send` (Application permission) — requires admin consent
- **Client secret:** Create under *Certificates & secrets* and store as `AZURE_CLIENT_SECRET`
