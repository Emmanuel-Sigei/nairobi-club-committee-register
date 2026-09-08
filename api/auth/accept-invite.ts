import { getDb } from "../_lib/db";
import { error, getClientIp, getUserAgent, json, readJson } from "../_lib/http";
import {
  hashPassword,
  hashToken,
  isStrongPassword,
} from "../_lib/security";

interface AcceptInviteRequest {
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
      await readJson<AcceptInviteRequest>(request);

    if (!body.token || !isStrongPassword(body.password ?? "")) {
      return error(
        "Password must be at least 12 characters and contain uppercase, lowercase, a number and a special character.",
      );
    }

    const db = getDb();

    const tokenHash = hashToken(body.token);

    const invitation =
      await db.oneTimeToken.findFirst({
        where: {
          tokenHash,
          purpose: "INVITATION",
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: true,
        },
      });

    if (!invitation) {
      return error(
        "This invitation is invalid or has expired.",
        400,
      );
    }

    const passwordHash = await hashPassword(
      body.password,
    );

    await db.$transaction([
      db.user.update({
        where: {
          id: invitation.userId,
        },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
        },
      }),
      db.oneTimeToken.update({
        where: {
          id: invitation.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      db.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId: invitation.userId,
          action: "INVITATION_ACCEPTED",
          entityType: "User",
          entityId: invitation.userId,
          ipAddress: getClientIp(request),
          userAgent: getUserAgent(request),
        },
      }),
    ]);

    return json({
      success: true,
    });
  } catch (err) {
    console.error("Accept invitation error:", err);

    return error(
      "Unable to complete the invitation.",
      500,
    );
  }
}
