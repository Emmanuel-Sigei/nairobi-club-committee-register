import access from "./documents/[id]/_access.js";
import completeUpload from "./documents/_complete-upload.js";
import index from "./documents/_index.js";
import uploadUrl from "./documents/_upload-url.js";
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

  const id =
    routingParameter(
      request,
      "ncId",
    );

  if (
    !route &&
    !id
  ) {
    const forwarded =
      await forwardRequest(
        request,
        "/api/documents",
        [],
      );

    return index(
      forwarded,
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

export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
