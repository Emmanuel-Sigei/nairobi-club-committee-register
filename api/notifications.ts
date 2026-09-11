import detail from "./notifications/_[id].js";
import index from "./notifications/_index.js";
import {
  forwardRequest,
  routingParameter,
} from "./_lib/function-forward.js";

export default async function handler(
  request: Request,
): Promise<Response> {
  const id =
    routingParameter(
      request,
      "ncId",
    );

  if (!id) {
    return index(
      request,
    );
  }

  const forwarded =
    await forwardRequest(
      request,
      `/api/notifications/${encodeURIComponent(id)}`,
      ["ncId"],
    );

  return detail(
    forwarded,
  );
}
