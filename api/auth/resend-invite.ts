import {
  getAuthenticatedUser,
} from "../_lib/auth";
import {
  getDb,
} from "../_lib/db";
import {
  assertZohoMailConfigured,
  sendInvitationEmail,
} from "../_lib/email";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http";
import {
  generateToken,
  hashToken,
} from "../_lib/security";

interface ResendInviteBody {
  userId?: unknown;
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

  const context =
    await getAuthenticatedUser(
      request,
    );

  if (!context) {
    return error(
      "Authentication required.",
      401,
    );
  }

  if (
    context.user.role !==
    "ADMIN"
  ) {
    return error(
      "Administrator access required.",
      403,
    );
  }

  const body =
    await readJson<ResendInviteBody>(
      request,
    );

  if (
    typeof body.userId !==
      "string" ||
    !body.userId.trim()
  ) {
    return error(
      "userId is required.",
      400,
    );
  }

  try {
    assertZohoMailConfigured();
  } catch {
    return error(
      "Zoho Mail is not configured.",
      503,
    );
  }

  const userId =
    body.userId.trim();

  const db =
    getDb();

  const user =
    await db.user.findUnique({
      where: {
        id:
          userId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        passwordSetAt: true,
      },
    });

  if (!user) {
    return error(
      "User not found.",
      404,
    );
  }

  if (!user.isActive) {
    return error(
      "Inactive users cannot receive invitations.",
      409,
    );
  }

  if (user.passwordSetAt) {
    return error(
      "This user has already accepted the invitation.",
      409,
    );
  }

  const now =
    new Date();

  const rawToken =
    generateToken();

  const tokenHash =
    hashToken(
      rawToken,
    );

  const expiresAt =
    new Date(
      now.getTime() +
        48 *
          60 *
          60_000,
    );

  const token =
    await db.$transaction(
      async (tx) => {
        await tx.oneTimeToken.updateMany({
          where: {
            userId,
            purpose:
              "INVITATION",
            usedAt:
              null,
          },
          data: {
            usedAt:
              now,
          },
        });

        const createdToken =
          await tx.oneTimeToken.create({
            data: {
              userId,
              purpose:
                "INVITATION",
              tokenHash,
              expiresAt,
            },
          });

        await tx.auditEvent.create({
          data: {
            actorType:
              "USER",
            actorUserId:
              context.user.id,
            action:
              "INVITATION_RESEND_REQUESTED",
            entityType:
              "User",
            entityId:
              userId,
            metadata: {
              email:
                user.email,
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

        return createdToken;
      },
    );

  try {
    await sendInvitationEmail(
      user.email,
      user.name,
      rawToken,
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
            context.user.id,
          action:
            "INVITATION_RESEND_EMAIL_FAILED",
          entityType:
            "User",
          entityId:
            userId,
          metadata: {
            email:
              user.email,
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

    return error(
      "Invitation could not be resent. The failed delivery was retained in audit history.",
      503,
    );
  }

  await db.auditEvent.create({
    data: {
      actorType:
        "USER",
      actorUserId:
        context.user.id,
      action:
        "INVITATION_RESENT",
      entityType:
        "User",
      entityId:
        userId,
      metadata: {
        email:
          user.email,
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

  return json({
    success: true,
    expiresAt,
  });
}