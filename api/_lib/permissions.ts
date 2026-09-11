import { getDb } from "./db.js";
import type { AuthContext } from "./auth.js";

export async function canManageCommittee(
  context: AuthContext,
): Promise<boolean> {
  return context.user.role === "ADMIN";
}

export async function canViewCommittee(
  context: AuthContext,
  committeeId: string,
): Promise<boolean> {
  if (
    context.user.role === "ADMIN" ||
    context.user.role === "EXCO_MANAGEMENT"
  ) {
    return true;
  }

  const now = new Date();

  const membership =
    await getDb().membership.findFirst({
      where: {
        userId: context.user.id,
        committeeId,
        startDate: {
          lte: now,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: now,
            },
          },
        ],
      },
    });

  return Boolean(membership);
}

export async function canViewCommitteeAt(
  context: AuthContext,
  committeeId: string,
  at: Date,
): Promise<boolean> {
  if (
    context.user.role === "ADMIN" ||
    context.user.role === "EXCO_MANAGEMENT"
  ) {
    return true;
  }

  const membership =
    await getDb().membership.findFirst({
      where: {
        userId: context.user.id,
        committeeId,
        startDate: {
          lte: at,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: at,
            },
          },
        ],
      },
    });

  return Boolean(membership);
}