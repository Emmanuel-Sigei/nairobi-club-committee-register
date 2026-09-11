import type { AuthContext } from "./auth.js";
import { getDb } from "./db.js";

export async function canAccessDocumentScope(
  context: AuthContext,
  input: {
    committeeId: string;
    meeting: { startAt: Date } | null;
  },
): Promise<boolean> {
  if (
    context.user.role === "ADMIN" ||
    context.user.role === "EXCO_MANAGEMENT"
  ) {
    return true;
  }

  if (context.user.role !== "MEMBER") {
    return false;
  }

  const effectiveAt = input.meeting?.startAt ?? new Date();

  const membership = await getDb().membership.findFirst({
    where: {
      userId: context.user.id,
      committeeId: input.committeeId,
      startDate: { lte: effectiveAt },
      OR: [
        { endDate: null },
        { endDate: { gte: effectiveAt } },
      ],
    },
    select: { id: true },
  });

  return Boolean(membership);
}
