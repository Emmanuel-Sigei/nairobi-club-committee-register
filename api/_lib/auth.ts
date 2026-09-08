import { getDb } from "./db";
import { hashToken } from "./security";

export const SESSION_COOKIE = "nairobi_club_session";

export async function getAuthenticatedUser(
  request: Request,
) {
  const cookie = request.headers.get("cookie") ?? "";

  const match = cookie.match(
    new RegExp(`${SESSION_COOKIE}=([^;]+)`),
  );

  if (!match?.[1]) {
    return null;
  }

  const rawToken = decodeURIComponent(match[1]);
  const tokenHash = hashToken(rawToken);

  const db = getDb();

  const session = await db.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!session || !session.user.isActive) {
    return null;
  }

  await db.session.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
  });

  return {
    session,
    user: session.user,
  };
}

export function requireRole(
  role: string,
  allowedRoles: string[],
): boolean {
  return allowedRoles.includes(role);
}
