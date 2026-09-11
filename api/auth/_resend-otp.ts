import { getDb } from "../_lib/db.js";
import {
  sendLoginOtp,
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
} from "../_lib/security.js";

interface ResendBody {
  challengeId?: unknown;
}

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

  const ipLimit =
    await enforceIpRateLimit(
      request,
      "resend-otp-ip",
      10,
      15 * 60_000,
      15 * 60_000,
    );

  if (!ipLimit.allowed) {
    return error(
      "Too many verification-code requests. Please try again later.",
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

  let body: ResendBody;

  try {
    body =
      await readJson<ResendBody>(
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
      200
  ) {
    return error(
      "Invalid verification request.",
      400,
    );
  }

  const challengeLimit =
    await consumeRateLimit(
      securityKey(
        "resend-otp-challenge",
        body.challengeId,
      ),
      5,
      15 * 60_000,
      15 * 60_000,
    );

  if (
    !challengeLimit.allowed
  ) {
    return error(
      "Too many verification-code requests. Please try again later.",
      429,
      "RATE_LIMITED",
      {
        "Retry-After":
          String(
            challengeLimit
              .retryAfterSeconds,
          ),
      },
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
      "Verification request not found.",
      404,
    );
  }

  if (
    !challenge.user.isActive
  ) {
    return error(
      "Account is inactive.",
      403,
    );
  }

  if (
    challenge.user
      .otpLockedUntil &&
    challenge.user
      .otpLockedUntil > now
  ) {
    return error(
      "Account temporarily locked.",
      429,
    );
  }

  if (
    challenge.consumedAt ||
    challenge.expiresAt <= now
  ) {
    return error(
      "Verification request has expired.",
      400,
    );
  }

  if (
    now.getTime() -
      challenge.lastSentAt
        .getTime() <
    60_000
  ) {
    return error(
      "Please wait before requesting another code.",
      429,
    );
  }

  const code =
    generateOtp();

  const codeHash =
    await hashOtp(code);

  const expiresAt =
    new Date(
      now.getTime() +
        10 * 60_000,
    );

  await db.otpChallenge.update({
    where: {
      id: challenge.id,
    },
    data: {
      codeHash,
      expiresAt,
      attempts: 0,
      lockedUntil: null,
      lastSentAt: now,
    },
  });

  try {
    await sendLoginOtp(
      challenge.user.email,
      challenge.user.name,
      code,
    );
  } catch {
    await db.otpChallenge.update({
      where: {
        id: challenge.id,
      },
      data: {
        consumedAt:
          new Date(),
      },
    });

    return error(
      "Verification email could not be sent. Please try again later.",
      503,
    );
  }

  await db.auditEvent.create({
    data: {
      actorType: "USER",
      actorUserId:
        challenge.userId,
      action:
        "OTP_RESENT",
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
  });

  return json({
    success: true,
    message:
      "Verification code resent.",
  });
}