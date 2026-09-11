import dashboard from "./exco/_dashboard.js";
import {
  forwardRequest,
  routingError,
  routingParameter,
} from "./_lib/function-forward.js";

export default async function handler(
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
