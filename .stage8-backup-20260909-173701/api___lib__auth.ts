import { getDb } from "./db";
import { hashToken } from "./security";

export const SESSION_COOKIE = "nairobi_club_session";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: "MEMBER" | "ADMIN" | "EXCO_MANAGEMENT";
  isActive: boolean;
}

export interface AuthContext {
  user: AuthenticatedUser;
  sessionId: string;
}

export function getSessionToken(
  request: Request,
): string | undefined {
  const header = request.headers.get("cookie");

  if (!header) {
    return undefined;
  }

  const cookies = header.split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = cookie.slice(0, separator).trim();

    if (name !== SESSION_COOKIE) {
      continue;
    }

    return decodeURIComponent(cookie.slice(separator + 1).trim());
  }

  return undefined;
}

export async function getAuthenticatedUser(
  request: Request,
): Promise<AuthContext | null> {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const session = await getDb().session.findUnique({
    where: {
      tokenHash,
    },
    include: {
      user: true,
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    !session.user.isActive
  ) {
    return null;
  }

  await getDb().session.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: now,
    },
  });

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      isActive: session.user.isActive,
    },
  };
}

export function hasRole(
  context: AuthContext,
  roles: AuthenticatedUser["role"][],
): boolean {
  return roles.includes(context.user.role);
}