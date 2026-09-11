import detail from "./memberships/_[id].js";
import index from "./memberships/_index.js";
import {
  forwardRequest,
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

  if (!id) {
    const forwarded =
      await forwardRequest(
        request,
        "/api/memberships",
        [],
      );

    return index(
      forwarded,
    );
  }

  const forwarded =
    await forwardRequest(
      request,
      `/api/memberships/${encodeURIComponent(id)}`,
      ["ncId"],
    );

  return detail(
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
