import { getDb } from "../_lib/db";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http";
import {
  generateOtp,
  hashOtp,
} from "../_lib/security";
import { sendLoginOtp } from "../_lib/email";

interface ResendBody {
  challengeId?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  let body: ResendBody;

  try {
    body = await readJson<ResendBody>(request);
  } catch {
    return error("Invalid request body.", 400);
  }

  if (typeof body.challengeId !== "string") {
    return error("Invalid verification request.", 400);
  }

  const db = getDb();
  const now = new Date();

  const challenge = await db.otpChallenge.findUnique({
    where: {
      id: body.challengeId,
    },
    include: {
      user: true,
    },
  });

  if (!challenge) {
    return error("Verification request not found.", 404);
  }

  if (!challenge.user.isActive) {
    return error("Account is inactive.", 403);
  }

  if (
    challenge.user.otpLockedUntil &&
    challenge.user.otpLockedUntil > now
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
    now.getTime() - challenge.lastSentAt.getTime() <
    60_000
  ) {
    return error(
      "Please wait before requesting another code.",
      429,
    );
  }

  const code = generateOtp();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(
    now.getTime() + 10 * 60_000,
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
        consumedAt: new Date(),
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
      actorUserId: challenge.userId,
      action: "OTP_RESENT",
      entityType: "OtpChallenge",
      entityId: challenge.id,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    },
  });

  return json({
    success: true,
    message: "Verification code resent.",
  });
}