import { getAuthenticatedUser } from "../_lib/auth.js";
import { error, json } from "../_lib/http.js";

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return error("Method not allowed.", 405);
  }

  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  return json({
    success: true,
    user: context.user,
  });
}