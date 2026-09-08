import { getAuthenticatedUser } from "../_lib/auth";
import { getDb } from "../_lib/db";
import { error, json } from "../_lib/http";

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return error("Method not allowed.", 405);
  }

  try {
    const context = await getAuthenticatedUser(request);

    if (!context) {
      return error("Authentication required.", 401);
    }

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

    return json({
      success: true,
      committees,
    });
  } catch (caught) {
    console.error("Committee list request failed.", caught);
    return error("Unable to load committees.", 500);
  }
}
