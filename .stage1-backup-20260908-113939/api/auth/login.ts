import { getDb } from "../_lib/db";
import { error, getClientIp, getUserAgent, json, readJson } from "../_lib/http";
import {
  generateOtp,
  hashOtp,
  normalizeEmail,
  verifyPassword,
} from "../_lib/security";
import { sendLoginOtp } from "../_lib/email";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  let body: LoginBody;

  try {
    body = await readJson<LoginBody>(request);
  } catch {
    return error("Invalid request body.", 400);
  }

  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return error("Invalid email or password.", 401);
  }

  const email = normalizeEmail(body.email);
  const password = body.password;

  const db = getDb();
  const now = new Date();

  const user = await db.user.findUnique({
    where: { email },
  });

  if (
    !user ||
    !user.isActive ||
    !user.passwordHash
  ) {
    return error("Invalid email or password.", 401);
  }

  if (
    user.otpLockedUntil &&
    user.otpLockedUntil > now
  ) {
    return error(
      "Account temporarily locked. Please try again later.",
      429,
    );
  }

  const validPassword = await verifyPassword(
    password,
    user.passwordHash,
  );

  if (!validPassword) {
    await db.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      },
    });

    return error("Invalid email or password.", 401);
  }

  const existingChallenge = await db.otpChallenge.findFirst({
    where: {
      userId: user.id,
      purpose: "LOGIN",
      consumedAt: null,
      expiresAt: { gt: now },
      lockedUntil: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (
    existingChallenge &&
    now.getTime() - existingChallenge.lastSentAt.getTime() < 60_000
  ) {
    return json({
      success: true,
      otpChallengeId: existingChallenge.id,
      message: "Verification code already sent.",
    });
  }

  const code = generateOtp();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(now.getTime() + 10 * 60_000);

  await db.otpChallenge.updateMany({
    where: {
      userId: user.id,
      purpose: "LOGIN",
      consumedAt: null,
    },
    data: {
      consumedAt: now,
    },
  });

  const challenge = await db.otpChallenge.create({
    data: {
      userId: user.id,
      purpose: "LOGIN",
      codeHash,
      expiresAt,
      lastSentAt: now,
    },
  });

  try {
    await sendLoginOtp(
      user.email,
      user.name,
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

    await db.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId: user.id,
        action: "OTP_EMAIL_FAILED",
        entityType: "OtpChallenge",
        entityId: challenge.id,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
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
      actorUserId: user.id,
      action: "OTP_SENT",
      entityType: "OtpChallenge",
      entityId: challenge.id,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    },
  });

  return json({
    success: true,
    otpChallengeId: challenge.id,
    message: "Verification code sent.",
  });
}