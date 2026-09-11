import { getDb } from "../_lib/db.js";
import {
  enforceIpRateLimit,
  isTrustedMutationOrigin,
} from "../_lib/hardening.js";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
  setCookie,
} from "../_lib/http.js";
import {
  generateToken,
  hashToken,
  verifyOtp,
} from "../_lib/security.js";

interface VerifyBody {
  challengeId?: unknown;
  otp?: unknown;
}

const SESSION_DAYS = 7;

export default async function handler(
  request: Request,
): Promise<Response> {
  if (
    request.method !== "POST"
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

  const rateLimit =
    await enforceIpRateLimit(
      request,
      "verify-otp-ip",
      20,
      15 * 60_000,
      15 * 60_000,
    );

  if (
    !rateLimit.allowed
  ) {
    return error(
      "Too many verification attempts. Please try again later.",
      429,
      "RATE_LIMITED",
      {
        "Retry-After":
          String(
            rateLimit.retryAfterSeconds,
          ),
      },
    );
  }

  let body: VerifyBody;

  try {
    body =
      await readJson<VerifyBody>(
        request,
      );
  } catch {
    return error(
      "Invalid request body.",
      400,
    );
  }

  if (
    typeof body.challengeId !==
      "string" ||
    body.challengeId.length >
      200 ||
    typeof body.otp !==
      "string" ||
    !/^\d{6}$/.test(
      body.otp,
    )
  ) {
    return error(
      "Invalid verification code.",
      400,
    );
  }

  const db = getDb();
  const now = new Date();

  const challenge =
    await db.otpChallenge.findUnique({
      where: {
        id: body.challengeId,
      },
      include: {
        user: true,
      },
    });

  if (!challenge) {
    return error(
      "Invalid verification code.",
      400,
    );
  }

  if (
    challenge.consumedAt ||
    challenge.expiresAt <= now ||
    (
      challenge.lockedUntil &&
      challenge.lockedUntil >
        now
    )
  ) {
    return error(
      "Verification code is expired or locked.",
      400,
    );
  }

  if (
    !challenge.user.isActive ||
    (
      challenge.user
        .otpLockedUntil &&
      challenge.user
        .otpLockedUntil >
        now
    )
  ) {
    return error(
      "Account temporarily locked.",
      429,
    );
  }

  const valid =
    await verifyOtp(
      body.otp,
      challenge.codeHash,
    );

  if (!valid) {
    const nextAttempts =
      challenge.attempts + 1;

    if (
      nextAttempts >= 5
    ) {
      const lockedUntil =
        new Date(
          now.getTime() +
            15 * 60_000,
        );

      await db.$transaction([
        db.otpChallenge.update({
          where: {
            id: challenge.id,
          },
          data: {
            attempts:
              nextAttempts,
            lockedUntil,
          },
        }),

        db.user.update({
          where: {
            id:
              challenge.userId,
          },
          data: {
            otpLockedUntil:
              lockedUntil,
          },
        }),

        db.auditEvent.create({
          data: {
            actorType:
              "USER",
            actorUserId:
              challenge.userId,
            action:
              "OTP_LOCKOUT",
            entityType:
              "OtpChallenge",
            entityId:
              challenge.id,
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

      return error(
        "Too many incorrect verification attempts. Try again in 15 minutes.",
        429,
      );
    }

    await db.otpChallenge.update({
      where: {
        id: challenge.id,
      },
      data: {
        attempts:
          nextAttempts,
      },
    });

    await db.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId:
          challenge.userId,
        action:
          "OTP_FAILED",
        entityType:
          "OtpChallenge",
        entityId:
          challenge.id,
        metadata: {
          attempts:
            nextAttempts,
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

    return error(
      "Invalid verification code.",
      401,
    );
  }

  const rawSessionToken =
    generateToken();

  const tokenHash =
    hashToken(
      rawSessionToken,
    );

  const expiresAt =
    new Date(
      now.getTime() +
        SESSION_DAYS *
          24 *
          60 *
          60_000,
    );

  await db.$transaction(
    async (tx) => {
      await tx.otpChallenge.update({
        where: {
          id: challenge.id,
        },
        data: {
          consumedAt: now,
        },
      });

      await tx.user.update({
        where: {
          id:
            challenge.userId,
        },
        data: {
          otpLockedUntil:
            null,
        },
      });

      const created =
        await tx.session.create({
          data: {
            userId:
              challenge.userId,
            tokenHash,
            expiresAt,
            lastSeenAt: now,
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

      await tx.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId:
            challenge.userId,
          action:
            "LOGIN_SUCCESS",
          entityType:
            "Session",
          entityId:
            created.id,
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
    },
  );

  return json(
    {
      success: true,
      user: {
        id:
          challenge.user.id,
        email:
          challenge.user.email,
        name:
          challenge.user.name,
        role:
          challenge.user.role,
        isActive:
          challenge.user
            .isActive,
      },
    },
    200,
    {
      "Set-Cookie":
        setCookie(
          "nairobi_club_session",
          rawSessionToken,
          {
            maxAge:
              SESSION_DAYS *
              24 *
              60 *
              60,
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
          },
        ),
    },
  );
}