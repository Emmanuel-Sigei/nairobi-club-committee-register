import { getDb } from "../_lib/db";
import { SESSION_COOKIE } from "../_lib/auth";
import { clearCookie, error, json } from "../_lib/http";
import { hashToken } from "../_lib/security";

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(
    new RegExp(`${SESSION_COOKIE}=([^;]+)`),
  );

  if (match?.[1]) {
    const rawToken = decodeURIComponent(match[1]);
    const tokenHash = hashToken(rawToken);

    const db = getDb();

    await db.session.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  return json(
    {
      success: true,
    },
    200,
    {
      "Set-Cookie": clearCookie(SESSION_COOKIE),
    },
  );
}
