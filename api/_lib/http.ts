export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function error(
  message: string,
  status = 400,
): Response {
  return json(
    {
      success: false,
      error: message,
    },
    status,
  );
}

export async function readJson<T>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }

  return request.headers.get("x-real-ip");
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}

export function setCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
  } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure !== false) {
    parts.push("Secure");
  }

  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  parts.push(`Path=${options.path ?? "/"}`);

  return parts.join("; ");
}

export function clearCookie(name: string): string {
  return setCookie(name, "", {
    maxAge: 0,
  });
}
