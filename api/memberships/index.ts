import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

type MembershipRole = "CHAIR" | "SECRETARY" | "MEMBER";

interface MembershipInput {
  userId?: unknown;
  committeeId?: unknown;
  role?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function dateValue(value: unknown, field: string): Date {
  const raw = requiredString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
}
function optionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("endDate must be a valid date.");
  return date;
}
function roleValue(value: unknown): MembershipRole {
  if (value === "CHAIR" || value === "SECRETARY" || value === "MEMBER") return value;
  return "MEMBER";
}

export default async function handler(request: Request): Promise<Response> {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  if (request.method === "POST") {
    try {
      const body = await readJson<MembershipInput>(request);
      const userId = requiredString(body.userId, "userId");
      const committeeId = requiredString(body.committeeId, "committeeId");
      const startDate = dateValue(body.startDate, "startDate");
      const endDate = optionalDate(body.endDate);
      const role = roleValue(body.role);

      if (endDate && endDate < startDate) return error("endDate cannot be before startDate.", 400);

      const [user, committee] = await Promise.all([
        getDb().user.findUnique({ where: { id: userId } }),
        getDb().committee.findUnique({ where: { id: committeeId } }),
      ]);
      if (!user) return error("User not found.", 404);
      if (!committee) return error("Committee not found.", 404);
      if (committee.archivedAt) return error("Archived committees cannot receive memberships.", 409);

      const overlapping = await getDb().membership.findFirst({
        where: {
          userId,
          committeeId,
          startDate: { lte: endDate ?? new Date("9999-12-31T00:00:00.000Z") },
          OR: [{ endDate: null }, { endDate: { gte: startDate } }],
        },
      });
      if (overlapping) return error("This membership overlaps an existing term.", 409);

      const membership = await getDb().membership.create({
        data: { userId, committeeId, role, startDate, endDate },
      });

      await writeAuditEvent({
        request, context, action: "MEMBERSHIP_CREATED",
        entityType: "Membership", entityId: membership.id,
        metadata: { userId, committeeId, role, startDate, endDate: endDate ?? null }
      });

      return json({ success: true, membership }, 201);
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : "Unable to create membership.", 400);
    }
  }

  return error("Method not allowed.", 405);
}