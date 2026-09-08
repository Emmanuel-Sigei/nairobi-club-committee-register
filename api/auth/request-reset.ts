import { getDb } from "../_lib/db";
import { error, getClientIp, getUserAgent, json, readJson } from "../_lib/http";
import {
  generateToken,
  hashToken,
  normalizeEmail,
} from "../_lib/security";

interface ResetRequest {
  email: string;
}

const RESET_HOURS = 1;

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  try {
    const body =
      await readJson<ResetRequest>(request);

    const email = normalizeEmail(body.email ?? "");
    const db = getDb();

    const user = await db.user.findUnique({
      where: { email },
    });

    /*
     * Always return the same response whether the account
     * exists or not to prevent account enumeration.
     */

    if (!user || !user.isActive) {
      return json({
        success: true,
        message:
          "If an account exists for that email, reset instructions have been sent.",
      });
    }

    const rawToken = generateToken(48);

    await db.oneTimeToken.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(
          Date.now() +
            RESET_HOURS * 60 * 60 * 1000,
        ),
      },
    });

    await db.auditEvent.create({
      data: {
        actorType: "SYSTEM",
        actorUserId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      },
    });

    /*
     * Email delivery will use Zoho Mail once credentials are
     * configured. The raw token is intentionally not returned.
     */

    return json({
      success: true,
      message:
        "If an account exists for that email, reset instructions have been sent.",
    });
  } catch (err) {
    console.error("Password reset request error:", err);

    return error(
      "Unable to process the password reset request.",
      500,
    );
  }
}
