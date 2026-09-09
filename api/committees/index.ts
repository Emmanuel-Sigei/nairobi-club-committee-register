import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

type CommitteeType = "MAIN" | "SUBCOMMITTEE";

interface CommitteeInput {
  name?: unknown;
  slug?: unknown;
  type?: unknown;
  parentId?: unknown;
  zohoCalendarId?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Expected a string.");
  return value.trim() || undefined;
}

function parseType(value: unknown): CommitteeType {
  if (value === "MAIN" || value === "SUBCOMMITTEE") return value;
  throw new Error("type must be MAIN or SUBCOMMITTEE.");
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const context = await getAuthenticatedUser(request);
    if (!context) return error("Authentication required.", 401);

    if (request.method === "GET") {
      const now = new Date();
      const committees = await getDb().committee.findMany({
        where:
          context.user.role === "MEMBER"
            ? {
                memberships: {
                  some: {
                    userId: context.user.id,
                    startDate: { lte: now },
                    OR: [{ endDate: null }, { endDate: { gte: now } }],
                  },
                },
              }
            : undefined,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          parentId: true,
          zohoCalendarId: true,
          archivedAt: true,
        },
        orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      });
      return json({ success: true, committees });
    }

    if (request.method === "POST") {
      if (context.user.role !== "ADMIN") {
        return error("Administrator access required.", 403);
      }

      const body = await readJson<CommitteeInput>(request);
      const name = requiredString(body.name, "name");
      const slug = requiredString(body.slug, "slug").toLowerCase();
      const type = parseType(body.type);
      const parentId = optionalString(body.parentId);
      const zohoCalendarId = optionalString(body.zohoCalendarId);

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return error("slug must contain lowercase letters, numbers and hyphens only.", 400);
      }

      if (type === "MAIN" && parentId) {
        return error("A MAIN committee cannot have a parent.", 400);
      }
      if (type === "SUBCOMMITTEE" && !parentId) {
        return error("A SUBCOMMITTEE requires parentId.", 400);
      }

      if (parentId) {
        const parent = await getDb().committee.findUnique({ where: { id: parentId } });
        if (!parent) return error("Parent committee not found.", 404);
        if (parent.archivedAt) return error("Archived committees cannot be used as parents.", 409);
      }

      const committee = await getDb().committee.create({
        data: { name, slug, type, parentId, zohoCalendarId },
      });

      await writeAuditEvent({
        request,
        context,
        action: "COMMITTEE_CREATED",
        entityType: "Committee",
        entityId: committee.id,
        metadata: { name, slug, type, parentId: parentId ?? null },
      });

      return json({ success: true, committee }, 201);
    }

    return error("Method not allowed.", 405);
  } catch (caught) {
    if (
      typeof caught === "object" &&
      caught !== null &&
      "code" in caught &&
      (caught as { code?: unknown }).code === "P2002"
    ) {
      return error("A committee with that slug already exists.", 409);
    }
    console.error("Committee request failed.", caught);
    return error(caught instanceof Error ? caught.message : "Unable to process committee request.", 400);
  }
}