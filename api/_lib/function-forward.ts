export function routingParameter(
  request: Request,
  name: string,
): string {
  return (
    new URL(
      request.url,
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
    new URL(
      request.url,
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
