import { getDb } from "./db.js";
import { getClientIp, getUserAgent } from "./http.js";
import type { AuthContext } from "./auth.js";

export async function writeAuditEvent(input: {
  request: Request;
  context?: AuthContext | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getDb().auditEvent.create({
    data: {
      actorType: input.context ? "USER" : "SYSTEM",
      actorUserId: input.context?.user.id,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata
        ? JSON.parse(JSON.stringify(input.metadata))
        : undefined,
      ipAddress: getClientIp(input.request),
      userAgent: getUserAgent(input.request),
    },
  });
}
