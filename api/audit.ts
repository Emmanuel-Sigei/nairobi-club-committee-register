import audit from "./audit/_index";

export default async function handler(
  request: Request,
): Promise<Response> {
  return audit(
    request,
  );
}
