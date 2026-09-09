import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

interface PatchBody {
  role?: unknown;
  endDate?: unknown;
  action?: unknown;
}

function idFromRequest(request: Request): string {
  const url = new URL(request.url);
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
}

export default async function handler(request: Request): Promise<Response> {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
  if (request.method !== "PATCH") return error("Method not allowed.", 405);

  const id = idFromRequest(request);
  const existing = await getDb().membership.findUnique({ where: { id } });
  if (!existing) return error("Membership not found.", 404);

  const body = await readJson<PatchBody>(request);
  const data: { role?: "CHAIR" | "SECRETARY" | "MEMBER"; endDate?: Date | null } = {};

  if (body.action === "end") {
    data.endDate = new Date();
  } else {
    if (body.role !== undefined) {
      if (body.role !== "CHAIR" && body.role !== "SECRETARY" && body.role !== "MEMBER") {
        return error("Invalid membership role.", 400);
      }
      data.role = body.role;
    }
    if (body.endDate !== undefined) {
      if (body.endDate === null || body.endDate === "") {
        data.endDate = null;
      } else {
        const date = new Date(String(body.endDate));
        if (Number.isNaN(date.getTime())) return error("Invalid endDate.", 400);
        if (date < existing.startDate) return error("endDate cannot be before startDate.", 400);
        data.endDate = date;
      }
    }
  }

  const membership = await getDb().membership.update({ where: { id }, data });
  await writeAuditEvent({
    request, context, action: body.action === "end" ? "MEMBERSHIP_ENDED" : "MEMBERSHIP_UPDATED",
    entityType: "Membership", entityId: id,
    metadata: { previousRole: existing.role, previousEndDate: existing.endDate, ...data }
  });
  return json({ success: true, membership });
}