import { getAuthenticatedUser } from "../../_lib/auth";
import { writeAuditEvent } from "../../_lib/audit";
import { getDb } from "../../_lib/db";
import { error, json } from "../../_lib/http";

function idFromRequest(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-2) ?? "");
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return error("Method not allowed.", 405);
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  const userId = idFromRequest(request);
  if (!userId) return error("User id is required.", 400);
  if (userId === context.user.id) return error("You cannot deactivate your own account.", 409);

  const existing = await getDb().user.findUnique({ where: { id: userId } });
  if (!existing) return error("User not found.", 404);
  if (!existing.isActive) return error("User is already inactive.", 409);

  const now = new Date();
  await getDb().$transaction([
    getDb().user.update({
      where: { id: userId },
      data: { isActive: false, deactivatedAt: now },
    }),
    getDb().session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  await writeAuditEvent({
    request, context, action: "USER_DEACTIVATED",
    entityType: "User", entityId: userId
  });

  return json({ success: true });
}