interface ZohoMailConfig {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  fromAddress: string;
  fromName: string;
}

function getConfig(): ZohoMailConfig {
  const apiBaseUrl = process.env.ZOHO_MAIL_API_BASE_URL;
  const accessToken = process.env.ZOHO_MAIL_ACCESS_TOKEN;
  const accountId = process.env.ZOHO_MAIL_ACCOUNT_ID;
  const fromAddress = process.env.ZOHO_MAIL_FROM_ADDRESS;
  const fromName =
    process.env.ZOHO_MAIL_FROM_NAME || "Nairobi Club";

  if (
    !apiBaseUrl ||
    !accessToken ||
    !accountId ||
    !fromAddress
  ) {
    throw new Error(
      "Zoho Mail configuration is incomplete.",
    );
  }

  return {
    apiBaseUrl,
    accessToken,
    accountId,
    fromAddress,
    fromName,
  };
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendZohoMail(
  input: SendEmailInput,
): Promise<void> {
  const config = getConfig();

  const response = await fetch(
    `${config.apiBaseUrl.replace(/\/$/, "")}/accounts/${encodeURIComponent(config.accountId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromAddress: config.fromAddress,
        toAddress: input.to,
        subject: input.subject,
        content: input.html,
        mailFormat: "html",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Zoho Mail request failed (${response.status}): ${body}`,
    );
  }
}

export async function sendLoginOtp(
  email: string,
  otp: string,
): Promise<void> {
  await sendZohoMail({
    to: email,
    subject: "Nairobi Club Committee Register — Verification Code",
    text: `Your Nairobi Club verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <p>Your Nairobi Club verification code is:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${otp}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not attempt to sign in, please contact the Club's ICT team.</p>
    `,
  });
}

export async function sendPasswordResetConfirmation(
  email: string,
): Promise<void> {
  await sendZohoMail({
    to: email,
    subject: "Nairobi Club Committee Register — Password Changed",
    text: "Your Nairobi Club Committee Register password has been changed. If you did not make this change, contact the Club's ICT team immediately.",
    html: `
      <p>Your Nairobi Club Committee Register password has been changed.</p>
      <p>If you did not make this change, contact the Club's ICT team immediately.</p>
    `,
  });
}
