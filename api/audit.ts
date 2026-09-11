import audit from "./audit/_index.js";
import {
  forwardRequest,
} from "./_lib/function-forward.js";

async function handler(
  request: Request,
): Promise<Response> {
  const forwarded =
    await forwardRequest(
      request,
      "/api/audit",
      [],
    );

  return audit(
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
