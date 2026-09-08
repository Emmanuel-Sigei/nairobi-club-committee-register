import { getDb } from "../_lib/db";
import { error, getClientIp, getUserAgent, json, readJson } from "../_lib/http";
import {
  hashPassword,
  hashToken,
  isStrongPassword,
} from "../_lib/security";

interface ResetPasswordRequest {
  token: string;
  password: string;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  try {
    const body =
      await readJson<ResetPasswordRequest>(request);

    if (!body.token || !isStrongPassword(body.password ?? "")) {
      return error(
        "Password must be at least 12 characters and contain uppercase, lowercase, a number and a special character.",
      );
    }

    const db = getDb();

    const tokenHash = hashToken(body.token);

    const resetToken =
      await db.oneTimeToken.findFirst({
        where: {
          tokenHash,
          purpose: "PASSWORD_RESET",
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: true,
        },
      });

    if (!resetToken || !resetToken.user.isActive) {
      return error(
        "This password reset link is invalid or has expired.",
        400,
      );
    }

    const passwordHash = await hashPassword(
      body.password,
    );

    await db.$transaction([
      db.user.update({
        where: {
          id: resetToken.userId,
        },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          otpLockedUntil: null,
        },
      }),

      db.oneTimeToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),

      db.session.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),

      db.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId: resetToken.userId,
          action: "PASSWORD_RESET_COMPLETED",
          entityType: "User",
          entityId: resetToken.userId,
          ipAddress: getClientIp(request),
          userAgent: getUserAgent(request),
        },
      }),
    ]);

    return json({
      success: true,
    });
  } catch (err) {
    console.error("Password reset error:", err);

    return error(
      "Unable to reset the password.",
      500,
    );
  }
}
