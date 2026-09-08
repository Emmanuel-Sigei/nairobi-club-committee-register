import { getDb } from "../_lib/db";
import { error, getClientIp, getUserAgent, json, readJson } from "../_lib/http";
import {
  generateOtp,
  hashOtp,
  normalizeEmail,
  verifyPassword,
} from "../_lib/security";
import { sendLoginOtp } from "../_lib/email";

interface LoginRequest {
  email: string;
  password: string;
}

const OTP_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;
const ACCOUNT_LOCK_MINUTES = 15;

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  try {
    const body = await readJson<LoginRequest>(request);

    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";

    if (!email || !password) {
      return error("Email and password are required.");
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { email },
    });

    const ipAddress = getClientIp(request);
    const userAgent = getUserAgent(request);

    if (!user || !user.passwordHash) {
      await db.auditEvent.create({
        data: {
          actorType: "SYSTEM",
          action: "LOGIN_FAILED",
          metadata: {
            reason: "INVALID_CREDENTIALS",
            email,
          },
          ipAddress,
          userAgent,
        },
      });

      return error("Invalid email or password.", 401);
    }

    if (!user.isActive) {
      await db.auditEvent.create({
        data: {
          actorType: "SYSTEM",
          action: "LOGIN_FAILED",
          actorUserId: user.id,
          metadata: {
            reason: "ACCOUNT_INACTIVE",
          },
          ipAddress,
          userAgent,
        },
      });

      return error("This account is inactive.", 403);
    }

    if (
      user.otpLockedUntil &&
      user.otpLockedUntil > new Date()
    ) {
      await db.auditEvent.create({
        data: {
          actorType: "SYSTEM",
          action: "LOGIN_BLOCKED",
          actorUserId: user.id,
          metadata: {
            reason: "OTP_LOCKOUT",
          },
          ipAddress,
          userAgent,
        },
      });

      return error(
        "Your account is temporarily locked. Please try again later.",
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
          actorType: "SYSTEM",
          action: "LOGIN_FAILED",
          actorUserId: user.id,
          metadata: {
            reason: "INVALID_PASSWORD",
          },
          ipAddress,
          userAgent,
        },
      });

      return error("Invalid email or password.", 401);
    }

    const existing = await db.otpChallenge.findFirst({
      where: {
        userId: user.id,
        purpose: "LOGIN",
        consumedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (
      existing &&
      Date.now() - existing.lastSentAt.getTime() <
        RESEND_COOLDOWN_SECONDS * 1000
    ) {
      return json({
        success: true,
        requiresOtp: true,
        otpChallengeId: existing.id,
      });
    }

    const otp = generateOtp();
    const codeHash = await hashOtp(otp);
    const expiresAt = new Date(
      Date.now() + OTP_MINUTES * 60 * 1000,
    );

    const challenge = await db.otpChallenge.create({
      data: {
        userId: user.id,
        purpose: "LOGIN",
        codeHash,
        expiresAt,
        lastSentAt: new Date(),
      },
    });

    await sendLoginOtp(user.email, otp);

    await db.auditEvent.create({
      data: {
        actorType: "SYSTEM",
        actorUserId: user.id,
        action: "OTP_SENT",
        metadata: {
          purpose: "LOGIN",
        },
        ipAddress,
        userAgent,
      },
    });

    return json({
      success: true,
      requiresOtp: true,
      otpChallengeId: challenge.id,
    });
  } catch (err) {
    console.error("Login error:", err);

    return error(
      "Unable to process the login request.",
      500,
    );
  }
}
