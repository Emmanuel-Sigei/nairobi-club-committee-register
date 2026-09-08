interface ZohoMailConfig {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  fromAddress: string;
  fromName: string;
}

interface SendMailInput {
  toAddress: string;
  subject: string;
  content: string;
}

function getConfig(): ZohoMailConfig {
  const apiBaseUrl = process.env.ZOHO_MAIL_API_BASE_URL?.trim();
  const accessToken = process.env.ZOHO_MAIL_ACCESS_TOKEN?.trim();
  const accountId = process.env.ZOHO_MAIL_ACCOUNT_ID?.trim();
  const fromAddress = process.env.ZOHO_MAIL_FROM_ADDRESS?.trim();
  const fromName =
    process.env.ZOHO_MAIL_FROM_NAME?.trim() || "Nairobi Club";

  if (
    !apiBaseUrl ||
    !accessToken ||
    !accountId ||
    !fromAddress
  ) {
    throw new Error("Zoho Mail configuration is incomplete.");
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    accessToken,
    accountId,
    fromAddress,
    fromName,
  };
}

export function assertZohoMailConfigured(): void {
  getConfig();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendZohoMail({
  toAddress,
  subject,
  content,
}: SendMailInput): Promise<void> {
  const config = getConfig();

  const response = await fetch(
    `${config.apiBaseUrl}/accounts/${encodeURIComponent(config.accountId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${config.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fromAddress: config.fromAddress,
        toAddress,
        subject,
        content,
        mailFormat: "html",
      }),
    },
  );

  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(`Zoho Mail request failed with HTTP ${response.status}.`);
  }
}

function appUrl(): string {
  const value = process.env.APP_URL?.trim();

  if (!value) {
    throw new Error("APP_URL is not configured.");
  }

  return value.replace(/\/+$/, "");
}

export async function sendLoginOtp(
  email: string,
  name: string,
  code: string,
): Promise<void> {
  const safeName = escapeHtml(name);

  await sendZohoMail({
    toAddress: email,
    subject: "Your Nairobi Club verification code",
    content: `
      <p>Dear ${safeName},</p>
      <p>Your Nairobi Club Committee Register verification code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;">${code}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not attempt to sign in, please contact the Club's ICT team.</p>
      <p>Regards,<br>Nairobi Club ICT</p>
    `,
  });
}

export async function sendInvitationEmail(
  email: string,
  name: string,
  token: string,
): Promise<void> {
  const safeName = escapeHtml(name);
  const url = `${appUrl()}/set-password?token=${encodeURIComponent(token)}`;

  await sendZohoMail({
    toAddress: email,
    subject: "Nairobi Club Committee Register invitation",
    content: `
      <p>Dear ${safeName},</p>
      <p>You have been invited to access the Nairobi Club Committee Register.</p>
      <p>Please use the secure link below to set your password:</p>
      <p><a href="${url}">Set your password</a></p>
      <p>This invitation expires in 48 hours.</p>
      <p>If you were not expecting this invitation, please contact the Club's ICT team.</p>
      <p>Regards,<br>Nairobi Club ICT</p>
    `,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string,
): Promise<void> {
  const safeName = escapeHtml(name);
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  await sendZohoMail({
    toAddress: email,
    subject: "Nairobi Club password reset",
    content: `
      <p>Dear ${safeName},</p>
      <p>A password reset was requested for your Nairobi Club Committee Register account.</p>
      <p><a href="${url}">Reset your password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request this, you can safely ignore this message.</p>
      <p>Regards,<br>Nairobi Club ICT</p>
    `,
  });
}

export async function sendPasswordResetConfirmation(
  email: string,
  name: string,
): Promise<void> {
  const safeName = escapeHtml(name);

  await sendZohoMail({
    toAddress: email,
    subject: "Nairobi Club password changed",
    content: `
      <p>Dear ${safeName},</p>
      <p>Your Nairobi Club Committee Register password has been changed successfully.</p>
      <p>All previous sessions have been invalidated.</p>
      <p>If you did not make this change, contact the Club's ICT team immediately.</p>
      <p>Regards,<br>Nairobi Club ICT</p>
    `,
  });
}