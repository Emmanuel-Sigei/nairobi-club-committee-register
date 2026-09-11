import { getAuthenticatedUser } from "../_lib/auth.js";
import { writeAuditEvent } from "../_lib/audit.js";
import { getDb } from "../_lib/db.js";
import { error, json, readJson } from "../_lib/http.js";

type MembershipRole = "CHAIR" | "SECRETARY" | "MEMBER";

interface PatchBody {
  role?: unknown;
  endDate?: unknown;
  action?: unknown;
}

const FAR_FUTURE = new Date("9999-12-31T23:59:59.999Z");

function idFromRequest(request: Request): string {
  const url = new URL(request.url);
  return decodeURIComponent(
    url.pathname.split("/").filter(Boolean).at(-1) ?? "",
  );
}

function isMembershipRole(value: unknown): value is MembershipRole {
  return value === "CHAIR" || value === "SECRETARY" || value === "MEMBER";
}

function isPrismaSerializationFailure(caught: unknown): boolean {
  return (
    typeof caught === "object" &&
    caught !== null &&
    "code" in caught &&
    (caught as { code?: unknown }).code === "P2034"
  );
}

export default async function handler(request: Request): Promise<Response> {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  if (context.user.role !== "ADMIN") {
    return error("Administrator access required.", 403);
  }

  if (request.method !== "PATCH") {
    return error("Method not allowed.", 405);
  }

  const id = idFromRequest(request);
  const db = getDb();

  const existing = await db.membership.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          isActive: true,
        },
      },
      committee: {
        select: {
          archivedAt: true,
        },
      },
    },
  });

  if (!existing) {
    return error("Membership not found.", 404);
  }

  const body = await readJson<PatchBody>(request);

  const data: {
    role?: MembershipRole;
    endDate?: Date | null;
  } = {};

  let endDateChanging = false;
  let proposedEndDate: Date | null | undefined;

  if (body.action === "end") {
    const now = new Date();

    if (now < existing.startDate) {
      return error(
        "Future memberships cannot be ended before their start date.",
        409,
      );
    }

    proposedEndDate = now;
    data.endDate = now;
    endDateChanging = true;
  } else {
    if (
      body.action !== undefined &&
      body.action !== null &&
      body.action !== ""
    ) {
      return error("Invalid membership action.", 400);
    }

    if (body.role !== undefined) {
      if (!isMembershipRole(body.role)) {
        return error("Invalid membership role.", 400);
      }

      data.role = body.role;
    }

    if (body.endDate !== undefined) {
      endDateChanging = true;

      if (body.endDate === null || body.endDate === "") {
        proposedEndDate = null;
        data.endDate = null;
      } else {
        const date = new Date(String(body.endDate));

        if (Number.isNaN(date.getTime())) {
          return error("Invalid endDate.", 400);
        }

        if (date < existing.startDate) {
          return error("endDate cannot be before startDate.", 400);
        }

        proposedEndDate = date;
        data.endDate = date;
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return error("No membership changes supplied.", 400);
  }

  if (endDateChanging && proposedEndDate === null) {
    if (!existing.user.isActive) {
      return error(
        "Inactive users cannot have committee memberships reopened.",
        409,
      );
    }

    if (existing.committee.archivedAt) {
      return error(
        "Memberships on archived committees cannot be reopened.",
        409,
      );
    }
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        if (endDateChanging) {
          const overlapping = await tx.membership.findFirst({
            where: {
              id: {
                not: id,
              },
              userId: existing.userId,
              committeeId: existing.committeeId,
              startDate: {
                lte: proposedEndDate ?? FAR_FUTURE,
              },
              OR: [
                {
                  endDate: null,
                },
                {
                  endDate: {
                    gte: existing.startDate,
                  },
                },
              ],
            },
            select: {
              id: true,
            },
          });

          if (overlapping) {
            return {
              membership: null,
              overlapping: true,
            };
          }
        }

        const membership = await tx.membership.update({
          where: { id },
          data,
        });

        return {
          membership,
          overlapping: false,
        };
      },
      {
        isolationLevel: "Serializable",
      },
    );

    if (result.overlapping || !result.membership) {
      return error(
        "This membership change would overlap an existing term.",
        409,
      );
    }

    await writeAuditEvent({
      request,
      context,
      action:
        body.action === "end"
          ? "MEMBERSHIP_ENDED"
          : "MEMBERSHIP_UPDATED",
      entityType: "Membership",
      entityId: id,
      metadata: {
        previousRole: existing.role,
        previousEndDate: existing.endDate,
        newRole: result.membership.role,
        newEndDate: result.membership.endDate,
      },
    });

    return json({
      success: true,
      membership: result.membership,
    });
  } catch (caught) {
    if (isPrismaSerializationFailure(caught)) {
      return error(
        "Membership changed concurrently. Please retry the operation.",
        409,
      );
    }

    throw caught;
  }
}