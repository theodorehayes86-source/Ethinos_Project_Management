import { logger } from "./logger";

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getAzureConfig() {
  const tenantId = process.env.AZURE_TENANT_ID || process.env.VITE_AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const senderEmail = process.env.MS_SENDER_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !senderEmail) {
    throw new Error(
      "Microsoft Graph email is not configured. Required: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, MS_SENDER_EMAIL"
    );
  }

  return { tenantId, clientId, clientSecret, senderEmail };
}

async function getAccessToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = getAzureConfig();

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get Microsoft Graph token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as GraphTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
}): Promise<void> {
  const { senderEmail } = getAzureConfig();
  const token = await getAccessToken();

  const message = {
    message: {
      subject: params.subject,
      body: {
        contentType: "HTML",
        content: params.bodyHtml,
      },
      toRecipients: [
        {
          emailAddress: {
            address: params.to,
          },
        },
      ],
    },
    saveToSentItems: false,
  };

  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;

  const response = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "Microsoft Graph sendMail failed");
    throw new Error(`Failed to send email via Microsoft Graph: ${response.status} ${text}`);
  }

  logger.info({ to: params.to, subject: params.subject }, "Email sent via Microsoft Graph");
}

export function isEmailConfigured(): boolean {
  return !!(
    (process.env.AZURE_TENANT_ID || process.env.VITE_AZURE_TENANT_ID) &&
    (process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID) &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.MS_SENDER_EMAIL
  );
}
