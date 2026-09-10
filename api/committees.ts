import detail from "./committees/_[id]";
import index from "./committees/_index";
import {
  forwardRequest,
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

  if (!id) {
    return index(
      request,
    );
  }

  const forwarded =
    await forwardRequest(
      request,
      `/api/committees/${encodeURIComponent(id)}`,
      ["ncId"],
    );

  return detail(
    forwarded,
  );
}
