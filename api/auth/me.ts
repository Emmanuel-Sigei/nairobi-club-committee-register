import { getAuthenticatedUser } from "../_lib/auth";
import { error, json } from "../_lib/http";

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return error("Method not allowed.", 405);
  }

  const authenticated = await getAuthenticatedUser(
    request,
  );

  if (!authenticated) {
    return error("Authentication required.", 401);
  }

  const { user } = authenticated;

  return json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  });
}
