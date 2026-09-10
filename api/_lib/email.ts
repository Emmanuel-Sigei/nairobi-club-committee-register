import nodemailer from "nodemailer";

interface ZohoMailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  appPassword: string;
  fromAddress: string;
  fromName: string;
}

interface SendMailInput {
  toAddress: string;
  subject: string;
  title: string;
  preheader: string;
  bodyHtml: string;
}

interface DetailRow {
  label: string;
  value: string;
}

const DEFAULT_LOGO_URL =
  "https://images.squarespace-cdn.com/content/v1/67af2554d0698256adb3fd86/2016c344-40cb-4baa-95c9-3890b5e8c083/Nairobi-Club-logo-Gold-NoText.png";

const NAVY = "#0B1F3A";
const NAVY_LIGHT = "#17365F";
const GOLD = "#C9A35B";
const GOLD_PALE = "#F8F3E8";
const INK = "#1D2939";
const MUTED = "#667085";
const BORDER = "#E4E7EC";
const PAGE = "#F5F7FA";
const WHITE = "#FFFFFF";

function getConfig(): ZohoMailConfig {
  const host =
    process.env.ZOHO_SMTP_HOST
      ?.trim();

  const portValue =
    process.env.ZOHO_SMTP_PORT
      ?.trim() || "587";

  const user =
    process.env.ZOHO_SMTP_USER
      ?.trim();

  const appPassword =
    process.env.ZOHO_SMTP_APP_PASSWORD
      ?.trim();

  const fromAddress =
    process.env.ZOHO_MAIL_FROM_ADDRESS
      ?.trim();

  const fromName =
    process.env.ZOHO_MAIL_FROM_NAME
      ?.trim();

  const port =
    Number(portValue);

  if (
    !host ||
    !user ||
    !appPassword ||
    !fromAddress ||
    !fromName ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "Zoho Mail SMTP configuration is incomplete.",
    );
  }

  return {
    host,
    port,
    secure:
      port === 465,
    user,
    appPassword,
    fromAddress,
    fromName,
  };
}

export function assertZohoMailConfigured(): void {
  getConfig();
}

