import { getAuthenticatedUser, hasRole } from "../_lib/auth";
import { getDb } from "../_lib/db";
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
  isValidEmail,
  normalizeEmail,
} from "../_lib/security";

interface InviteBody {
  name?: unknown;
  email?: unknown;
  role?: unknown;
}

const allowedRoles = [
  "MEMBER",
  "ADMIN",
  "EXCO_MANAGEMENT",
] as const;

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  if (!hasRole(context, ["ADMIN"])) {
    return error("Administrator access required.", 403);
  }

  let body: InviteBody;

  try {
    body = await readJson<InviteBody>(request);
  } catch {
    return error("Invalid request body.", 400);
  }

  if (
    typeof body.name !== "string" ||
    body.name.trim().length < 2 ||
    typeof body.email !== "string"
  ) {
    return error("Name and email are required.", 400);
  }

  const email = normalizeEmail(body.email);
  const name = body.name.trim();

  if (!isValidEmail(email)) {
    return error("Invalid email address.", 400);
  }

  const role =
    typeof body.role === "string" &&
    allowedRoles.includes(
      body.role as (typeof allowedRoles)[number],
    )
      ? (body.role as (typeof allowedRoles)[number])
      : "MEMBER";

  try {
    assertZohoMailConfigured();
  } catch {
    return error(
      "Zoho Mail is not configured.",
      503,
    );
  }

  const db = getDb();

  const existing = await db.user.findUnique({
    where: {
      email,
    },
  });

  if (existing) {
    return error(
      "An account with that email already exists.",
      409,
    );
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 48 * 60 * 60_000,
  );

  const user = await db.user.create({
    data: {
      email,
      name,
      role,
      invitedAt: now,
      oneTimeTokens: {
        create: {
          purpose: "INVITATION",
          tokenHash,
          expiresAt,
        },
      },
    },
  });

  try {
    await sendInvitationEmail(
      email,
      name,
      rawToken,
    );
  } catch {
    await db.user.delete({
      where: {
        id: user.id,
      },
    });

    return error(
      "Invitation could not be sent. Please try again later.",
      503,
    );
  }

  await db.auditEvent.create({
    data: {
      actorType: "USER",
      actorUserId: context.user.id,
      action: "USER_INVITED",
      entityType: "User",
      entityId: user.id,
      metadata: {
        invitedEmail: email,
        invitedRole: role,
      },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    },
  });

  return json({
    success: true,
    userId: user.id,
  });
}