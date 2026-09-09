import {
  getAuthenticatedUser,
} from "../_lib/auth";
import {
  getDb,
} from "../_lib/db";
import {
  error,
  json,
} from "../_lib/http";

function idFromRequest(
  request: Request,
): string {
  const url =
    new URL(
      request.url,
    );

  return decodeURIComponent(
    url.pathname
      .split("/")
      .filter(Boolean)
      .at(-1) ?? "",
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (
    request.method !==
    "PATCH"
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

  const id =
    idFromRequest(
      request,
    );

  if (!id) {
    return error(
      "Notification id is required.",
      400,
    );
  }

  const result =
    await getDb().notification.updateMany({
      where: {
        id,
        userId:
          context.user.id,
      },
      data: {
        readAt:
          new Date(),
      },
    });

  if (
    result.count ===
    0
  ) {
    return error(
      "Notification not found.",
      404,
    );
  }

  return json({
    success: true,
  });
}