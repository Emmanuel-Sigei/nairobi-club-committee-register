export function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

export function error(
  message: string,
  status = 400,
  code?: string,
): Response {
  return json(
    {
      success: false,
      error: message,
      ...(code ? { code } : {}),
    },
    status,
  );
}

export async function readJson<T>(
  request: Request,
): Promise<T> {
  const text = await request.text();

  if (!text) {
    throw new Error("Request body is required.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    undefined
  );
}

export function getUserAgent(request: Request): string | undefined {
  return request.headers.get("user-agent") ?? undefined;
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
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `SameSite=${options.sameSite ?? "Lax"}`,
  ];

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure !== false) {
    parts.push("Secure");
  }

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  return parts.join("; ");
}

export function clearCookie(name: string): string {
  return setCookie(name, "", {
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });
}