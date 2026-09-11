import reports from "./reports/_index.js";

export default async function handler(
  request: Request,
): Promise<Response> {
  return reports(
    request,
  );
}
