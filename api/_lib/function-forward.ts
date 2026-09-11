function requestBaseUrl(
  request: Request,
): string {
  const configured =
    process.env.APP_URL
      ?.trim();

  if (configured) {
    try {
      return new URL(
        configured,
      ).origin;
    } catch {
      // Fall through to forwarded request headers.
    }
  }

  const forwardedProto =
    request.headers
      .get(
        "x-forwarded-proto",
      )
      ?.split(",")[0]
      ?.trim();

  const forwardedHost =
    request.headers
      .get(
        "x-forwarded-host",
      )
      ?.split(",")[0]
      ?.trim();

  const host =
    forwardedHost ||
    request.headers
      .get("host")
      ?.trim();

  if (host) {
    return `${forwardedProto || "https"}://${host}`;
  }

  return "http://localhost";
}

export function resolvedRequestUrl(
  request: Request,
): URL {
  try {
    return new URL(
      request.url,
    );
  } catch {
    return new URL(
      request.url,
      requestBaseUrl(
        request,
      ),
    );
  }
}

export function routingParameter(
  request: Request,
  name: string,
): string {
  return (
    resolvedRequestUrl(
      request,
    ).searchParams
      .get(name)
      ?.trim() ?? ""
  );
}

export function routingError(
  message = "Not found.",
  status = 404,
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
    }),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    },
  );
}

export async function forwardRequest(
  request: Request,
  pathname: string,
  internalParameters: string[],
): Promise<Request> {
  const url =
    resolvedRequestUrl(
      request,
    );

  url.pathname =
    pathname;

  for (
    const parameter of
      internalParameters
  ) {
    url.searchParams.delete(
      parameter,
    );
  }

  const method =
    request.method.toUpperCase();

  const body =
    method === "GET" ||
    method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  return new Request(
    url.toString(),
    {
      method:
        request.method,
      headers:
        request.headers,
      body,
      redirect:
        request.redirect,
      signal:
        request.signal,
    },
  );
}
