import access from "./documents/[id]/_access";
import completeUpload from "./documents/_complete-upload";
import index from "./documents/_index";
import uploadUrl from "./documents/_upload-url";
import {
  forwardRequest,
  routingError,
  routingParameter,
} from "./_lib/function-forward";

export default async function handler(
  request: Request,
): Promise<Response> {
  const route =
    routingParameter(
      request,
      "ncRoute",
    );

  const id =
    routingParameter(
      request,
      "ncId",
    );

  if (!route && !id) {
    return index(
      request,
    );
  }

  if (
    route ===
      "upload-url" &&
    !id
  ) {
    const forwarded =
      await forwardRequest(
        request,
        "/api/documents/upload-url",
        ["ncRoute"],
      );

    return uploadUrl(
      forwarded,
    );
  }

  if (
    route ===
      "complete-upload" &&
    !id
  ) {
    const forwarded =
      await forwardRequest(
        request,
        "/api/documents/complete-upload",
        ["ncRoute"],
      );

    return completeUpload(
      forwarded,
    );
  }

  if (
    route ===
      "access" &&
    id
  ) {
    const forwarded =
      await forwardRequest(
        request,
        `/api/documents/${encodeURIComponent(id)}/access`,
        [
          "ncId",
          "ncRoute",
        ],
      );

    return access(
      forwarded,
    );
  }

  return routingError();
}
