import detail from "./meetings/_[id]";
import attendance from "./meetings/[id]/_attendance";
import coi from "./meetings/[id]/_coi";
import index from "./meetings/_index";
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
    !route
  ) {
    const forwarded =
      await forwardRequest(
        request,
        `/api/meetings/${encodeURIComponent(id)}`,
        ["ncId"],
      );

    return detail(
      forwarded,
      {
        params: {
          id,
        },
      },
    );
  }

  if (
    id &&
    route ===
      "attendance"
  ) {
    const forwarded =
      await forwardRequest(
        request,
        `/api/meetings/${encodeURIComponent(id)}/attendance`,
        [
          "ncId",
          "ncRoute",
        ],
      );

    return attendance(
      forwarded,
      {
        params: {
          id,
        },
      },
    );
  }

  if (
    id &&
    route ===
      "coi"
  ) {
    const forwarded =
      await forwardRequest(
        request,
        `/api/meetings/${encodeURIComponent(id)}/coi`,
        [
          "ncId",
          "ncRoute",
        ],
      );

    return coi(
      forwarded,
    );
  }

  return routingError();
}
