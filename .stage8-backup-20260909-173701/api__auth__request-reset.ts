import { getDb } from "../_lib/db";
import { sendPasswordResetEmail } from "../_lib/email";
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
  normalizeEmail,
} from "../_lib/security";

interface ResetRequestBody {
  email?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  let body: ResetRequestBody;

  try {
    body = await readJson<ResetRequestBody>(request);
  } catch {
    return error("Invalid request body.", 400);
  }

  if (typeof body.email !== "string") {
    return error("Invalid request.", 400);
  }

  const email = normalizeEmail(body.email);

  const genericResponse = () =>
    json({
      success: true,
      message:
        "If an active account exists for that email address, a password reset message has been sent.",
    });

  const db = getDb();

  const user = await db.user.findUnique({
    where: {
      email,
    },
  });

  if (!user || !user.isActive) {
    return genericResponse();
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 60 * 60_000,
  );

  await db.oneTimeToken.updateMany({
    where: {
      userId: user.id,
      purpose: "PASSWORD_RESET",
      usedAt: null,
    },
    data: {
      usedAt: now,
    },
  });

  const token = await db.oneTimeToken.create({
    data: {
      userId: user.id,
      purpose: "PASSWORD_RESET",
      tokenHash,
      expiresAt,
    },
  });

  try {
    await sendPasswordResetEmail(
      user.email,
      user.name,
      rawToken,
    );
  } catch {
    await db.oneTimeToken.update({
      where: {
        id: token.id,
      },
      data: {
        usedAt: new Date(),
      },
    });

    await db.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId: user.id,
        action: "PASSWORD_RESET_EMAIL_FAILED",
        entityType: "OneTimeToken",
        entityId: token.id,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      },
    });

    return genericResponse();
  }

  await db.auditEvent.create({
    data: {
      actorType: "USER",
      actorUserId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "OneTimeToken",
      entityId: token.id,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    },
  });

  return genericResponse();
}