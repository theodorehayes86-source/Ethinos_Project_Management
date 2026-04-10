# Ethinos PMT — Replit Workspace

## Overview

Ethinos Project Management Tool (PMT) — full-stack project tracking app for ~80 Ethinos staff.
pnpm monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

| Artifact | Kind | Path | Description |
|---|---|---|---|
| `artifacts/pmt-app` | web | `/` | Main React + Vite frontend app |
| `artifacts/api-server` | api | `/api` | Express + TypeScript backend (auth, email, export) |
| `artifacts/pmt-timer-widget` | web | `/pmt-timer-widget` | Electron timer widget dev preview |
| `artifacts/mockup-sandbox` | design | `/__mockup` | Component preview sandbox |

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4
- **Backend**: Express 5 + TypeScript + esbuild
- **Auth**: Firebase Auth (email/password) + Microsoft MSAL (Microsoft 365 login)
- **Database**: Firebase Realtime Database (primary app data) + PostgreSQL + Drizzle ORM
- **Email**: Microsoft Graph API (via app registration with Mail.Send permission)
- **Desktop widget**: Electron + React + Vite

## Authentication Flow

### Email / Password
Standard Firebase email+password auth. Restricted to `@ethinos.com` addresses.

### Microsoft 365 Login (primary path)
1. Frontend: MSAL.js calls `loginPopup` → gets Microsoft ID token
2. Frontend: POSTs ID token to `POST /api/auth/ms-token-exchange`
3. API server: validates ID token via Azure JWKS (verifies `iss`, `aud`, `tid` claims)
4. API server: issues Firebase custom token
5. Frontend: signs into Firebase with `signInWithCustomToken`

### Admin Creates a User
1. Super Admin / Admin fills CC → Users → Add User form
2. Frontend: POSTs to `POST /api/auth/create-user` with Firebase Bearer token
3. API server: verifies caller has Super Admin/Admin role via Firebase DB lookup
4. API server: creates Firebase Auth account with auto-generated password, sends welcome email via Graph

### Password Reset
1. User enters `@ethinos.com` email on login screen → "Forgot password?"
2. Frontend: POSTs to `POST /api/auth/reset-password`
3. API server: generates Firebase password-reset link, emails it via Microsoft Graph

## Required Secrets

### Backend (API server — all required for startup)
| Secret | Description |
|---|---|
| `AZURE_TENANT_ID` | Azure AD tenant GUID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret (client-credentials for Graph API) |
| `MS_SENDER_EMAIL` | Licensed M365 mailbox granted `Mail.Send` (e.g. `noreply@ethinos.com`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK service account JSON |
| `VITE_FIREBASE_DATABASE_URL` | Firebase Realtime DB URL (shared with frontend) |
| `PMT_EXPORT_API_KEY` | API key protecting the CSV export endpoint |
| `SESSION_SECRET` | Express session secret |

### Frontend (pmt-app)
| Secret / Env Var | Description |
|---|---|
| `VITE_AZURE_TENANT_ID` | Same value as `AZURE_TENANT_ID` — used by MSAL |
| `VITE_AZURE_CLIENT_ID` | Same value as `AZURE_CLIENT_ID` — used by MSAL |
| `VITE_FIREBASE_API_KEY` | Firebase web SDK key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |

## Key API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/ms-token-exchange` | None | Validates MS ID token → returns Firebase custom token |
| `POST` | `/api/auth/create-user` | Firebase Bearer (Super Admin / Admin only) | Creates Firebase user + sends welcome email |
| `POST` | `/api/auth/reset-password` | None (rate-limited) | Sends password-reset link via M365 email |
| `GET` | `/api/export/...` | `PMT_EXPORT_API_KEY` header | CSV data export |

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Widget Downloads (Ethinos Timer Pro)

GitHub releases tagged `v{version}` (e.g. `v1.0.19`):
- Windows: `Ethinos.Timer.Pro.Setup.{version}.exe`
- Mac: `Ethinos.Timer.Pro-{version}-universal.dmg`
- CI workflow (`build-widget.yml`) builds on push to `main` when `artifacts/pmt-timer-widget/**` changes

## Important Files

```
artifacts/pmt-app/src/App.jsx             — main app state, auth handlers, Firebase sync
artifacts/pmt-app/src/msalConfig.js       — MSAL instance + login request config
artifacts/pmt-app/src/PMT/LoginView.jsx   — login/register/reset UI (email + MS button)
artifacts/pmt-app/src/PMT/MasterDataView.jsx — Control Center (users, clients, etc.)
artifacts/pmt-app/src/PMT/HomeView.jsx    — Home task board
artifacts/pmt-app/src/PMT/Sidebar.jsx     — sidebar nav + widget download links
artifacts/api-server/src/index.ts         — server entry, Azure secret validation
artifacts/api-server/src/routes/auth.ts   — MS token exchange, create-user, reset-password
artifacts/api-server/src/lib/microsoft-graph.ts — Graph API email sender
.github/workflows/build-widget.yml        — Electron widget CI/CD
```

## Azure AD App Registration Requirements

- **Supported account types:** Single tenant (`@ethinos.com` directory only)
- **API permissions:** `Mail.Send` (Application permission) — requires admin consent
- **Redirect URI:** Set to the Replit app's origin (for MSAL popup)
- **Client secret:** Create under Certificates & secrets, store as `AZURE_CLIENT_SECRET`
