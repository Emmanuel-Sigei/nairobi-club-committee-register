import reports from "./reports/_index";

export default async function handler(
  request: Request,
): Promise<Response> {
  return reports(
    request,
  );
}
