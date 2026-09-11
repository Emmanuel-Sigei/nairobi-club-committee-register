import {
  getAuthenticatedUser,
} from "../_lib/auth.js";
import {
  getDb,
} from "../_lib/db.js";
import {
  error,
  json,
} from "../_lib/http.js";

export default async function handler(
  request: Request,
): Promise<Response> {
  if (
    request.method !==
    "GET"
  ) {
    return error(
      "Method not allowed.",
      405,
    );
  }

  const context =
    await getAuthenticatedUser(
      request,
    );

  if (!context) {
    return error(
      "Authentication required.",
      401,
    );
  }

  if (
    context.user.role !==
    "ADMIN"
  ) {
    return error(
      "Administrator access required.",
      403,
    );
  }

  const users =
    await getDb().user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        invitedAt: true,
        passwordSetAt: true,
        deactivatedAt: true,
        createdAt: true,
        memberships: {
          orderBy: {
            startDate:
              "desc",
          },
          select: {
            id: true,
            role: true,
            startDate: true,
            endDate: true,
            committee: {
              select: {
                id: true,
                name: true,
                archivedAt:
                  true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          isActive:
            "desc",
        },
        {
          name:
            "asc",
        },
      ],
    });

  return json({
    success: true,
    users,
  });
}