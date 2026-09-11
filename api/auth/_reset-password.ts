import { getDb } from "../_lib/db.js";
import {
  sendGovernancePasswordResetConfirmation,
} from "../_lib/email.js";
import {
  consumeRateLimit,
  enforceIpRateLimit,
  isTrustedMutationOrigin,
  securityKey,
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
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
  verifyOtp as verifyOtpCode,
} from "../_lib/security.js";

interface ResetPasswordBody {
  email?: unknown;
  otp?: unknown;
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

  let body: ResetPasswordBody;

  try {
    body =
      await readJson<ResetPasswordBody>(
        request,
      );
  } catch {
    return error(
      "Invalid request body.",
      400,
    );
  }

  if (
    typeof body.email !==
      "string" ||
    typeof body.otp !==
      "string" ||
    typeof body.password !==
      "string"
  ) {
    return error(
      "Email, verification code and new password are required.",
      400,
    );
  }

  const email =
    normalizeEmail(
      body.email,
    );

  const otp =
    body.otp.trim();

  if (
    !isValidEmail(
      email,
    ) ||
    !/^\d{6}$/.test(
      otp,
    )
  ) {
    return error(
      "The verification code is invalid or expired.",
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

  const ipLimit =
    await enforceIpRateLimit(
      request,
      "password-reset-verify-ip",
      20,
      15 * 60_000,
      15 * 60_000,
    );

  if (!ipLimit.allowed) {
    return error(
      "Too many verification attempts. Please try again later.",
      429,
      "RATE_LIMITED",
      {
        "Retry-After":
          String(
            ipLimit.retryAfterSeconds,
          ),
      },
    );
  }

  const accountLimitKey =
    securityKey(
      "password-reset-verify-account",
      email,
    );

  const accountLimit =
    await consumeRateLimit(
      accountLimitKey,
      5,
      15 * 60_000,
      15 * 60_000,
    );

  if (!accountLimit.allowed) {
    return error(
      "Too many incorrect verification attempts. Request a new code or try again later.",
      429,
      "RATE_LIMITED",
      {
        "Retry-After":
          String(
            accountLimit.retryAfterSeconds,
          ),
      },
    );
  }

  const db =
    getDb();

  const now =
    new Date();

  const user =
    await db.user.findUnique({
      where: {
        email,
      },
    });

  if (
    !user ||
    !user.isActive ||
    !user.passwordSetAt
  ) {
    return error(
      "The verification code is invalid or expired.",
      400,
    );
  }

  const token =
    await db.oneTimeToken.findFirst({
      where: {
        userId:
          user.id,
        purpose:
          "PASSWORD_RESET",
        usedAt:
          null,
        expiresAt: {
          gt:
            now,
        },
      },
      orderBy: {
        createdAt:
          "desc",
      },
    });

  const validCode =
    Boolean(
      token &&
      token.tokenHash.startsWith(
        "$2",
      ) &&
      await verifyOtpCode(
        otp,
        token.tokenHash,
      ),
    );

  if (
    !token ||
    !validCode
  ) {
    return error(
      "The verification code is invalid or expired.",
      400,
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
          user.id,
      },
      data: {
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
          user.id,
        purpose:
          "PASSWORD_RESET",
        usedAt:
          null,
      },
      data: {
        usedAt:
          now,
      },
    }),

    db.session.updateMany({
      where: {
        userId:
          user.id,
        revokedAt:
          null,
      },
      data: {
        revokedAt:
          now,
      },
    }),

    db.otpChallenge.updateMany({
      where: {
        userId:
          user.id,
        consumedAt:
          null,
      },
      data: {
        consumedAt:
          now,
      },
    }),

    db.rateLimitBucket.deleteMany({
      where: {
        key:
          accountLimitKey,
      },
    }),

    db.auditEvent.create({
      data: {
        actorType:
          "USER",
        actorUserId:
          user.id,
        action:
          "PASSWORD_RESET_COMPLETED",
        entityType:
          "User",
        entityId:
          user.id,
        metadata: {
          verification:
            "EMAIL_OTP",
          sessionsRevoked:
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
    await sendGovernancePasswordResetConfirmation(
      user.email,
      user.name,
    );
  } catch {
    notificationSent =
      false;

    await db.auditEvent.create({
      data: {
        actorType:
          "USER",
        actorUserId:
          user.id,
        action:
          "PASSWORD_RESET_CONFIRMATION_FAILED",
        entityType:
          "User",
        entityId:
          user.id,
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
      "Your password has been reset successfully. You can now sign in.",
  });
}