import deactivate from "./users/[id]/_deactivate.js";
import index from "./users/_index.js";
import {
  forwardRequest,
  routingError,
  routingParameter,
} from "./_lib/function-forward.js";

async function handler(
  request: Request,
): Promise<Response> {
  const id =
    routingParameter(
      request,
      "ncId",
    );

  const route =
    routingParameter(
      request,
      "ncRoute",
    );

  if (
    !id &&
    !route
  ) {
    const forwarded =
      await forwardRequest(
        request,
        "/api/users",
        [],
      );

    return index(
      forwarded,
    );
  }

  if (
    id &&
    route ===
      "deactivate"
  ) {
    const forwarded =
      await forwardRequest(
        request,
        `/api/users/${encodeURIComponent(id)}/deactivate`,
        [
          "ncId",
          "ncRoute",
        ],
      );

    return deactivate(
      forwarded,
    );
  }

  return routingError();
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
