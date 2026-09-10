import route0 from "./audit/_index";
import route1 from "./auth/_accept-invite";
import route2 from "./auth/_invite";
import route3 from "./auth/_login";
import route4 from "./auth/_logout";
import route5 from "./auth/_me";
import route6 from "./auth/_request-reset";
import route7 from "./auth/_resend-invite";
import route8 from "./auth/_resend-otp";
import route9 from "./auth/_reset-password";
import route10 from "./auth/_verify-otp";
import route11 from "./committees/_[id]";
import route12 from "./committees/_index";
import route13 from "./documents/[id]/_access";
import route14 from "./documents/_complete-upload";
import route15 from "./documents/_index";
import route16 from "./documents/_upload-url";
import route17 from "./exco/_dashboard";
import route18 from "./meetings/_[id]";
import route19 from "./meetings/[id]/_attendance";
import route20 from "./meetings/[id]/_coi";
import route21 from "./meetings/_index";
import route22 from "./memberships/_[id]";
import route23 from "./memberships/_index";
import route24 from "./notifications/_[id]";
import route25 from "./notifications/_index";
import route26 from "./reports/_index";
import route27 from "./users/[id]/_deactivate";
import route28 from "./users/_index";

type RouteParams =
  Record<
    string,
    string | undefined
  >;

interface RouteContext {
  params:
    | RouteParams
    | Promise<RouteParams>;
}

type Handler =
  (
    request: Request,
    context: RouteContext,
  ) =>
    Response |
    Promise<Response>;

interface RouteDefinition {
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

const routes: RouteDefinition[] = [
  {
    pattern: new RegExp("^/api/audit$"),
    paramNames: [],
    handler: route0,
  },
  {
    pattern: new RegExp("^/api/auth/accept-invite$"),
    paramNames: [],
    handler: route1,
  },
  {
    pattern: new RegExp("^/api/auth/invite$"),
    paramNames: [],
    handler: route2,
  },
  {
    pattern: new RegExp("^/api/auth/login$"),
    paramNames: [],
    handler: route3,
  },
  {
    pattern: new RegExp("^/api/auth/logout$"),
    paramNames: [],
    handler: route4,
  },
  {
    pattern: new RegExp("^/api/auth/me$"),
    paramNames: [],
    handler: route5,
  },
  {
    pattern: new RegExp("^/api/auth/request-reset$"),
    paramNames: [],
    handler: route6,
  },
  {
    pattern: new RegExp("^/api/auth/resend-invite$"),
    paramNames: [],
    handler: route7,
  },
  {
    pattern: new RegExp("^/api/auth/resend-otp$"),
    paramNames: [],
    handler: route8,
  },
  {
    pattern: new RegExp("^/api/auth/reset-password$"),
    paramNames: [],
    handler: route9,
  },
  {
    pattern: new RegExp("^/api/auth/verify-otp$"),
    paramNames: [],
    handler: route10,
  },
  {
    pattern: new RegExp("^/api/committees/([^/]+)$"),
    paramNames: ["id"],
    handler: route11,
  },
  {
    pattern: new RegExp("^/api/committees$"),
    paramNames: [],
    handler: route12,
  },
  {
    pattern: new RegExp("^/api/documents/([^/]+)/access$"),
    paramNames: ["id"],
    handler: route13,
  },
  {
    pattern: new RegExp("^/api/documents/complete-upload$"),
    paramNames: [],
    handler: route14,
  },
  {
    pattern: new RegExp("^/api/documents$"),
    paramNames: [],
    handler: route15,
  },
  {
    pattern: new RegExp("^/api/documents/upload-url$"),
    paramNames: [],
    handler: route16,
  },
  {
    pattern: new RegExp("^/api/exco/dashboard$"),
    paramNames: [],
    handler: route17,
  },
  {
    pattern: new RegExp("^/api/meetings/([^/]+)$"),
    paramNames: ["id"],
    handler: route18,
  },
  {
    pattern: new RegExp("^/api/meetings/([^/]+)/attendance$"),
    paramNames: ["id"],
    handler: route19,
  },
  {
    pattern: new RegExp("^/api/meetings/([^/]+)/coi$"),
    paramNames: ["id"],
    handler: route20,
  },
  {
    pattern: new RegExp("^/api/meetings$"),
    paramNames: [],
    handler: route21,
  },
  {
    pattern: new RegExp("^/api/memberships/([^/]+)$"),
    paramNames: ["id"],
    handler: route22,
  },
  {
    pattern: new RegExp("^/api/memberships$"),
    paramNames: [],
    handler: route23,
  },
  {
    pattern: new RegExp("^/api/notifications/([^/]+)$"),
    paramNames: ["id"],
    handler: route24,
  },
  {
    pattern: new RegExp("^/api/notifications$"),
    paramNames: [],
    handler: route25,
  },
  {
    pattern: new RegExp("^/api/reports$"),
    paramNames: [],
    handler: route26,
  },
  {
    pattern: new RegExp("^/api/users/([^/]+)/deactivate$"),
    paramNames: ["id"],
    handler: route27,
  },
  {
    pattern: new RegExp("^/api/users$"),
    paramNames: [],
    handler: route28,
  },
];

export default async function handler(
  request: Request,
): Promise<Response> {
  const rawPath =
    new URL(
      request.url,
    ).pathname;

  const pathname =
    rawPath.length > 1
      ? rawPath.replace(
          /\/+$/,
          "",
        )
      : rawPath;

  for (const route of routes) {
    const match =
      route.pattern.exec(
        pathname,
      );

    if (!match) {
      continue;
    }

    const params:
      RouteParams = {};

    route.paramNames.forEach(
      (name, index) => {
        params[name] =
          match[index + 1];
      },
    );

    return await route.handler(
      request,
      {
        params,
      },
    );
  }

  return new Response(
    JSON.stringify({
      error:
        "Not found.",
    }),
    {
      status: 404,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
      },
    },
  );
}
