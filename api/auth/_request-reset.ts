import { getDb } from "../_lib/db.js";
import {
  sendPasswordResetOtpEmail,
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
  generateOtp,
  hashOtp,
  isValidEmail,
  normalizeEmail,
} from "../_lib/security.js";

interface ResetRequestBody {
  email?: unknown;
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

  const ipLimit =
    await enforceIpRateLimit(
      request,
      "password-reset-ip",
      10,
      60 * 60_000,
      60 * 60_000,
    );

  if (!ipLimit.allowed) {
    return error(
      "Too many password reset requests. Please try again later.",
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

  let body: ResetRequestBody;

  try {
    body =
      await readJson<ResetRequestBody>(
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
    "string"
  ) {
    return error(
      "Email address is required.",
      400,
    );
  }

  const email =
    normalizeEmail(
      body.email,
    );

  const genericResponse =
    () =>
      json({
        success: true,
        message:
          "If an active account exists for that email address, a 6-digit password reset code has been sent. The code expires in 10 minutes.",
      });

  if (
    !isValidEmail(
      email,
    )
  ) {
    return genericResponse();
  }

  const resendLimit =
    await consumeRateLimit(
      securityKey(
        "password-reset-resend",
        email,
      ),
      1,
      60_000,
      60_000,
    );

  if (!resendLimit.allowed) {
    return error(
      "Please wait before requesting another password reset code.",
      429,
      "RATE_LIMITED",
      {
        "Retry-After":
          String(
            resendLimit.retryAfterSeconds,
          ),
      },
    );
  }

  const accountLimit =
    await consumeRateLimit(
      securityKey(
        "password-reset-account",
        email,
      ),
      3,
      60 * 60_000,
      60 * 60_000,
    );

  if (!accountLimit.allowed) {
    return error(
      "Too many password reset requests. Please try again later.",
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

  const user =
    await db.user.findUnique({
      where: {
        email,
      },
    });

  /*
   * Pending invitation accounts must finish their secure
   * invitation instead of bypassing first-time activation
   * through password recovery.
   */
  if (
    !user ||
    !user.isActive ||
    !user.passwordSetAt
  ) {
    return genericResponse();
  }

  const code =
    generateOtp();

  const codeHash =
    await hashOtp(
      code,
    );

  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
        10 * 60_000,
    );

  const token =
    await db.$transaction(
      async (tx) => {
        await tx.oneTimeToken.updateMany({
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
        });

        const created =
          await tx.oneTimeToken.create({
            data: {
              userId:
                user.id,
              purpose:
                "PASSWORD_RESET",
              tokenHash:
                codeHash,
              expiresAt,
            },
          });

        await tx.auditEvent.create({
          data: {
            actorType:
              "USER",
            actorUserId:
              user.id,
            action:
              "PASSWORD_RESET_OTP_REQUESTED",
            entityType:
              "OneTimeToken",
            entityId:
              created.id,
            metadata: {
              verification:
                "EMAIL_OTP",
              expiresAt:
                expiresAt.toISOString(),
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
        });

        return created;
      },
    );

  try {
    await sendPasswordResetOtpEmail(
      user.email,
      user.name,
      code,
    );
  } catch {
    const failedAt =
      new Date();

    await db.$transaction([
      db.oneTimeToken.update({
        where: {
          id:
            token.id,
        },
        data: {
          usedAt:
            failedAt,
        },
      }),

      db.auditEvent.create({
        data: {
          actorType:
            "USER",
          actorUserId:
            user.id,
          action:
            "PASSWORD_RESET_OTP_EMAIL_FAILED",
          entityType:
            "OneTimeToken",
          entityId:
            token.id,
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

    /*
     * Preserve account-enumeration resistance.
     */
    return genericResponse();
  }

  return genericResponse();
}