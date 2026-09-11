import dashboard from "./exco/_dashboard.js";
import {
  forwardRequest,
  routingError,
  routingParameter,
} from "./_lib/function-forward.js";

async function handler(
  request: Request,
): Promise<Response> {
  const route =
    routingParameter(
      request,
      "ncRoute",
    );

  if (
    route !==
      "dashboard"
  ) {
    return routingError();
  }

  const forwarded =
    await forwardRequest(
      request,
      "/api/exco/dashboard",
      ["ncRoute"],
    );

  return dashboard(
    forwarded,
  );
}

export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