export function isZohoMailConfigured(): boolean {
  const port =
    Number(
      process.env.ZOHO_SMTP_PORT
        ?.trim() || "587",
    );

  return Boolean(
    process.env.ZOHO_SMTP_HOST
      ?.trim() &&
    process.env.ZOHO_SMTP_USER
      ?.trim() &&
    process.env.ZOHO_SMTP_APP_PASSWORD
      ?.trim() &&
    process.env.ZOHO_MAIL_FROM_ADDRESS
      ?.trim() &&
    process.env.ZOHO_MAIL_FROM_NAME
      ?.trim() &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535,
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logoUrl(): string {
  return (
    process.env.EMAIL_LOGO_URL
      ?.trim() ||
    DEFAULT_LOGO_URL
  );
}

function paragraph(
  html: string,
): string {
  return `
    <p style="
      margin:0 0 18px 0;
      color:${INK};
      font-family:'Segoe UI',Arial,Helvetica,sans-serif;
      font-size:15px;
      line-height:1.7;
    ">
      ${html}
    </p>
  `;
}

function notice(
  title: string,
  text: string,
): string {
  return `
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="
        margin:22px 0;
        border-collapse:separate;
        background:${GOLD_PALE};
        border:1px solid #E8D7B1;
        border-radius:10px;
      "
    >
      <tr>
        <td style="padding:16px 18px;">
          <div style="
            margin:0 0 5px 0;
            color:${NAVY};
            font-family:'Segoe UI',Arial,Helvetica,sans-serif;
            font-size:13px;
            line-height:1.4;
            font-weight:700;
            text-transform:uppercase;
            letter-spacing:.6px;
          ">
            ${escapeHtml(title)}
          </div>
          <div style="
            color:${INK};
            font-family:'Segoe UI',Arial,Helvetica,sans-serif;
            font-size:14px;
            line-height:1.6;
          ">
            ${escapeHtml(text)}
          </div>
        </td>
      </tr>
    </table>
  `;
}

function button(
  href: string,
  label: string,
): string {
  return `
    <table
      role="presentation"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="margin:24px 0 26px 0;"
    >
      <tr>
        <td
          bgcolor="${NAVY}"
          style="
            border-radius:8px;
            box-shadow:0 2px 5px rgba(11,31,58,.16);
          "
        >
          <a
            href="${escapeHtml(href)}"
            style="
              display:inline-block;
              padding:13px 22px;
              color:${WHITE};
              font-family:'Segoe UI',Arial,Helvetica,sans-serif;
              font-size:14px;
              line-height:1.3;
              font-weight:700;
              text-decoration:none;
              border-radius:8px;
            "
          >
            ${escapeHtml(label)} &nbsp;&#8594;
          </a>
        </td>
      </tr>
    </table>
  `;
}

function detailTable(
  rows: DetailRow[],
): string {
  const renderedRows =
    rows
      .map(
        (row) => `
          <tr>
            <td
              valign="top"
              style="
                width:34%;
                padding:11px 12px;
                border-bottom:1px solid ${BORDER};
                color:${MUTED};
                font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                font-size:13px;
                line-height:1.5;
                font-weight:600;
              "
            >
              ${escapeHtml(row.label)}
            </td>
            <td
              valign="top"
              style="
                padding:11px 12px;
                border-bottom:1px solid ${BORDER};
                color:${INK};
                font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                font-size:14px;
                line-height:1.5;
                font-weight:600;
              "
            >
              ${escapeHtml(row.value)}
            </td>
          </tr>
        `,
      )
      .join("");

  return `
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="
        margin:22px 0;
        border:1px solid ${BORDER};
        border-radius:10px;
        border-collapse:separate;
        border-spacing:0;
        overflow:hidden;
        background:${WHITE};
      "
    >
      ${renderedRows}
    </table>
  `;
}

function otpPanel(
  code: string,
): string {
  return `
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="margin:24px 0;"
    >
      <tr>
        <td
          align="center"
          style="
            padding:22px;
            border:1px solid #D7C18E;
            border-radius:12px;
            background:${GOLD_PALE};
          "
        >
          <div style="
            margin:0 0 7px 0;
            color:${MUTED};
            font-family:'Segoe UI',Arial,Helvetica,sans-serif;
            font-size:11px;
            line-height:1.4;
            font-weight:700;
            letter-spacing:1.2px;
            text-transform:uppercase;
          ">
            Verification code
          </div>
          <div style="
            color:${NAVY};
            font-family:'Segoe UI',Arial,Helvetica,sans-serif;
            font-size:34px;
            line-height:1.2;
            font-weight:700;
            letter-spacing:8px;
          ">
            ${escapeHtml(code)}
          </div>
        </td>
      </tr>
    </table>
  `;
}

function emailShell(input: {
  title: string;
  preheader: string;
  bodyHtml: string;
}): string {
  const logo =
    escapeHtml(
      logoUrl(),
    );

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <meta
    name="color-scheme"
    content="light"
  >
  <title>${escapeHtml(input.title)}</title>
</head>
<body
  style="
    margin:0;
    padding:0;
    background:${PAGE};
    -webkit-text-size-adjust:100%;
  "
>
  <div style="
    display:none;
    max-height:0;
    overflow:hidden;
    opacity:0;
    color:transparent;
    mso-hide:all;
  ">
    ${escapeHtml(input.preheader)}
  </div>

  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    bgcolor="${PAGE}"
    style="background:${PAGE};"
  >
    <tr>
      <td
        align="center"
        style="padding:32px 14px;"
      >
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            width:100%;
            max-width:640px;
            border-collapse:separate;
          "
        >
          <tr>
            <td
              style="
                background:${NAVY};
                border-radius:14px 14px 0 0;
                padding:25px 30px;
              "
            >
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
              >
                <tr>
                  <td
                    valign="middle"
                    width="116"
                    style="width:116px;"
                  >
                    <img
                      src="${logo}"
                      alt="Nairobi Club"
                      width="94"
                      style="
                        display:block;
                        width:94px;
                        max-width:94px;
                        height:auto;
                        border:0;
                      "
                    >
                  </td>
                  <td
                    valign="middle"
                    style="
                      padding-left:12px;
                      color:${WHITE};
                      font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                    "
                  >
                    <div style="
                      font-size:23px;
                      line-height:1.15;
                      font-weight:700;
                      letter-spacing:.4px;
                    ">
                      Nairobi Club
                    </div>
                    <div style="
                      margin-top:5px;
                      color:${GOLD};
                      font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                      font-size:11px;
                      line-height:1.4;
                      font-weight:700;
                      letter-spacing:1.3px;
                      text-transform:uppercase;
                    ">
                      Committee Register
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td
              height="5"
              bgcolor="${GOLD}"
              style="
                height:5px;
                line-height:5px;
                font-size:0;
                background:${GOLD};
              "
            >
              &nbsp;
            </td>
          </tr>

          <tr>
            <td
              bgcolor="${WHITE}"
              style="
                padding:34px 34px 28px 34px;
                background:${WHITE};
                border-left:1px solid ${BORDER};
                border-right:1px solid ${BORDER};
              "
            >
              <div style="
                margin:0 0 24px 0;
                color:${NAVY};
                font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                font-size:27px;
                line-height:1.25;
                font-weight:700;
              ">
                ${escapeHtml(input.title)}
              </div>

              ${input.bodyHtml}
            </td>
          </tr>

          <tr>
            <td
              style="
                padding:22px 30px 25px 30px;
                background:${NAVY_LIGHT};
                border-radius:0 0 14px 14px;
                text-align:center;
              "
            >
              <div style="
                color:#D7DEE8;
                font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                font-size:12px;
                line-height:1.6;
              ">
                Nairobi Club Committee Register
              </div>
              <div style="
                margin-top:5px;
                color:${GOLD};
                font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                font-size:11px;
                line-height:1.5;
              ">
                Nairobi Club
              </div>
              <div style="
                margin-top:10px;
                color:#9EACBD;
                font-family:'Segoe UI',Arial,Helvetica,sans-serif;
                font-size:10px;
                line-height:1.5;
              ">
                This is an automated message from Nairobi Club.
                Please do not forward security codes or password links.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendZohoMail({
  toAddress,
  subject,
  title,
  preheader,
  bodyHtml,
}: SendMailInput): Promise<void> {
  const config =
    getConfig();

  const transport =
    nodemailer.createTransport({
      host:
        config.host,
      port:
        config.port,
      secure:
        config.secure,
      requireTLS:
        !config.secure,
      auth: {
        user:
          config.user,
        pass:
          config.appPassword,
      },
      connectionTimeout:
        15000,
      greetingTimeout:
        10000,
      socketTimeout:
        30000,
      tls: {
        minVersion:
          "TLSv1.2",
      },
    });

  try {
    await transport.sendMail({
      from: {
        name:
          config.fromName,
        address:
          config.fromAddress,
      },
      replyTo: {
        name:
          config.fromName,
        address:
          config.fromAddress,
      },
      to:
        toAddress,
      subject,
      html:
        emailShell({
          title,
          preheader,
          bodyHtml,
        }),
    });
  } finally {
    transport.close();
  }
}

function appUrl(): string {
  const value =
    process.env.APP_URL?.trim();

  if (!value) {
    throw new Error(
      "APP_URL is not configured.",
    );
  }

  return value.replace(
    /\/+$/,
    "",
  );
}

function meetingUrl(
  meetingId: string,
): string {
  return (
    `${appUrl()}/meetings/` +
    encodeURIComponent(
      meetingId,
    )
  );
}

function meetingWhen(input: {
  startAt: Date;
  timezone: string;
}): string {
  return input.startAt
    .toLocaleString(
      "en-KE",
      {
        dateStyle:
          "full",
        timeStyle:
          "short",
        timeZone:
          input.timezone,
      },
    );
}

export async function sendLoginOtp(
  email: string,
  name: string,
  code: string,
): Promise<void> {
  await sendZohoMail({
    toAddress:
      email,
    subject:
      "Your Nairobi Club verification code",
    title:
      "Sign-in verification",
    preheader:
      "Use this verification code to complete your Nairobi Club sign-in.",
    bodyHtml:
      paragraph(
        `Dear ${escapeHtml(name)},`,
      ) +
      paragraph(
        "Use the verification code below to complete your secure sign-in to the Nairobi Club Committee Register.",
      ) +
      otpPanel(
        code,
      ) +
      notice(
        "Security notice",
        "This code expires in 10 minutes. If you did not attempt to sign in, do not share this code and contact the Club's ICT team.",
      ),
  });
}

export async function sendInvitationEmail(
  email: string,
  name: string,
  token: string,
): Promise<void> {
  const url =
    `${appUrl()}/set-password?token=` +
    encodeURIComponent(
      token,
    );

  await sendZohoMail({
    toAddress:
      email,
    subject:
      "Nairobi Club Committee Register invitation",
    title:
      "Welcome to the Committee Register",
    preheader:
      "You have been invited to access the Nairobi Club Committee Register.",
    bodyHtml:
      paragraph(
        `Dear ${escapeHtml(name)},`,
      ) +
      paragraph(
        "You have been invited to access the Nairobi Club Committee Register, the Club's central workspace for committee meetings, attendance, declarations and documents.",
      ) +
      button(
        url,
        "Set your password",
      ) +
      notice(
        "Invitation validity",
        "This secure invitation expires in 48 hours. If you were not expecting this invitation, contact Nairobi Club ICT.",
      ),
  });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string,
): Promise<void> {
  const url =
    `${appUrl()}/reset-password?token=` +
    encodeURIComponent(
      token,
    );

  await sendZohoMail({
    toAddress:
      email,
    subject:
      "Nairobi Club password reset",
    title:
      "Reset your password",
    preheader:
      "A password reset was requested for your Nairobi Club Committee Register account.",
    bodyHtml:
      paragraph(
        `Dear ${escapeHtml(name)},`,
      ) +
      paragraph(
        "A password reset was requested for your Nairobi Club Committee Register account.",
      ) +
      button(
        url,
        "Reset password",
      ) +
      notice(
        "Security notice",
        "This secure link expires in 1 hour. If you did not request a password reset, you may ignore this email and contact Nairobi Club ICT if you have concerns.",
      ),
  });
}

export async function sendPasswordResetConfirmation(
  email: string,
  name: string,
): Promise<void> {
  await sendZohoMail({
    toAddress:
      email,
    subject:
      "Nairobi Club password changed",
    title:
      "Password changed successfully",
    preheader:
      "Your Nairobi Club Committee Register password has been changed.",
    bodyHtml:
      paragraph(
        `Dear ${escapeHtml(name)},`,
      ) +
      paragraph(
        "Your Nairobi Club Committee Register password has been changed successfully.",
      ) +
      notice(
        "Account protection",
        "All previous sessions have been invalidated. If you did not make this change, contact Nairobi Club ICT immediately.",
      ),
  });
}

export async function sendMeetingNotification(
  recipients: Array<{
    email: string;
    name: string;
  }>,
  input: {
    type:
      | "scheduled"
      | "updated"
      | "cancelled";
    title: string;
    committeeName: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    location: string;
    meetingId: string;
  },
): Promise<void> {
  const subjectPrefix =
    input.type ===
    "scheduled"
      ? "Committee meeting scheduled"
      : input.type ===
          "updated"
        ? "Committee meeting updated"
        : "Committee meeting cancelled";

  const heading =
    input.type ===
    "scheduled"
      ? "Meeting scheduled"
      : input.type ===
          "updated"
        ? "Meeting updated"
        : "Meeting cancelled";

  const url =
    meetingUrl(
      input.meetingId,
    );

  const start =
    input.startAt
      .toLocaleString(
        "en-KE",
        {
          dateStyle:
            "full",
          timeStyle:
            "short",
          timeZone:
            input.timezone,
        },
      );

  const end =
    input.endAt
      .toLocaleTimeString(
        "en-KE",
        {
          hour:
            "2-digit",
          minute:
            "2-digit",
          timeZone:
            input.timezone,
        },
      );

  for (
    const recipient
    of recipients
  ) {
    await sendZohoMail({
      toAddress:
        recipient.email,
      subject:
        `Nairobi Club: ${subjectPrefix} - ${input.title}`,
      title:
        heading,
      preheader:
        `${input.committeeName}: ${input.title}`,
      bodyHtml:
        paragraph(
          `Dear ${escapeHtml(recipient.name)},`,
        ) +
        paragraph(
          input.type ===
          "cancelled"
            ? "The following Nairobi Club committee meeting has been cancelled."
            : input.type ===
                "updated"
              ? "The following Nairobi Club committee meeting has been updated."
              : "A Nairobi Club committee meeting has been scheduled.",
        ) +
        detailTable([
          {
            label:
              "Committee",
            value:
              input.committeeName,
          },
          {
            label:
              "Meeting",
            value:
              input.title,
          },
          {
            label:
              "Date & time",
            value:
              `${start} - ${end} (${input.timezone})`,
          },
          {
            label:
              "Location",
            value:
              input.location,
          },
        ]) +
        button(
          url,
          "Open meeting record",
        ),
    });
  }
}

export async function sendApologyConfirmation(
  email: string,
  name: string,
  meeting: {
    title: string;
    committeeName: string;
    startAt: Date;
    timezone: string;
    meetingId: string;
  },
  reason?: string,
): Promise<void> {
  const url =
    meetingUrl(
      meeting.meetingId,
    );

  const when =
    meetingWhen(
      meeting,
    );

  await sendZohoMail({
    toAddress:
      email,
    subject:
      `Nairobi Club: apology recorded - ${meeting.title}`,
    title:
      "Apology recorded",
    preheader:
      `Your apology has been recorded for ${meeting.title}.`,
    bodyHtml:
      paragraph(
        `Dear ${escapeHtml(name)},`,
      ) +
      paragraph(
        "Your apology has been recorded in the Nairobi Club Committee Register.",
      ) +
      detailTable([
        {
          label:
            "Committee",
          value:
            meeting.committeeName,
        },
        {
          label:
            "Meeting",
          value:
            meeting.title,
        },
        {
          label:
            "Date & time",
          value:
            when,
        },
      ]) +
      (
        reason
          ? notice(
              "Recorded reason",
              reason,
            )
          : ""
      ) +
      button(
        url,
        "Open meeting record",
      ),
  });
}

export async function sendAttendanceCorrectionNotification(
  email: string,
  name: string,
  meeting: {
    title: string;
    committeeName: string;
    startAt: Date;
    timezone: string;
    meetingId: string;
  },
  correction: {
    previousStatus: string;
    correctedStatus: string;
    correctionReason: string;
  },
): Promise<void> {
  const url =
    meetingUrl(
      meeting.meetingId,
    );

  const when =
    meetingWhen(
      meeting,
    );

  await sendZohoMail({
    toAddress:
      email,
    subject:
      `Nairobi Club: attendance record corrected - ${meeting.title}`,
    title:
      "Attendance record corrected",
    preheader:
      `Your attendance record for ${meeting.title} has been corrected.`,
    bodyHtml:
      paragraph(
        `Dear ${escapeHtml(name)},`,
      ) +
      paragraph(
        "An administrator has corrected your attendance record. The previous entry remains available in the audit trail.",
      ) +
      detailTable([
        {
          label:
            "Committee",
          value:
            meeting.committeeName,
        },
        {
          label:
            "Meeting",
          value:
            meeting.title,
        },
        {
          label:
            "Date & time",
          value:
            when,
        },
        {
          label:
            "Previous status",
          value:
            correction.previousStatus,
        },
        {
          label:
            "Corrected status",
          value:
            correction.correctedStatus,
        },
      ]) +
      notice(
        "Correction reason",
        correction.correctionReason,
      ) +
      button(
        url,
        "Open meeting record",
      ),
  });
}

export async function sendCoiCorrectionNotification(
  email: string,
  name: string,
  meeting: {
    title: string;
    committeeName: string;
    startAt: Date;
    timezone: string;
    meetingId: string;
  },
  correctionReason: string,
): Promise<void> {
  const url =
    meetingUrl(
      meeting.meetingId,
    );

  const when =
    meetingWhen(
      meeting,
    );

  await sendZohoMail({
    toAddress:
      email,
    subject:
      `Nairobi Club: conflict-of-interest record corrected - ${meeting.title}`,
    title:
      "Conflict-of-interest record corrected",
    preheader:
      `Your conflict-of-interest record for ${meeting.title} has been corrected.`,
    bodyHtml:
      paragraph(
        `Dear ${escapeHtml(name)},`,
      ) +
      paragraph(
        "An administrator has corrected your conflict-of-interest declaration. The previous declaration remains available in the audit trail.",
      ) +
      detailTable([
        {
          label:
            "Committee",
          value:
            meeting.committeeName,
        },
        {
          label:
            "Meeting",
          value:
            meeting.title,
        },
        {
          label:
            "Date & time",
          value:
            when,
        },
      ]) +
      notice(
        "Correction reason",
        correctionReason,
      ) +
      button(
        url,
        "Open meeting record",
      ),
  });
}

export async function sendDocumentAddedNotification(
  recipients: Array<{
    email: string;
    name: string;
  }>,
  input: {
    title: string;
    committeeName: string;
    meetingTitle?: string;
    meetingId?: string;
    version: number;
    fileName: string;
  },
): Promise<void> {
  const url =
    input.meetingId
      ? meetingUrl(
          input.meetingId,
        )
      : appUrl();

  for (
    const recipient
    of recipients
  ) {
    const rows: DetailRow[] = [
      {
        label:
          "Committee",
        value:
          input.committeeName,
      },
    ];

    if (
      input.meetingTitle
    ) {
      rows.push({
        label:
          "Meeting",
        value:
          input.meetingTitle,
      });
    }

    rows.push(
      {
        label:
          "Document",
        value:
          input.title,
      },
      {
        label:
          "Version",
        value:
          String(
            input.version,
          ),
      },
      {
        label:
          "File",
        value:
          input.fileName,
      },
    );

    await sendZohoMail({
      toAddress:
        recipient.email,
      subject:
        `Nairobi Club: new document - ${input.title}`,
      title:
        "New committee document",
      preheader:
        `${input.title} has been added to the Nairobi Club Committee Register.`,
      bodyHtml:
        paragraph(
          `Dear ${escapeHtml(recipient.name)},`,
        ) +
        paragraph(
          "A new document is available in the Nairobi Club Committee Register.",
        ) +
        detailTable(
          rows,
        ) +
        button(
          url,
          "Open Committee Register",
        ),
    });
  }
}