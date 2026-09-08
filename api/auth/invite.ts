import { getAuthenticatedUser } from "../_lib/auth";
import { getDb } from "../_lib/db";
import { error, getClientIp, getUserAgent, json, readJson } from "../_lib/http";
import {
  generateToken,
  hashToken,
  normalizeEmail,
  isValidEmail,
} from "../_lib/security";

interface InviteRequest {
  name: string;
  email: string;
  role: "MEMBER" | "ADMIN" | "EXCO_MANAGEMENT";
}

const INVITE_HOURS = 48;

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  const authenticated = await getAuthenticatedUser(request);

  if (!authenticated) {
    return error("Authentication required.", 401);
  }

  if (authenticated.user.role !== "ADMIN") {
    return error("Administrator privileges required.", 403);
  }

  try {
    const body = await readJson<InviteRequest>(request);

    const name = body.name?.trim();
    const email = normalizeEmail(body.email ?? "");

    if (!name || !isValidEmail(email)) {
      return error("Valid name and email are required.");
    }

    const db = getDb();

    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      return error(
        "A user with this email already exists.",
        409,
      );
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        role: body.role ?? "MEMBER",
        isActive: true,
        invitedAt: new Date(),
      },
    });

    const rawToken = generateToken(48);
    const tokenHash = hashToken(rawToken);

    await db.oneTimeToken.create({
      data: {
        userId: user.id,
        purpose: "INVITATION",
        tokenHash,
        expiresAt: new Date(
          Date.now() +
            INVITE_HOURS * 60 * 60 * 1000,
        ),
      },
    });

    await db.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId: authenticated.user.id,
        action: "USER_INVITED",
        entityType: "User",
        entityId: user.id,
        metadata: {
          role: user.role,
        },
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      },
    });

    /*
     * The actual Zoho invitation email is deliberately kept
     * behind the Stage 1 mail provider and can be enabled once
     * Zoho credentials are configured.
     *
     * The raw token is returned only during development.
     * This endpoint must NOT expose it in production.
     */

    const appUrl =
      process.env.APP_URL ||
      "http://localhost:5173";

    const invitationUrl =
      `${appUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;

    return json({
      success: true,
      userId: user.id,
      invitationUrl,
    }, 201);
  } catch (err) {
    console.error("Invite error:", err);

    return error(
      "Unable to create the invitation.",
      500,
    );
  }
}
