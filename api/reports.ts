import reports from "./reports/_index.js";
import {
  forwardRequest,
} from "./_lib/function-forward.js";

export default async function handler(
  request: Request,
): Promise<Response> {
  const forwarded =
    await forwardRequest(
      request,
      "/api/reports",
      [],
    );

  return reports(
    forwarded,
  );
}
