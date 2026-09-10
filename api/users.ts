import deactivate from "./users/[id]/_deactivate";
import index from "./users/_index";
import {
  forwardRequest,
  routingError,
  routingParameter,
} from "./_lib/function-forward";

export default async function handler(
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
    return index(
      request,
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
