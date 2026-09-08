import { getDb } from "../_lib/db";
import { getSessionToken } from "../_lib/auth";
import {
  clearCookie,
  error,
  getClientIp,
  getUserAgent,
  json,
} from "../_lib/http";
import { hashToken } from "../_lib/security";

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  const token = getSessionToken(request);

  if (token) {
    const tokenHash = hashToken(token);

    const session = await getDb().session.findUnique({
      where: {
        tokenHash,
      },
    });

    if (session && !session.revokedAt) {
      await getDb().session.update({
        where: {
          id: session.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await getDb().auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId: session.userId,
          action: "LOGOUT",
          entityType: "Session",
          entityId: session.id,
          ipAddress: getClientIp(request),
          userAgent: getUserAgent(request),
        },
      });
    }
  }

  return json(
    {
      success: true,
    },
    200,
    {
      "Set-Cookie": clearCookie(
        "nairobi_club_session",
      ),
    },
  );
}