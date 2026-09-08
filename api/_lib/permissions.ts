import { getDb } from "./db";
import type { AuthContext } from "./auth";

export async function canManageCommittee(
  context: AuthContext,
  committeeId: string,
): Promise<boolean> {
  if (context.user.role === "ADMIN") {
    return true;
  }

  if (context.user.role !== "MEMBER") {
    return false;
  }

  const membership = await getDb().membership.findFirst({
    where: {
      userId: context.user.id,
      committeeId,
      startDate: { lte: new Date() },
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    },
  });

  return membership?.role === "CHAIR" || membership?.role === "SECRETARY";
}

export async function canViewCommittee(
  context: AuthContext,
  committeeId: string,
): Promise<boolean> {
  if (context.user.role === "ADMIN" || context.user.role === "EXCO_MANAGEMENT") {
    return true;
  }

  const now = new Date();
  const membership = await getDb().membership.findFirst({
    where: {
      userId: context.user.id,
      committeeId,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });

  return Boolean(membership);
}
