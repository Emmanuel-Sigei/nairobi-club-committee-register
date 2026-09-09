import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

interface CommitteePatch {
  name?: unknown;
  zohoCalendarId?: unknown;
  action?: unknown;
}

function idFromRequest(request: Request): string {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-1) ?? "");
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Expected a string.");
  return value.trim() || null;
}

export default async function handler(request: Request): Promise<Response> {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  const id = idFromRequest(request);
  if (!id) return error("Committee id is required.", 400);

  const existing = await getDb().committee.findUnique({ where: { id } });
  if (!existing) return error("Committee not found.", 404);

  if (request.method === "PATCH") {
    const body = await readJson<CommitteePatch>(request);
    if (body.action === "archive") {
      if (existing.archivedAt) return error("Committee is already archived.", 409);
      const committee = await getDb().committee.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await writeAuditEvent({
        request, context, action: "COMMITTEE_ARCHIVED",
        entityType: "Committee", entityId: id
      });
      return json({ success: true, committee });
    }

    const name =
      body.name === undefined
        ? undefined
        : typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : (() => { throw new Error("name must be a non-empty string."); })();

    const zohoCalendarId = optionalString(body.zohoCalendarId);

    const committee = await getDb().committee.update({
      where: { id },
      data: { name, zohoCalendarId },
    });

    await writeAuditEvent({
      request, context, action: "COMMITTEE_UPDATED",
      entityType: "Committee", entityId: id,
      metadata: { name: name ?? existing.name, zohoCalendarId }
    });

    return json({ success: true, committee });
  }

  return error("Method not allowed.", 405);
}