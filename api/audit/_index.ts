import { getAuthenticatedUser } from "../_lib/auth.js";
import { getDb } from "../_lib/db.js";
import {
  canViewGovernance,
} from "../_lib/governance.js";
import {
  error,
  json,
} from "../_lib/http.js";

function parseInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(minimum, parsed),
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return error(
      "Audit records are read-only.",
      405,
    );
  }

  const context =
    await getAuthenticatedUser(request);

  if (!context) {
    return error(
      "Authentication required.",
      401,
    );
  }

  if (!canViewGovernance(context)) {
    return error(
      "Governance access requires Administrator or Exco/Management role.",
      403,
    );
  }

  const url = new URL(request.url);

  const page = parseInteger(
    url.searchParams.get("page"),
    1,
    1,
    100000,
  );

  const limit = parseInteger(
    url.searchParams.get("limit"),
    50,
    1,
    200,
  );

  const action =
    url.searchParams
      .get("action")
      ?.trim() || undefined;

  const entityType =
    url.searchParams
      .get("entityType")
      ?.trim() || undefined;

  const where = {
    ...(action
      ? {
          action,
        }
      : {}),
    ...(entityType
      ? {
          entityType,
        }
      : {}),
  };

  const [events, total] =
    await Promise.all([
      getDb().auditEvent.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      }),

      getDb().auditEvent.count({
        where,
      }),
    ]);

  return json({
    success: true,
    readOnly: true,
    page,
    limit,
    total,
    pages:
      total === 0
        ? 0
        : Math.ceil(total / limit),
    events,
  });
}