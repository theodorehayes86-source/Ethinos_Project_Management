# Ethinos Flow Pro — Teams App

This directory contains the Microsoft Teams app manifest that enables real-time activity-feed pings when a user is @mentioned in a task chat message.

## How it works

1. A user types `@Emily` in any task chat and sends the message.
2. The PMT backend resolves Emily's Microsoft Entra Object ID (cached in Firebase after the first lookup).
3. The API calls `POST /users/{objectId}/teamwork/sendActivityNotification` via Microsoft Graph.
4. Emily sees a notification in her Teams activity feed (bell icon) with the sender's name, task name, and a deep link back to Flow Pro.

Teams notifications are **additive** — if Teams is not configured or the user has opted out, the existing email notification still fires as normal.

---

## One-time Azure admin setup

### 1. Add the `TeamsActivity.Send` Graph permission

In the [Azure Portal](https://portal.azure.com):

1. Open **Azure Active Directory → App registrations → Ethinos PMT** (the same registration used for MSAL login and Graph email).
2. Go to **API permissions → Add a permission → Microsoft Graph → Application permissions**.
3. Search for and add **`TeamsActivity.Send`**.
4. Click **Grant admin consent for [your tenant]**.

### 2. Note the App Object ID that will become `TEAMS_APP_ID`

The `TEAMS_APP_ID` is a UUID you choose when publishing the Teams app. It must match the `id` field in `manifest.json`. You can use any UUID — generate one with `uuidgen` or an online tool. Save it — you'll need it in step 4.

### 3. Build the app package

Replace `${TEAMS_APP_ID}` and `${VITE_AZURE_CLIENT_ID}` in `manifest.json` with their real values, then zip the directory:

```bash
cd teams-app
zip ethinos-flow-pro.zip manifest.json icon-color.png icon-outline.png
```

The icons must be:
- `icon-color.png` — 192×192 px, full-colour PNG (brand logo)
- `icon-outline.png` — 32×32 px, white/transparent outline PNG

Placeholder icon files are included in this directory. Replace them with the real Ethinos branding before publishing.

### 4. Publish to the tenant app catalog

In the **Microsoft Teams admin center** ([admin.teams.microsoft.com](https://admin.teams.microsoft.com)):

1. Go to **Teams apps → Manage apps → Upload new app**.
2. Upload `ethinos-flow-pro.zip`.
3. The app will appear with status **Submitted** (or directly **Published** depending on your policies).
4. Approve/publish it so it is available in the tenant app catalog.

### 5. Set the `TEAMS_APP_ID` secret in Replit

In the Replit Secrets panel, add:

| Secret | Value |
|--------|-------|
| `TEAMS_APP_ID` | The UUID you used as `id` in `manifest.json` |

Restart the API server. The startup log will confirm `Teams activity notifications configured`.

### 6. Enable notifications per user

In the PMT **Control Centre → Users** tab, turn on the **Teams Pings** toggle for each user you want to receive Teams activity notifications. The toggle defaults to **off** for all existing users.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No notification appears | Confirm the user has the app installed (from the tenant catalog), `TeamsActivity.Send` admin consent is granted, and their **Teams Pings** toggle is on in Control Centre. |
| API logs show `sendActivityNotification failed 403` | The app is not installed for that user. Policy-based auto-installation may be needed (Teams admin center → Setup policies). |
| API logs show `Could not resolve Entra Object ID` | The user's `@ethinos.com` email is not in Entra ID, or the Graph `User.Read.All` permission is missing. |
| `TEAMS_APP_ID` warning at startup | The secret is not set. Teams pings are silently skipped; all other features work normally. |
