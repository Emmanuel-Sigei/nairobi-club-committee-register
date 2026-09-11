import { getDb } from "../_lib/db.js";
import {
  sendAccountSetupConfirmation,
} from "../_lib/email.js";
import {
  isTrustedMutationOrigin,
} from "../_lib/hardening.js";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http.js";
import {
  hashPassword,
  hashToken,
  isStrongPassword,
} from "../_lib/security.js";

interface AcceptInviteBody {
  token?: unknown;
  name?: unknown;
  password?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (
    request.method !==
    "POST"
  ) {
    return error(
      "Method not allowed.",
      405,
    );
  }

  if (
    !isTrustedMutationOrigin(
      request,
    )
  ) {
    return error(
      "Request origin is not permitted.",
      403,
      "ORIGIN_REJECTED",
    );
  }

  let body: AcceptInviteBody;

  try {
    body =
      await readJson<AcceptInviteBody>(
        request,
      );
  } catch {
    return error(
      "Invalid request body.",
      400,
    );
  }

  if (
    typeof body.token !==
      "string" ||
    typeof body.name !==
      "string" ||
    typeof body.password !==
      "string"
  ) {
    return error(
      "Invitation token, full name and password are required.",
      400,
    );
  }

  const name =
    body.name.trim();

  if (
    name.length < 2 ||
    name.length > 120
  ) {
    return error(
      "Please enter your full name.",
      400,
    );
  }

  if (
    !isStrongPassword(
      body.password,
    )
  ) {
    return error(
      "Password must be at least 12 characters and contain uppercase, lowercase, a number and a special character.",
      400,
    );
  }

  const db =
    getDb();

  const now =
    new Date();

  const tokenHash =
    hashToken(
      body.token,
    );

  const token =
    await db.oneTimeToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user:
          true,
      },
    });

  if (
    !token ||
    token.purpose !==
      "INVITATION" ||
    token.usedAt ||
    token.expiresAt <=
      now ||
    !token.user.isActive
  ) {
    return error(
      "Invitation link is invalid or expired.",
      400,
    );
  }

  if (
    token.user.passwordSetAt
  ) {
    return error(
      "This invitation has already been completed. Please sign in instead.",
      409,
    );
  }

  const passwordHash =
    await hashPassword(
      body.password,
    );

  await db.$transaction([
    db.user.update({
      where: {
        id:
          token.userId,
      },
      data: {
        name,
        passwordHash,
        passwordSetAt:
          now,
        otpLockedUntil:
          null,
      },
    }),

    db.oneTimeToken.updateMany({
      where: {
        userId:
          token.userId,
        purpose:
          "INVITATION",
        usedAt:
          null,
      },
      data: {
        usedAt:
          now,
      },
    }),

    db.auditEvent.create({
      data: {
        actorType:
          "USER",
        actorUserId:
          token.userId,
        action:
          "INVITATION_ACCEPTED",
        entityType:
          "User",
        entityId:
          token.userId,
        metadata: {
          profileConfirmed:
            true,
          passwordCreatedByUser:
            true,
        },
        ipAddress:
          getClientIp(
            request,
          ),
        userAgent:
          getUserAgent(
            request,
          ),
      },
    }),
  ]);

  let notificationSent =
    true;

  try {
    await sendAccountSetupConfirmation(
      token.user.email,
      name,
    );
  } catch {
    notificationSent =
      false;

    await db.auditEvent.create({
      data: {
        actorType:
          "USER",
        actorUserId:
          token.userId,
        action:
          "ACCOUNT_SETUP_CONFIRMATION_FAILED",
        entityType:
          "User",
        entityId:
          token.userId,
        ipAddress:
          getClientIp(
            request,
          ),
        userAgent:
          getUserAgent(
            request,
          ),
      },
    });
  }

  return json({
    success: true,
    notificationSent,
    message:
      "Your Nairobi Club Governance Portal account is ready. You can now sign in.",
  });
}