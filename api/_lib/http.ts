const API_SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

export function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...API_SECURITY_HEADERS,
        "Content-Type":
          "application/json; charset=utf-8",
        ...extraHeaders,
      },
    },
  );
}

export function error(
  message: string,
  status = 400,
  code?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return json(
    {
      success: false,
      error: message,
      ...(code
        ? {
            code,
          }
        : {}),
    },
    status,
    extraHeaders,
  );
}

export async function readJson<T>(
  request: Request,
): Promise<T> {
  const contentType =
    request.headers
      .get("content-type")
      ?.toLowerCase();

  if (
    contentType &&
    !contentType.includes(
      "application/json",
    )
  ) {
    throw new Error(
      "Content-Type must be application/json.",
    );
  }

  const text =
    await request.text();

  if (!text) {
    throw new Error(
      "Request body is required.",
    );
  }

  if (
    text.length >
    1024 * 1024
  ) {
    throw new Error(
      "Request body is too large.",
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      "Request body must be valid JSON.",
    );
  }
}

export function getClientIp(
  request: Request,
): string | undefined {
  const forwarded =
    request.headers.get(
      "x-forwarded-for",
    );

  if (forwarded) {
    return forwarded
      .split(",")[0]
      ?.trim();
  }

  return (
    request.headers.get(
      "x-real-ip",
    ) ??
    request.headers.get(
      "cf-connecting-ip",
    ) ??
    undefined
  );
}

export function getUserAgent(
  request: Request,
): string | undefined {
  const value =
    request.headers.get(
      "user-agent",
    );

  return value
    ? value.slice(0, 500)
    : undefined;
}

export function setCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?:
      | "Strict"
      | "Lax"
      | "None";
    path?: string;
  } = {},
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `SameSite=${options.sameSite ?? "Lax"}`,
  ];

  if (
    options.httpOnly !== false
  ) {
    parts.push("HttpOnly");
  }

  if (
    options.secure !== false
  ) {
    parts.push("Secure");
  }

  if (
    typeof options.maxAge ===
    "number"
  ) {
    parts.push(
      `Max-Age=${Math.max(
        0,
        Math.floor(
          options.maxAge,
        ),
      )}`,
    );
  }

  return parts.join("; ");
}

export function clearCookie(
  name: string,
): string {
  return setCookie(
    name,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    },
  );
}