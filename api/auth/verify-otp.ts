import { getDb } from "../_lib/db";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
  setCookie,
} from "../_lib/http";
import {
  generateToken,
  hashToken,
  verifyOtp,
} from "../_lib/security";
import { SESSION_COOKIE } from "../_lib/auth";

interface VerifyOtpRequest {
  challengeId: string;
  otp: string;
}

const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  try {
    const body = await readJson<VerifyOtpRequest>(request);

    if (
      !body.challengeId ||
      !/^\d{6}$/.test(body.otp ?? "")
    ) {
      return error("A valid six-digit verification code is required.");
    }

    const db = getDb();

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

    const ipAddress = getClientIp(request);
    const userAgent = getUserAgent(request);

    if (!challenge.user.isActive) {
      return error("This account is inactive.", 403);
    }

    if (challenge.consumedAt) {
      return error("This verification code has already been used.");
    }

    if (challenge.expiresAt <= new Date()) {
      return error("This verification code has expired.");
    }

    if (
      challenge.lockedUntil &&
      challenge.lockedUntil > new Date()
    ) {
      return error(
        "Too many failed attempts. Please try again later.",
        429,
      );
    }

    const valid = await verifyOtp(
      body.otp,
      challenge.codeHash,
    );

    if (!valid) {
      const attempts = challenge.attempts + 1;

      const locked = attempts >= MAX_ATTEMPTS;
      const lockedUntil = locked
        ? new Date(
            Date.now() + LOCK_MINUTES * 60 * 1000,
          )
        : null;

      await db.otpChallenge.update({
        where: {
          id: challenge.id,
        },
        data: {
          attempts,
          lockedUntil,
        },
      });

      if (locked) {
        await db.user.update({
          where: {
            id: challenge.userId,
          },
          data: {
            otpLockedUntil: lockedUntil,
          },
        });
      }

      await db.auditEvent.create({
        data: {
          actorType: "SYSTEM",
          actorUserId: challenge.userId,
          action: locked
            ? "OTP_LOCKOUT"
            : "OTP_FAILED",
          metadata: {
            attempts,
          },
          ipAddress,
          userAgent,
        },
      });

      return error(
        locked
          ? "Too many failed attempts. Your account is locked for 15 minutes."
          : "Incorrect verification code.",
        locked ? 429 : 401,
      );
    }

    const sessionToken = generateToken(48);
    const tokenHash = hashToken(sessionToken);

    const expiresAt = new Date(
      Date.now() +
        SESSION_DAYS * 24 * 60 * 60 * 1000,
    );

    await db.otpChallenge.update({
      where: {
        id: challenge.id,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await db.user.update({
      where: {
        id: challenge.userId,
      },
      data: {
        otpLockedUntil: null,
      },
    });

    await db.session.create({
      data: {
        userId: challenge.userId,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    await db.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId: challenge.userId,
        action: "LOGIN_SUCCESS",
        ipAddress,
        userAgent,
      },
    });

    return json(
      {
        success: true,
        authenticated: true,
      },
      200,
      {
        "Set-Cookie": setCookie(
          SESSION_COOKIE,
          sessionToken,
          {
            maxAge:
              SESSION_DAYS * 24 * 60 * 60,
          },
        ),
      },
    );
  } catch (err) {
    console.error("OTP verification error:", err);

    return error(
      "Unable to verify the authentication code.",
      500,
    );
  }
}
