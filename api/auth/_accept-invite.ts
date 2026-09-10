import { getDb } from "../_lib/db";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http";
import {
  hashPassword,
  hashToken,
  isStrongPassword,
} from "../_lib/security";

interface AcceptInviteBody {
  token?: unknown;
  password?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  let body: AcceptInviteBody;

  try {
    body = await readJson<AcceptInviteBody>(request);
  } catch {
    return error("Invalid request body.", 400);
  }

  if (
    typeof body.token !== "string" ||
    typeof body.password !== "string"
  ) {
    return error(
      "Invitation token and password are required.",
      400,
    );
  }

  if (!isStrongPassword(body.password)) {
    return error(
      "Password must be at least 12 characters and contain uppercase, lowercase, number and special character.",
      400,
    );
  }

  const db = getDb();
  const now = new Date();
  const tokenHash = hashToken(body.token);

  const token = await db.oneTimeToken.findUnique({
    where: {
      tokenHash,
    },
    include: {
      user: true,
    },
  });

  if (
    !token ||
    token.purpose !== "INVITATION" ||
    token.usedAt ||
    token.expiresAt <= now
  ) {
    return error(
      "Invitation link is invalid or expired.",
      400,
    );
  }

  const passwordHash = await hashPassword(
    body.password,
  );

  await db.$transaction([
    db.user.update({
      where: {
        id: token.userId,
      },
      data: {
        passwordHash,
        passwordSetAt: now,
      },
    }),
    db.oneTimeToken.update({
      where: {
        id: token.id,
      },
      data: {
        usedAt: now,
      },
    }),
    db.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId: token.userId,
        action: "INVITATION_ACCEPTED",
        entityType: "User",
        entityId: token.userId,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      },
    }),
  ]);

  return json({
    success: true,
    message: "Password created successfully.",
  });
}