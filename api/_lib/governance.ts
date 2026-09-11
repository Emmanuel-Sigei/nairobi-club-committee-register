import type { AuthContext } from "./auth.js";

export function canViewGovernance(
  context: AuthContext,
): boolean {
  return (
    context.user.role === "ADMIN" ||
    context.user.role === "EXCO_MANAGEMENT"
  );
}

export function assertGovernanceReadOnlyMethod(
  request: Request,
): boolean {
  return request.method === "GET";
}