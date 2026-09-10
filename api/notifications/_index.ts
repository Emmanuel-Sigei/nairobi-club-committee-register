import {
  getAuthenticatedUser,
} from "../_lib/auth";
import {
  getDb,
} from "../_lib/db";
import {
  error,
  json,
  readJson,
} from "../_lib/http";

interface NotificationAction {
  action?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
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
    request.method ===
    "GET"
  ) {
    const [
      notifications,
      unreadCount,
    ] = await Promise.all([
      getDb().notification.findMany({
        where: {
          userId:
            context.user.id,
        },
        orderBy: {
          createdAt:
            "desc",
        },
        take: 50,
      }),
      getDb().notification.count({
        where: {
          userId:
            context.user.id,
          readAt:
            null,
        },
      }),
    ]);

    return json({
      success: true,
      notifications,
      unreadCount,
    });
  }

  if (
    request.method ===
    "PATCH"
  ) {
    const body =
      await readJson<NotificationAction>(
        request,
      );

    if (
      body.action !==
      "read-all"
    ) {
      return error(
        "A valid notification action is required.",
        400,
      );
    }

    const result =
      await getDb().notification.updateMany({
        where: {
          userId:
            context.user.id,
          readAt:
            null,
        },
        data: {
          readAt:
            new Date(),
        },
      });

    return json({
      success: true,
      updated:
        result.count,
    });
  }

  return error(
    "Method not allowed.",
    405,
  );
}